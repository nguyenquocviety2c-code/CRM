import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const PACKAGE_SELECT =
  "*, category:package_categories(id, name), items:package_items(id, package_id, service_id, quantity, service:services(id, name, code, price))";

/**
 * Generate a package code: "GOI" + 6-digit zero-padded sequence.
 * Tries RPC generate_code first, then falls back to JS counting.
 */
async function generatePackageCode(): Promise<string> {
  // Try RPC first
  try {
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
      "generate_code",
      { prefix: "GOI", table_name: "packages" }
    );
    if (!rpcError && rpcData) {
      return String(rpcData);
    }
  } catch {
    // ignore and fallback
  }

  // JS fallback: count existing rows with code starting with "GOI"
  const { data: existing, error: countError } = await supabaseAdmin
    .from("packages")
    .select("code")
    .like("code", "GOI%")
    .order("code", { ascending: false })
    .limit(1);

  if (countError) {
    const ts = Date.now().toString().slice(-6);
    return `GOI${ts.padStart(6, "0")}`;
  }

  let next = 1;
  if (existing && existing.length > 0) {
    const lastCode = String(existing[0].code || "");
    const numPart = lastCode.replace(/^GOI/, "");
    const parsed = parseInt(numPart, 10);
    if (!isNaN(parsed)) {
      next = parsed + 1;
    }
  }
  return `GOI${String(next).padStart(6, "0")}`;
}

/**
 * Detect whether the `packages` table has a `branch_id` column.
 * The schema is expected to have it, but some deployments omit it.
 * Returns true only if a select on `branch_id` succeeds.
 */
async function packagesHasBranchIdColumn(): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("packages")
    .select("branch_id")
    .limit(1);
  return !error;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("category_id");
    const branchId = searchParams.get("branch_id");
    const search = searchParams.get("search");
    const active = searchParams.get("active");
    const pageStr = searchParams.get("page");
    const limitStr = searchParams.get("limit");

    const page = pageStr ? Math.max(1, parseInt(pageStr, 10)) : 1;
    const limit = limitStr ? Math.max(1, parseInt(limitStr, 10)) : 50;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Probe column existence once if branch_id filter is requested
    const hasBranchId = branchId
      ? await packagesHasBranchIdColumn()
      : false;

    let query = supabaseAdmin
      .from("packages")
      .select(PACKAGE_SELECT, { count: "exact" });

    if (categoryId) query = query.eq("category_id", categoryId);
    if (branchId && hasBranchId) query = query.eq("branch_id", branchId);
    if (active === "true") query = query.eq("active", true);
    else if (active === "false") query = query.eq("active", false);
    if (search) {
      query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
    }

    query = query.order("created_at", { ascending: false }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
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
      total_price,
      discount_price,
      active,
      category_id,
      branch_id,
      code,
      items,
    } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { ok: false, error: "Package name is required" },
        { status: 400 }
      );
    }

    // Auto-generate code if not provided
    const finalCode =
      typeof code === "string" && code.trim()
        ? code.trim()
        : await generatePackageCode();

    const insertData: Record<string, unknown> = {
      code: finalCode,
      name: name.trim(),
      total_price: total_price !== undefined ? Number(total_price) : 0,
      discount_price:
        discount_price !== undefined ? Number(discount_price) : 0,
      active: active !== undefined ? Boolean(active) : true,
      category_id: category_id || null,
    };

    // Only include branch_id if provided AND the column exists on the table
    if (branch_id) {
      const hasBranchId = await packagesHasBranchIdColumn();
      if (hasBranchId) {
        insertData.branch_id = branch_id;
      }
    }

    const { data: pkg, error } = await supabaseAdmin
      .from("packages")
      .insert(insertData)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const packageId = pkg.id;

    // Insert package_items
    if (Array.isArray(items) && items.length > 0) {
      const itemRows = items
        .map(
          (it: { service_id?: string; quantity?: number }) => ({
            package_id: packageId,
            service_id: it.service_id,
            quantity: it.quantity !== undefined ? Number(it.quantity) : 1,
          })
        )
        .filter((it: { service_id?: string }) => it.service_id);
      if (itemRows.length > 0) {
        const { error: itemErr } = await supabaseAdmin
          .from("package_items")
          .insert(itemRows);
        if (itemErr) {
          // Best effort: cleanup created package
          await supabaseAdmin.from("packages").delete().eq("id", packageId);
          return NextResponse.json(
            {
              ok: false,
              error: `Failed to create package items: ${itemErr.message}`,
            },
            { status: 500 }
          );
        }
      }
    }

    // Fetch full package with joins
    const { data: fullPackage, error: fetchErr } = await supabaseAdmin
      .from("packages")
      .select(PACKAGE_SELECT)
      .eq("id", packageId)
      .single();

    if (fetchErr) {
      return NextResponse.json(
        { ok: false, error: fetchErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: fullPackage }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
