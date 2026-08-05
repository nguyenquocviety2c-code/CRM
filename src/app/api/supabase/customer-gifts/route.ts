import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentStaffId } from "@/lib/auth/current-staff";

/**
 * GET /api/supabase/customer-gifts?customer_id=UUID
 *
 * Returns the list of incentives (promotions + vouchers) GIFTED to a customer
 * via the "Tặng khuyến mãi" dialog. Each row joins the incentives table so the
 * caller gets the full incentive shape (name/code/discount/dates/usage) in one
 * call. A gifted incentive is usable by the customer even after its global
 * usageLimit is exhausted — the gift grants the customer a personal allowance
 * (as long as the incentive is still within its date validity).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customer_id");
    if (!customerId) {
      return NextResponse.json(
        { ok: false, error: "customer_id is required" },
        { status: 400 }
      );
    }
    const { data, error } = await supabaseAdmin
      .from("customer_gifts")
      .select(
        "id, customer_id, incentive_id, created_at, created_by, incentive:incentives(*)"
      )
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, data: data || [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Helper removed — inline NextResponse.json used directly. */

/**
 * POST /api/supabase/customer-gifts
 * Body: { customer_id, incentive_ids: string[] }
 *
 * Bulk-GIFT a set of incentives to a customer. Idempotent — re-gifting an
 * already-gifted incentive is a no-op (UNIQUE constraint on customer_id +
 * incentive_id). Records who gifted them (created_by from the auth cookie).
 * Returns the final list of this customer's gifts (same shape as GET).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const customerId = typeof body?.customer_id === "string" ? body.customer_id : "";
    const incentiveIds: unknown = body?.incentive_ids;
    if (!customerId || !Array.isArray(incentiveIds) || incentiveIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "customer_id and non-empty incentive_ids[] are required" },
        { status: 400 }
      );
    }
    const actorStaffId = getCurrentStaffId(request);
    const rows = incentiveIds
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .map((incentive_id) => ({
        customer_id: customerId,
        incentive_id,
        created_by: actorStaffId,
      }));
    if (rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No valid incentive_ids provided" },
        { status: 400 }
      );
    }
    // upsert so re-gifting is a no-op (UNIQUE customer_id+incentive_id).
    const { error } = await supabaseAdmin
      .from("customer_gifts")
      .upsert(rows, { onConflict: "customer_id,incentive_id", ignoreDuplicates: true });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    // Return the customer's full gift list so the caller can refresh state.
    const { data, error: fetchErr } = await supabaseAdmin
      .from("customer_gifts")
      .select(
        "id, customer_id, incentive_id, created_at, created_by, incentive:incentives(*)"
      )
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    if (fetchErr) {
      return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, data: data || [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/supabase/customer-gifts?customer_id=UUID&incentive_id=UUID
 *
 * Remove a single gifted incentive from a customer (revoke the gift).
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customer_id");
    const incentiveId = searchParams.get("incentive_id");
    if (!customerId || !incentiveId) {
      return NextResponse.json(
        { ok: false, error: "customer_id and incentive_id are required" },
        { status: 400 }
      );
    }
    const { error } = await supabaseAdmin
      .from("customer_gifts")
      .delete()
      .eq("customer_id", customerId)
      .eq("incentive_id", incentiveId);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
