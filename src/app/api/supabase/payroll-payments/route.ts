import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const PAYROLL_SELECT = "*, staff:staff(id, code, name, phone)";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const staffId = searchParams.get("staff_id");
    const paymentType = searchParams.get("payment_type");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const search = searchParams.get("search");
    const pageStr = searchParams.get("page");
    const limitStr = searchParams.get("limit");

    const page = pageStr ? Math.max(1, parseInt(pageStr, 10)) : 1;
    const limit = limitStr ? Math.max(1, parseInt(limitStr, 10)) : 50;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("payroll_payments")
      .select(PAYROLL_SELECT, { count: "exact" });

    if (staffId) query = query.eq("staff_id", staffId);
    if (paymentType) query = query.eq("payment_type", paymentType);
    if (dateFrom) query = query.gte("payment_date", dateFrom);
    if (dateTo) query = query.lte("payment_date", dateTo);
    if (search) {
      query = query.or(`note.ilike.%${search}%`);
    }

    query = query
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return NextResponse.json({
      ok: true,
      data: data ?? [],
      pagination: { page, limit, total, totalPages },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { staff_id, payment_type, amount, payment_method, payment_date, note, created_by } = body;

    if (!staff_id) {
      return NextResponse.json({ ok: false, error: "staff_id is required" }, { status: 400 });
    }
    if (amount === undefined || amount === null || isNaN(Number(amount))) {
      return NextResponse.json({ ok: false, error: "amount is required and must be a number" }, { status: 400 });
    }

    const insertData: Record<string, unknown> = {
      staff_id,
      payment_type: payment_type || "salary",
      amount: Number(amount),
      payment_method: payment_method || "cash",
      payment_date: payment_date || new Date().toISOString().slice(0, 10),
      note: note || null,
      created_by: created_by || null,
    };

    const { data: payment, error } = await supabaseAdmin
      .from("payroll_payments")
      .insert(insertData)
      .select(PAYROLL_SELECT)
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: payment }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
