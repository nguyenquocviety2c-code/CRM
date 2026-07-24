import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/customers/export
 * Exports customers as a CSV file. Re-implemented on Supabase so it works
 * on Vercel (the old Prisma version read from an ephemeral SQLite file).
 *
 * Query params: search, source (name), group (name).
 *
 * Joins customer_sources + customer_groups manually (the FKs aren't
 * registered in PostgREST for this schema, so we batch-lookup names).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").trim();
    const sourceName = searchParams.get("source") || "";
    const groupName = searchParams.get("group") || "";

    // 1. Fetch all customers (limit 5000 to keep export reasonable).
    let query = supabaseAdmin
      .from("customers")
      .select("id, code, name, phone, email, gender, birthday, address, note, source_id, group_id, total_spent, debt, created_at")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (search) {
      // Case-insensitive search across name / phone / code (OR).
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,code.ilike.%${search}%`);
    }
    const { data: customers, error } = await query;
    if (error) {
      return Response.json({ ok: false, error: error.message }, { status: 500 });
    }

    // 2. Batch-lookup source + group names for filtering + display.
    const sourceIds = new Set<string>();
    const groupIds = new Set<string>();
    for (const c of customers || []) {
      if (c.source_id) sourceIds.add(c.source_id);
      if (c.group_id) groupIds.add(c.group_id);
    }

    const sourceMap = new Map<string, string>();
    if (sourceIds.size > 0) {
      const { data: sources } = await supabaseAdmin
        .from("customer_sources")
        .select("id, name")
        .in("id", Array.from(sourceIds));
      for (const s of sources || []) sourceMap.set(s.id, s.name);
    }
    const groupMap = new Map<string, string>();
    if (groupIds.size > 0) {
      const { data: groups } = await supabaseAdmin
        .from("customer_groups")
        .select("id, name")
        .in("id", Array.from(groupIds));
      for (const g of groups || []) groupMap.set(g.id, g.name);
    }

    // 3. Apply source/group name filters (the API only had name-based filtering).
    let filtered = customers || [];
    if (sourceName) {
      filtered = filtered.filter((c) => {
        const name = c.source_id ? sourceMap.get(c.source_id) : null;
        return name === sourceName;
      });
    }
    if (groupName) {
      filtered = filtered.filter((c) => {
        const name = c.group_id ? groupMap.get(c.group_id) : null;
        return name === groupName;
      });
    }

    // 4. Build CSV.
    const headers = [
      "Mã KH", "Tên", "SĐT", "Email", "Giới tính", "Ngày sinh",
      "Địa chỉ", "Nguồn", "Nhóm", "Tổng chi tiêu", "Công nợ", "Ghi chú",
    ];
    const rows = filtered.map((c) => [
      c.code || "",
      c.name || "",
      c.phone || "",
      c.email || "",
      c.gender || "",
      c.birthday ? new Date(c.birthday).toLocaleDateString("vi-VN") : "",
      c.address || "",
      c.source_id ? sourceMap.get(c.source_id) || "" : "",
      c.group_id ? groupMap.get(c.group_id) || "" : "",
      String(c.total_spent || 0),
      String(c.debt || 0),
      c.note || "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    return new Response(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="customers.csv"',
      },
    });
  } catch (error) {
    console.error("GET /api/customers/export error:", error);
    return Response.json(
      { ok: false, error: "Failed to export customers" },
      { status: 500 }
    );
  }
}
