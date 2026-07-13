import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const PRODUCT_SELECT =
  "*, category:product_categories(id, name, code), branch:branches(id, name)";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Product not found" },
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

    const updateData: Record<string, unknown> = {};
    if (body.code !== undefined) updateData.code = body.code || null;
    if (body.name !== undefined) updateData.name = body.name?.trim() || null;
    if (body.price !== undefined) updateData.price = Number(body.price);
    if (body.cost !== undefined) updateData.cost = Number(body.cost);
    if (body.unit !== undefined) updateData.unit = body.unit || null;
    if (body.stock !== undefined) updateData.stock = Number(body.stock);
    if (body.initial_stock !== undefined)
      updateData.initial_stock = Number(body.initial_stock);
    if (body.image !== undefined) updateData.image = body.image || null;
    if (body.volume !== undefined)
      updateData.volume = body.volume === null ? null : Number(body.volume);
    if (body.volume_unit !== undefined)
      updateData.volume_unit = body.volume_unit || null;
    if (body.origin !== undefined) updateData.origin = body.origin || null;
    if (body.detail !== undefined) updateData.detail = body.detail || null;
    if (body.show_on_app !== undefined)
      updateData.show_on_app = Boolean(body.show_on_app);
    if (body.active !== undefined) updateData.active = Boolean(body.active);
    if (body.category_id !== undefined)
      updateData.category_id = body.category_id || null;
    if (body.branch_id !== undefined)
      updateData.branch_id = body.branch_id || null;
    if (body.product_type !== undefined)
      updateData.product_type = body.product_type || "trading";

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No fields provided to update" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("products")
      .update(updateData)
      .eq("id", id)
      .select(PRODUCT_SELECT)
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, data });
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

    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      "code",
      "name",
      "price",
      "cost",
      "unit",
      "stock",
      "initial_stock",
      "image",
      "volume",
      "volume_unit",
      "origin",
      "detail",
      "show_on_app",
      "active",
      "category_id",
      "branch_id",
      "product_type",
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (
          ["price", "cost", "stock", "initial_stock", "volume"].includes(field)
        ) {
          updateData[field] =
            body[field] === null ? null : Number(body[field]);
        } else if (["show_on_app", "active"].includes(field)) {
          updateData[field] = Boolean(body[field]);
        } else if (field === "name") {
          updateData[field] = body[field]?.trim() || null;
        } else {
          updateData[field] = body[field] || null;
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No fields provided to update" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("products")
      .update(updateData)
      .eq("id", id)
      .select(PRODUCT_SELECT)
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, data });
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

    // Check references before deleting
    const tablesToCheck = [
      { table: "slip_items", column: "product_id", label: "slip items" },
      {
        table: "service_attached_products",
        column: "product_id",
        label: "service attached products",
      },
    ];

    for (const { table, column, label } of tablesToCheck) {
      const { data, error } = await supabaseAdmin
        .from(table)
        .select("id")
        .eq(column, id)
        .limit(1);
      if (error) continue;
      if (data && data.length > 0) {
        return NextResponse.json(
          {
            ok: false,
            error: `Không thể xóa sản phẩm vì đang có dữ liệu liên quan trong ${label}`,
          },
          { status: 409 }
        );
      }
    }

    const { error } = await supabaseAdmin
      .from("products")
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
