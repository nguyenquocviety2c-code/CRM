import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from("service_categories")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Category not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, data });
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
    if (body.name !== undefined) updateData.name = body.name?.trim() || null;
    if (body.active !== undefined) updateData.active = Boolean(body.active);
    if (body.sort_order !== undefined)
      updateData.sort_order = Number(body.sort_order);
    if (body.branch_id !== undefined) updateData.branch_id = body.branch_id || null;
    if (body.requires_contact !== undefined) updateData.requires_contact = Boolean(body.requires_contact);

    // Allow update even if only branch_ids is provided
    const hasFields = Object.keys(updateData).length > 0 || Array.isArray(body.branch_ids);

    if (!hasFields) {
      return NextResponse.json(
        { ok: false, error: "No fields provided to update" },
        { status: 400 }
      );
    }

    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from("service_categories")
        .update(updateData)
        .eq("id", id);
      if (updateError) {
        return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
      }
    }

    // Sync multi-branch assignments if branch_ids provided
    let branchIds: string[] = [];
    if (Array.isArray(body.branch_ids)) {
      await supabaseAdmin.from("service_category_branches").delete().eq("service_category_id", id);
      if (body.branch_ids.length > 0) {
        const rows = body.branch_ids.map((bid: string) => ({
          service_category_id: id,
          branch_id: bid,
        }));
        await supabaseAdmin.from("service_category_branches").insert(rows);
        branchIds = body.branch_ids;
      }
    } else {
      // Fetch existing
      const { data: sbData } = await supabaseAdmin
        .from("service_category_branches")
        .select("branch_id")
        .eq("service_category_id", id);
      branchIds = (sbData || []).map((sb: { branch_id: string }) => sb.branch_id);
    }

    // Re-fetch the category
    const { data, error: fetchError } = await supabaseAdmin
      .from("service_categories")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError) {
      return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, data: { ...data, branches: branchIds } });
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
    const allowedFields = ["name", "active", "sort_order"];
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === "active") {
          updateData[field] = Boolean(body[field]);
        } else if (field === "sort_order") {
          updateData[field] = Number(body[field]);
        } else if (field === "name") {
          updateData[field] = body[field]?.trim() || null;
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No fields provided to update" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("service_categories")
      .update(updateData)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, data });
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

    // Check services referencing this category
    const { data, error } = await supabaseAdmin
      .from("services")
      .select("id")
      .eq("category_id", id)
      .limit(1);

    if (!error && data && data.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Không thể xóa danh mục vì đang có dịch vụ thuộc danh mục này",
        },
        { status: 409 }
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from("service_categories")
      .delete()
      .eq("id", id);
    if (deleteError) {
      return NextResponse.json(
        { ok: false, error: deleteError.message },
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
