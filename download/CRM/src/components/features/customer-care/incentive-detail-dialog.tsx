"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IncentiveApplyScopeLabel } from "@/lib/constants";

/**
 * IncentiveDetailDialog — read-only detail view for a promotion or voucher.
 *
 * Opens when the cashier clicks the blue program name link in the
 * PromotionList / VoucherList tables. Shows the full program info:
 *  - Tên chương trình + Mã (same row)
 *  - Giảm giá + Áp dụng (same row)
 *  - Thời gian áp dụng (days + from/to dates)
 *  - Cửa hàng được áp dụng (branch names)
 *  - Danh sách dịch vụ / sản phẩm được chọn (resolved names)
 *  - Số lượng / Đã sử dụng / Chưa sử dụng / Hết hạn (4-column table)
 *  - Chi phí (voucher only)
 *
 * This is a VIEW-ONLY dialog (no edit form). The existing IncentiveDialog
 * (edit/create) remains untouched; this is a separate component so the two
 * concerns (view vs. edit) stay decoupled.
 */

// Shared shape — covers BOTH promotion and voucher fields (cost is voucher-only,
// the rest are common). The parent passes whichever fields it has; missing
// fields render as "—".
export interface IncentiveDetail {
  id: string;
  code: string;
  name: string;
  discountValue: number;
  applyScope: string | null;
  startDate: string | null;
  endDate: string | null;
  usageLimit: number;
  usedCount: number;
  unusedCount: number;
  expiredCount: number;
  cost?: number;
  // type lets the dialog title say "Chi tiết khuyến mãi" vs "Chi tiết voucher".
  type?: "promotion" | "voucher";
  // New fields for branch + entity display.
  // branchIds: JSON-string array from the API, e.g. "[\"all\"]" or
  // "[\"uuid1\",\"uuid2\"]". "all" means every branch is eligible.
  branchIds?: string | null;
  // serviceIds: JSON-string array of entity ids. What these ids refer to
  // depends on discountType (service_category / service / product).
  serviceIds?: string | null;
  // discountType: determines which entity list to fetch & resolve names for.
  discountType?: string | null;
}

interface IncentiveDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: IncentiveDetail | null;
}

// Compute the number of days a program is valid (inclusive of both start and
// end dates). Returns null when dates are missing/unbounded so the UI can show
// "Không giới hạn".
function getValidDays(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
  const ms = e.getTime() - s.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24)) + 1; // inclusive
  return days < 0 ? 0 : days;
}

// Format an ISO date string (YYYY-MM-DD or full ISO) to dd/MM/yyyy for display.
// Returns "—" when the value is missing/invalid.
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("vi-VN");
}

// Safely parse a JSON-string array ("[\"a\",\"b\"]") into a string[]. Returns
// [] for null/undefined/invalid input.
function parseIdArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

// Human-readable label for each discountType, used for the entity-list section
// heading (e.g. "Dịch vụ được chọn" vs "Sản phẩm được chọn").
function getEntitySectionLabel(discountType: string | null | undefined): string {
  switch (discountType) {
    case "service_category":
      return "Nhóm dịch vụ được chọn";
    case "service":
      return "Dịch vụ được chọn";
    case "product":
      return "Sản phẩm được chọn";
    default:
      return "Mục được chọn";
  }
}

export function IncentiveDetailDialog({
  open,
  onOpenChange,
  detail,
}: IncentiveDetailDialogProps) {
  // Resolve branch names + entity names via Supabase queries. These only run
  // when the dialog is open AND there's a detail with ids to resolve. Each
  // query is keyed by the detail's id so switching items re-fetches correctly.
  const branchIds = parseIdArray(detail?.branchIds);
  const entityIds = parseIdArray(detail?.serviceIds);
  const isAllBranches = branchIds.includes("all");
  const realBranchIds = branchIds.filter((id) => id !== "all");
  const discountType = detail?.discountType || null;

  // Fetch branches (always — cheap, cached by react-query). Only resolved when
  // there are specific branch ids (not "all" and not empty).
  const { data: branchesData } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["incentive-detail-branches"],
    queryFn: async () => {
      const res = await fetch("/api/supabase/branches?active=true");
      const json = await res.json();
      return (json.data as { id: string; name: string }[]) || [];
    },
    enabled: open && !!detail && !isAllBranches && realBranchIds.length > 0,
  });

  // Fetch service categories when discountType === "service_category".
  const { data: serviceCategoriesData } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["incentive-detail-service-categories"],
    queryFn: async () => {
      const res = await fetch("/api/supabase/service-categories");
      const json = await res.json();
      return (json.data as { id: string; name: string }[]) || [];
    },
    enabled: open && discountType === "service_category" && entityIds.length > 0,
  });

  // Fetch services when discountType === "service".
  const { data: servicesData } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["incentive-detail-services"],
    queryFn: async () => {
      const res = await fetch("/api/supabase/services?limit=500");
      const json = await res.json();
      return (json.data as { id: string; name: string }[]) || [];
    },
    enabled: open && discountType === "service" && entityIds.length > 0,
  });

  // Fetch products when discountType === "product".
  const { data: productsData } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["incentive-detail-products"],
    queryFn: async () => {
      const res = await fetch("/api/supabase/products?limit=500");
      const json = await res.json();
      return (json.data as { id: string; name: string }[]) || [];
    },
    enabled: open && discountType === "product" && entityIds.length > 0,
  });

  if (!detail) {
    // Render an empty (closed) dialog when there's no detail. The `open` prop
    // is still forwarded so controlled open/close stays consistent.
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md" />
      </Dialog>
    );
  }

  const days = getValidDays(detail.startDate, detail.endDate);
  const isVoucher = detail.type === "voucher";
  const title = isVoucher ? "Chi tiết voucher" : "Chi tiết khuyến mãi";

  // Resolve branch names: "all" → "Tất cả cửa hàng"; otherwise map each id to
  // its name, joining with ", ". Unresolved ids fall back to the raw id.
  let branchDisplay = "—";
  if (isAllBranches) {
    branchDisplay = "Tất cả cửa hàng";
  } else if (realBranchIds.length > 0) {
    const names = realBranchIds.map((id) => {
      const found = (branchesData || []).find((b) => b.id === id);
      return found?.name || id.slice(0, 8);
    });
    branchDisplay = names.join(", ");
  }

  // Resolve entity names based on discountType.
  let entityNames: string[] = [];
  if (entityIds.length > 0) {
    let source: { id: string; name: string }[] = [];
    if (discountType === "service_category") source = serviceCategoriesData || [];
    else if (discountType === "service") source = servicesData || [];
    else if (discountType === "product") source = productsData || [];
    entityNames = entityIds.map((id) => {
      const found = source.find((e) => e.id === id);
      return found?.name || "";
    });
    // Drop any that didn't resolve (e.g. entity deleted) to avoid showing raw
    // uuids in the list.
    entityNames = entityNames.filter(Boolean);
  }

  // Two-column row: label (left) + value (right). Used for single-field rows.
  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex justify-between gap-4 py-1.5 text-sm border-b border-gray-100 last:border-b-0">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="font-medium text-gray-900 text-right">{value}</span>
    </div>
  );

  // Two-fields-per-row layout: each field is label (tiny, gray) above value.
  // Used to put "Tên chương trình" + "Mã" on one row, and "Giảm giá" +
  // "Áp dụng" on one row, per the user's request.
  const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex-1 py-1.5 text-sm">
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <div className="font-medium text-gray-900">{value}</div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-0.5">
          {/* Row 1: Tên chương trình + Mã (same line, 2 columns) */}
          <div className="flex gap-4 border-b border-gray-100">
            <Field label="Tên chương trình" value={detail.name || "—"} />
            <Field
              label="Mã"
              value={
                detail.code ? (
                  <span className="font-mono text-xs">{detail.code}</span>
                ) : (
                  "—"
                )
              }
            />
          </div>

          {/* Row 2: Giảm giá + Áp dụng (same line, 2 columns) */}
          <div className="flex gap-4 border-b border-gray-100">
            <Field
              label="Giảm giá"
              value={
                <span className="text-emerald-600">
                  {detail.discountValue}%
                </span>
              }
            />
            <Field
              label="Áp dụng"
              value={
                detail.applyScope
                  ? IncentiveApplyScopeLabel[
                      detail.applyScope as keyof typeof IncentiveApplyScopeLabel
                    ] || detail.applyScope
                  : "Hóa đơn"
              }
            />
          </div>

          {/* Thời gian áp dụng (full width) */}
          <Row
            label="Thời gian áp dụng"
            value={
              days === null ? (
                "Không giới hạn"
              ) : (
                <span>
                  {days} ngày
                  <span className="block text-xs font-normal text-gray-500">
                    ({formatDate(detail.startDate)} – {formatDate(detail.endDate)})
                  </span>
                </span>
              )
            }
          />

          {/* Cửa hàng được áp dụng (full width) */}
          <Row label="Cửa hàng áp dụng" value={branchDisplay} />

          {/* Danh sách dịch vụ / sản phẩm được chọn (full width, only when
              there are entities and they resolved to names). */}
          {entityNames.length > 0 && (
            <div className="py-1.5 text-sm border-b border-gray-100">
              <div className="text-xs text-gray-500 mb-1">
                {getEntitySectionLabel(discountType)}
              </div>
              <div className="font-medium text-gray-900">
                {/* Wrap long lists in a scrollable area so the dialog doesn't
                    grow unbounded for programs with many entities. */}
                <div className="max-h-32 overflow-y-auto pr-1 space-y-0.5">
                  {entityNames.map((nm, i) => (
                    <div key={i} className="text-[13px] text-gray-800">
                      • {nm}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Số lượng / Đã sử dụng / Chưa sử dụng / Hết hạn — 4-column table. */}
          <div className="py-2">
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded border border-gray-200 bg-gray-50 px-2 py-2">
                <div className="text-xs text-gray-500 mb-0.5">Số lượng</div>
                <div className="text-base font-semibold text-gray-900">
                  {formatNumber(detail.usageLimit)}
                </div>
              </div>
              <div className="rounded border border-gray-200 bg-gray-50 px-2 py-2">
                <div className="text-xs text-gray-500 mb-0.5">Đã sử dụng</div>
                <div className="text-base font-semibold text-gray-900">
                  {formatNumber(detail.usedCount)}
                </div>
              </div>
              <div className="rounded border border-gray-200 bg-gray-50 px-2 py-2">
                <div className="text-xs text-gray-500 mb-0.5">Chưa sử dụng</div>
                <div className="text-base font-semibold text-gray-900">
                  {formatNumber(detail.unusedCount)}
                </div>
              </div>
              <div className="rounded border border-gray-200 bg-gray-50 px-2 py-2">
                <div className="text-xs text-gray-500 mb-0.5">Hết hạn</div>
                <div className="text-base font-semibold text-gray-900">
                  {formatNumber(detail.expiredCount)}
                </div>
              </div>
            </div>
          </div>

          {/* Chi phí (voucher only) */}
          {isVoucher && (
            <Row
              label="Chi phí"
              value={
                <span>
                  {formatNumber(detail.cost)}
                  <span className="ml-0.5 text-xs font-normal text-gray-500">
                    đ
                  </span>
                </span>
              }
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
