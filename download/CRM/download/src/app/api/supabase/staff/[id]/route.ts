import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { hashPassword, verifyPassword, hasPasswordHash } from "@/lib/password";

const STAFF_SELECT =
  "*, group:staff_groups(id, name, is_office_staff, active), branch:branches(id, name), staff_branches(branch_id)";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from("staff")
      .select(STAFF_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Staff not found" },
        { status: 404 }
      );
    }
    // Strip the password hash and expose `has_password` so the frontend can
    // tell whether the account has a real password set (used by the edit
    // dialog to decide whether the "old password" field is required).
    const { password, staff_branches, ...rest } = data as Record<string, unknown>;
    const branchIds: string[] = Array.isArray(staff_branches)
      ? (staff_branches as { branch_id: string }[])
          .map((sb) => sb.branch_id)
          .filter((bid) => typeof bid === "string")
      : [];
    const enriched = {
      ...rest,
      has_password: hasPasswordHash(password as string | null | undefined),
      branches:
        branchIds.length > 0
          ? branchIds
          : rest.branch_id
            ? [rest.branch_id as string]
            : [],
    };
    return NextResponse.json({ ok: true, data: enriched });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid body" },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (body.code !== undefined) updateData.code = body.code || null;
    if (body.name !== undefined) updateData.name = body.name?.trim() || null;
    if (body.phone !== undefined) updateData.phone = body.phone || null;
    if (body.email !== undefined) updateData.email = body.email || null;
    // Username (login name) — empty string clears it.
    if (body.username !== undefined) updateData.username = body.username || null;
    // Password change. The old password is ALWAYS optional in the admin
    // staff-edit dialog — the admin can reset any account's password without
    // knowing the old one. If the old password IS provided AND the account has
    // one, verify it matches (extra confirmation). If old password is blank,
    // skip verification entirely (admin reset).
    if (body.password !== undefined && body.password !== null && body.password !== "") {
      const oldPwd = typeof body.old_password === "string" ? body.old_password.trim() : "";
      if (oldPwd) {
        // Old password provided → verify it matches the stored hash.
        const { data: current, error: fetchErr } = await supabaseAdmin
          .from("staff")
          .select("password")
          .eq("id", id)
          .maybeSingle();
        if (fetchErr) {
          return NextResponse.json(
            { ok: false, error: fetchErr.message },
            { status: 500 }
          );
        }
        const storedPassword = current?.password ?? null;
        if (hasPasswordHash(storedPassword) && !verifyPassword(oldPwd, storedPassword)) {
          return NextResponse.json(
            { ok: false, error: "Mật khẩu cũ không đúng", has_password: true },
            { status: 400 }
          );
        }
      }
      // Old password blank (or not provided) → admin reset, skip verification.
      updateData.password = hashPassword(body.password);
    }
    if (body.role !== undefined) updateData.role = body.role || null;
    if (body.avatar !== undefined) updateData.avatar = body.avatar || null;
    if (body.group_id !== undefined)
      updateData.group_id = body.group_id || null;
    if (body.branch_id !== undefined)
      updateData.branch_id = body.branch_id || null;
    if (body.active !== undefined) updateData.active = Boolean(body.active);
    if (body.allow_booking !== undefined)
      updateData.allow_booking = Boolean(body.allow_booking);
    if (body.allow_overlap !== undefined)
      updateData.allow_overlap = Boolean(body.allow_overlap);
    if (body.app_login !== undefined)
      updateData.app_login = Boolean(body.app_login);
    if (body.account_type !== undefined)
      updateData.account_type = body.account_type;
    if (body.permissions !== undefined)
      updateData.permissions = body.permissions;

    // Always allow update (even if only multi-branch or permissions changed).
    // If no staff-table fields changed, do a no-op update to get the row back.
    if (Object.keys(updateData).length === 0) {
      // At least set updated_at to trigger a refresh.
      updateData.updated_at = new Date().toISOString();
    }

    const { error } = await supabaseAdmin
      .from("staff")
      .update(updateData)
      .eq("id", id);
    if (error) {
      // 23505 = unique_violation (duplicate username / email / code).
      if (error.code === "23505") {
        return NextResponse.json(
          { ok: false, error: "Tên đăng nhập, mã hoặc email đã tồn tại" },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    // Sync multi-branch assignments (staff_branches junction table).
    if (Array.isArray(body.branch_ids)) {
      // Delete existing, then re-insert.
      await supabaseAdmin
        .from("staff_branches")
        .delete()
        .eq("staff_id", id);
      if (body.branch_ids.length > 0) {
        const sbRows = (body.branch_ids as string[]).map((bid) => ({
          staff_id: id,
          branch_id: bid,
        }));
        await supabaseAdmin.from("staff_branches").insert(sbRows);
      }
    }

    // Fetch refreshed row with branches array.
    const { data: refreshed, error: fetchErr } = await supabaseAdmin
      .from("staff")
      .select(STAFF_SELECT)
      .eq("id", id)
      .single();

    if (fetchErr) {
      return NextResponse.json(
        { ok: false, error: fetchErr.message },
        { status: 500 }
      );
    }

    // Enrich with branches array (from staff_branches junction).
    // Strip the password hash and expose `has_password` so the frontend can
    // tell whether the account has a password set.
    const branchIds = (refreshed?.staff_branches || []).map(
      (sb: { branch_id: string }) => sb.branch_id
    );
    const { branch_id, staff_branches, password, ...rest } = refreshed as Record<string, unknown>;
    const enriched = {
      ...rest,
      has_password: hasPasswordHash(password as string | null | undefined),
      branches: branchIds.length > 0 ? branchIds : (branch_id ? [branch_id] : []),
    };

    return NextResponse.json({ ok: true, data: enriched });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid body" },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      "code",
      "name",
      "phone",
      "email",
      "password",
      "role",
      "avatar",
      "group_id",
      "branch_id",
      "active",
    ];

    for (const field of allowedFields) {
      if (body[field] === undefined) continue;
      if (field === "active") {
        updateData[field] = Boolean(body[field]);
      } else if (field === "name") {
        updateData[field] = body[field]?.trim() || null;
      } else {
        updateData[field] = body[field] || null;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No fields provided to update" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("staff")
      .update(updateData)
      .eq("id", id);
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const { data: refreshed, error: fetchErr } = await supabaseAdmin
      .from("staff")
      .select(STAFF_SELECT)
      .eq("id", id)
      .single();

    if (fetchErr) {
      return NextResponse.json(
        { ok: false, error: fetchErr.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, data: refreshed });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check invoices referencing this staff
    const { data: invoices, error: invErr } = await supabaseAdmin
      .from("invoices")
      .select("id")
      .eq("staff_id", id)
      .limit(1);

    if (!invErr && invoices && invoices.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Không thể xóa nhân viên vì đang có hóa đơn liên quan đến nhân viên này",
        },
        { status: 409 }
      );
    }

    // Check booking_services referencing this staff (staff_id is text)
    const { data: bookingServices, error: bsErr } = await supabaseAdmin
      .from("booking_services")
      .select("id")
      .eq("staff_id", id)
      .limit(1);

    if (!bsErr && bookingServices && bookingServices.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Không thể xóa nhân viên vì đang có lịch hẹn liên quan đến nhân viên này",
        },
        { status: 409 }
      );
    }

    const { error } = await supabaseAdmin
      .from("staff")
      .delete()
      .eq("id", id);
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
