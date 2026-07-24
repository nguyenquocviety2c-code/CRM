import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const SERVICE_SELECT =
  "*, category:service_categories(id, name), sub_prices:service_sub_prices(id, service_id, label, price, sort_order), attached_products:service_attached_products(id, service_id, product_id, quantity, product:products(id, name, code, unit, price))";

/**
 * Re-sync sub_prices for a service: delete existing rows and re-insert.
 */
async function syncSubPrices(
  serviceId: string,
  sub_prices: unknown
): Promise<{ error: string | null }> {
  // Delete existing
  const { error: delErr } = await supabaseAdmin
    .from("service_sub_prices")
    .delete()
    .eq("service_id", serviceId);
  if (delErr) {
    return { error: `Failed to clear sub prices: ${delErr.message}` };
  }

  if (!Array.isArray(sub_prices) || sub_prices.length === 0) {
    return { error: null };
  }

  const rows = (sub_prices as Array<{ label?: string; price?: number; sort_order?: number; id?: string }>)
    .map((sp, idx) => ({
      service_id: serviceId,
      label: sp.label || null,
      price: sp.price !== undefined ? Number(sp.price) : 0,
      sort_order: sp.sort_order !== undefined ? Number(sp.sort_order) : idx,
    }))
    .filter((sp) => sp.label);

  if (rows.length === 0) {
    return { error: null };
  }

  const { error: insErr } = await supabaseAdmin
    .from("service_sub_prices")
    .insert(rows);
  if (insErr) {
    return { error: `Failed to update sub prices: ${insErr.message}` };
  }
  return { error: null };
}

/**
 * Re-sync attached_products for a service: delete existing rows and re-insert.
 */
async function syncAttachedProducts(
  serviceId: string,
  attached_products: unknown
): Promise<{ error: string | null }> {
  const { error: delErr } = await supabaseAdmin
    .from("service_attached_products")
    .delete()
    .eq("service_id", serviceId);
  if (delErr) {
    return { error: `Failed to clear attached products: ${delErr.message}` };
  }

  if (!Array.isArray(attached_products) || attached_products.length === 0) {
    return { error: null };
  }

  const rows = (attached_products as Array<{ product_id?: string; quantity?: number; id?: string }>)
    .map((ap) => ({
      service_id: serviceId,
      product_id: ap.product_id,
      quantity: ap.quantity !== undefined ? Number(ap.quantity) : 1,
    }))
    .filter((ap) => ap.product_id);

  if (rows.length === 0) {
    return { error: null };
  }

  const { error: insErr } = await supabaseAdmin
    .from("service_attached_products")
    .insert(rows);
  if (insErr) {
    return { error: `Failed to update attached products: ${insErr.message}` };
  }
  return { error: null };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from("services")
      .select(SERVICE_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Service not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, data });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid body" },
        { status: 400 }
      );
    }

    const { sub_prices, attached_products, ...rest } = body;

    const updateData: Record<string, unknown> = {};
    if (rest.code !== undefined) updateData.code = rest.code || null;
    if (rest.name !== undefined) updateData.name = rest.name?.trim() || null;
    if (rest.price !== undefined) updateData.price = Number(rest.price);
    if (rest.cost !== undefined) updateData.cost = Number(rest.cost);
    if (rest.cost_type !== undefined) updateData.cost_type = rest.cost_type || null;
    if (rest.duration !== undefined)
      updateData.duration = rest.duration === null ? null : Number(rest.duration);
    if (rest.commission !== undefined)
      updateData.commission = Number(rest.commission);
    if (rest.active !== undefined) updateData.active = Boolean(rest.active);
    if (rest.allow_booking !== undefined)
      updateData.allow_booking = Boolean(rest.allow_booking);
    if (rest.show_on_app !== undefined)
      updateData.show_on_app = Boolean(rest.show_on_app);
    if (rest.category_id !== undefined)
      updateData.category_id = rest.category_id || null;
    if (rest.branch_id !== undefined)
      updateData.branch_id = rest.branch_id || null;

    if (Object.keys(updateData).length > 0) {
      const { error } = await supabaseAdmin
        .from("services")
        .update(updateData)
        .eq("id", id);
      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }
    }

    // Sync sub_prices if provided
    if (sub_prices !== undefined) {
      const { error: subErr } = await syncSubPrices(id, sub_prices);
      if (subErr) {
        return NextResponse.json({ ok: false, error: subErr }, { status: 500 });
      }
    }

    // Sync attached_products if provided
    if (attached_products !== undefined) {
      const { error: attErr } = await syncAttachedProducts(id, attached_products);
      if (attErr) {
        return NextResponse.json({ ok: false, error: attErr }, { status: 500 });
      }
    }

    const { data: refreshed, error: fetchErr } = await supabaseAdmin
      .from("services")
      .select(SERVICE_SELECT)
      .eq("id", id)
      .single();

    if (fetchErr) {
      return NextResponse.json(
        { ok: false, error: fetchErr.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, data: refreshed });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid body" },
        { status: 400 }
      );
    }

    const { sub_prices, attached_products, ...rest } = body;

    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      "code",
      "name",
      "price",
      "cost",
      "cost_type",
      "duration",
      "commission",
      "active",
      "allow_booking",
      "show_on_app",
      "category_id",
      "branch_id",
    ];

    for (const field of allowedFields) {
      if (rest[field] === undefined) continue;
      if (["price", "cost", "duration", "commission"].includes(field)) {
        updateData[field] =
          rest[field] === null ? null : Number(rest[field]);
      } else if (["active", "allow_booking", "show_on_app"].includes(field)) {
        updateData[field] = Boolean(rest[field]);
      } else if (field === "name") {
        updateData[field] = rest[field]?.trim() || null;
      } else {
        updateData[field] = rest[field] || null;
      }
    }

    if (Object.keys(updateData).length > 0) {
      const { error } = await supabaseAdmin
        .from("services")
        .update(updateData)
        .eq("id", id);
      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }
    }

    if (sub_prices !== undefined) {
      const { error: subErr } = await syncSubPrices(id, sub_prices);
      if (subErr) {
        return NextResponse.json({ ok: false, error: subErr }, { status: 500 });
      }
    }

    if (attached_products !== undefined) {
      const { error: attErr } = await syncAttachedProducts(id, attached_products);
      if (attErr) {
        return NextResponse.json({ ok: false, error: attErr }, { status: 500 });
      }
    }

    const { data: refreshed, error: fetchErr } = await supabaseAdmin
      .from("services")
      .select(SERVICE_SELECT)
      .eq("id", id)
      .single();

    if (fetchErr) {
      return NextResponse.json(
        { ok: false, error: fetchErr.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, data: refreshed });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check references before deleting — only block if there are actual bookings
    const { data: bookingData } = await supabaseAdmin
      .from("booking_services")
      .select("id")
      .eq("service_id", id)
      .limit(1);
    if (bookingData && bookingData.length > 0) {
      return NextResponse.json(
        { ok: false, error: "Không thể xóa dịch vụ vì đang có lịch hẹn sử dụng dịch vụ này" },
        { status: 409 }
      );
    }

    // Clean up child rows (package_items, sub_prices, attached_products) before deleting
    await supabaseAdmin.from("package_items").delete().eq("service_id", id);
    await supabaseAdmin.from("service_sub_prices").delete().eq("service_id", id);
    await supabaseAdmin
      .from("service_attached_products")
      .delete()
      .eq("service_id", id);

    const { error } = await supabaseAdmin
      .from("services")
      .delete()
      .eq("id", id);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
