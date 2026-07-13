import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const PACKAGE_SELECT =
  "*, category:package_categories(id, name), items:package_items(id, package_id, service_id, quantity, service:services(id, name, code, price))";

/**
 * Detect whether the `packages` table has a `branch_id` column.
 */
async function packagesHasBranchIdColumn(): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("packages")
    .select("branch_id")
    .limit(1);
  return !error;
}

/**
 * Re-sync package_items for a package: delete existing rows and re-insert.
 */
async function syncPackageItems(
  packageId: string,
  items: unknown
): Promise<{ error: string | null }> {
  const { error: delErr } = await supabaseAdmin
    .from("package_items")
    .delete()
    .eq("package_id", packageId);
  if (delErr) {
    return { error: `Failed to clear package items: ${delErr.message}` };
  }

  if (!Array.isArray(items) || items.length === 0) {
    return { error: null };
  }

  const rows = (
    items as Array<{ service_id?: string; quantity?: number; id?: string }>
  )
    .map((it) => ({
      package_id: packageId,
      service_id: it.service_id,
      quantity: it.quantity !== undefined ? Number(it.quantity) : 1,
    }))
    .filter((it) => it.service_id);

  if (rows.length === 0) {
    return { error: null };
  }

  const { error: insErr } = await supabaseAdmin
    .from("package_items")
    .insert(rows);
  if (insErr) {
    return { error: `Failed to update package items: ${insErr.message}` };
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
      .from("packages")
      .select(PACKAGE_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Package not found" },
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

    const { items, ...rest } = body;

    const updateData: Record<string, unknown> = {};
    if (rest.code !== undefined) updateData.code = rest.code || null;
    if (rest.name !== undefined) updateData.name = rest.name?.trim() || null;
    if (rest.total_price !== undefined)
      updateData.total_price = Number(rest.total_price);
    if (rest.discount_price !== undefined)
      updateData.discount_price =
        rest.discount_price === null ? null : Number(rest.discount_price);
    if (rest.active !== undefined) updateData.active = Boolean(rest.active);
    if (rest.category_id !== undefined)
      updateData.category_id = rest.category_id || null;
    if (rest.branch_id !== undefined) {
      const hasBranchId = await packagesHasBranchIdColumn();
      if (hasBranchId) {
        updateData.branch_id = rest.branch_id || null;
      }
    }

    if (Object.keys(updateData).length > 0) {
      const { error } = await supabaseAdmin
        .from("packages")
        .update(updateData)
        .eq("id", id);
      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }
    }

    // Sync items if provided
    if (items !== undefined) {
      const { error: itemErr } = await syncPackageItems(id, items);
      if (itemErr) {
        return NextResponse.json(
          { ok: false, error: itemErr },
          { status: 500 }
        );
      }
    }

    const { data: refreshed, error: fetchErr } = await supabaseAdmin
      .from("packages")
      .select(PACKAGE_SELECT)
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

    const { items, ...rest } = body;

    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      "code",
      "name",
      "total_price",
      "discount_price",
      "active",
      "category_id",
      "branch_id",
    ];

    for (const field of allowedFields) {
      if (rest[field] === undefined) continue;
      if (["total_price", "discount_price"].includes(field)) {
        updateData[field] =
          rest[field] === null ? null : Number(rest[field]);
      } else if (field === "active") {
        updateData[field] = Boolean(rest[field]);
      } else if (field === "name") {
        updateData[field] = rest[field]?.trim() || null;
      } else if (field === "branch_id") {
        // conditionally applied below after column probe
        continue;
      } else {
        updateData[field] = rest[field] || null;
      }
    }
    if (rest.branch_id !== undefined) {
      const hasBranchId = await packagesHasBranchIdColumn();
      if (hasBranchId) {
        updateData.branch_id = rest.branch_id || null;
      }
    }

    if (Object.keys(updateData).length > 0) {
      const { error } = await supabaseAdmin
        .from("packages")
        .update(updateData)
        .eq("id", id);
      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }
    }

    if (items !== undefined) {
      const { error: itemErr } = await syncPackageItems(id, items);
      if (itemErr) {
        return NextResponse.json(
          { ok: false, error: itemErr },
          { status: 500 }
        );
      }
    }

    const { data: refreshed, error: fetchErr } = await supabaseAdmin
      .from("packages")
      .select(PACKAGE_SELECT)
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

    // Clean up child rows (package_items) before deleting
    const { error: itemsDelErr } = await supabaseAdmin
      .from("package_items")
      .delete()
      .eq("package_id", id);
    if (itemsDelErr) {
      return NextResponse.json(
        { ok: false, error: itemsDelErr.message },
        { status: 500 }
      );
    }

    const { error } = await supabaseAdmin
      .from("packages")
      .delete()
      .eq("id", id);
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
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
