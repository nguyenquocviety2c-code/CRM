import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { hashPassword, hasPasswordHash } from "@/lib/password";

/**
 * GET /api/supabase/staff
 * List staff with filters and pagination.
 *
 * Query params:
 *   - search:    ilike match on name, phone or code
 *   - group_id:  filter by staff_groups FK
 *   - branch_id: filter by branches FK
 *   - active:    "true" | "false" -> only active/inactive
 *   - page:      1-based page number (default 1)
 *   - limit:     page size (default 50)
 *
 * Joins staff_groups and branches via FK relations.
 *
 * Response: { ok, data, pagination: { page, limit, total, totalPages } }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").trim();
    const groupId = searchParams.get("group_id") || "";
    const branchId = searchParams.get("branch_id") || "";
    const active = searchParams.get("active");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.max(
      1,
      Math.min(500, parseInt(searchParams.get("limit") || "50", 10) || 50)
    );
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("staff")
      .select("*, group:staff_groups(*), branch:branches(*)", { count: "exact" });

    if (groupId) {
      query = query.eq("group_id", groupId);
    }
    if (branchId) {
      // A staff belongs to a branch if EITHER the primary `branch_id` column
      // matches OR they have a row in the `staff_branches` join table for that
      // branch (multi-branch assignment). We resolve the join-table matches
      // first, then filter the staff query with an `in` (id) OR `eq` (branch_id)
      // so a staff assigned to multiple branches appears in EACH branch's list.
      let staffIdsFromBranch: string[] = [];
      try {
        const { data: sbRows } = await supabaseAdmin
          .from("staff_branches")
          .select("staff_id")
          .eq("branch_id", branchId);
        staffIdsFromBranch = (sbRows || [])
          .map((r: { staff_id: string }) => r.staff_id)
          .filter((id: string) => typeof id === "string");
      } catch {
        // best-effort; fall back to primary branch_id filter only.
      }
      if (staffIdsFromBranch.length > 0) {
        // Use or() to match staff whose id is in the join-table list OR whose
        // primary branch_id equals the filter. Encode the in-list safely.
        const idList = staffIdsFromBranch
          .map((id) => `"${id.replace(/"/g, '""')}"`)
          .join(",");
        query = query.or(`id.in.(${idList}),branch_id.eq.${branchId}`);
      } else {
        query = query.eq("branch_id", branchId);
      }
    }
    if (active === "true") {
      query = query.eq("active", true);
    } else if (active === "false") {
      query = query.eq("active", false);
    }
    if (search) {
      const escaped = search.replace(/"/g, '\\"');
      query = query.or(
        `name.ilike.%${encodeURIComponent(escaped)}%,phone.ilike.%${encodeURIComponent(
          escaped
        )}%,code.ilike.%${encodeURIComponent(escaped)}%`
      );
    }

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("GET /api/supabase/staff error:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const total = count ?? 0;
    const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

    // Fetch multi-branch assignments for all staff in the page
    const staffIds = (data ?? []).map((s: { id: string }) => s.id);
    const branchMap: Record<string, string[]> = {};
    if (staffIds.length > 0) {
      const { data: sbData } = await supabaseAdmin
        .from("staff_branches")
        .select("staff_id, branch_id")
        .in("staff_id", staffIds);
      if (sbData) {
        for (const sb of sbData) {
          if (!branchMap[sb.staff_id]) branchMap[sb.staff_id] = [];
          branchMap[sb.staff_id].push(sb.branch_id);
        }
      }
    }

    // Attach branches array to each staff row.
    // Strip the password hash from the response and expose only a boolean
    // `has_password` so the frontend can tell whether the account already has
    // a password set (used by the edit dialog to decide whether the "old
    // password" field is required).
    const enriched = (data ?? []).map((s: Record<string, unknown>) => {
      const { password, ...rest } = s;
      return {
        ...rest,
        has_password: hasPasswordHash(password as string | null | undefined),
        branches: branchMap[s.id as string] || (s.branch_id ? [s.branch_id] : []),
      };
    });

    return NextResponse.json({
      ok: true,
      data: enriched,
      pagination: { page, limit, total, totalPages },
    });
  } catch (error) {
    console.error("GET /api/supabase/staff error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch staff" },
      { status: 500 }
    );
  }
}

/**
 * Generate a unique staff code with prefix "NV" (e.g. NV000001).
 *
 * Strategy:
 *   1. Try the RPC function `generate_code(prefix, table_name)` if it exists.
 *   2. Fall back to JS-based generation: query the max code with prefix "NV",
 *      parse the numeric portion, increment.
 *   3. Final fallback: "NV000001".
 */
async function generateStaffCode(): Promise<string> {
  const PREFIX = "NV";
  const PAD = 6;

  // 1) Try the RPC function generate_code(prefix, table_name).
  try {
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
      "generate_code",
      { prefix: PREFIX, table_name: "staff" }
    );
    if (!rpcError && rpcData !== null && rpcData !== undefined) {
      const code = String(rpcData);
      if (code) {
        if (code.startsWith(PREFIX)) {
          return code;
        }
        const num = parseInt(code, 10);
        if (!isNaN(num)) {
          return `${PREFIX}${String(num).padStart(PAD, "0")}`;
        }
        return code;
      }
    }
  } catch (err) {
    // RPC may not exist; fall back silently.
    console.warn("generate_code RPC failed, falling back to JS:", err);
  }

  // 2) JS-based fallback: query the highest code starting with "NV".
  const { data: maxRows, error: maxErr } = await supabaseAdmin
    .from("staff")
    .select("code")
    .like("code", `${PREFIX}%`)
    .order("code", { ascending: false })
    .limit(1);

  if (maxErr) {
    console.error("Failed to query max staff code:", maxErr);
    return `${PREFIX}${String(1).padStart(PAD, "0")}`;
  }

  let nextNum = 1;
  if (maxRows && maxRows.length > 0 && maxRows[0]?.code) {
    const numPart = String(maxRows[0].code).slice(PREFIX.length);
    const parsed = parseInt(numPart, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      nextNum = parsed + 1;
    }
  }

  return `${PREFIX}${String(nextNum).padStart(PAD, "0")}`;
}

/**
 * POST /api/supabase/staff
 * Create a new staff member.
 *
 * Body fields (name required):
 *   name, phone?, email?, password?, role?, avatar?, group_id?, branch_id?, active?
 *
 * The `code` is auto-generated with prefix "NV" and a 6-digit padded number
 * (e.g. NV000001).
 *
 * Returns the created staff member with all joins.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json(
        { ok: false, error: "Name is required" },
        { status: 400 }
      );
    }

    // Generate code if not provided.
    let code: string | undefined =
      typeof body.code === "string" && body.code.trim()
        ? body.code.trim()
        : undefined;
    if (!code) {
      code = await generateStaffCode();
    }

    const insertPayload: Record<string, unknown> = {
      code,
      name: body.name.trim(),
    };

    // Text fields.
    if (body.phone !== undefined && body.phone !== null) {
      insertPayload.phone = body.phone;
    }
    if (body.email !== undefined && body.email !== null) {
      insertPayload.email = body.email;
    }
    // Username (login name) — stored as-is. A unique constraint on the
    // `username` column (added via SQL migration) makes duplicates return a
    // 23505 unique_violation, handled below.
    if (body.username !== undefined && body.username !== null && body.username !== "") {
      insertPayload.username = body.username;
    }
    if (body.password !== undefined && body.password !== null && body.password !== "") {
      // Hash the password with scrypt before storing — NEVER store plaintext.
      insertPayload.password = hashPassword(body.password);
    }
    if (body.role !== undefined && body.role !== null && body.role !== "") {
      insertPayload.role = body.role;
    } else {
      insertPayload.role = "staff";
    }
    if (body.avatar !== undefined && body.avatar !== null) {
      insertPayload.avatar = body.avatar;
    }

    // Boolean fields.
    if (body.active !== undefined && body.active !== null) {
      insertPayload.active = Boolean(body.active);
    } else {
      insertPayload.active = true;
    }

    // FK fields — empty string -> null.
    if (body.group_id !== undefined) {
      insertPayload.group_id =
        body.group_id === "" || body.group_id === null ? null : body.group_id;
    }
    if (body.branch_id !== undefined) {
      insertPayload.branch_id =
        body.branch_id === "" || body.branch_id === null
          ? null
          : body.branch_id;
    }

    // New permission/booking fields.
    if (body.allow_booking !== undefined) {
      insertPayload.allow_booking = Boolean(body.allow_booking);
    }
    if (body.allow_overlap !== undefined) {
      insertPayload.allow_overlap = Boolean(body.allow_overlap);
    }
    if (body.app_login !== undefined) {
      insertPayload.app_login = Boolean(body.app_login);
    }
    if (body.account_type !== undefined) {
      insertPayload.account_type = body.account_type;
    }
    if (body.permissions !== undefined) {
      insertPayload.permissions = body.permissions;
    }

    const { data, error } = await supabaseAdmin
      .from("staff")
      .insert(insertPayload)
      .select("*, group:staff_groups(*), branch:branches(*)")
      .single();

    if (error) {
      console.error("POST /api/supabase/staff error:", error);
      // 23505 = unique_violation (e.g. duplicate code, email, or username).
      if (error.code === "23505") {
        return NextResponse.json(
          {
            ok: false,
            error: "Tên đăng nhập, mã hoặc email đã tồn tại",
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    // Insert multi-branch assignments into staff_branches
    const branchIds: string[] = Array.isArray(body.branch_ids) ? body.branch_ids : [];
    if (branchIds.length > 0) {
      const sbRows = branchIds.map((bid: string) => ({
        staff_id: data.id,
        branch_id: bid,
      }));
      await supabaseAdmin.from("staff_branches").insert(sbRows);
    }

    return NextResponse.json({ ok: true, data: { ...data, branches: branchIds } }, { status: 201 });
  } catch (error) {
    console.error("POST /api/supabase/staff error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to create staff member" },
      { status: 500 }
    );
  }
}
