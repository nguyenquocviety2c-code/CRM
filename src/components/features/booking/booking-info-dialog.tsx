"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { X, Clock, User, Phone, Calendar, FileText, Receipt } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BookingStatusLabel, BookingStatusBadgeColors, BookingStatusType } from "@/lib/constants";
import { toVietnamDay, toVietnamTime, formatVND } from "@/lib/utils";

// Lazy-load InvoiceActivityTable (it has its own data query) so the dialog
// stays light until opened.
const InvoiceActivityTable = dynamic(
  () => import("@/components/features/cashier/invoice-activity-table").then((m) => m.InvoiceActivityTable),
  { ssr: false }
);

interface BookingInfoDialogProps {
  booking: import("@/stores/booking-store").Booking | null;
  onClose: () => void;
}

/** Format an ISO date_time as "HH:MM DD/MM/YYYY" (Vietnam time). */
function fmtDateTime(iso?: string): string {
  if (!iso) return "—";
  try {
    const d = toVietnamDay(iso).split("-");
    const t = toVietnamTime(iso);
    return d.length === 3 ? `${t} ${d[2]}/${d[1]}/${d[0]}` : "—";
  } catch {
    return "—";
  }
}

export function BookingInfoDialog({ booking, onClose }: BookingInfoDialogProps) {
  const open = !!booking;
  // Fetch the booking's linked invoice (if any) so we can show the activity
  // history table. A booking has an invoice when it's been checked in or paid.
  const { data: invoiceData } = useQuery<{
    ok: boolean;
    data: Array<{ id: string; code: string | null; status: string; final_amount: number | string }>;
  }>({
    queryKey: ["booking-info-invoice", booking?.id],
    queryFn: async () => {
      if (!booking) return { ok: false, data: [] };
      const res = await fetch(
        `/api/supabase/invoices?booking_id=${encodeURIComponent(booking.id)}&limit=5`
      );
      const json = await res.json();
      if (!json.ok) return { ok: false, data: [] };
      return { ok: true, data: json.data || [] };
    },
    enabled: open,
  });
  const invoice = (invoiceData?.data || [])[0] || null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl sm:max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <DialogTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-600" />
            Thông tin lịch hẹn
            {booking?.code && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-700">
                {booking.code}
              </span>
            )}
            {booking && (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  BookingStatusBadgeColors[booking.status as BookingStatusType]?.bg || "bg-gray-100"
                } ${BookingStatusBadgeColors[booking.status as BookingStatusType]?.text || "text-gray-600"}`}
              >
                {BookingStatusLabel[booking.status as BookingStatusType] || booking.status}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="dialog-list-scroll max-h-[70vh] overflow-y-auto px-6 py-4 space-y-4">
          {booking && (
            <>
              {/* Booking summary — customer, time, services */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border bg-gray-50/50 p-3">
                {/* Customer */}
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  <span className="text-xs text-gray-500">Khách:</span>
                  <span className="text-xs font-medium text-gray-900 truncate">
                    {booking.customer?.name || "—"}
                  </span>
                </div>
                {/* Phone */}
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  <span className="text-xs text-gray-500">SĐT:</span>
                  <span className="text-xs text-gray-700">
                    {booking.customer?.phone || "—"}
                  </span>
                </div>
                {/* Date/time */}
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  <span className="text-xs text-gray-500">Giờ hẹn:</span>
                  <span className="text-xs text-gray-900">
                    {fmtDateTime(booking.date_time)}
                  </span>
                </div>
                {/* Created at */}
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  <span className="text-xs text-gray-500">Tạo lúc:</span>
                  <span className="text-xs text-gray-700">
                    {fmtDateTime(booking.created_at)}
                  </span>
                </div>
                {/* Created by */}
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  <span className="text-xs text-gray-500">Tạo bởi:</span>
                  <span className="text-xs text-gray-700">
                    {booking.created_by ? (booking.createdBy?.name || "—") : "Khách hàng"}
                  </span>
                </div>
                {/* Invoice (if linked) */}
                {invoice && (
                  <div className="flex items-center gap-2">
                    <Receipt className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    <span className="text-xs text-gray-500">Hóa đơn:</span>
                    <span className="text-xs font-mono text-gray-700">
                      {invoice.code || "—"}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      ({invoice.status === "completed" ? "đã thanh toán" : invoice.status})
                    </span>
                  </div>
                )}
              </div>

              {/* Services list */}
              <div>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Dịch vụ
                </h4>
                <div className="space-y-1">
                  {(booking.services as unknown as Array<Record<string, unknown>> || []).map((s, i) => {
                    const svc = s.service as { name?: string; price?: number; duration?: number } | null;
                    const stf = s.staff as { name?: string } | null;
                    return (
                      <div key={i} className="flex items-center justify-between rounded border bg-white px-2 py-1 text-xs">
                        <span className="font-medium text-gray-800">
                          {svc?.name || "Dịch vụ"}
                        </span>
                        <div className="flex items-center gap-3 text-gray-500">
                          {stf?.name && <span>{stf.name}</span>}
                          {svc?.duration && <span>{svc.duration} phút</span>}
                          {svc?.price != null && (
                            <span className="font-medium text-gray-700">
                              {formatVND(Number(svc.price))}đ
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {(!booking.services || (booking.services as unknown[]).length === 0) && (
                    <p className="text-xs text-gray-400">Chưa có dịch vụ</p>
                  )}
                </div>
              </div>

              {/* Note (if any) */}
              {booking.note && !booking.note.startsWith("[[MULTI]]") && (
                <div>
                  <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Ghi chú
                  </h4>
                  <p className="whitespace-pre-line rounded border bg-amber-50 px-2 py-1.5 text-xs text-gray-700">
                    {booking.note}
                  </p>
                </div>
              )}

              {/* Activity history table (Lịch sử thao tác) */}
              <div>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Lịch sử thao tác
                </h4>
                {invoice ? (
                  <InvoiceActivityTable invoiceId={invoice.id} />
                ) : (
                  <div className="rounded border bg-gray-50 px-3 py-4 text-center text-xs text-gray-400">
                    Chưa có lịch sử thao tác (lịch hẹn chưa được checkin).
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t bg-white flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Đóng
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
