import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/supabase/warehouse/total-debt
 * Returns the total unpaid import-slip debt (sum of total_cost where is_paid
 * is false). Optional ?supplier_id= filter.
 *
 * Replaces the Prisma-backed /api/warehouse/totalitarian-debt route so the
 * pay-debt dialog works on Vercel (where Prisma uses an ephemeral SQLite
 * file). The dialog calls /api/warehouse/total-debt — this route matches
 * that URL.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get("supplier_id") || searchParams.get("supplierId");

    let query = supabaseAdmin
      .from("import_slips")
      .select("total_cost, is_paid")
      .eq("is_paid", false);
    if (supplierId) {
      query = query.eq("supplier_id", supplierId);
    }
    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    const totalDebt = (data || []).reduce(
      (sum, row) => sum + Number(row.total_cost || 0),
      0
    );
    return NextResponse.json({ ok: true, data: { totalDebt } });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
