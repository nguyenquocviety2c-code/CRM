import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * DELETE /api/supabase/branches/[id]
 * Delete a branch by ID.
 * Prevents deletion if the branch is referenced by other tables (products, services, etc.).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check for references in related tables before deleting
    const tablesToCheck = [
      { table: "products", column: "branch_id" },
      { table: "services", column: "branch_id" },
      { table: "staff", column: "branch_id" },
      { table: "salon_info", column: "branch_id" },
      { table: "revenue_vouchers", column: "branch_id" },
      { table: "expenditure_vouchers", column: "branch_id" },
      { table: "import_slips", column: "branch_id" },
      { table: "export_slips", column: "branch_id" },
      { table: "cash_fund_settings", column: "branch_id" },
    ];

    for (const { table, column } of tablesToCheck) {
      const { data, error } = await supabaseAdmin
        .from(table)
        .select("id")
        .eq(column, id)
        .limit(1);

      if (error) {
        // Table might not exist or column might not exist — skip silently
        continue;
      }

      if (data && data.length > 0) {
        return NextResponse.json(
          {
            ok: false,
            error: `Không thể xóa chi nhánh vì đang có dữ liệu liên quan trong bảng ${table}`,
          },
          { status: 409 }
        );
      }
    }

    const { error } = await supabaseAdmin
      .from("branches")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("DELETE /api/supabase/branches/[id] error:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: { id } });
  } catch (error: unknown) {
    console.error("DELETE /api/supabase/branches/[id] error:", error);
    const message = error instanceof Error ? error.message : "Failed to delete branch";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
