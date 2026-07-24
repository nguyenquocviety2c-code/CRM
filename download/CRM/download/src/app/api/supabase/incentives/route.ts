import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/supabase/incentives
 * List incentives (promotions or vouchers) from Supabase.
 * Query params: ?type=promotion|voucher &search= &page= &limit=
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "promotion";
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("incentives")
      .select("*", { count: "exact" })
      .eq("type", type)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (search) {
      query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
    }

    const { data, error, count } = await query;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Map snake_case -> camelCase for the UI layer.
    // used_count is maintained by the invoices API (incremented when an invoice
    // applies a promotion, decremented on invoice delete). unusedCount and
    // expiredCount are DERIVED here so they're always consistent:
    //   unusedCount = max(0, usageLimit - usedCount)
    //   expiredCount = (end_date in the past) ? unusedCount : 0
    const now = Date.now();
    const items = (data ?? []).map((row: Record<string, unknown>) => {
      const usedCount = Number(row.used_count) || 0;
      const usageLimit = Number(row.usage_limit) || 0;
      const unusedCount = Math.max(0, usageLimit - usedCount);
      let expiredCount = 0;
      const endDateRaw = row.end_date as string | null;
      if (endDateRaw) {
        const endMs = new Date(endDateRaw).getTime();
        if (!isNaN(endMs) && endMs < now) {
          expiredCount = unusedCount;
        }
      }
      return {
        id: row.id,
        code: row.code ?? null,
        name: row.name,
        applyScope: row.apply_scope ?? null,
        startDate: row.start_date ?? null,
        endDate: row.end_date ?? null,
        branchIds: row.branch_ids ?? null,
        serviceIds: row.service_ids ?? null,
        discountType: row.discount_type ?? "SERVICE_DISCOUNT",
        discountValue: Number(row.discount_value) || 0,
        usageLimit,
        autoApplyTarget: row.auto_apply_target ?? null,
        type: row.type ?? "promotion",
        usedCount,
        unusedCount,
        expiredCount,
        cost: Number(row.cost) || 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    return NextResponse.json({
      ok: true,
      data: { items, total: count ?? 0, page, limit },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch incentives";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/supabase/incentives
 * Create a new incentive (promotion or voucher).
 * Body fields use camelCase (matches the UI form); mapped to snake_case for Supabase.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      code,
      name,
      applyScope,
      startDate,
      endDate,
      branchIds, // string[] | undefined
      discountType,
      serviceIds, // string[] | undefined
      discountValue,
      usageLimit,
      autoApplyTarget,
      type,
    } = body;

    if (!name) {
      return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
    }

    const finalCode = code || `KM${Date.now()}`;
    const insertData = {
      code: finalCode,
      name,
      apply_scope: applyScope || "time_range",
      start_date: startDate || null,
      end_date: endDate || null,
      branch_ids: Array.isArray(branchIds) && branchIds.length > 0 ? JSON.stringify(branchIds) : null,
      discount_type: discountType || "SERVICE_DISCOUNT",
      service_ids: Array.isArray(serviceIds) && serviceIds.length > 0 ? JSON.stringify(serviceIds) : null,
      discount_value: Number(discountValue) || 0,
      usage_limit: Number(usageLimit) || 1,
      auto_apply_target: autoApplyTarget || null,
      type: type || "promotion",
      used_count: 0,
      unused_count: 0,
      expired_count: 0,
      cost: 0,
    };

    const { data, error } = await supabaseAdmin
      .from("incentives")
      .insert(insertData)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create incentive";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
