import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type SlipType = "import" | "export" | "transfer";

// Note: slip_items.slip_id is polymorphic (no FK to a single slip table),
// so PostgREST cannot auto-join. We fetch items separately and merge in JS.
const IMPORT_SELECT = "*, branch:branches(id, name)";
const EXPORT_SELECT = "*, branch:branches(id, name)";
const TRANSFER_SELECT =
  "*, from_branch:branches!from_branch_id(id, name), to_branch:branches!to_branch_id(id, name)";
const ITEM_SELECT = "*, product:products(id, name, code)";

/**
 * Generate slip code with given prefix (NK/XK/CK) + 6-digit zero-padded sequence.
 * Tries RPC generate_code first, then falls back to JS counting.
 */
async function generateSlipCode(
  prefix: string,
  table: string
): Promise<string> {
  // Try RPC first
  try {
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
      "generate_code",
      { prefix, table_name: table }
    );
    if (!rpcError && rpcData) {
      return String(rpcData);
    }
  } catch {
    // ignore and fallback
  }

  // JS fallback
  const { data: existing, error: countError } = await supabaseAdmin
    .from(table)
    .select("code")
    .like("code", `${prefix}%`)
    .order("code", { ascending: false })
    .limit(1);

  if (countError) {
    const ts = Date.now().toString().slice(-6);
    return `${prefix}${ts.padStart(6, "0")}`;
  }

  let next = 1;
  if (existing && existing.length > 0) {
    const lastCode = String(existing[0].code || "");
    const numPart = lastCode.replace(new RegExp(`^${prefix}`), "");
    const parsed = parseInt(numPart, 10);
    if (!isNaN(parsed)) {
      next = parsed + 1;
    }
  }
  return `${prefix}${String(next).padStart(6, "0")}`;
}

function resolveType(type: string | null): SlipType | null {
  if (type === "import" || type === "export" || type === "transfer") {
    return type;
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const typeParam = searchParams.get("type");
    const type = resolveType(typeParam);

    if (!type) {
      return NextResponse.json(
        {
          ok: false,
          error: "Query param 'type' is required (import | export | transfer)",
        },
        { status: 400 }
      );
    }

    const branchId = searchParams.get("branch_id");
    const fromBranchId = searchParams.get("from_branch_id");
    const toBranchId = searchParams.get("to_branch_id");
    const status = searchParams.get("status");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const search = searchParams.get("search");
    const pageStr = searchParams.get("page");
    const limitStr = searchParams.get("limit");

    const page = pageStr ? Math.max(1, parseInt(pageStr, 10)) : 1;
    const limit = limitStr ? Math.max(1, parseInt(limitStr, 10)) : 50;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const dateColumn = type === "transfer" ? "transfer_date" : "created_at";

    let query;
    if (type === "import") {
      query = supabaseAdmin.from("import_slips").select(IMPORT_SELECT, {
        count: "exact",
      });
    } else if (type === "export") {
      query = supabaseAdmin.from("export_slips").select(EXPORT_SELECT, {
        count: "exact",
      });
    } else {
      query = supabaseAdmin.from("transfer_slips").select(TRANSFER_SELECT, {
        count: "exact",
      });
    }

    // Branch filter
    if (branchId) {
      if (type === "transfer") {
        query = query.or(`from_branch_id.eq.${branchId},to_branch_id.eq.${branchId}`);
      } else {
        query = query.eq("branch_id", branchId);
      }
    }
    if (type === "transfer") {
      if (fromBranchId) query = query.eq("from_branch_id", fromBranchId);
      if (toBranchId) query = query.eq("to_branch_id", toBranchId);
      if (status) query = query.eq("status", status);
    } else if (status) {
      // import/export_slips have no status column in the schema, ignore
    }

    if (dateFrom) query = query.gte(dateColumn, dateFrom);
    if (dateTo) query = query.lte(dateColumn, dateTo);
    if (search) {
      query = query.or(`code.ilike.%${search}%,note.ilike.%${search}%`);
    }

    query = query.order("created_at", { ascending: false }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Fetch slip_items for the returned slips (polymorphic relation — fetched separately)
    let itemsBySlipId: Record<string, unknown[]> = {};
    const slips = (data ?? []) as Array<Record<string, unknown>>;
    if (slips.length > 0) {
      const slipIds = slips.map((s) => s.id);
      const { data: itemsData, error: itemsErr } = await supabaseAdmin
        .from("slip_items")
        .select(ITEM_SELECT)
        .eq("slip_type", type)
        .in("slip_id", slipIds);

      if (itemsErr) {
        return NextResponse.json({ ok: false, error: itemsErr.message }, { status: 500 });
      }

      itemsBySlipId = (itemsData ?? []).reduce((acc, item: Record<string, unknown>) => {
        const slipId = String(item.slip_id);
        if (!acc[slipId]) acc[slipId] = [];
        acc[slipId].push(item);
        return acc;
      }, {} as Record<string, unknown[]>);

      // Merge items into each slip
      slips.forEach((s) => {
        s.items = itemsBySlipId[String(s.id)] ?? [];
      });
    }

    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return NextResponse.json({
      ok: true,
      data: slips,
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
    const {
      type: bodyType,
      note,
      branch_id,
      from_branch_id,
      to_branch_id,
      transfer_date,
      status,
      created_by,
      items,
    } = body;

    const type = resolveType(bodyType);
    if (!type) {
      return NextResponse.json(
        { ok: false, error: "Field 'type' is required (import | export | transfer)" },
        { status: 400 }
      );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { ok: false, error: "items array is required and must not be empty" },
        { status: 400 }
      );
    }

    // Validate branch references based on type
    if (type === "import" || type === "export") {
      if (!branch_id) {
        return NextResponse.json(
          { ok: false, error: "branch_id is required for import/export slips" },
          { status: 400 }
        );
      }
    } else {
      if (!from_branch_id || !to_branch_id) {
        return NextResponse.json(
          { ok: false, error: "from_branch_id and to_branch_id are required for transfer slips" },
          { status: 400 }
        );
      }
    }

    // Compute total_cost from items
    let totalCost = 0;
    const slipItems = items.map((item: Record<string, unknown>) => {
      const quantity = Number(item.quantity ?? 0);
      const costPrice = Number(item.cost_price ?? 0);
      totalCost += quantity * costPrice;
      return {
        slip_type: type,
        product_id: item.product_id,
        quantity,
        cost_price: costPrice,
        note: item.note || null,
        // slip_id is set after the slip is created
      };
    });

    // Validate product_id presence on each item
    for (const it of slipItems) {
      if (!it.product_id) {
        return NextResponse.json(
          { ok: false, error: "Each slip item requires a product_id" },
          { status: 400 }
        );
      }
    }

    // Generate code & insert slip
    let slipTable: string;
    let prefix: string;
    if (type === "import") {
      slipTable = "import_slips";
      prefix = "NK";
    } else if (type === "export") {
      slipTable = "export_slips";
      prefix = "XK";
    } else {
      slipTable = "transfer_slips";
      prefix = "CK";
    }

    const code = await generateSlipCode(prefix, slipTable);

    const slipInsert: Record<string, unknown> = {
      code,
      note: note || null,
      total_cost: totalCost,
      created_by: created_by || null,
    };

    if (type === "import" || type === "export") {
      slipInsert.branch_id = branch_id;
      slipInsert.type = body.type_specific || null; // optional type field on import/export
    } else {
      slipInsert.from_branch_id = from_branch_id;
      slipInsert.to_branch_id = to_branch_id;
      slipInsert.transfer_date = transfer_date || new Date().toISOString().slice(0, 10);
      slipInsert.status = status || "pending";
    }

    const { data: slip, error: slipError } = await supabaseAdmin
      .from(slipTable)
      .insert(slipInsert)
      .select("*")
      .single();

    if (slipError || !slip) {
      return NextResponse.json(
        { ok: false, error: slipError?.message || "Failed to create slip" },
        { status: 500 }
      );
    }

    // Insert slip_items with slip_id
    const slipItemsWithId = slipItems.map((it: Record<string, unknown>) => ({
      ...it,
      slip_id: slip.id,
    }));

    const { data: insertedItems, error: itemsError } = await supabaseAdmin
      .from("slip_items")
      .insert(slipItemsWithId)
      .select(ITEM_SELECT);

    if (itemsError) {
      // Rollback slip creation
      await supabaseAdmin.from(slipTable).delete().eq("id", slip.id);
      return NextResponse.json(
        { ok: false, error: itemsError.message },
        { status: 500 }
      );
    }

    // Fetch slip with branch joins (items are merged manually due to polymorphic slip_id)
    let fullSelect: string;
    if (type === "import") {
      fullSelect = IMPORT_SELECT;
    } else if (type === "export") {
      fullSelect = EXPORT_SELECT;
    } else {
      fullSelect = TRANSFER_SELECT;
    }

    const { data: fullSlip, error: fetchErr } = await supabaseAdmin
      .from(slipTable)
      .select(fullSelect)
      .eq("id", slip.id)
      .single();

    if (fetchErr) {
      // Return basic slip + items if branch join fetch fails
      return NextResponse.json({
        ok: true,
        data: { ...slip, items: insertedItems ?? [] },
      }, { status: 201 });
    }

    // Merge items into the slip response
    return NextResponse.json(
      { ok: true, data: { ...fullSlip, items: insertedItems ?? [] } },
      { status: 201 }
    );
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
