"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  X,
  Printer,
  Camera,
  User,
  Smile,
  XCircle,
  Upload,
  CheckSquare,
} from "lucide-react";
import { InvoiceActivityTable } from "@/components/features/cashier/invoice-activity-table";

interface SavedInvoiceItem {
  name?: string;
  type?: string;
  price?: number;
  quantity?: number;
  discount?: number;
  total?: number;
  staffName?: string;
}

interface SavedInvoice {
  id: string;
  code: string | null;
  status: string;
  final_amount: number;
  discount: number;
  tip: number;
  payment_method: string | null;
  promotion: {
    id: string;
    code: string | null;
    name: string;
    discountValue: number;
    discountAmount: number;
  } | null;
  items: SavedInvoiceItem[];
  photos?: string[];
  created_at: string;
}

interface PaidInvoiceViewProps {
  invoiceId: string;
  customerName?: string;
  customerPhone?: string;
  bookingCode?: string | null;
  onClose: () => void;
  /** When set, the view fetches ALL completed invoices for this booking_id
   *  and MERGES their items into a single receipt. Used for multi-customer
   *  "Cùng lịch" bookings where each customer paid separately (each payment
   *  creates/updates an invoice). When omitted, only the single `invoiceId`
   *  is shown (single-customer bookings, or bookings where all customers paid
   *  in one invoice). */
  bookingId?: string;
}

const TYPE_LABELS: Record<string, string> = {
  service: "Làm dịch vụ",
  product: "Bán sản phẩm",
  package: "Bán gói dịch vụ",
  sell_service: "Bán dịch vụ",
  sell_treatment: "Bán điều trị",
};

export function PaidInvoiceView({
  invoiceId,
  customerName,
  customerPhone,
  bookingCode,
  onClose,
  bookingId,
}: PaidInvoiceViewProps) {
  // Fetch the primary invoice (always — used for the header code, photos,
  // activity history, etc.).
  const { data: invoice, isLoading } = useQuery<SavedInvoice>({
    queryKey: ["paid-invoice-view", invoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/supabase/invoices/${invoiceId}`);
      const json = await res.json();
      return json.data as SavedInvoice;
    },
  });

  // When `bookingId` is set, ALSO fetch ALL completed invoices for this
  // booking so we can merge their items into a single receipt. This handles
  // multi-customer "Cùng lịch" bookings where each customer paid separately
  // (per-customer mode appends to the same invoice, but if the booking was
  // edited/re-paid, or invoices were created independently, multiple invoices
  // may exist). We merge items + sum totals + collect all photos.
  const { data: allInvoices } = useQuery<SavedInvoice[]>({
    queryKey: ["paid-invoice-view-all-by-booking", bookingId],
    queryFn: async () => {
      if (!bookingId) return [];
      const res = await fetch(`/api/supabase/invoices?booking_id=${encodeURIComponent(bookingId)}&limit=100`);
      const json = await res.json();
      const list = (json.ok && Array.isArray(json.data) ? json.data : []) as SavedInvoice[];
      // Only keep COMPLETED (paid) invoices — pending ones belong to the
      // editable InvoiceDialog, not this read-only paid view.
      return list.filter((inv) => inv.status === "completed");
    },
    enabled: !!bookingId,
  });

  const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(n);

  // === Merge items from all invoices (when bookingId is set) ===
  // Each invoice's items come from its note JSON (parsed by the invoices API
  // into the `items` field). We concatenate them in invoice order (oldest
  // first by created_at) so the receipt reads chronologically.
  const mergedInvoices = bookingId && allInvoices && allInvoices.length > 0
    ? [...allInvoices].sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
    : invoice ? [invoice] : [];

  const items = mergedInvoices.flatMap((inv) => inv.items || []);
  const subtotal = items.reduce(
    (s, it) => s + (Number(it.total ?? it.price) || 0),
    0
  );
  const discount = mergedInvoices.reduce((s, inv) => s + (Number(inv.discount) || 0), 0);
  const tip = mergedInvoices.reduce((s, inv) => s + (Number(inv.tip) || 0), 0);
  const finalAmount = mergedInvoices.reduce((s, inv) => s + (Number(inv.final_amount) || 0), 0);
  // Cash vs transfer totals across all merged invoices. Each invoice's
  // final_amount is attributed to its payment_method. When multiple invoices
  // have different methods, both columns show their respective sums.
  const cashTotal = mergedInvoices
    .filter((inv) => inv.payment_method === "cash")
    .reduce((s, inv) => s + (Number(inv.final_amount) || 0), 0);
  const transferTotal = mergedInvoices
    .filter((inv) => inv.payment_method === "transfer")
    .reduce((s, inv) => s + (Number(inv.final_amount) || 0), 0);
  // Photos: merge from all invoices (deduplicated by URL).
  const allPhotos = Array.from(new Set(mergedInvoices.flatMap((inv) => inv.photos || [])));
  // Use the EARLIEST paid invoice's created_at as the "paid time" (first
  // payment), so the receipt shows when the first customer paid.
  const paidTimeInvoice = mergedInvoices[0];
  const paidTime = paidTimeInvoice?.created_at
    ? format(new Date(paidTimeInvoice.created_at), "HH:mm dd/MM/yyyy", { locale: vi })
    : "";
  // Display the primary invoice's code in the header (or fall back to the
  // booking code). When multiple invoices exist, show "Mã HD1, HD2, ..." so
  // the cashier knows there are multiple receipts.
  const invoiceCodes = mergedInvoices
    .map((inv) => inv.code)
    .filter(Boolean) as string[];
  const headerCode = invoiceCodes.length > 0
    ? (invoiceCodes.length === 1 ? invoiceCodes[0] : invoiceCodes.join(", "))
    : (bookingCode || "—");

  const [selectedPhotoIndices, setSelectedPhotoIndices] = useState<number[]>([]);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const queryClient = useQueryClient();

  return (
    <div className="fixed top-14 right-0 bottom-0 z-50 overflow-y-auto bg-white shadow-2xl" style={{ left: "12rem" }}>
      {/* Top bar — title + invoice code(s) + close button on same line.
          When bookingId is set and multiple invoices exist, the header shows
          ALL invoice codes joined by ", " so the cashier knows there are
          multiple receipts merged into this view. */}
      <div className="sticky top-0 z-10 flex items-center justify-between bg-white px-8 py-2 border-b">
        <h1 className="text-lg font-bold text-gray-900">
          Hóa đơn #{headerCode}
        </h1>
        <button
          onClick={onClose}
          className="flex items-center gap-1 rounded-lg border px-3 py-1 text-sm text-gray-600 hover:bg-gray-100"
        >
          <X className="h-4 w-4" />
          Đóng
        </button>
      </div>

      {/* Invoice content */}
      <div className="px-8 py-3">
        {isLoading ? (
          <div className="py-20 text-center text-gray-400">Đang tải...</div>
        ) : mergedInvoices.length === 0 ? (
          <div className="py-20 text-center text-gray-400">
            Không tìm thấy hóa đơn
          </div>
        ) : (
          <>
            {/* Metadata bar */}
            <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span className="font-medium text-gray-900">
                {customerName || "—"}
              </span>
              {customerPhone && (
                <span className="text-gray-600">📞 {customerPhone}</span>
              )}
              <span className="text-gray-600">🕒 {paidTime}</span>
              <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-0.5 text-xs font-semibold text-green-700">
                Đã thanh toán
              </span>
              {mergedInvoices.length > 1 && (
                <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-0.5 text-xs font-medium text-blue-700">
                  Gộp {mergedInvoices.length} hóa đơn
                </span>
              )}
            </div>

            {/* Items table */}
            <table className="mb-3 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-gray-300 bg-gray-50">
                  <th className="border-r border-gray-200 px-3 py-1.5 text-left font-semibold text-gray-700">Tên</th>
                  <th className="border-r border-gray-200 px-3 py-1.5 text-left font-semibold text-gray-700">Loại</th>
                  <th className="border-r border-gray-200 px-3 py-1.5 text-left font-semibold text-gray-700">Nhân viên</th>
                  <th className="border-r border-gray-200 px-3 py-1.5 text-right font-semibold text-gray-700">Đơn giá</th>
                  <th className="border-r border-gray-200 px-3 py-1.5 text-center font-semibold text-gray-700">SL</th>
                  <th className="border-r border-gray-200 px-3 py-1.5 text-right font-semibold text-gray-700">Giảm giá</th>
                  <th className="px-3 py-1.5 text-right font-semibold text-gray-700">Tổng tiền</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-200">
                    <td className="border-r border-gray-200 px-3 py-1.5 text-gray-900">{item.name || "—"}</td>
                    <td className="border-r border-gray-200 px-3 py-1.5 text-gray-600">{TYPE_LABELS[item.type || ""] || item.type || "—"}</td>
                    <td className="border-r border-gray-200 px-3 py-1.5 text-gray-600">{item.staffName ? `• ${item.staffName}` : "Chưa xếp nhân viên"}</td>
                    <td className="border-r border-gray-200 px-3 py-1.5 text-right text-gray-900">{fmt(Number(item.price) || 0)}</td>
                    <td className="border-r border-gray-200 px-3 py-1.5 text-center text-gray-900">{item.quantity || 1}</td>
                    <td className="border-r border-gray-200 px-3 py-1.5 text-right text-gray-900">{fmt(Number(item.discount) || 0)}</td>
                    <td className="px-3 py-1.5 text-right font-medium text-gray-900">{fmt(Number(item.total ?? item.price) || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 4-column summary: KM + Thưởng + Phương thức + Thành tiền */}
            <div className="mb-3 grid grid-cols-4 gap-3">
              {/* Col 1: Chương trình khuyến mãi — show the FIRST invoice's
                  promotion (if any). When multiple invoices each have their
                  own promotion, only the first is shown for simplicity; the
                  total discount is already summed in `discount`. */}
              <div className="rounded-lg bg-blue-50 px-3 py-1.5 text-[13px] leading-tight">
                <div className="mb-0.5 font-semibold text-gray-700">Chương trình khuyến mãi</div>
                {mergedInvoices[0]?.promotion ? (
                  <div className="text-gray-900">
                    <div className="font-medium">
                      {mergedInvoices[0].promotion.name}
                      <span className="ml-1 text-gray-500">({mergedInvoices[0].promotion.discountValue}%)</span>
                    </div>
                    <div className="text-gray-600">Giảm: {fmt(discount)}</div>
                  </div>
                ) : (
                  <div className="text-gray-400">{discount > 0 ? `Giảm: ${fmt(discount)}` : "Không áp dụng"}</div>
                )}
              </div>

              {/* Col 2: Thưởng */}
              <div className="rounded-lg bg-blue-50 px-3 py-1.5 text-[13px] leading-tight">
                <div className="mb-0.5 font-semibold text-gray-700">Thưởng (thưởng thợ)</div>
                <div className="text-gray-900">{tip > 0 ? `+${fmt(tip)}` : "0"}</div>
              </div>

              {/* Col 3: Phương thức thanh toán — when multiple invoices,
                  sum the cash vs transfer amounts across all invoices so the
                  cashier sees the total paid in each method. */}
              <div className="rounded-lg bg-blue-50 px-3 py-1.5 text-[13px] leading-tight">
                <div className="mb-0.5 font-semibold text-gray-700">Phương thức thanh toán</div>
                <div className="space-y-0 text-gray-900">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Tiền mặt:</span>
                    <span className={cashTotal > 0 ? "font-medium" : "text-gray-400"}>
                      {fmt(cashTotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Chuyển khoản:</span>
                    <span className={transferTotal > 0 ? "font-medium" : "text-gray-400"}>
                      {fmt(transferTotal)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Col 4: Thành tiền */}
              <div className="rounded-lg bg-blue-50 px-3 py-1.5 text-[13px] leading-tight">
                <div className="mb-0.5 font-semibold text-gray-700">Thành tiền</div>
                <div className="space-y-0 text-gray-900">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Tổng:</span>
                    <span className="font-medium">{fmt(subtotal)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex items-center justify-between text-orange-700">
                      <span>Giảm:</span>
                      <span>-{fmt(discount)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t pt-0">
                    <span className="font-semibold text-gray-700">Cần thanh toán:</span>
                    <span className="font-semibold">{fmt(finalAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-green-600">Đã thanh toán:</span>
                    <span className="font-bold text-green-700">{fmt(finalAmount)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Photos section — functional upload + select all + thumbnails */}
            <div className="mb-3">
              <div className="mb-1.5 flex items-center gap-3">
                <label className="flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">
                  <Camera className="h-4 w-4" />
                  Tải ảnh lên
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length === 0) return;
                      try {
                        // Read each file as base64 data URL.
                        const readFiles = await Promise.all(
                          files.map(
                            (f) =>
                              new Promise<string>((resolve, reject) => {
                                const reader = new FileReader();
                                reader.onload = () => resolve(reader.result as string);
                                reader.onerror = reject;
                                reader.readAsDataURL(f);
                              })
                          )
                        );
                        const existing = allPhotos;
                        const updated = [...existing, ...readFiles];
                        // Upload to the PRIMARY invoice (first merged invoice).
                        // When multiple invoices exist, photos are attributed to
                        // the primary one for simplicity.
                        const primaryInv = mergedInvoices[0];
                        if (!primaryInv) return;
                        const res = await fetch(`/api/supabase/invoices/${primaryInv.id}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ photos: updated }),
                        });
                        if (res.ok) {
                          // Optimistic update: immediately set the cached invoice
                          // data with the new photos so the UI updates instantly
                          // (no need to wait for the background refetch).
                          queryClient.setQueryData<SavedInvoice>(
                            ["paid-invoice-view", invoiceId],
                            (old) => (old ? { ...old, photos: updated } : old)
                          );
                          // Invalidate for background refetch + cross-tab sync.
                          queryClient.invalidateQueries({ queryKey: ["paid-invoice-view", invoiceId] });
                          queryClient.invalidateQueries({ queryKey: ["paid-invoice-view-all-by-booking", bookingId] });
                          queryClient.invalidateQueries({ queryKey: ["customer-info-invoices"] });
                        }
                      } catch {
                        // Best-effort — don't crash on upload error.
                      }
                      // Reset the input so the same file can be re-selected.
                      e.target.value = "";
                    }}
                  />
                </label>
                <button
                  onClick={() => {
                    const allSel = selectedPhotoIndices.length === allPhotos.length && allPhotos.length > 0;
                    setSelectedPhotoIndices(allSel ? [] : allPhotos.map((_, i) => i));
                  }}
                  className="flex items-center gap-1 rounded-lg border px-3 py-1 text-sm text-gray-600 hover:bg-gray-50"
                >
                  <CheckSquare className="h-4 w-4" />
                  Chọn tất cả
                </button>
                <button
                  onClick={async () => {
                    if (selectedPhotoIndices.length === 0) return;
                    const remaining = allPhotos.filter((_, idx) => !selectedPhotoIndices.includes(idx));
                    const primaryInv = mergedInvoices[0];
                    if (!primaryInv) return;
                    await fetch(`/api/supabase/invoices/${primaryInv.id}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ photos: remaining }),
                    });
                    setSelectedPhotoIndices([]);
                    // Optimistic update: immediately set the cached invoice data
                    // with the remaining photos so the UI updates instantly
                    // (photos disappear right away — no need to exit & re-enter).
                    queryClient.setQueryData<SavedInvoice>(
                      ["paid-invoice-view", invoiceId],
                      (old) => (old ? { ...old, photos: remaining } : old)
                    );
                    queryClient.invalidateQueries({ queryKey: ["paid-invoice-view", invoiceId] });
                    queryClient.invalidateQueries({ queryKey: ["paid-invoice-view-all-by-booking", bookingId] });
                    queryClient.invalidateQueries({ queryKey: ["customer-info-invoices"] });
                  }}
                  disabled={selectedPhotoIndices.length === 0}
                  className={`flex items-center gap-1 rounded-lg border px-3 py-1 text-sm transition-colors ${
                    selectedPhotoIndices.length > 0
                      ? "border-red-300 text-red-600 hover:bg-red-50 cursor-pointer"
                      : "border-gray-200 text-gray-300 cursor-not-allowed"
                  }`}
                  title={selectedPhotoIndices.length === 0 ? "Chọn ảnh để xóa" : `Xóa ${selectedPhotoIndices.length} ảnh đã chọn`}
                >
                  <X className="h-4 w-4" />
                  Xóa{selectedPhotoIndices.length > 0 ? ` (${selectedPhotoIndices.length})` : ""}
                </button>
              </div>
              {allPhotos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {allPhotos.map((src, idx) => (
                    <div key={idx} className="relative h-20 w-20 overflow-hidden rounded-lg border">
                      <input
                        type="checkbox"
                        checked={selectedPhotoIndices.includes(idx)}
                        className="absolute left-1 top-1 z-10 h-4 w-4"
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPhotoIndices((prev) => [...prev, idx]);
                          } else {
                            setSelectedPhotoIndices((prev) => prev.filter((i) => i !== idx));
                          }
                        }}
                      />
                      <img
                        src={src}
                        alt={`Ảnh ${idx + 1}`}
                        className="h-full w-full cursor-pointer object-cover"
                        onClick={() => setLightboxPhoto(src)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Activity history — at the bottom. When multiple invoices
                are merged, show the activity table for EACH invoice so the
                cashier sees the full timeline across all payments. */}
            <div className="border-t pt-2 space-y-3">
              {mergedInvoices.map((inv, invIdx) => (
                <div key={inv.id}>
                  {mergedInvoices.length > 1 && (
                    <div className="mb-1 text-xs font-semibold text-gray-600">
                      Lịch sử thao tác — Hóa đơn {inv.code || `#${invIdx + 1}`}
                    </div>
                  )}
                  <InvoiceActivityTable invoiceId={inv.id} />
                </div>
              ))}
            </div>

            {/* Action buttons bar */}
            <div className="mt-3 flex flex-wrap gap-2 border-t pt-2">
              <button className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-1 text-sm font-medium text-gray-600 hover:bg-gray-50">
                <XCircle className="h-4 w-4" />
                Hủy hóa đơn
              </button>
              <button className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-1 text-sm font-medium text-gray-600 hover:bg-gray-50">
                <User className="h-4 w-4" />
                Xếp nhân viên
              </button>
              <button className="flex items-center gap-2 rounded-lg border border-blue-300 px-4 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50">
                <Smile className="h-4 w-4" />
                Mời đánh giá
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-1 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                <Printer className="h-4 w-4" />
                In hóa đơn
              </button>
            </div>
          </>
        )}
      </div>

      {/* Photo lightbox — click thumbnail to view full size */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80"
          onClick={() => setLightboxPhoto(null)}
        >
          <button
            className="absolute right-4 top-4 rounded-full bg-white/20 p-2 text-white hover:bg-white/30"
            onClick={() => setLightboxPhoto(null)}
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={lightboxPhoto}
            alt="Ảnh lớn"
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
