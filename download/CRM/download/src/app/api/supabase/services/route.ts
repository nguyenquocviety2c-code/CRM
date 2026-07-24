import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const SERVICE_SELECT =
  "*, category:service_categories(id, name), sub_prices:service_sub_prices(id, service_id, label, price, sort_order), attached_products:service_attached_products(id, service_id, product_id, quantity, product:products(id, name, code, unit, price))";

/**
 * Generate a service code: "DV" + 6-digit zero-padded sequence.
 * Tries RPC generate_code first, then falls back to JS counting.
 */
async function generateServiceCode(): Promise<string> {
  // Try RPC first
  try {
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
      "generate_code",
      { prefix: "DV", table_name: "services" }
    );
    if (!rpcError && rpcData) {
      return String(rpcData);
    }
  } catch {
    // ignore and fallback
  }

  // JS fallback: count existing rows with code starting with "DV"
  const { data: existing, error: countError } = await supabaseAdmin
    .from("services")
    .select("code")
    .like("code", "DV%")
    .order("code", { ascending: false })
    .limit(1);

  if (countError) {
    const ts = Date.now().toString().slice(-6);
    return `DV${ts.padStart(6, "0")}`;
  }

  let next = 1;
  if (existing && existing.length > 0) {
    const lastCode = String(existing[0].code || "");
    const numPart = lastCode.replace(/^DV/, "");
    const parsed = parseInt(numPart, 10);
    if (!isNaN(parsed)) {
      next = parsed + 1;
    }
  }
  return `DV${String(next).padStart(6, "0")}`;
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
      .from("services")
      .select(SERVICE_SELECT, { count: "exact" });

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
      cost_type,
      duration,
      commission,
      active,
      allow_booking,
      show_on_app,
      category_id,
      branch_id,
      code,
      sub_prices,
      attached_products,
    } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { ok: false, error: "Service name is required" },
        { status: 400 }
      );
    }

    // Auto-generate code if not provided
    const finalCode =
      typeof code === "string" && code.trim()
        ? code.trim()
        : await generateServiceCode();

    const insertData: Record<string, unknown> = {
      code: finalCode,
      name: name.trim(),
      price: price !== undefined ? Number(price) : 0,
      cost: cost !== undefined ? Number(cost) : 0,
      cost_type: cost_type || null,
      duration: duration !== undefined ? Number(duration) : null,
      commission: commission !== undefined ? Number(commission) : 0,
      active: active !== undefined ? Boolean(active) : true,
      allow_booking: allow_booking !== undefined ? Boolean(allow_booking) : true,
      show_on_app: show_on_app !== undefined ? Boolean(show_on_app) : true,
      category_id: category_id || null,
      branch_id: branch_id || null,
    };

    const { data: service, error } = await supabaseAdmin
      .from("services")
      .insert(insertData)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const serviceId = service.id;

    // Insert sub_prices
    if (Array.isArray(sub_prices) && sub_prices.length > 0) {
      const subRows = sub_prices
        .map((sp: { label?: string; price?: number; sort_order?: number }, idx: number) => ({
          service_id: serviceId,
          label: sp.label || null,
          price: sp.price !== undefined ? Number(sp.price) : 0,
          sort_order: sp.sort_order !== undefined ? Number(sp.sort_order) : idx,
        }))
        .filter((sp: { label?: string }) => sp.label);
      if (subRows.length > 0) {
        const { error: subErr } = await supabaseAdmin
          .from("service_sub_prices")
          .insert(subRows);
        if (subErr) {
          // Best effort: cleanup created service
          await supabaseAdmin.from("services").delete().eq("id", serviceId);
          return NextResponse.json(
            { ok: false, error: `Failed to create sub prices: ${subErr.message}` },
            { status: 500 }
          );
        }
      }
    }

    // Insert attached_products
    if (Array.isArray(attached_products) && attached_products.length > 0) {
      const attachRows = attached_products
        .map((ap: { product_id?: string; quantity?: number }) => ({
          service_id: serviceId,
          product_id: ap.product_id,
          quantity: ap.quantity !== undefined ? Number(ap.quantity) : 1,
        }))
        .filter((ap: { product_id?: string }) => ap.product_id);
      if (attachRows.length > 0) {
        const { error: attachErr } = await supabaseAdmin
          .from("service_attached_products")
          .insert(attachRows);
        if (attachErr) {
          await supabaseAdmin.from("services").delete().eq("id", serviceId);
          return NextResponse.json(
            { ok: false, error: `Failed to create attached products: ${attachErr.message}` },
            { status: 500 }
          );
        }
      }
    }

    // Fetch full service with joins
    const { data: fullService, error: fetchErr } = await supabaseAdmin
      .from("services")
      .select(SERVICE_SELECT)
      .eq("id", serviceId)
      .single();

    if (fetchErr) {
      return NextResponse.json(
        { ok: false, error: fetchErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: fullService }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
