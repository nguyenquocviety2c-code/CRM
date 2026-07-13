import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Parse a DD/MM/YYYY string into a Date at local midnight (start of day).
function parseDate(value: string): Date | null {
  if (!value) return null;
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  const d = new Date(year, month - 1, day, 0, 0, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type DateFilter = { gte?: string; lte?: string } | undefined;

function dateRange(from: string, to: string): DateFilter {
  const fromDate = parseDate(from);
  const toDate = parseDate(to);
  if (fromDate && toDate) {
    return { gte: toIsoDate(fromDate), lte: toIsoDate(toDate) };
  }
  if (fromDate) return { gte: toIsoDate(fromDate) };
  if (toDate) return { lte: toIsoDate(toDate) };
  return undefined;
}

type ProductRow = {
  id: string;
  code: string | null;
  name: string;
  initial_stock: number;
  stock: number;
  category_id: string | null;
};

type SlipItemRow = {
  id: string;
  slip_type: string;
  slip_id: string;
  product_id: string;
  quantity: number;
  cost_price: number;
  note: string | null;
  created_at: string;
};

type ImportSlipRow = {
  id: string;
  code: string | null;
  import_date: string;
  branch_id: string | null;
  created_by: string | null;
  note: string | null;
};

type ExportSlipRow = {
  id: string;
  code: string | null;
  type: string;
  export_date: string;
  branch_id: string | null;
  created_by: string | null;
  note: string | null;
};

type TransferSlipRow = {
  id: string;
  code: string | null;
  transfer_date: string;
  from_branch_id: string;
  to_branch_id: string;
  status: string;
  created_by: string | null;
  note: string | null;
};

// ============================================
// Shared helpers
// ============================================

// Filter products by search (name/code, case-insensitive) and/or category_id.
// Returns a Supabase query builder that callers can extend (range/count).
function buildProductQuery(
  search: string,
  categoryId: string
) {
  let q = supabaseAdmin
    .from("products")
    .select("id, code, name, initial_stock, stock, category_id", {
      count: "exact",
    });
  if (search) {
    // PostgREST `or` filter — case-insensitive ilike
    q = q.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
  }
  if (categoryId) {
    q = q.eq("category_id", categoryId);
  }
  return q;
}

// Apply stockStatus filter (out-of-stock / in-stock / low-stock) on top of a query.
function applyStockStatus(
  q: ReturnType<typeof buildProductQuery>,
  stockStatus: string
) {
  if (stockStatus === "out-of-stock") {
    q = q.eq("stock", 0);
  } else if (stockStatus === "in-stock") {
    q = q.gt("stock", 0);
  } else if (stockStatus === "low-stock") {
    q = q.gt("stock", 0).lte("stock", 5);
  }
  return q;
}

// Fetch staff names for a list of staff IDs (uuids) — used to resolve
// slip.created_by (uuid FK to staff.id) into a displayable name.
async function fetchStaffNameMap(
  ids: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return map;
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("id, name")
    .in("id", unique);
  if (error) return map;
  for (const row of data ?? []) {
    map.set(row.id, row.name);
  }
  return map;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") || "inventory";
    const dateFrom = searchParams.get("from") || "";
    const dateTo = searchParams.get("to") || "";
    const categoryId = searchParams.get("categoryId") || "";
    const search = searchParams.get("search") || "";
    const stockStatus = searchParams.get("stockStatus") || "all";
    const transferStatus = searchParams.get("transferStatus") || "completed";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const skip = (page - 1) * limit;

    const dateFilter = dateRange(dateFrom, dateTo);

    // Determine the current branch (first branch in the table) — used by
    // transferOut/transferIn classification, matching Prisma route behavior.
    const { data: branches } = await supabaseAdmin
      .from("branches")
      .select("id, name")
      .order("created_at", { ascending: true });
    const branchList = (branches ?? []) as Array<{ id: string; name: string }>;
    const branchNameMap = new Map<string, string>(
      branchList.map((b) => [b.id, b.name])
    );
    const currentBranchId = branchList[0]?.id || null;

    if (view === "inventory") {
      return await handleInventoryView({
        categoryId,
        search,
        stockStatus,
        dateFilter,
        skip,
        limit,
        page,
        currentBranchId,
      });
    }

    if (view === "movement") {
      return await handleMovementView({
        categoryId,
        search,
        dateFilter,
        skip,
        limit,
        page,
      });
    }

    if (view === "transfer") {
      return await handleTransferView({
        categoryId,
        search,
        transferStatus,
        dateFilter,
        skip,
        limit,
        page,
        branchNameMap,
      });
    }

    return Response.json(
      { ok: false, error: "Invalid view mode" },
      { status: 400 }
    );
  } catch (error) {
    console.error("GET /api/supabase/warehouse/report error:", error);
    return Response.json(
      { ok: false, error: "Lỗi khi lấy dữ liệu báo cáo kho hàng" },
      { status: 500 }
    );
  }
}

// ============================================
// View 1: Inventory (Tồn kho)
// ============================================
type InventoryArgs = {
  categoryId: string;
  search: string;
  stockStatus: string;
  dateFilter: DateFilter;
  skip: number;
  limit: number;
  page: number;
  currentBranchId: string | null;
};

async function handleInventoryView(args: InventoryArgs) {
  const {
    categoryId,
    search,
    stockStatus,
    dateFilter,
    skip,
    limit,
    page,
    currentBranchId,
  } = args;

  // Page query (for the current page rows)
  let pageQuery = buildProductQuery(search, categoryId);
  pageQuery = applyStockStatus(pageQuery, stockStatus);
  pageQuery = pageQuery
    .order("code", { ascending: true })
    .range(skip, skip + limit - 1);
  const { data: pageRows, error: pageErr, count } = await pageQuery;
  if (pageErr) {
    return Response.json({ ok: false, error: pageErr.message }, { status: 500 });
  }
  const products = (pageRows ?? []) as ProductRow[];
  const total = count ?? 0;

  // All-matching ids (for the summary across the entire filter set)
  let allQuery = buildProductQuery(search, categoryId);
  allQuery = applyStockStatus(allQuery, stockStatus);
  allQuery = allQuery.select("id, initial_stock");
  const { data: allRows, error: allErr } = await allQuery;
  if (allErr) {
    return Response.json({ ok: false, error: allErr.message }, { status: 500 });
  }
  const allProducts = (allRows ?? []) as Array<{
    id: string;
    initial_stock: number;
  }>;
  const allIds = allProducts.map((p) => p.id);

  const pageIds = products.map((p) => p.id);

  // Fetch slip_items for the page products within the date range.
  const importItemsMap = new Map<string, number>(); // productId -> qty
  const exportItemsMap = new Map<
    string,
    { use: number; sell: number }
  >();
  const transferItemsMap = new Map<
    string,
    { out: number; in: number }
  >();

  if (dateFilter && pageIds.length > 0) {
    // Import slip items
    const importSlipIdsRes = await fetchSlipIdsByDate(
      "import_slips",
      "import_date",
      dateFilter
    );
    if (importSlipIdsRes.length > 0) {
      const { data: importItems } = await supabaseAdmin
        .from("slip_items")
        .select("product_id, quantity")
        .eq("slip_type", "import")
        .in("slip_id", importSlipIdsRes)
        .in("product_id", pageIds);
      for (const it of (importItems ?? []) as Array<{
        product_id: string;
        quantity: number;
      }>) {
        importItemsMap.set(
          it.product_id,
          (importItemsMap.get(it.product_id) || 0) + it.quantity
        );
      }
    }

    // Export slip items (need slip.code to classify use vs sell)
    const exportSlipsRes = await fetchSlipsByDate<ExportSlipRow>(
      "export_slips",
      "export_date",
      dateFilter,
      "id, code, type"
    );
    if (exportSlipsRes.length > 0) {
      const exportSlipIds = exportSlipsRes.map((s) => s.id);
      const codeById = new Map<string, string>();
      const typeById = new Map<string, string>();
      for (const s of exportSlipsRes) {
        codeById.set(s.id, (s.code || "").toUpperCase());
        typeById.set(s.id, s.type);
      }
      const { data: exportItems } = await supabaseAdmin
        .from("slip_items")
        .select("slip_id, product_id, quantity")
        .eq("slip_type", "export")
        .in("slip_id", exportSlipIds)
        .in("product_id", pageIds);
      for (const it of (exportItems ?? []) as Array<{
        slip_id: string;
        product_id: string;
        quantity: number;
      }>) {
        const code = codeById.get(it.slip_id) || "";
        // XB prefix means "Xuất bán" (sell); everything else is "Xuất sử dụng"
        const isSell = code.startsWith("XB");
        const prev = exportItemsMap.get(it.product_id) || { use: 0, sell: 0 };
        if (isSell) prev.sell += it.quantity;
        else prev.use += it.quantity;
        exportItemsMap.set(it.product_id, prev);
      }
    }

    // Transfer slip items
    const transferSlipsRes = await fetchSlipsByDate<TransferSlipRow>(
      "transfer_slips",
      "transfer_date",
      dateFilter,
      "id, from_branch_id, to_branch_id"
    );
    if (transferSlipsRes.length > 0) {
      const transferSlipIds = transferSlipsRes.map((s) => s.id);
      const fromBranchById = new Map<string, string>();
      const toBranchById = new Map<string, string>();
      for (const s of transferSlipsRes) {
        fromBranchById.set(s.id, s.from_branch_id);
        toBranchById.set(s.id, s.to_branch_id);
      }
      const { data: transferItems } = await supabaseAdmin
        .from("slip_items")
        .select("slip_id, product_id, quantity")
        .eq("slip_type", "transfer")
        .in("slip_id", transferSlipIds)
        .in("product_id", pageIds);
      for (const it of (transferItems ?? []) as Array<{
        slip_id: string;
        product_id: string;
        quantity: number;
      }>) {
        const fromB = fromBranchById.get(it.slip_id);
        const toB = toBranchById.get(it.slip_id);
        const prev = transferItemsMap.get(it.product_id) || {
          out: 0,
          in: 0,
        };
        if (currentBranchId && fromB === currentBranchId) {
          prev.out += it.quantity;
        } else if (currentBranchId && toB === currentBranchId) {
          prev.in += it.quantity;
        } else {
          prev.out += it.quantity;
        }
        transferItemsMap.set(it.product_id, prev);
      }
    }
  }

  const items = products.map((p) => {
    const imp = importItemsMap.get(p.id) || 0;
    const exp = exportItemsMap.get(p.id) || { use: 0, sell: 0 };
    const tr = transferItemsMap.get(p.id) || { out: 0, in: 0 };
    const closingStock =
      p.initial_stock + imp - exp.use - exp.sell - tr.out + tr.in;
    return {
      id: p.id,
      productCode: p.code || "-",
      productName: p.name,
      openingStock: p.initial_stock,
      importedQty: imp,
      exportedQty: exp.use,
      soldQty: exp.sell,
      transferOut: tr.out,
      transferIn: tr.in,
      closingStock,
    };
  });

  // Summary across ALL matching products (not just current page)
  const summary = {
    openingStock: allProducts.reduce((s, p) => s + p.initial_stock, 0),
    importedQty: 0,
    exportedUse: 0,
    exportedSell: 0,
    exportedTotal: 0,
    transferOut: 0,
    transferIn: 0,
    closingStock: 0,
  };

  if (dateFilter && allIds.length > 0) {
    // Imports
    const allImportSlipIds = await fetchSlipIdsByDate(
      "import_slips",
      "import_date",
      dateFilter
    );
    if (allImportSlipIds.length > 0) {
      summary.importedQty = await sumSlipItems(
        "import",
        allImportSlipIds,
        allIds
      );
    }

    // Exports (split use vs sell)
    const allExportSlips = await fetchSlipsByDate<ExportSlipRow>(
      "export_slips",
      "export_date",
      dateFilter,
      "id, code"
    );
    if (allExportSlips.length > 0) {
      const sellIds: string[] = [];
      const useIds: string[] = [];
      for (const s of allExportSlips) {
        if ((s.code || "").toUpperCase().startsWith("XB")) sellIds.push(s.id);
        else useIds.push(s.id);
      }
      if (sellIds.length > 0) {
        summary.exportedSell = await sumSlipItems("export", sellIds, allIds);
      }
      if (useIds.length > 0) {
        summary.exportedUse = await sumSlipItems("export", useIds, allIds);
      }
    }

    // Transfers (out only — current branch as from_branch)
    if (currentBranchId) {
      let transferOutQ = supabaseAdmin
        .from("transfer_slips")
        .select("id")
        .eq("from_branch_id", currentBranchId);
      if (dateFilter.gte) transferOutQ = transferOutQ.gte("transfer_date", dateFilter.gte);
      if (dateFilter.lte) transferOutQ = transferOutQ.lte("transfer_date", dateFilter.lte);
      const { data: transferOutSlips } = await transferOutQ;
      const transferOutIds = (transferOutSlips ?? []).map((s) => s.id);
      if (transferOutIds.length > 0) {
        summary.transferOut = await sumSlipItems(
          "transfer",
          transferOutIds,
          allIds
        );
      }
    }

    summary.exportedTotal = summary.exportedUse + summary.exportedSell;
    summary.transferIn = 0;
    summary.closingStock =
      summary.openingStock +
      summary.importedQty -
      summary.exportedTotal -
      summary.transferOut +
      summary.transferIn;
  } else {
    summary.closingStock = summary.openingStock;
  }

  return Response.json({
    ok: true,
    data: { items, summary, total, page, limit },
  });
}

// Fetch slip IDs in a table filtered by a date column. Returns [] if no filter
// is supplied or the query fails.
async function fetchSlipIdsByDate(
  table: string,
  dateColumn: string,
  dateFilter: DateFilter
): Promise<string[]> {
  if (!dateFilter) return [];
  let q = supabaseAdmin.from(table).select("id");
  if (dateFilter.gte) q = q.gte(dateColumn, dateFilter.gte);
  if (dateFilter.lte) q = q.lte(dateColumn, dateFilter.lte);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []).map((r: { id: string }) => r.id);
}

// Fetch slips (with selected columns) filtered by a date column.
async function fetchSlipsByDate<T>(
  table: string,
  dateColumn: string,
  dateFilter: DateFilter,
  select: string
): Promise<T[]> {
  if (!dateFilter) return [];
  let q = supabaseAdmin.from(table).select(select);
  if (dateFilter.gte) q = q.gte(dateColumn, dateFilter.gte);
  if (dateFilter.lte) q = q.lte(dateColumn, dateFilter.lte);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as T[];
}

// Sum the quantity column of slip_items with a given slip_type, restricted to
// a set of slip_ids and product_ids. Returns 0 if either set is empty.
async function sumSlipItems(
  slipType: string,
  slipIds: string[],
  productIds: string[]
): Promise<number> {
  if (slipIds.length === 0 || productIds.length === 0) return 0;
  const { data, error } = await supabaseAdmin
    .from("slip_items")
    .select("quantity")
    .eq("slip_type", slipType)
    .in("slip_id", slipIds)
    .in("product_id", productIds);
  if (error) return 0;
  return (data ?? []).reduce(
    (sum: number, r: { quantity: number }) => sum + (r.quantity || 0),
    0
  );
}

// ============================================
// View 2: Movement (Nhập xuất kho)
// ============================================
type MovementArgs = {
  categoryId: string;
  search: string;
  dateFilter: DateFilter;
  skip: number;
  limit: number;
  page: number;
};

type MovementRow = {
  id: string;
  datetime: string;
  slipCode: string;
  createdBy: string;
  action: "import" | "export-use" | "export-sell" | "export-return" | "export-destroy";
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  price: number;
  content: string;
  _time: number;
};

async function handleMovementView(args: MovementArgs) {
  const { categoryId, search, dateFilter, skip, limit } = args;

  // Resolve matching product ids (search + category filter)
  const productIds = await fetchMatchingProductIds(search, categoryId);
  const productById = await fetchProductMap(productIds);

  if (!dateFilter) {
    return Response.json({
      ok: true,
      data: { items: [], total: 0, page: args.page, limit },
    });
  }

  // Fetch slip_items: import + export, filtered by product
  const rows: MovementRow[] = [];

  // --- Imports ---
  const importSlips = await fetchSlipsByDate<ImportSlipRow>(
    "import_slips",
    "import_date",
    dateFilter,
    "id, code, import_date, created_by"
  );
  if (importSlips.length > 0) {
    const slipById = new Map<string, ImportSlipRow>();
    for (const s of importSlips) slipById.set(s.id, s);
    const slipIds = importSlips.map((s) => s.id);
    const slipItems = await fetchSlipItems(
      "import",
      slipIds,
      productIds
    );
    const createdBySet = importSlips
      .map((s) => s.created_by)
      .filter((v): v is string => Boolean(v));
    const staffNameMap = await fetchStaffNameMap(createdBySet);
    for (const it of slipItems) {
      const slip = slipById.get(it.slip_id);
      if (!slip) continue;
      const product = productById.get(it.product_id);
      if (!product) continue;
      const dt = new Date(slip.import_date).getTime();
      rows.push({
        id: it.id,
        datetime: new Date(slip.import_date).toISOString(),
        slipCode: slip.code || "",
        createdBy: (slip.created_by && staffNameMap.get(slip.created_by)) || "",
        action: "import",
        productId: product.id,
        productCode: product.code || "-",
        productName: product.name,
        quantity: it.quantity,
        price: Number(it.cost_price),
        content: `Nhập kho${slip.code ? ` #${slip.code}` : ""}`,
        _time: dt,
      });
    }
  }

  // --- Exports ---
  const exportSlips = await fetchSlipsByDate<ExportSlipRow>(
    "export_slips",
    "export_date",
    dateFilter,
    "id, code, type, export_date, created_by"
  );
  if (exportSlips.length > 0) {
    const slipById = new Map<string, ExportSlipRow>();
    for (const s of exportSlips) slipById.set(s.id, s);
    const slipIds = exportSlips.map((s) => s.id);
    const slipItems = await fetchSlipItems("export", slipIds, productIds);
    const createdBySet = exportSlips
      .map((s) => s.created_by)
      .filter((v): v is string => Boolean(v));
    const staffNameMap = await fetchStaffNameMap(createdBySet);
    for (const it of slipItems) {
      const slip = slipById.get(it.slip_id);
      if (!slip) continue;
      const product = productById.get(it.product_id);
      if (!product) continue;
      const code = (slip.code || "").toUpperCase();
      let action: MovementRow["action"] = "export-use";
      if (slip.type === "return") action = "export-return";
      else if (slip.type === "destroy") action = "export-destroy";
      else if (code.startsWith("XB")) action = "export-sell";
      else action = "export-use";

      let content = "Xuất sử dụng";
      if (action === "export-sell")
        content = `Xuất cho hóa đơn #${slip.code || ""}`;
      else if (action === "export-return") content = "Trả hàng nhập";
      else if (action === "export-destroy") content = "Xuất hủy";
      else content = `Xuất sử dụng${slip.code ? ` #${slip.code}` : ""}`;

      const dt = new Date(slip.export_date).getTime();
      rows.push({
        id: it.id,
        datetime: new Date(slip.export_date).toISOString(),
        slipCode: slip.code || "",
        createdBy: (slip.created_by && staffNameMap.get(slip.created_by)) || "",
        action,
        productId: product.id,
        productCode: product.code || "-",
        productName: product.name,
        quantity: it.quantity,
        price: Number(it.cost_price),
        content,
        _time: dt,
      });
    }
  }

  rows.sort((a, b) => b._time - a._time);

  const total = rows.length;
  const paged = rows.slice(skip, skip + limit).map(({ _time, ...rest }) => {
    void _time;
    return rest;
  });

  return Response.json({
    ok: true,
    data: { items: paged, total, page: args.page, limit },
  });
}

// ============================================
// View 3: Transfer (Chuyển kho)
// ============================================
type TransferArgs = {
  categoryId: string;
  search: string;
  transferStatus: string;
  dateFilter: DateFilter;
  skip: number;
  limit: number;
  page: number;
  branchNameMap: Map<string, string>;
};

type TransferRow = {
  id: string;
  datetime: string;
  slipCode: string;
  createdBy: string;
  action: "transfer";
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  fromBranchId: string;
  fromBranchName: string;
  toBranchId: string;
  toBranchName: string;
  content: string;
  status: "completed" | "pending";
  _time: number;
};

async function handleTransferView(args: TransferArgs) {
  const {
    categoryId,
    search,
    transferStatus,
    dateFilter,
    skip,
    limit,
    branchNameMap,
  } = args;

  const productIds = await fetchMatchingProductIds(search, categoryId);
  const productById = await fetchProductMap(productIds);

  // Build transfer_slips query
  let slipQ = supabaseAdmin
    .from("transfer_slips")
    .select(
      "id, code, transfer_date, from_branch_id, to_branch_id, status, created_by"
    );
  if (dateFilter) {
    if (dateFilter.gte) slipQ = slipQ.gte("transfer_date", dateFilter.gte);
    if (dateFilter.lte) slipQ = slipQ.lte("transfer_date", dateFilter.lte);
  }
  if (transferStatus === "completed") {
    slipQ = slipQ.eq("status", "completed");
  } else if (transferStatus === "pending") {
    slipQ = slipQ.eq("status", "pending");
  }
  slipQ = slipQ.order("transfer_date", { ascending: false });
  const { data: slipRows, error: slipErr } = await slipQ;
  if (slipErr) {
    return Response.json({ ok: false, error: slipErr.message }, { status: 500 });
  }
  const slips = (slipRows ?? []) as TransferSlipRow[];

  if (slips.length === 0) {
    return Response.json({
      ok: true,
      data: { items: [], total: 0, page: args.page, limit },
    });
  }

  const slipById = new Map<string, TransferSlipRow>();
  for (const s of slips) slipById.set(s.id, s);
  const slipIds = slips.map((s) => s.id);
  const slipItems = await fetchSlipItems("transfer", slipIds, productIds);

  const createdBySet = slips
    .map((s) => s.created_by)
    .filter((v): v is string => Boolean(v));
  const staffNameMap = await fetchStaffNameMap(createdBySet);

  const rows: TransferRow[] = slipItems.map((it) => {
    const slip = slipById.get(it.slip_id);
    // slip should always exist, but guard anyway
    const fromId = slip?.from_branch_id || "";
    const toId = slip?.to_branch_id || "";
    const fromName = branchNameMap.get(fromId) || "Kho chính";
    const toName = branchNameMap.get(toId) || "Kho khác";
    const product = productById.get(it.product_id);
    const productName = product?.name || "";
    const productCode = product?.code || "-";
    const dt = slip ? new Date(slip.transfer_date).getTime() : 0;
    return {
      id: it.id,
      datetime: slip ? new Date(slip.transfer_date).toISOString() : "",
      slipCode: slip?.code || "",
      createdBy:
        (slip?.created_by && staffNameMap.get(slip.created_by)) || "",
      action: "transfer",
      productId: it.product_id,
      productCode,
      productName,
      quantity: it.quantity,
      fromBranchId: fromId,
      fromBranchName: fromName,
      toBranchId: toId,
      toBranchName: toName,
      content: `Chuyển ${it.quantity} ${productName} từ ${fromName} đến ${toName}`,
      status: (slip?.status === "completed" ? "completed" : "pending") as
        | "completed"
        | "pending",
      _time: dt,
    };
  });

  rows.sort((a, b) => b._time - a._time);

  const total = rows.length;
  const paged = rows.slice(skip, skip + limit).map(({ _time, ...rest }) => {
    void _time;
    return rest;
  });

  return Response.json({
    ok: true,
    data: { items: paged, total, page: args.page, limit },
  });
}

// ============================================
// Helpers: matching product ids + product map
// ============================================

// Return product ids filtered by search/categoryId. If both are empty, returns
// null to signal "no filter" — caller may decide to skip the in() clause.
async function fetchMatchingProductIds(
  search: string,
  categoryId: string
): Promise<string[]> {
  // For movement/transfer views we always filter slip_items by product_id IN (...).
  // When no search/category filter is applied, return ALL product ids.
  if (!search && !categoryId) {
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("id");
    if (error) return [];
    return (data ?? []).map((r: { id: string }) => r.id);
  }

  const q = buildProductQuery(search, categoryId).select("id");
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []).map((r: { id: string }) => r.id);
}

// Fetch a Map of product_id -> { id, code, name } for the given ids.
async function fetchProductMap(
  ids: string[]
): Promise<Map<string, { id: string; code: string | null; name: string }>> {
  const map = new Map<string, { id: string; code: string | null; name: string }>();
  if (ids.length === 0) return map;
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id, code, name")
    .in("id", ids);
  if (error) return map;
  for (const row of (data ?? []) as Array<{
    id: string;
    code: string | null;
    name: string;
  }>) {
    map.set(row.id, row);
  }
  return map;
}

// Fetch slip_items by slip_type, slip_id set, and product_id set.
async function fetchSlipItems(
  slipType: string,
  slipIds: string[],
  productIds: string[]
): Promise<SlipItemRow[]> {
  if (slipIds.length === 0 || productIds.length === 0) return [];
  let q = supabaseAdmin
    .from("slip_items")
    .select("id, slip_type, slip_id, product_id, quantity, cost_price, note, created_at")
    .eq("slip_type", slipType)
    .in("slip_id", slipIds)
    .in("product_id", productIds);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as SlipItemRow[];
}
