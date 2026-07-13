import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/supabase/warehouse/pay-debt
 * Records a supplier debt payment. In "auto" mode, allocates the payment
 * across the oldest unpaid import slips (FIFO) and marks them is_paid=true
 * when fully covered. In "manual" mode, marks a single import slip as paid.
 *
 * Replaces the Prisma-backed /api/warehouse/pay-debt route so the feature
 * works on Vercel.
 *
 * Body: {
 *   paymentType: "auto" | "manual",
 *   amount: number,           // auto mode only
 *   importSlipId?: string,    // manual mode only
 *   paymentMethod: string,
 *   note?: string,
 *   paymentDate: string,
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      paymentType,
      amount,
      importSlipId,
      note,
    } = body as {
      paymentType?: string;
      amount?: number;
      importSlipId?: string;
      paymentMethod?: string;
      note?: string;
      paymentDate?: string;
    };

    if (paymentType === "manual") {
      if (!importSlipId) {
        return NextResponse.json(
          { ok: false, error: "Thiếu mã phiếu nhập (importSlipId)" },
          { status: 400 }
        );
      }
      const { error } = await supabaseAdmin
        .from("import_slips")
        .update({ is_paid: true })
        .eq("id", importSlipId);
      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, data: { importSlipId, is_paid: true } });
    }

    // Auto mode — FIFO allocation across unpaid import slips.
    const payAmount = Number(amount || 0);
    if (payAmount <= 0) {
      return NextResponse.json(
        { ok: false, error: "Số tiền thanh toán phải > 0" },
        { status: 400 }
      );
    }

    const { data: unpaidSlips, error: fetchErr } = await supabaseAdmin
      .from("import_slips")
      .select("id, total_cost, is_paid")
      .eq("is_paid", false)
      .order("import_date", { ascending: true });
    if (fetchErr) {
      return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
    }

    let remaining = payAmount;
    const updatedSlips: Array<{ id: string; is_paid: boolean }> = [];
    for (const slip of unpaidSlips || []) {
      if (remaining <= 0) break;
      const slipTotal = Number(slip.total_cost || 0);
      const toPay = Math.min(remaining, slipTotal);
      remaining -= toPay;
      const fullyPaid = toPay >= slipTotal;
      const newTotal = slipTotal - toPay;
      const { error: updErr } = await supabaseAdmin
        .from("import_slips")
        .update({ is_paid: fullyPaid, total_cost: newTotal })
        .eq("id", slip.id);
      if (updErr) {
        console.error("pay-debt: failed to update slip", slip.id, updErr.message);
      } else {
        updatedSlips.push({ id: slip.id, is_paid: fullyPaid });
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        paidAmount: payAmount - remaining,
        remaining,
        updatedSlips,
        note: note || "Thanh toán nợ NCC",
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
