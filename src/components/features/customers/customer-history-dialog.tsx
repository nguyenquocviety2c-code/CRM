"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuthStore } from "@/stores/auth-store";
import { maskPhone } from "@/lib/phone-mask";
import { toVietnamDay } from "@/lib/utils";

/** Minimal customer shape this dialog needs. Any caller (Customer module,
 * Booking module, Cashier module) can pass a partial customer object as long
 * as it has an `id` — the dialog fetches invoices + feedbacks by id. */
export interface HistoryCustomer {
  id: string;
  name?: string | null;
  phone?: string | null;
  code?: string | null;
  note?: string | null;
  birthday?: string | null;
  group?: { id: string; name: string } | null;
  rank?: { id: string; name: string } | null;
  totalSpent?: number;
  total_spent?: number;
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

/** Format an ISO date string → "dd/MM/yyyy" using Vietnam timezone. */
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
  let next = new Date(`${yyyy}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+07:00`);
  const todayMs = new Date(`${vnNow}T00:00:00+07:00`).getTime();
  if (next.getTime() < todayMs) {
    next = new Date(`${yyyy + 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+07:00`);
  }
  return Math.round((next.getTime() - todayMs) / (1000 * 60 * 60 * 24));
}

/**
 * Customer history dialog — "Lịch sử".
 *
 * Reusable across the Customer, Booking, and Cashier modules. Shows the
 * customer's visit history, spending stats, preferences, and feedback.
 *
 * Props:
 *   customer — the customer to show history for (needs at least `id`).
 *   open     — whether the dialog is visible.
 *   onClose  — callback when the dialog should close.
 */
export function CustomerHistoryDialog({
  customer,
  open,
  onClose,
}: {
  customer: HistoryCustomer | null;
  open: boolean;
  onClose: () => void;
}) {
  // Fetch up to 100 most-recent COMPLETED invoices. The display list shows
  // only 10, but the aggregate stats (top services, avg gap, LTV fallback,
  // promotion savings) need a larger sample to be representative.
  const { data: invoiceData, isLoading: loadingInvoices } = useQuery({
    queryKey: ["customer-history-invoices", customer?.id],
    queryFn: async () => {
      if (!customer) return [] as Invoice[];
      const res = await fetch(
        `/api/supabase/invoices?customer_id=${encodeURIComponent(customer.id)}&limit=100&status=completed`
      );
      const json = await res.json();
      return (json.data || []) as Invoice[];
    },
    enabled: !!customer,
  });

  // Fetch up to 100 most-recent feedbacks. Display shows 5; avg rating uses
  // all of them for accuracy.
  const { data: feedbackData, isLoading: loadingFeedback } = useQuery({
    queryKey: ["customer-history-feedback", customer?.id],
    queryFn: async () => {
      if (!customer) return [] as Feedback[];
      const res = await fetch(
        `/api/supabase/customer-feedback?customer_id=${encodeURIComponent(customer.id)}&limit=100`
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
  //     the fetched invoices' final_amount. ---
  const ltv = useMemo(() => {
    const serverTotal = Number(customer?.totalSpent ?? customer?.total_spent ?? 0);
    if (serverTotal > 0) return serverTotal;
    return invoices.reduce((sum, inv) => sum + (Number(inv.final_amount) || 0), 0);
  }, [customer, invoices]);

  const avgSpendPerVisit = visitCount > 0 ? ltv / visitCount : 0;

  const firstVisitMs = invoiceTimes.length > 0 ? invoiceTimes[0] : null;
  const lastVisitMs = invoiceTimes.length > 0 ? invoiceTimes[invoiceTimes.length - 1] : null;

  const tenureDays = useMemo(() => {
    if (firstVisitMs === null) return null;
    return daysBetween(firstVisitMs, Date.now());
  }, [firstVisitMs]);

  const daysSinceLastVisit = useMemo(() => {
    if (lastVisitMs === null) return null;
    return daysBetween(lastVisitMs, Date.now());
  }, [lastVisitMs]);

  const avgGapDays = useMemo(() => {
    if (invoiceTimes.length < 2) return null;
    let totalDays = 0;
    for (let i = 1; i < invoiceTimes.length; i++) {
      totalDays += daysBetween(invoiceTimes[i - 1], invoiceTimes[i]);
    }
    return totalDays / (invoiceTimes.length - 1);
  }, [invoiceTimes]);

  const predictedNextVisitMs = useMemo(() => {
    if (lastVisitMs === null || avgGapDays === null) return null;
    return lastVisitMs + avgGapDays * 24 * 60 * 60 * 1000;
  }, [lastVisitMs, avgGapDays]);

  const riskStatus = useMemo<{
    level: "active" | "at-risk" | "churned" | "new";
    label: string;
    color: string;
    bg: string;
  }>(() => {
    if (visitCount === 0 || daysSinceLastVisit === null) {
      return { level: "new", label: "Khách mới", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" };
    }
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

  const topServices = useMemo(() => {
    const counts = new Map<string, number>();
    for (const inv of invoices) {
      for (const it of inv.items || []) {
        const n = it.name?.trim();
        if (!n) continue;
        counts.set(n, (counts.get(n) || 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [invoices]);

  const topStaff = useMemo(() => {
    const counts = new Map<string, number>();
    for (const inv of invoices) {
      for (const it of inv.items || []) {
        const s = it.staffName?.trim();
        if (!s) continue;
        counts.set(s, (counts.get(s) || 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [invoices]);

  const avgTip = useMemo(() => {
    if (invoices.length === 0) return 0;
    const total = invoices.reduce((sum, inv) => sum + (Number(inv.tip) || 0), 0);
    return total / invoices.length;
  }, [invoices]);

  const feedbackStats = useMemo(() => {
    if (feedbacks.length === 0) return { avgRating: null, count: 0 };
    const sum = feedbacks.reduce((s, f) => s + (Number(f.rating) || 0), 0);
    return { avgRating: sum / feedbacks.length, count: feedbacks.length };
  }, [feedbacks]);

  const promotionStats = useMemo(() => {
    const promoNames = new Set<string>();
    let totalSavings = 0;
    for (const inv of invoices) {
      if (inv.promotion?.name) promoNames.add(inv.promotion.name);
      const saving = Number(inv.promotion?.discountAmount) || Number(inv.discount) || 0;
      totalSavings += saving;
    }
    return { usedCount: promoNames.size, totalSavings };
  }, [invoices]);

  const birthdayInfo = useMemo<{ month: number; day: number; daysUntil: number; display: string } | null>(() => {
    const bday = customer?.birthday;
    if (!bday) return null;
    const d = new Date(bday);
    if (isNaN(d.getTime())) return null;
    const vnDay = toVietnamDay(bday);
    const parts = vnDay.split("-");
    const month = parseInt(parts[1] || "0", 10);
    const day = parseInt(parts[2] || "0", 10);
    if (!month || !day) return null;
    const daysUntil = daysUntilNextMonthlyAnniversary(month, day);
    return { month, day, daysUntil, display: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}` };
  }, [customer?.birthday]);

  const displayInvoices = invoices.slice(0, 10);
  const displayFeedbacks = feedbacks.slice(0, 5);

  const fmtVND = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 0 });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="!max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-gray-900">
            Lịch sử
          </DialogTitle>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-emerald-700">{customer?.name}</span>
            {customer?.phone && (
              <span className="text-sm text-gray-500">
                · {useAuthStore.getState().hasPermission("view_customer_phone") ? customer.phone : maskPhone(customer.phone)}
              </span>
            )}
            {customer?.code && (
              <span className="text-xs text-gray-400">· {customer.code}</span>
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
          {/* Risk-status banner */}
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

          {/* Summary stats grid */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5">
              <div className="text-xs font-medium text-emerald-700">Số lượt ghé</div>
              <div className="mt-0.5 text-base font-bold text-emerald-900">{visitCount}</div>
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

          {/* Visit timeline */}
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
                    {predictedNextVisitMs ? formatShortDate(new Date(predictedNextVisitMs).toISOString()) : "—"}
                  </div>
                  {avgGapDays !== null && (
                    <div className="text-xs text-gray-500">~{avgGapDays.toFixed(0)} ngày / lần</div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Promotion insights + birthday reminder */}
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
                      {promotionStats.totalSavings > 0 ? `${fmtVND(promotionStats.totalSavings)}đ` : "—"}
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
                        {birthdayInfo.daysUntil === 0 ? "Hôm nay 🎂" : `${birthdayInfo.daysUntil} ngày`}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* 10 most recent completed invoices */}
          <section>
            <h3 className="mb-1 text-sm font-semibold text-emerald-700 flex items-center gap-2">
              <span className="inline-block h-3 w-1 rounded-full bg-emerald-500" />
              Lịch sử 10 cuộc hẹn gần nhất
            </h3>
            {loadingInvoices ? (
              <div className="py-2 text-center text-sm text-gray-500">Đang tải...</div>
            ) : displayInvoices.length === 0 ? (
              <div className="py-2 text-center text-sm text-gray-500">Chưa có lịch sử</div>
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
                        {(inv.items || []).map((it) => it.name).filter(Boolean).join(", ") || "—"}
                      </div>
                      <div className="text-xs text-gray-500">
                        Thợ: {(inv.items || []).map((it) => it.staffName).filter(Boolean).join(", ") || "—"}
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

          {/* Preferences grid */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5">
              <div className="text-xs font-medium text-teal-700">
                Thời gian dùng dịch vụ trung bình
              </div>
              <div className="mt-0.5 text-sm font-semibold text-teal-900">
                {avgGapDays === null ? "Chưa đủ dữ liệu" : `${avgGapDays.toFixed(1)} ngày`}
              </div>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5">
              <div className="text-xs font-medium text-emerald-700">Tiền thưởng trung bình</div>
              <div className="mt-0.5 text-sm font-semibold text-emerald-900">
                {invoices.length === 0 ? "Chưa đủ dữ liệu" : `${fmtVND(avgTip)}đ`}
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

          {/* Customer feedback */}
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
              <div className="py-2 text-center text-sm text-gray-500">Đang tải...</div>
            ) : displayFeedbacks.length === 0 ? (
              <div className="py-2 text-center text-sm text-gray-500">Chưa có đánh giá</div>
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
                            (i < fb.rating ? "fill-amber-400 text-amber-400" : "text-gray-300")
                          }
                        />
                      ))}
                      <span className="ml-2 text-xs text-gray-400">
                        {formatShortDate(fb.createdAt)}
                      </span>
                    </div>
                    <div className="text-gray-700">{fb.content || "—"}</div>
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
