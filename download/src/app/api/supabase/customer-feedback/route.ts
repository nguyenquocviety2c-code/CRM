import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/supabase/customer-feedback
 * List customer feedback from Supabase.
 * Query params:
 *   ?customer_id=   filter by customer
 *   ?branch_id=     filter by branch (optional; customer_feedbacks may have a branch_id column in the future)
 *   ?rating=        filter by rating (1-5)
 *   ?page=          1-based page number (default 1)
 *   ?limit=         page size (default 20)
 *
 * Returns: { ok: true, data: { feedbacks: [...], total, page, limit } }
 * Each feedback row is mapped snake_case -> camelCase to match the original
 * Prisma API surface so existing callers do not need to change their parsing.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customer_id");
    const branchId = searchParams.get("branch_id");
    const rating = searchParams.get("rating");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "20", 10));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("customer_feedbacks")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (customerId) {
      query = query.eq("customer_id", customerId);
    }
    if (branchId) {
      query = query.eq("branch_id", branchId);
    }
    if (rating) {
      const r = parseInt(rating, 10);
      if (!isNaN(r)) {
        query = query.eq("rating", r);
      }
    }

    const { data, error, count } = await query;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const feedbacks = (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id,
      rating: Number(row.rating) || 0,
      content: row.content ?? null,
      customerId: row.customer_id ?? null,
      serviceId: row.service_id ?? null,
      branchId: row.branch_id ?? null,
      feedbackDate: row.feedback_date ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return NextResponse.json({
      ok: true,
      data: { feedbacks, total: count ?? 0, page, limit },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch feedback";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/supabase/customer-feedback
 * Create a new customer feedback entry.
 * Body (camelCase, matches the UI form / customerFeedbackSchema):
 *   { rating, content, customerId, serviceId, branchId? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rating, content, customerId, serviceId, branchId } = body ?? {};

    if (!customerId) {
      return NextResponse.json(
        { ok: false, error: "customerId is required" },
        { status: 400 }
      );
    }
    if (!serviceId) {
      return NextResponse.json(
        { ok: false, error: "serviceId is required" },
        { status: 400 }
      );
    }

    const insertData = {
      customer_id: customerId,
      service_id: serviceId,
      branch_id: branchId || null,
      rating: Number(rating) || 5,
      content: content || null,
    };

    const { data, error } = await supabaseAdmin
      .from("customer_feedbacks")
      .insert(insertData)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const row = data as Record<string, unknown>;
    const mapped = {
      id: row.id,
      rating: Number(row.rating) || 0,
      content: row.content ?? null,
      customerId: row.customer_id ?? null,
      serviceId: row.service_id ?? null,
      branchId: row.branch_id ?? null,
      feedbackDate: row.feedback_date ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    return NextResponse.json({ ok: true, data: mapped }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create feedback";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
