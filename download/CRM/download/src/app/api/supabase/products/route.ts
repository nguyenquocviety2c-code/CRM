import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Generate a product code: "A" + 6-digit zero-padded sequence.
 * Tries RPC generate_code first, then falls back to JS counting.
 */
async function generateProductCode(): Promise<string> {
  // Try RPC first
  try {
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
      "generate_code",
      { prefix: "A", table_name: "products" }
    );
    if (!rpcError && rpcData) {
      return String(rpcData);
    }
  } catch {
    // ignore and fallback
  }

  // JS fallback: count existing rows with code starting with "A"
  const { data: existing, error: countError } = await supabaseAdmin
    .from("products")
    .select("code")
    .like("code", "A%")
    .order("code", { ascending: false })
    .limit(1);

  if (countError) {
    // If we cannot read, generate a timestamp-based unique code
    const ts = Date.now().toString().slice(-6);
    return `A${ts.padStart(6, "0")}`;
  }

  let next = 1;
  if (existing && existing.length > 0) {
    const lastCode = String(existing[0].code || "");
    const numPart = lastCode.replace(/^A/, "");
    const parsed = parseInt(numPart, 10);
    if (!isNaN(parsed)) {
      next = parsed + 1;
    }
  }
  return `A${String(next).padStart(6, "0")}`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branch_id");
    const categoryId = searchParams.get("category_id");
    const search = searchParams.get("search");
    const active = searchParams.get("active");
    const pageStr = searchParams.get("page");
    const limitStr = searchParams.get("limit");

    const page = pageStr ? Math.max(1, parseInt(pageStr, 10)) : 1;
    const limit = limitStr ? Math.max(1, parseInt(limitStr, 10)) : 50;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("products")
      .select(
        "*, category:product_categories(id, name, code), branch:branches(id, name)",
        { count: "exact" }
      );

    if (branchId) query = query.eq("branch_id", branchId);
    if (categoryId) query = query.eq("category_id", categoryId);
    if (active === "true") query = query.eq("active", true);
    else if (active === "false") query = query.eq("active", false);
    if (search) {
      query = query.or(
        `name.ilike.%${search}%,code.ilike.%${search}%`
      );
    }

    query = query.order("created_at", { ascending: false }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return NextResponse.json({
      ok: true,
      data: data ?? [],
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
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
    const {
      name,
      price,
      cost,
      unit,
      stock,
      initial_stock,
      image,
      volume,
      volume_unit,
      origin,
      detail,
      show_on_app,
      active,
      category_id,
      branch_id,
      code,
      product_type,
    } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { ok: false, error: "Product name is required" },
        { status: 400 }
      );
    }

    // Auto-generate code if not provided
    const finalCode =
      typeof code === "string" && code.trim()
        ? code.trim()
        : await generateProductCode();

    const insertData: Record<string, unknown> = {
      code: finalCode,
      name: name.trim(),
      price: price !== undefined ? Number(price) : 0,
      cost: cost !== undefined ? Number(cost) : 0,
      unit: unit || null,
      stock: stock !== undefined ? Number(stock) : 0,
      initial_stock: initial_stock !== undefined ? Number(initial_stock) : 0,
      image: image || null,
      volume: volume !== undefined ? Number(volume) : null,
      volume_unit: volume_unit || null,
      origin: origin || null,
      detail: detail || null,
      show_on_app: show_on_app !== undefined ? Boolean(show_on_app) : true,
      active: active !== undefined ? Boolean(active) : true,
      category_id: category_id || null,
      branch_id: branch_id || null,
      product_type: product_type || "trading",
    };

    const { data, error } = await supabaseAdmin
      .from("products")
      .insert(insertData)
      .select(
        "*, category:product_categories(id, name, code), branch:branches(id, name)"
      )
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
