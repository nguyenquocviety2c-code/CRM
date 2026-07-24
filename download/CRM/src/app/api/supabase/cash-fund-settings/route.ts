import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const CASH_FUND_SELECT = "*, branches(*)";

/**
 * GET /api/supabase/cash-fund-settings
 * Get current cash fund settings, optionally filtered by branch_id.
 *
 * Query params:
 *   - branch_id: filter by branch FK
 *
 * If no settings exist, returns a default:
 *   { opening_balance: 0, carry_forward: true }
 *
 * Response: { ok, data }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branch_id") || "";

    let query = supabaseAdmin
      .from("cash_fund_settings")
      .select(CASH_FUND_SELECT)
      .order("effective_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1);

    if (branchId) {
      query = query.eq("branch_id", branchId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error("GET /api/supabase/cash-fund-settings error:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({
        ok: true,
        data: {
          opening_balance: 0,
          carry_forward: true,
        },
      });
    }

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error("GET /api/supabase/cash-fund-settings error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch cash fund settings" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/supabase/cash-fund-settings
 * Update cash fund settings. If opening_balance is changing, a cash_fund_history
 * entry is also created with previous_value, new_value, reason, mechanism, operator.
 *
 * Body fields:
 *   opening_balance?, carry_forward?, branch_id?, effective_date?,
 *   reason?, mechanism?, operator?
 *
 * Strategy:
 *   - Look up the current settings (by branch_id if provided).
 *   - If opening_balance is provided and differs from the current value,
 *     insert a cash_fund_history row.
 *   - Upsert the cash_fund_settings row.
 *
 * Response: { ok, data }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    const branchId =
      body.branch_id === undefined ||
      body.branch_id === null ||
      body.branch_id === ""
        ? null
        : body.branch_id;

    // 1) Fetch current settings (if any).
    let currentSettings: Record<string, unknown> | null = null;
    {
      let lookup = supabaseAdmin
        .from("cash_fund_settings")
        .select("*")
        .order("effective_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1);

      if (branchId) {
        lookup = lookup.eq("branch_id", branchId);
      }

      const { data, error } = await lookup.maybeSingle();
      if (error) {
        console.error(
          "PUT /api/supabase/cash-fund-settings - lookup error:",
          error
        );
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }
      currentSettings = data;
    }

    const previousValue =
      currentSettings && currentSettings.opening_balance !== undefined
        ? Number(currentSettings.opening_balance)
        : 0;

    const newOpeningBalance =
      body.opening_balance !== undefined &&
      body.opening_balance !== null &&
      body.opening_balance !== ""
        ? Number(body.opening_balance)
        : previousValue;

    // 2) Build the upsert payload.
    const upsertPayload: Record<string, unknown> = {};

    if (currentSettings && currentSettings.id) {
      upsertPayload.id = currentSettings.id;
    }

    if (body.opening_balance !== undefined && body.opening_balance !== null && body.opening_balance !== "") {
      upsertPayload.opening_balance = newOpeningBalance;
    }

    if (body.carry_forward !== undefined && body.carry_forward !== null) {
      upsertPayload.carry_forward = Boolean(body.carry_forward);
    }

    if (body.branch_id !== undefined) {
      upsertPayload.branch_id = branchId;
    }

    if (body.effective_date !== undefined && body.effective_date !== null && body.effective_date !== "") {
      upsertPayload.effective_date = String(body.effective_date);
    } else if (!currentSettings) {
      upsertPayload.effective_date = new Date().toISOString().slice(0, 10);
    }

    upsertPayload.updated_at = new Date().toISOString();

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("cash_fund_settings")
      .upsert(upsertPayload)
      .select(CASH_FUND_SELECT)
      .single();

    if (updateErr) {
      console.error("PUT /api/supabase/cash-fund-settings error:", updateErr);
      return NextResponse.json(
        { ok: false, error: updateErr.message },
        { status: 500 }
      );
    }

    // 3) If opening_balance changed, create a cash_fund_history entry.
    const balanceChanged =
      body.opening_balance !== undefined &&
      body.opening_balance !== null &&
      body.opening_balance !== "" &&
      Number(newOpeningBalance) !== Number(previousValue);

    if (balanceChanged) {
      const historyRow: Record<string, unknown> = {
        previous_value: Number(previousValue),
        new_value: Number(newOpeningBalance),
        reason:
          body.reason !== undefined && body.reason !== null
            ? String(body.reason)
            : "Update opening balance",
        mechanism:
          body.mechanism !== undefined && body.mechanism !== null
            ? String(body.mechanism)
            : "manual",
        operator:
          body.operator !== undefined && body.operator !== null
            ? String(body.operator)
            : "system",
        branch_id: branchId,
      };

      const { error: histErr } = await supabaseAdmin
        .from("cash_fund_histories")
        .insert(historyRow);

      if (histErr) {
        console.error(
          "PUT /api/supabase/cash-fund-settings - history insert error:",
          histErr
        );
        // Settings were updated; warn about partial failure but still return success.
        return NextResponse.json({
          ok: true,
          data: updated,
          warning: `Settings updated but failed to log history: ${histErr.message}`,
        });
      }
    }

    return NextResponse.json({ ok: true, data: updated });
  } catch (error) {
    console.error("PUT /api/supabase/cash-fund-settings error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to update cash fund settings" },
      { status: 500 }
    );
  }
}
