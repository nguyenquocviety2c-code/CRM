import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/supabase/packages/report
 * Supabase-backed report for the "Gói dịch vụ" report page.
 *
 * Query params:
 *   - view: "purchased" | "usage"   (default: purchased)
 *   - customerSearch: substring on customer name/phone
 *   - packageSearch: substring on package name (usage view only)
 *   - categoryId: filter packages by package_categories.id (via packages.category_id)
 *   - branchId: filter by customer_packages.branch_id
 *   - dateFrom / dateTo: ISO date range — purchased view filters on purchase_date,
 *     usage view filters on use_date
 *   - page (default 1), limit (default 20)
 *
 * Storage note
 * ------------
 * The Supabase tables mirror the Prisma `CustomerPackage` / `PackageUsage` models
 * but ALSO carry denormalized display columns (customer_name, customer_phone,
 * package_name, service_name, staff_name, invoice_code). This lets the report
 * route read everything it needs in a single pass without manual joins — and
 * keeps rows stable even if the underlying customer/package/service records are
 * later edited or deleted.
 *
 * When the denormalized columns are NULL (e.g. legacy rows) we batch-resolve
 * them via lookups on customers / packages / services / staff for completeness.
 */

interface CustomerPackageRow {
  id: string;
  customer_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  package_id: string;
  package_name: string | null;
  branch_id: string | null;
  invoice_id: string | null;
  invoice_code: string | null;
  status: string;
  purchase_date: string;
  expiry_date: string | null;
  last_used_date: string | null;
  total_uses: number;
  used_count: number;
  remaining: number;
  created_by_id: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

interface PackageUsageRow {
  id: string;
  customer_package_id: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  package_name: string | null;
  service_id: string | null;
  service_name: string | null;
  use_date: string;
  quantity: number;
  invoice_id: string | null;
  invoice_code: string | null;
  staff_id: string | null;
  staff_name: string | null;
  note: string | null;
  created_at: string;
}

interface CustomerLookup {
  id: string;
  name: string | null;
  phone: string | null;
}

interface PackageLookup {
  id: string;
  name: string | null;
  category_id: string | null;
}

interface ServiceLookup {
  id: string;
  name: string | null;
}

interface StaffLookup {
  id: string;
  name: string | null;
}

/**
 * Resolve the set of package ids that belong to a given category.
 * Returns undefined when no categoryId is provided (no filter applied).
 */
async function fetchPackageIdsByCategory(
  categoryId: string
): Promise<Set<string> | undefined> {
  const { data, error } = await supabaseAdmin
    .from("packages")
    .select("id")
    .eq("category_id", categoryId);
  if (error) {
    // Surface the error so the request fails loudly rather than silently
    // returning "no matches" for an unrelated reason.
    throw new Error(`Failed to fetch packages by category: ${error.message}`);
  }
  return new Set((data ?? []).map((r: { id: string }) => r.id));
}

/**
 * Batch-resolve customer name+phone for any rows where the denormalized
 * customer_name / customer_phone columns are NULL.
 */
async function resolveCustomerMap(
  customerIds: string[]
): Promise<Map<string, CustomerLookup>> {
  const map = new Map<string, CustomerLookup>();
  if (customerIds.length === 0) return map;
  const { data, error } = await supabaseAdmin
    .from("customers")
    .select("id, name, phone")
    .in("id", customerIds);
  if (error) return map;
  for (const c of (data ?? []) as { id: string; name: string | null; phone: string | null }[]) {
    map.set(c.id, { id: c.id, name: c.name, phone: c.phone });
  }
  return map;
}

/**
 * Batch-resolve package name for any rows where the denormalized
 * package_name column is NULL.
 */
async function resolvePackageMap(
  packageIds: string[]
): Promise<Map<string, PackageLookup>> {
  const map = new Map<string, PackageLookup>();
  if (packageIds.length === 0) return map;
  const { data, error } = await supabaseAdmin
    .from("packages")
    .select("id, name, category_id")
    .in("id", packageIds);
  if (error) return map;
  for (const p of (data ?? []) as { id: string; name: string | null; category_id: string | null }[]) {
    map.set(p.id, { id: p.id, name: p.name, category_id: p.category_id });
  }
  return map;
}

async function resolveServiceMap(
  serviceIds: string[]
): Promise<Map<string, ServiceLookup>> {
  const map = new Map<string, ServiceLookup>();
  if (serviceIds.length === 0) return map;
  const { data, error } = await supabaseAdmin
    .from("services")
    .select("id, name")
    .in("id", serviceIds);
  if (error) return map;
  for (const s of (data ?? []) as { id: string; name: string | null }[]) {
    map.set(s.id, { id: s.id, name: s.name });
  }
  return map;
}

async function resolveStaffMap(
  staffIds: string[]
): Promise<Map<string, StaffLookup>> {
  const map = new Map<string, StaffLookup>();
  if (staffIds.length === 0) return map;
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("id, name")
    .in("id", staffIds);
  if (error) return map;
  for (const s of (data ?? []) as { id: string; name: string | null }[]) {
    map.set(s.id, { id: s.id, name: s.name });
  }
  return map;
}

function toIso(value: string | null): string {
  return value ? new Date(value).toISOString() : "";
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") || "purchased";
    const customerSearch = (searchParams.get("customerSearch") || "").trim();
    const categoryId = searchParams.get("categoryId") || "";
    const packageSearch = (searchParams.get("packageSearch") || "").trim();
    const branchId = searchParams.get("branchId") || "";
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "20", 10));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    if (view === "purchased") {
      return await handlePurchasedView({
        customerSearch,
        categoryId,
        branchId,
        dateFrom,
        dateTo,
        page,
        limit,
        from,
        to,
      });
    }

    if (view === "usage") {
      return await handleUsageView({
        customerSearch,
        packageSearch,
        categoryId,
        branchId,
        dateFrom,
        dateTo,
        page,
        limit,
        from,
        to,
      });
    }

    return NextResponse.json(
      { ok: false, error: "Invalid view mode" },
      { status: 400 }
    );
  } catch (error: unknown) {
    console.error("GET /api/supabase/packages/report error:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Lỗi khi lấy dữ liệu báo cáo gói dịch vụ",
      },
      { status: 500 }
    );
  }
}

// ============================================
// View 1: Gói đã mua (Purchased packages)
// ============================================
type PurchasedArgs = {
  customerSearch: string;
  categoryId: string;
  branchId: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  limit: number;
  from: number;
  to: number;
};

async function handlePurchasedView(args: PurchasedArgs) {
  const {
    customerSearch,
    categoryId,
    branchId,
    dateFrom,
    dateTo,
    page,
    limit,
    from,
    to,
  } = args;

  // Resolve package ids matching the category filter (if any). We'll restrict
  // the customer_packages query by these ids.
  let categoryPackageIds: Set<string> | undefined;
  if (categoryId) {
    categoryPackageIds = await fetchPackageIdsByCategory(categoryId);
  }

  let query = supabaseAdmin
    .from("customer_packages")
    .select("*", { count: "exact" });

  if (customerSearch) {
    // Match either name or phone (denormalized columns).
    query = query.or(
      `customer_name.ilike.%${customerSearch}%,customer_phone.ilike.%${customerSearch}%`
    );
  }
  if (branchId) {
    query = query.eq("branch_id", branchId);
  }
  if (dateFrom) {
    query = query.gte("purchase_date", dateFrom);
  }
  if (dateTo) {
    query = query.lte("purchase_date", dateTo);
  }
  if (categoryPackageIds) {
    if (categoryPackageIds.size === 0) {
      // Category exists but has no packages — return empty result.
      return NextResponse.json({
        ok: true,
        data: { items: [], total: 0, page, limit },
      });
    }
    query = query.in(
      "package_id",
      Array.from(categoryPackageIds)
    );
  }

  query = query
    .order("purchase_date", { ascending: false })
    .range(from, to);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as CustomerPackageRow[];

  // Batch-resolve customers / packages for any rows whose denormalized name
  // fields are NULL (e.g. legacy inserts).
  const missingCustomerIds = [
    ...new Set(
      rows
        .filter((r) => !r.customer_name)
        .map((r) => r.customer_id)
        .filter((id): id is string => !!id)
    ),
  ];
  const missingPackageIds = [
    ...new Set(
      rows
        .filter((r) => !r.package_name)
        .map((r) => r.package_id)
        .filter((id): id is string => !!id)
    ),
  ];
  const [customerMap, packageMap] = await Promise.all([
    resolveCustomerMap(missingCustomerIds),
    resolvePackageMap(missingPackageIds),
  ]);

  const items = rows.map((r) => {
    const cust = customerMap.get(r.customer_id);
    const pkg = packageMap.get(r.package_id);
    return {
      id: r.id,
      customerId: r.customer_id || "",
      customerName: r.customer_name || cust?.name || "",
      customerPhone: r.customer_phone ?? cust?.phone ?? "",
      packageName: r.package_name || pkg?.name || "",
      status: r.status,
      purchaseDate: toIso(r.purchase_date),
      expiryDate: toIso(r.expiry_date),
      lastUsedDate: toIso(r.last_used_date),
      totalUses: r.total_uses,
      usedCount: r.used_count,
      remaining: r.remaining,
    };
  });

  return NextResponse.json({
    ok: true,
    data: { items, total: count ?? 0, page, limit },
  });
}

// ============================================
// View 2: Lịch sử dùng gói (Package usage history)
// ============================================
type UsageArgs = {
  customerSearch: string;
  packageSearch: string;
  categoryId: string;
  branchId: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  limit: number;
  from: number;
  to: number;
};

async function handleUsageView(args: UsageArgs) {
  const {
    customerSearch,
    packageSearch,
    categoryId,
    branchId,
    dateFrom,
    dateTo,
    page,
    limit,
    from,
    to,
  } = args;

  // Pre-resolve package ids matching the category — these will be used to
  // constrain both customer_packages (parent) and package_usages (denorm).
  let categoryPackageIds: Set<string> | undefined;
  if (categoryId) {
    categoryPackageIds = await fetchPackageIdsByCategory(categoryId);
  }

  let query = supabaseAdmin
    .from("package_usages")
    .select("*", { count: "exact" });

  if (customerSearch) {
    query = query.or(
      `customer_name.ilike.%${customerSearch}%,customer_phone.ilike.%${customerSearch}%`
    );
  }
  if (packageSearch) {
    query = query.ilike("package_name", `%${packageSearch}%`);
  }
  if (dateFrom) {
    query = query.gte("use_date", dateFrom);
  }
  if (dateTo) {
    query = query.lte("use_date", dateTo);
  }
  if (categoryPackageIds) {
    if (categoryPackageIds.size === 0) {
      return NextResponse.json({
        ok: true,
        data: {
          items: [],
          summary: { totalPackages: 0, totalUses: 0, totalCustomers: 0 },
          total: 0,
          page,
          limit,
        },
      });
    }
    // Filter by denormalized package_name OR by joined customer_package's
    // package_id. Since we don't have a guaranteed FK on customer_package_id
    // for PostgREST to follow, we instead filter via customer_package_id IN
    // (matching customer_packages rows). First, fetch matching cp ids.
    const cpIds = await fetchCustomerPackageIdsByPackageIds(
      Array.from(categoryPackageIds),
      branchId
    );
    if (cpIds.length === 0) {
      return NextResponse.json({
        ok: true,
        data: {
          items: [],
          summary: { totalPackages: 0, totalUses: 0, totalCustomers: 0 },
          total: 0,
          page,
          limit,
        },
      });
    }
    query = query.in("customer_package_id", cpIds);
  } else if (branchId) {
    // No category filter: filter by branch via parent customer_packages.
    const cpIds = await fetchCustomerPackageIdsByBranch(branchId);
    if (cpIds.length === 0) {
      return NextResponse.json({
        ok: true,
        data: {
          items: [],
          summary: { totalPackages: 0, totalUses: 0, totalCustomers: 0 },
          total: 0,
          page,
          limit,
        },
      });
    }
    query = query.in("customer_package_id", cpIds);
  }

  query = query.order("use_date", { ascending: false }).range(from, to);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as PackageUsageRow[];

  // Batch-resolve missing denormalized fields (customer/package/service/staff).
  const missingCustomerIds = [
    ...new Set(
      rows
        .filter((r) => !r.customer_name && r.customer_id)
        .map((r) => r.customer_id as string)
    ),
  ];
  const missingServiceIds = [
    ...new Set(
      rows
        .filter((r) => !r.service_name && r.service_id)
        .map((r) => r.service_id as string)
    ),
  ];
  const missingStaffIds = [
    ...new Set(
      rows
        .filter((r) => !r.staff_name && r.staff_id)
        .map((r) => r.staff_id as string)
    ),
  ];
  // For package_name we need the customer_package's package_id, then look up
  // package name. Fetch missing customer_packages.
  const missingCpIds = [
    ...new Set(
      rows
        .filter((r) => !r.package_name)
        .map((r) => r.customer_package_id)
        .filter((id): id is string => !!id)
    ),
  ];

  const [customerMap, serviceMap, staffMap, cpMap] = await Promise.all([
    resolveCustomerMap(missingCustomerIds),
    resolveServiceMap(missingServiceIds),
    resolveStaffMap(missingStaffIds),
    fetchCustomerPackageMap(missingCpIds),
  ]);

  // For cpMap we still need package names — fetch in batch.
  const cpPackageIds = [
    ...new Set(
      Array.from(cpMap.values())
        .map((cp) => cp.package_id)
        .filter((id): id is string => !!id)
    ),
  ];
  const packageMap = await resolvePackageMap(cpPackageIds);

  const items = rows.map((r) => {
    const cust = r.customer_id ? customerMap.get(r.customer_id) : undefined;
    const cp = cpMap.get(r.customer_package_id);
    const pkg =
      cp?.package_id ? packageMap.get(cp.package_id) : undefined;
    const svc = r.service_id ? serviceMap.get(r.service_id) : undefined;
    const stf = r.staff_id ? staffMap.get(r.staff_id) : undefined;
    return {
      id: r.id,
      packageName: r.package_name || pkg?.name || "",
      customerId: r.customer_id || "",
      customerName: r.customer_name || cust?.name || "",
      customerPhone: r.customer_phone ?? cust?.phone ?? "",
      useDate: toIso(r.use_date),
      quantity: r.quantity,
      // Include invoice_id so the report's "Hóa đơn" column can open the
      // full-page invoice view (PaidInvoiceView) — matching the revenue
      // invoice view's behavior. Falls back to "" when the usage row has no
      // linked invoice (legacy / manual entries).
      invoiceId: r.invoice_id || "",
      invoiceCode: r.invoice_code || "",
      staffName: r.staff_name || stf?.name || "",
    };
  });

  // Summary across ALL matching rows (not just the current page). We re-fetch
  // without pagination but with the same filters. To stay efficient we project
  // only the columns needed for aggregation.
  const summary = await computeUsageSummary({
    customerSearch,
    packageSearch,
    categoryPackageIds,
    branchId,
    dateFrom,
    dateTo,
    cpMapAlready: cpMap,
  });

  return NextResponse.json({
    ok: true,
    data: { items, summary, total: count ?? 0, page, limit },
  });
}

/**
 * Fetch customer_packages ids filtered by a set of package ids (and optionally
 * a branch). Used when the report needs to constrain package_usages via the
 * parent customer_packages row.
 */
async function fetchCustomerPackageIdsByPackageIds(
  packageIds: string[],
  branchId: string
): Promise<string[]> {
  if (packageIds.length === 0) return [];
  let q = supabaseAdmin
    .from("customer_packages")
    .select("id")
    .in("package_id", packageIds);
  if (branchId) q = q.eq("branch_id", branchId);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []).map((r: { id: string }) => r.id);
}

async function fetchCustomerPackageIdsByBranch(
  branchId: string
): Promise<string[]> {
  if (!branchId) return [];
  const { data, error } = await supabaseAdmin
    .from("customer_packages")
    .select("id")
    .eq("branch_id", branchId);
  if (error) return [];
  return (data ?? []).map((r: { id: string }) => r.id);
}

interface CustomerPackageLookup {
  id: string;
  package_id: string | null;
  branch_id: string | null;
}

async function fetchCustomerPackageMap(
  cpIds: string[]
): Promise<Map<string, CustomerPackageLookup>> {
  const map = new Map<string, CustomerPackageLookup>();
  if (cpIds.length === 0) return map;
  const { data, error } = await supabaseAdmin
    .from("customer_packages")
    .select("id, package_id, branch_id")
    .in("id", cpIds);
  if (error) return map;
  for (const r of (data ?? []) as { id: string; package_id: string | null; branch_id: string | null }[]) {
    map.set(r.id, { id: r.id, package_id: r.package_id, branch_id: r.branch_id });
  }
  return map;
}

/**
 * Aggregate the summary (total distinct packages, total uses, total distinct
 * customers) across ALL rows matching the filter — not just the current page.
 * Mirrors the Prisma route which did a second findMany with the same `where`
 * but only selected packageName/customerName/quantity.
 */
async function computeUsageSummary(args: {
  customerSearch: string;
  packageSearch: string;
  categoryPackageIds: Set<string> | undefined;
  branchId: string;
  dateFrom: string;
  dateTo: string;
  cpMapAlready: Map<string, CustomerPackageLookup>;
}): Promise<{
  totalPackages: number;
  totalUses: number;
  totalCustomers: number;
}> {
  const {
    customerSearch,
    packageSearch,
    categoryPackageIds,
    branchId,
    dateFrom,
    dateTo,
  } = args;

  let query = supabaseAdmin
    .from("package_usages")
    .select("package_name, customer_name, customer_id, quantity, customer_package_id");

  if (customerSearch) {
    query = query.or(
      `customer_name.ilike.%${customerSearch}%,customer_phone.ilike.%${customerSearch}%`
    );
  }
  if (packageSearch) {
    query = query.ilike("package_name", `%${packageSearch}%`);
  }
  if (dateFrom) {
    query = query.gte("use_date", dateFrom);
  }
  if (dateTo) {
    query = query.lte("use_date", dateTo);
  }

  // Category / branch filter via parent customer_packages (same as the main query).
  if (categoryPackageIds || branchId) {
    const cpIds = new Set<string>();
    // Pull all customer_packages matching the constraints once (without pagination).
    let cpQuery = supabaseAdmin
      .from("customer_packages")
      .select("id, package_id, branch_id");
    // Apply branch filter at the DB level (cheap).
    if (branchId) cpQuery = cpQuery.eq("branch_id", branchId);
    const { data: cpData, error: cpErr } = await cpQuery;
    if (cpErr) {
      return { totalPackages: 0, totalUses: 0, totalCustomers: 0 };
    }
    for (const cp of (cpData ?? []) as { id: string; package_id: string | null; branch_id: string | null }[]) {
      if (categoryPackageIds) {
        if (cp.package_id && categoryPackageIds.has(cp.package_id)) {
          cpIds.add(cp.id);
        }
      } else {
        cpIds.add(cp.id);
      }
    }
    if (cpIds.size === 0) {
      return { totalPackages: 0, totalUses: 0, totalCustomers: 0 };
    }
    query = query.in("customer_package_id", Array.from(cpIds));
  }

  const { data, error } = await query;
  if (error) {
    return { totalPackages: 0, totalUses: 0, totalCustomers: 0 };
  }
  const allRows = (data ?? []) as {
    package_name: string | null;
    customer_name: string | null;
    customer_id: string | null;
    quantity: number;
    customer_package_id: string;
  }[];

  const pkgSet = new Set<string>();
  const custSet = new Set<string>();
  let totalUses = 0;
  for (const r of allRows) {
    if (r.package_name) pkgSet.add(r.package_name);
    if (r.customer_name) custSet.add(r.customer_name);
    else if (r.customer_id) custSet.add(r.customer_id);
    totalUses += r.quantity || 0;
  }
  return {
    totalPackages: pkgSet.size,
    totalUses,
    totalCustomers: custSet.size,
  };
}
