import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from("product_categories")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Category not found" },
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
    if (body.name !== undefined) updateData.name = body.name?.trim() || null;
    if (body.code !== undefined) updateData.code = body.code || null;
    if (body.active !== undefined) updateData.active = Boolean(body.active);
    if (body.sort_order !== undefined)
      updateData.sort_order = Number(body.sort_order);

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No fields provided to update" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("product_categories")
      .update(updateData)
      .eq("id", id)
      .select("*")
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
    const allowedFields = ["name", "code", "active", "sort_order"];
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === "active") {
          updateData[field] = Boolean(body[field]);
        } else if (field === "sort_order") {
          updateData[field] = Number(body[field]);
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
      .from("product_categories")
      .update(updateData)
      .eq("id", id)
      .select("*")
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

    // Check products referencing this category
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("id")
      .eq("category_id", id)
      .limit(1);

    if (!error && data && data.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Không thể xóa danh mục vì đang có sản phẩm thuộc danh mục này",
        },
        { status: 409 }
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from("product_categories")
      .delete()
      .eq("id", id);
    if (deleteError) {
      return NextResponse.json(
        { ok: false, error: deleteError.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
