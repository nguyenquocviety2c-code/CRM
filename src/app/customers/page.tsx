"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  Download,
  Search,
  Filter,
  Bell,
  Columns3,
  ChevronDown,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/shared/page-header";
import { queryKeys } from "@/lib/query-keys";
import { useCustomerStore, Customer } from "@/stores/customer-store";
import { getCustomerColumns } from "@/components/features/customers/customer-columns";
import { CustomerDialog } from "@/components/features/customers/customer-dialog";
import { CustomerDeleteDialog } from "@/components/features/customers/customer-delete-dialog";
import { useAuthStore } from "@/stores/auth-store";
import { maskPhone } from "@/lib/phone-mask";
import { useBranchStore } from "@/stores/branch-store";
import { toVietnamDay } from "@/lib/utils";

// Debounce hook — uses useEffect (NOT useMemo) so the cleanup actually runs
// and clears the timeout. The old useMemo version leaked timers on every keystroke.
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

interface Option {
  id: string;
  name: string;
}

interface InvoiceItem {
  name?: string;
  staffName?: string | null;
  staffId?: string | null;
  price?: number;
  quantity?: number;
  type?: string;
  [key: string]: unknown;
}

interface InvoicePromotion {
  id?: string;
  name?: string;
  discountValue?: number;
  discountAmount?: number;
  discountType?: string;
}

interface Invoice {
  id: string;
  code?: string;
  created_at?: string;
  createdAt?: string;
  tip?: number;
  items?: InvoiceItem[];
  final_amount?: number;
  total_amount?: number;
  discount?: number;
  promotion?: InvoicePromotion | null;
  payment_method?: string | null;
  status?: string;
}

interface Feedback {
  id: string;
  rating: number;
  content?: string | null;
  createdAt?: string;
}

// Column visibility keys — must match the column `key` in customer-columns.tsx.
const COLUMN_KEYS = [
  "code",
  "name",
  "phone",
  "group",
  "source",
  "channel",
  "careHistory",
  "actions",
] as const;

const COLUMN_LABELS: Record<string, string> = {
  code: "Mã",
  name: "Họ tên & ghi chú",
  phone: "Điện thoại",
  group: "Nhóm",
  source: "Nguồn KH",
  channel: "Kênh liên lạc",
  careHistory: "Lịch sử chăm sóc",
  actions: "Thao tác",
};

/** Format an ISO date string → "dd/MM/yyyy" using Vietnam timezone.
 *  The old version used `new Date(iso).getDate()` which returns the date in
 *  the HOST machine's local timezone — on a UTC server, a 23:00 Vietnam
 *  visit on Jan 5 would render as "06/01/...". Using `toVietnamDay` keeps
 *  the displayed date aligned with what the customer actually experienced. */
function formatShortDate(iso?: string): string {
  if (!iso) return "—";
  const dayStr = toVietnamDay(iso); // "YYYY-MM-DD"
  if (!dayStr || dayStr.length < 10) return "—";
  const [yyyy, mm, dd] = dayStr.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

/** Days between two epoch-ms values (b - a), rounded to 1 decimal. */
function daysBetween(aMs: number, bMs: number): number {
  return (bMs - aMs) / (1000 * 60 * 60 * 24);
}

/** Days until the next occurrence of a monthly anniversary (e.g. birthday).
 *  Returns 0 if the anniversary is today, otherwise 1-365. */
function daysUntilNextMonthlyAnniversary(month: number, day: number): number {
  const now = new Date();
  const vnNow = toVietnamDay(now); // "YYYY-MM-DD" in VN
  const [yyyyStr] = vnNow.split("-");
  const yyyy = Number(yyyyStr);
  // Try this year's anniversary first.
  let next = new Date(`${yyyy}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+07:00`);
  const todayMs = new Date(`${vnNow}T00:00:00+07:00`).getTime();
  if (next.getTime() < todayMs) {
    // Already passed this year → next is next year.
    next = new Date(`${yyyy + 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+07:00`);
  }
  return Math.round((next.getTime() - todayMs) / (1000 * 60 * 60 * 24));
}

/** Customer history dialog — "Lịch sử chăm sóc".
 *
 *  Algorithm overview
 *  ------------------
 *  Data sources:
 *    1. Up to 100 most-recent COMPLETED invoices (`status=completed`) — used
 *       for BOTH the 10-row display list AND all aggregate stats. Fetching
 *       100 (not 10) removes the sampling bias where "top services" only
 *       reflected the last 10 visits.
 *    2. Up to 100 most-recent feedbacks — used for BOTH the 5-row display
 *       list AND the aggregate avg-rating / count stats.
 *    3. `customer.totalSpent` (LTV) — pre-aggregated on the server, so we
 *       don't need to sum all invoices client-side. Used as the canonical
 *       LTV; falls back to summing the fetched invoices when the field is
 *       missing/zero.
 *
 *  Computed metrics (all memoized):
 *    - visitCount: total completed visits (= invoices.length, but capped at
 *      100 — the true total is on the server; for typical customers this is
 *      exact, for power users it's a lower bound).
 *    - ltv: lifetime value (totalSpent || sum of final_amount).
 *    - avgSpendPerVisit: ltv / visitCount.
 *    - firstVisitMs / lastVisitMs: earliest & latest invoice timestamps.
 *    - tenureDays: days since firstVisit.
 *    - daysSinceLastVisit: days from lastVisit to today.
 *    - avgGapDays: mean days between consecutive visits.
 *    - predictedNextVisit: lastVisit + avgGapDays (ISO date).
 *    - riskStatus: "active" | "at-risk" | "churned" — based on
 *      daysSinceLastVisit vs avgGapDays (or a 90-day fallback when there's
 *      no avg gap). active ≤ 1.5× avgGap; at-risk ≤ 2.5×; churned > 2.5×.
 *    - avgRating: mean rating across ALL fetched feedbacks.
 *    - feedbackCount: total fetched feedbacks.
 *    - promotionsUsed: distinct promotion names applied across invoices.
 *    - totalSavings: sum of promotion.discountAmount (fallback invoice.discount).
 *    - topServices / topStaff: top 3 by occurrence across all fetched invoices.
 *    - avgTip: mean tip across all fetched invoices.
 *    - birthdayInfo: if customer.birthday exists, days until next birthday.
 *
 *  Rendering:
 *    The dialog widens to max-w-3xl to fit the new sections. Layout top→bottom:
 *      1. Header (name + phone + code + group/rank badges + note)
 *      2. Risk-status banner (color-coded)
 *      3. Summary stats grid (4 cards: visits, LTV, avg/visit, avg rating)
 *      4. Visit timeline (first → last → predicted next)
 *      5. Promotion insights + birthday reminder (2-col)
 *      6. "Lịch sử 10 cuộc hẹn gần nhất" (display list — 10 most recent)
 *      7. Preferences grid (avg gap, avg tip, top 3 services, top 3 staff)
 *      8. "Lịch sử đánh giá" (display list — 5 most recent)
 */
function CustomerHistoryDialog({
  customer,
  open,
  onClose,
}: {
  customer: Customer | null;
  open: boolean;
  onClose: () => void;
}) {
  // Fetch up to 100 most-recent COMPLETED invoices. The display list shows
  // only 10, but the aggregate stats (top services, avg gap, LTV fallback,
  // promotion savings) need a larger sample to be representative.
  const { data: invoiceData, isLoading: loadingInvoices } = useQuery({
    queryKey: [
      "customer-history-invoices",
      customer?.id,
    ],
    queryFn: async () => {
      if (!customer) return [] as Invoice[];
      const res = await fetch(
        `/api/supabase/invoices?customer_id=${encodeURIComponent(
          customer.id
        )}&limit=100&status=completed`
      );
      const json = await res.json();
      return (json.data || []) as Invoice[];
    },
    enabled: !!customer,
  });

  // Fetch up to 100 most-recent feedbacks. Display shows 5; avg rating uses
  // all of them for accuracy.
  const { data: feedbackData, isLoading: loadingFeedback } = useQuery({
    queryKey: [
      "customer-history-feedback",
      customer?.id,
    ],
    queryFn: async () => {
      if (!customer) return [] as Feedback[];
      const res = await fetch(
        `/api/supabase/customer-feedback?customer_id=${encodeURIComponent(
          customer.id
        )}&limit=100`
      );
      const json = await res.json();
      return (json.data?.feedbacks || []) as Feedback[];
    },
    enabled: !!customer,
  });

  const invoices: Invoice[] = invoiceData || [];
  const feedbacks: Feedback[] = feedbackData || [];

  // --- Timestamps (epoch ms) sorted ascending for gap calc ---
  const invoiceTimes = useMemo(
    () =>
      invoices
        .map((inv) => new Date(inv.created_at || inv.createdAt || "").getTime())
        .filter((t) => !isNaN(t))
        .sort((a, b) => a - b),
    [invoices]
  );

  const visitCount = invoices.length;

  // --- LTV: prefer the server-aggregated totalSpent; fall back to summing
  //     the fetched invoices' final_amount (covers legacy customers where
  //     totalSpent wasn't backfilled). ---
  const ltv = useMemo(() => {
    const serverTotal = Number(customer?.totalSpent ?? customer?.total_spent ?? 0);
    if (serverTotal > 0) return serverTotal;
    return invoices.reduce((sum, inv) => sum + (Number(inv.final_amount) || 0), 0);
  }, [customer, invoices]);

  const avgSpendPerVisit = visitCount > 0 ? ltv / visitCount : 0;

  const firstVisitMs = invoiceTimes.length > 0 ? invoiceTimes[0] : null;
  const lastVisitMs = invoiceTimes.length > 0 ? invoiceTimes[invoiceTimes.length - 1] : null;

  // --- Tenure & days since last visit (Vietnam-timezone-aware) ---
  const tenureDays = useMemo(() => {
    if (firstVisitMs === null) return null;
    const todayMs = Date.now();
    return daysBetween(firstVisitMs, todayMs);
  }, [firstVisitMs]);

  const daysSinceLastVisit = useMemo(() => {
    if (lastVisitMs === null) return null;
    return daysBetween(lastVisitMs, Date.now());
  }, [lastVisitMs]);

  // --- Average gap (days) between consecutive visits. ---
  const avgGapDays = useMemo(() => {
    if (invoiceTimes.length < 2) return null;
    let totalDays = 0;
    for (let i = 1; i < invoiceTimes.length; i++) {
      totalDays += daysBetween(invoiceTimes[i - 1], invoiceTimes[i]);
    }
    return totalDays / (invoiceTimes.length - 1);
  }, [invoiceTimes]);

  // --- Predicted next visit = last visit + avg gap. ---
  const predictedNextVisitMs = useMemo(() => {
    if (lastVisitMs === null || avgGapDays === null) return null;
    return lastVisitMs + avgGapDays * 24 * 60 * 60 * 1000;
  }, [lastVisitMs, avgGapDays]);

  // --- Risk status: churn prediction based on days since last visit vs the
  //     customer's own visit cadence. Falls back to a fixed 90-day window
  //     when there's no avg gap (e.g. only 1 visit). ---
  const riskStatus = useMemo<{
    level: "active" | "at-risk" | "churned" | "new";
    label: string;
    color: string;
    bg: string;
  }>(() => {
    if (visitCount === 0) {
      return { level: "new", label: "Khách mới", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" };
    }
    if (daysSinceLastVisit === null) {
      return { level: "new", label: "Khách mới", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" };
    }
    // Thresholds: use avg gap if available; otherwise 90-day fixed window.
    const baseGap = avgGapDays !== null ? avgGapDays : 45;
    const activeThreshold = baseGap * 1.5;
    const atRiskThreshold = baseGap * 2.5;
    if (daysSinceLastVisit <= activeThreshold) {
      return { level: "active", label: "Đang hoạt động", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" };
    }
    if (daysSinceLastVisit <= atRiskThreshold) {
      return { level: "at-risk", label: "Có nguy cơ rời bỏ", color: "text-orange-700", bg: "bg-orange-50 border-orange-200" };
    }
    return { level: "churned", label: "Đã rời bỏ", color: "text-red-700", bg: "bg-red-50 border-red-200" };
  }, [visitCount, daysSinceLastVisit, avgGapDays]);

  // --- Top 3 services by occurrence across all fetched invoice items. ---
  const topServices = useMemo(() => {
    const counts = new Map<string, number>();
    for (const inv of invoices) {
      for (const it of inv.items || []) {
        const n = it.name?.trim();
        if (!n) continue;
        counts.set(n, (counts.get(n) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [invoices]);

  // --- Top 3 staff by occurrence across all fetched invoice items. ---
  const topStaff = useMemo(() => {
    const counts = new Map<string, number>();
    for (const inv of invoices) {
      for (const it of inv.items || []) {
        const s = it.staffName?.trim();
        if (!s) continue;
        counts.set(s, (counts.get(s) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [invoices]);

  // --- Average tip across all fetched invoices. ---
  const avgTip = useMemo(() => {
    if (invoices.length === 0) return 0;
    const total = invoices.reduce((sum, inv) => sum + (Number(inv.tip) || 0), 0);
    return total / invoices.length;
  }, [invoices]);

  // --- Aggregate feedback stats: avg rating + total count. ---
  const feedbackStats = useMemo(() => {
    if (feedbacks.length === 0) return { avgRating: null, count: 0 };
    const sum = feedbacks.reduce((s, f) => s + (Number(f.rating) || 0), 0);
    return { avgRating: sum / feedbacks.length, count: feedbacks.length };
  }, [feedbacks]);

  // --- Promotion insights: distinct promotions used + total savings. ---
  const promotionStats = useMemo(() => {
    const promoNames = new Set<string>();
    let totalSavings = 0;
    for (const inv of invoices) {
      if (inv.promotion?.name) {
        promoNames.add(inv.promotion.name);
      }
      // Prefer the promotion's pre-computed discountAmount; fall back to the
      // invoice-level discount (covers invoices where a manual discount was
      // applied without a named promotion).
      const saving =
        Number(inv.promotion?.discountAmount) ||
        Number(inv.discount) ||
        0;
      totalSavings += saving;
    }
    return { usedCount: promoNames.size, totalSavings };
  }, [invoices]);

  // --- Birthday reminder: if customer.birthday exists, compute days until
  //     the next occurrence. Returns null when no birthday is set. ---
  const birthdayInfo = useMemo<{ month: number; day: number; daysUntil: number; display: string } | null>(() => {
    const bday = customer?.birthday;
    if (!bday) return null;
    // Birthday may be "YYYY-MM-DD" or an ISO datetime. Extract month+day.
    const d = new Date(bday);
    if (isNaN(d.getTime())) return null;
    // Use Vietnam-day to avoid off-by-one when the host runs in UTC.
    const vnDay = toVietnamDay(bday); // "YYYY-MM-DD"
    const parts = vnDay.split("-");
    const month = parseInt(parts[1] || "0", 10);
    const day = parseInt(parts[2] || "0", 10);
    if (!month || !day) return null;
    const daysUntil = daysUntilNextMonthlyAnniversary(month, day);
    return { month, day, daysUntil, display: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}` };
  }, [customer?.birthday]);

  // Display lists: only the 10 most recent invoices + 5 most recent feedbacks.
  // The fetched arrays are already sorted descending by created_at (API default).
  const displayInvoices = invoices.slice(0, 10);
  const displayFeedbacks = feedbacks.slice(0, 5);

  const fmtVND = (n: number) =>
    n.toLocaleString("vi-VN", { maximumFractionDigits: 0 });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="!max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-gray-900">
            Lịch sử
          </DialogTitle>
          {/* Customer info sub-header — name + phone + code + badges + note.
              Moved below the "Lịch sử" title so the dialog's purpose is clear
              at a glance, while the customer identity stays prominent. */}
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-emerald-700">{customer?.name}</span>
            {customer?.phone && (
              <span className="text-sm text-gray-500">
                · {useAuthStore.getState().hasPermission("view_customer_phone") ? customer.phone : maskPhone(customer.phone)}
              </span>
            )}
            {customer?.code && (
              <span className="text-xs text-gray-400">
                · {customer.code}
              </span>
            )}
            {customer?.group && (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
                {customer.group.name}
              </span>
            )}
            {customer?.rank && (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
                {customer.rank.name}
              </span>
            )}
          </div>
          {customer?.note && (
            <p className="mt-1 text-xs text-gray-500 italic">
              Ghi chú: {customer.note}
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1 -mr-1 space-y-2">
          {/* Risk-status banner — actionable at-a-glance churn indicator */}
          {visitCount > 0 && (
            <div className={`rounded-lg border px-3 py-1 flex items-center justify-between ${riskStatus.bg}`}>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${riskStatus.color}`}>
                  {riskStatus.label}
                </span>
                {daysSinceLastVisit !== null && (
                  <span className="text-xs text-gray-600">
                    · {Math.round(daysSinceLastVisit)} ngày kể từ lần cuối
                  </span>
                )}
              </div>
              {predictedNextVisitMs !== null && (
                <span className="text-xs text-gray-600">
                  Dự kiến quay lại: {formatShortDate(new Date(predictedNextVisitMs).toISOString())}
                </span>
              )}
            </div>
          )}

          {/* Summary stats grid — 4 cards, each with a distinct color tint so
              the user can distinguish metric types at a glance:
              emerald = visits/engagement, teal = money (LTV),
              cyan = average spending, amber = rating. */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5">
              <div className="text-xs font-medium text-emerald-700">Số lượt ghé</div>
              <div className="mt-0.5 text-base font-bold text-emerald-900">
                {visitCount}
              </div>
            </div>
            <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5">
              <div className="text-xs font-medium text-teal-700">Tổng chi tiêu (LTV)</div>
              <div className="mt-0.5 text-base font-bold text-teal-900">
                {visitCount > 0 ? `${fmtVND(ltv)}đ` : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5">
              <div className="text-xs font-medium text-cyan-700">Chi tiêu TB / lượt</div>
              <div className="mt-0.5 text-base font-bold text-cyan-900">
                {visitCount > 0 ? `${fmtVND(avgSpendPerVisit)}đ` : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5">
              <div className="text-xs font-medium text-amber-700">Đánh giá TB</div>
              <div className="mt-0.5 text-base font-bold text-amber-900 flex items-center gap-1">
                {feedbackStats.avgRating !== null ? (
                  <>
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    {feedbackStats.avgRating.toFixed(1)}
                    <span className="text-xs font-normal text-gray-400">
                      ({feedbackStats.count})
                    </span>
                  </>
                ) : (
                  <span className="text-gray-400 text-sm">Chưa có</span>
                )}
              </div>
            </div>
          </section>

          {/* Visit timeline — first → last → predicted next. Slate tint keeps
              it visually separate from the colored stat cards above. */}
          {visitCount > 0 && (
            <section className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
              <div className="text-xs font-semibold text-slate-700 mb-1">Hành trình khách hàng</div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-xs text-gray-400">Lần đầu</div>
                  <div className="font-medium text-gray-800">
                    {firstVisitMs ? formatShortDate(new Date(firstVisitMs).toISOString()) : "—"}
                  </div>
                  {tenureDays !== null && (
                    <div className="text-xs text-gray-500">{Math.round(tenureDays)} ngày</div>
                  )}
                </div>
                <div>
                  <div className="text-xs text-gray-400">Lần cuối</div>
                  <div className="font-medium text-gray-800">
                    {lastVisitMs ? formatShortDate(new Date(lastVisitMs).toISOString()) : "—"}
                  </div>
                  {daysSinceLastVisit !== null && (
                    <div className="text-xs text-gray-500">{Math.round(daysSinceLastVisit)} ngày trước</div>
                  )}
                </div>
                <div>
                  <div className="text-xs text-gray-400">Dự kiến lần sau</div>
                  <div className="font-medium text-gray-800">
                    {predictedNextVisitMs
                      ? formatShortDate(new Date(predictedNextVisitMs).toISOString())
                      : "—"}
                  </div>
                  {avgGapDays !== null && (
                    <div className="text-xs text-gray-500">~{avgGapDays.toFixed(0)} ngày / lần</div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Promotion insights (orange = savings) + birthday reminder (pink).
              2-col layout, shown only when data exists. */}
          {(promotionStats.usedCount > 0 || birthdayInfo) && (
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5">
                <div className="text-xs font-semibold text-orange-700">Khuyến mãi đã dùng</div>
                <div className="mt-0.5 text-sm text-gray-800 space-y-0">
                  <div className="flex justify-between">
                    <span>Số chương trình:</span>
                    <span className="font-medium">{promotionStats.usedCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tiết kiệm:</span>
                    <span className="font-medium text-orange-600">
                      {promotionStats.totalSavings > 0
                        ? `${fmtVND(promotionStats.totalSavings)}đ`
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>
              {birthdayInfo && (
                <div className="rounded-lg border border-pink-100 bg-pink-50/50 px-3 py-1.5">
                  <div className="text-xs text-pink-600">Sinh nhật</div>
                  <div className="mt-0.5 text-sm text-gray-800">
                    <div className="flex justify-between">
                      <span>Ngày:</span>
                      <span className="font-medium">{birthdayInfo.display}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Còn:</span>
                      <span className="font-medium text-pink-700">
                        {birthdayInfo.daysUntil === 0
                          ? "Hôm nay 🎂"
                          : `${birthdayInfo.daysUntil} ngày`}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* 10 most recent completed invoices (display list). Zebra-striped
              rows for readability; emerald accent bar on the section header. */}
          <section>
            <h3 className="mb-1 text-sm font-semibold text-emerald-700 flex items-center gap-2">
              <span className="inline-block h-3 w-1 rounded-full bg-emerald-500" />
              Lịch sử 10 cuộc hẹn gần nhất
            </h3>
            {loadingInvoices ? (
              <div className="py-2 text-center text-sm text-gray-500">
                Đang tải...
              </div>
            ) : displayInvoices.length === 0 ? (
              <div className="py-2 text-center text-sm text-gray-500">
                Chưa có lịch sử
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                {displayInvoices.map((inv, idx) => (
                  <div
                    key={inv.id}
                    className={`px-3 py-1 flex items-start gap-3 text-sm ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
                  >
                    <div className="w-24 shrink-0 text-gray-500">
                      {formatShortDate(inv.created_at || inv.createdAt)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-gray-800">
                        {(inv.items || [])
                          .map((it) => it.name)
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </div>
                      <div className="text-xs text-gray-500">
                        Thợ:{" "}
                        {(inv.items || [])
                          .map((it) => it.staffName)
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </div>
                    </div>
                    {Number(inv.final_amount) > 0 && (
                      <div className="shrink-0 text-xs text-gray-700">
                        {fmtVND(Number(inv.final_amount))}đ
                      </div>
                    )}
                    {Number(inv.tip) > 0 && (
                      <div className="shrink-0 text-xs text-emerald-600">
                        +{fmtVND(Number(inv.tip))}đ
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Preferences grid: avg gap (teal), avg tip (emerald), top services
              (cyan), top staff (violet). Each tinted so the user can tell the
              4 preference facets apart at a glance. */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5">
              <div className="text-xs font-medium text-teal-700">
                Thời gian dùng dịch vụ trung bình
              </div>
              <div className="mt-0.5 text-sm font-semibold text-teal-900">
                {avgGapDays === null
                  ? "Chưa đủ dữ liệu"
                  : `${avgGapDays.toFixed(1)} ngày`}
              </div>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5">
              <div className="text-xs font-medium text-emerald-700">Tiền thưởng trung bình</div>
              <div className="mt-0.5 text-sm font-semibold text-emerald-900">
                {invoices.length === 0
                  ? "Chưa đủ dữ liệu"
                  : `${fmtVND(avgTip)}đ`}
              </div>
            </div>
            <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5">
              <div className="text-xs font-medium text-cyan-700">3 dịch vụ dùng nhiều nhất</div>
              <div className="mt-0.5 text-sm text-cyan-900 space-y-0">
                {topServices.length === 0 ? (
                  <span className="text-gray-400">Chưa có dữ liệu</span>
                ) : (
                  topServices.map(([name, count]) => (
                    <div key={name} className="flex justify-between gap-2">
                      <span className="truncate">{name}</span>
                      <span className="text-gray-500 shrink-0">{count}×</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5">
              <div className="text-xs font-medium text-violet-700">3 thợ dùng nhiều nhất</div>
              <div className="mt-0.5 text-sm text-violet-900 space-y-0">
                {topStaff.length === 0 ? (
                  <span className="text-gray-400">Chưa có dữ liệu</span>
                ) : (
                  topStaff.map(([name, count]) => (
                    <div key={name} className="flex justify-between gap-2">
                      <span className="truncate">{name}</span>
                      <span className="text-gray-500 shrink-0">{count}×</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          {/* Customer feedback (5 most recent). Amber tint ties to the rating
              theme; accent bar on the header matches the visit-history style. */}
          <section>
            <h3 className="mb-1 text-sm font-semibold text-amber-700 flex items-center gap-2">
              <span className="inline-block h-3 w-1 rounded-full bg-amber-500" />
              Lịch sử đánh giá
              {feedbackStats.count > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-400">
                  ({feedbackStats.count} đánh giá · TB {feedbackStats.avgRating?.toFixed(1)}★)
                </span>
              )}
            </h3>
            {loadingFeedback ? (
              <div className="py-2 text-center text-sm text-gray-500">
                Đang tải...
              </div>
            ) : displayFeedbacks.length === 0 ? (
              <div className="py-2 text-center text-sm text-gray-500">
                Chưa có đánh giá
              </div>
            ) : (
              <div className="space-y-1">
                {displayFeedbacks.map((fb) => (
                  <div
                    key={fb.id}
                    className="rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-1.5 text-sm"
                  >
                    <div className="flex items-center gap-1 mb-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={
                            "h-3.5 w-3.5 " +
                            (i < fb.rating
                              ? "fill-amber-400 text-amber-400"
                              : "text-gray-300")
                          }
                        />
                      ))}
                      <span className="ml-2 text-xs text-gray-400">
                        {formatShortDate(fb.createdAt)}
                      </span>
                    </div>
                    <div className="text-gray-700">
                      {fb.content || "—"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(COLUMN_KEYS.map((k) => [k, true])) as Record<
        string,
        boolean
      >
  );
  const limit = 20;

  const debouncedSearch = useDebounce(search, 300);
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);

  const {
    dialogOpen,
    selectedCustomer,
    deleteDialogOpen,
    deletingCustomer,
    filterSource,
    filterGroup,
    openCreateDialog,
    openEditDialog,
    closeDialog,
    openDeleteDialog,
    closeDeleteDialog,
    setFilterSource,
    setFilterGroup,
  } = useCustomerStore();

  const toggleColumn = (key: string) => {
    setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Fetch sources for dropdown
  const { data: sourcesData } = useQuery({
    queryKey: queryKeys.settings.section("sources"),
    queryFn: async () => {
      const res = await fetch("/api/supabase/customer-sources");
      const json = await res.json();
      return json.data || [];
    },
  });

  // Fetch groups for dropdown
  const { data: groupsData } = useQuery({
    queryKey: queryKeys.settings.section("groups"),
    queryFn: async () => {
      const res = await fetch("/api/supabase/customer-groups");
      const json = await res.json();
      return json.data || [];
    },
  });

  const sources: Option[] = sourcesData || [];
  const groups: Option[] = groupsData || [];

  const { data, isLoading } = useQuery<{
    customers: Customer[];
    total: number;
    page: number;
    limit: number;
  }>({
    queryKey: queryKeys.customers.list({
      search: debouncedSearch,
      page,
      sourceId: filterSource,
      groupId: filterGroup,
      branchId: selectedBranchId || undefined,
    }),
    queryFn: async () => {
      const params = new URLSearchParams({
        search: debouncedSearch,
        page: String(page),
        limit: String(limit),
        // Show ALL customers (both "khách cũ" with paid invoices AND "khách mới"
        // who only registered name+phone but haven't paid yet). Walk-in guests
        // (no phone) are already filtered out by the API's default behavior.
      });
      if (filterSource) params.set("sourceId", filterSource);
      if (filterGroup) params.set("groupId", filterGroup);
      if (selectedBranchId) params.set("branch_id", selectedBranchId);
      const res = await fetch(`/api/supabase/customers?${params.toString()}`);
      const json = await res.json();
      return json;
    },
    // Keep previous page's data visible while the next page loads — no blank
    // table during pagination.
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  const customers = data?.data || [];
  const total = data?.pagination?.total || 0;
  const totalPages = data?.pagination?.totalPages || Math.ceil(total / limit);

  const columns = getCustomerColumns({
    onEdit: openEditDialog,
    onDelete: openDeleteDialog,
    onViewHistory: (c) => setHistoryCustomer(c),
  });

  // Filter columns by visibility state.
  const visibleCols = columns.filter((c) => visibleColumns[c.key] !== false);

  const handleExport = () => {
    const params = new URLSearchParams({
      search: debouncedSearch,
    });
    if (filterSource) params.set("sourceId", filterSource);
    if (filterGroup) params.set("groupId", filterGroup);
    window.open(`/api/customers/export?${params.toString()}`, "_blank");
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <PageHeader title="Khách hàng">
        <div className="flex items-center gap-3">
          <Button variant="outline" className="text-sm">
            <Bell className="mr-2 h-4 w-4" />
            Nhận
          </Button>
          <Button variant="outline" className="text-sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Xuất excel
          </Button>
          <Button
            onClick={openCreateDialog}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            Thêm khách hàng
          </Button>
        </div>
      </PageHeader>

      {/* Search & Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm kiếm..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-gray-500" />
          <select
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          >
            <option value="">Nhóm</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          >
            <option value="">Nguồn</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>

          {/* Column visibility toggle */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-9"
              >
                <Columns3 className="h-4 w-4" />
                Cột
                <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <div className="px-2 py-1.5 text-xs font-medium text-gray-500">
                Hiển thị cột
              </div>
              {columns.map((col) => (
                <DropdownMenuItem
                  key={col.key}
                  onClick={(e) => {
                    e.preventDefault();
                    toggleColumn(col.key);
                  }}
                  className="cursor-pointer"
                >
                  <Checkbox
                    checked={visibleColumns[col.key] !== false}
                    onCheckedChange={() => toggleColumn(col.key)}
                    className="mr-2 h-4 w-4"
                  />
                  <span className="text-sm">
                    {COLUMN_LABELS[col.key] || col.header}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 hover:bg-gray-50">
              {visibleCols.map((col) => (
                <TableHead
                  key={col.key}
                  className={col.className || "text-left font-medium text-gray-500"}
                >
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={visibleCols.length}
                  className="py-8 text-center text-gray-500"
                >
                  Đang tải...
                </TableCell>
              </TableRow>
            ) : customers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={visibleCols.length}
                  className="py-8 text-center text-gray-500"
                >
                  Không có khách hàng nào
                </TableCell>
              </TableRow>
            ) : (
              customers.map((customer) => (
                <TableRow
                  key={customer.id}
                  className="border-b hover:bg-gray-50"
                >
                  {visibleCols.map((col) => (
                    <TableCell
                      key={col.key}
                      className={col.className || "text-left"}
                    >
                      {col.render(customer)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Hiển thị {(page - 1) * limit + 1}-
            {Math.min(page * limit, total)} trên tổng {total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
            >
              Sau
            </Button>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <CustomerDialog
        open={dialogOpen}
        onClose={closeDialog}
        customer={selectedCustomer}
      />
      <CustomerDeleteDialog
        open={deleteDialogOpen}
        onClose={closeDeleteDialog}
        customer={deletingCustomer}
      />
      <CustomerHistoryDialog
        customer={historyCustomer}
        open={!!historyCustomer}
        onClose={() => setHistoryCustomer(null)}
      />
    </div>
  );
}
