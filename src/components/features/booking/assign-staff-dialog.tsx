"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queryKeys } from "@/lib/query-keys";
import { useToast } from "@/hooks/use-toast";

/**
 * AssignStaffDialog — a focused dialog for assigning a staff member to each
 * service of a booking that currently has NO staff assigned.
 *
 * Mirrors the cashier module's "Xếp nhân viên" dialog (invoice-summary.tsx):
 *  - Staff is REQUIRED (no "Không chọn" option — the whole point is to assign)
 *  - A staff conflict check runs before save: if the picked staff is already
 *    booked at this booking's date/time (excluding this booking itself), the
 *    save is BLOCKED with a detailed conflict message (existing booking code +
 *    customer + service + time).
 *  - "Vui lòng chọn nhân viên" error when a service has no staff picked.
 *
 * Opens from the "Xếp nhân viên" button shown on:
 *  - segment blocks in View nhân viên + View khách hàng > Khung giờ (when the
 *    segment's service has no staff)
 *  - the hover popover (BookingHoverDetails) for services with no staff
 *  - the "Xếp nhân viên" clickable link in View khách hàng's list rows
 */

interface AssignStaffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: {
    id: string;
    code?: string | null;
    date_time?: string | null;
    branch_id?: string | null;
    services?: Array<{
      id: string;
      service_id: string;
      staff_id?: string | null;
      service_category_id?: string | null;
      service?: { id: string; name: string; duration?: number } | null;
      staff?: { id: string; name: string } | null;
    }>;
  } | null;
  branchId?: string | null;
}

interface StaffMember {
  id: string;
  name: string;
}

export function AssignStaffDialog({
  open,
  onOpenChange,
  booking,
  branchId,
}: AssignStaffDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // Per-service staff draft: { [service_row_id]: staffId }.
  const [staffDraft, setStaffDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // Conflict error message (shown in a red box, mirrors the cashier dialog).
  const [conflictError, setConflictError] = useState("");

  // Fetch the eligible staff list (active staff for the branch).
  const { data: staffList, isLoading: staffLoading } = useQuery<StaffMember[]>({
    queryKey: ["assign-staff-list", branchId || "all"],
    queryFn: async () => {
      const params = new URLSearchParams({ active: "true", limit: "200" });
      if (branchId) params.set("branch_id", branchId);
      const res = await fetch(`/api/supabase/staff?${params.toString()}`);
      const json = await res.json();
      return (json.data as StaffMember[]) || [];
    },
    enabled: open && !!booking,
  });

  // Initialize the draft when the dialog opens (or when the booking changes).
  useEffect(() => {
    if (!open || !booking) return;
    const draft: Record<string, string> = {};
    for (const s of booking.services || []) {
      draft[s.id] = s.staff_id || "";
    }
    setStaffDraft(draft);
    setConflictError("");
  }, [open, booking]);

  if (!booking) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md" />
      </Dialog>
    );
  }

  const services = booking.services || [];
  const title = `Xếp nhân viên${booking.code ? ` · ${booking.code}` : ""}`;

  // Whether every service has a staff picked — Lưu is disabled until all do
  // (mirrors the cashier dialog where staff is required).
  const allPicked = services.length > 0 && services.every((s) => staffDraft[s.id]);

  // Compute the booking's time window for the conflict check.
  const bookingStartMs = booking.date_time ? new Date(booking.date_time).getTime() : 0;

  const handleSave = async () => {
    if (!allPicked) return;
    setConflictError("");
    setSaving(true);
    try {
      // ---- Staff conflict check (mirrors the cashier's "Xếp nhân viên" OK
      //      handler + the server-side check in the bookings API). Fetch all
      //      bookings for the same day + branch, then for each service's picked
      //      staff, verify no OTHER booking's service overlaps this booking's
      //      time window. If a conflict is found, block the save with a
      //      detailed message (existing booking code + customer + service). ----
      if (bookingStartMs && booking.date_time) {
        const params = new URLSearchParams({ page: "1", limit: "200" });
        // Day range = the booking's day (VN timezone-safe).
        const d = new Date(booking.date_time);
        const isoDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        // Use the booking's date as both from + to (single day).
        params.set("date_from", `${isoDay}T00:00:00+07:00`);
        params.set("date_to", `${isoDay}T23:59:59+07:00`);
        if (booking.branch_id) params.set("branch_id", booking.branch_id);
        const cfRes = await fetch(`/api/supabase/bookings?${params.toString()}`);
        const cfJson = await cfRes.json();
        if (cfJson.ok) {
          const exList = (cfJson.data?.items || cfJson.data || []) as Array<{
            id: string;
            code?: string | null;
            status?: string | null;
            date_time?: string | null;
            customer?: { name?: string } | null;
            services?: Array<{
              staff_id?: string | null;
              staff?: { name?: string } | null;
              service?: { name?: string; duration?: number } | null;
            }>;
          }>;
          // Build the picked-staff → service map for this booking.
          for (const s of services) {
            const pickedStaffId = staffDraft[s.id];
            if (!pickedStaffId) continue;
            const dur = (Number(s.service?.duration) || 60) * 60 * 1000;
            const newEnd = bookingStartMs + dur;
            for (const ex of exList) {
              if (ex.id === booking.id) continue; // skip self
              if (ex.status === "cancelled" || ex.status === "no_show") continue;
              const exStart = new Date(String(ex.date_time || "")).getTime();
              if (isNaN(exStart)) continue;
              for (const exSvc of ex.services || []) {
                if (exSvc.staff_id !== pickedStaffId) continue;
                const exDur = (Number(exSvc.service?.duration) || 60) * 60 * 1000;
                const exEnd = exStart + exDur;
                // Overlap check: [newStart, newEnd) ∩ [exStart, exEnd)
                if (bookingStartMs < exEnd && exStart < newEnd) {
                  const staffName =
                    exSvc.staff?.name ||
                    (staffList || []).find((st) => st.id === pickedStaffId)?.name ||
                    "nhân viên";
                  const svcName = exSvc.service?.name || "Dịch vụ";
                  const exCode = ex.code || "";
                  const exCust = ex.customer?.name || "Khách";
                  const fmtTime = (ms: number) => {
                    const dt = new Date(ms);
                    return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
                  };
                  setConflictError(
                    `${staffName} đã có lịch "${svcName}" cho ${exCust} (${exCode}) lúc ${fmtTime(exStart)}–${fmtTime(exEnd)}. Vui lòng chọn nhân viên khác.`
                  );
                  setSaving(false);
                  return;
                }
              }
            }
          }
        }
      }

      // ---- No conflict → save the updated services. ----
      const updatedServices = services.map((s) => ({
        service_id: s.service_id,
        service_category_id: s.service_category_id || null,
        staff_id: staffDraft[s.id] || null,
      }));
      const res = await fetch(
        `/api/supabase/bookings/${encodeURIComponent(booking.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ services: updatedServices }),
        }
      );
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error || "Không thể cập nhật nhân viên");
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      queryClient.invalidateQueries({ queryKey: ["cashier-day-bookings"] });
      toast({ title: "Đã xếp nhân viên" });
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Lỗi không xác định";
      toast({ title: "Lỗi", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {services.length === 0 ? (
            <p className="text-sm text-gray-500">Đơn chưa có dịch vụ.</p>
          ) : (
            services.map((s) => (
              <div key={s.id} className="space-y-1">
                <Label className="text-xs text-gray-600">
                  {s.service?.name || "Dịch vụ"}
                  {s.service?.duration ? (
                    <span className="ml-1 text-gray-400">
                      ({s.service.duration}')
                    </span>
                  ) : null}
                </Label>
                <Select
                  value={staffDraft[s.id] ?? ""}
                  onValueChange={(v) =>
                    setStaffDraft((prev) => ({ ...prev, [s.id]: v }))
                  }
                >
                  <SelectTrigger className="w-full h-8 text-xs" size="sm">
                    <SelectValue placeholder="Chọn nhân viên" />
                  </SelectTrigger>
                  <SelectContent>
                    {staffLoading ? (
                      <div className="px-3 py-2 text-xs text-gray-500 flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" /> Đang tải…
                      </div>
                    ) : (staffList || []).length === 0 ? (
                      <div className="px-3 py-2 text-xs text-gray-500">
                        Không có nhân viên
                      </div>
                    ) : (
                      (staffList || []).map((st) => (
                        <SelectItem key={st.id} value={st.id} className="text-xs">
                          {st.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {/* "Vui lòng chọn nhân viên" error — mirrors the cashier dialog.
                    Shown when this service has no staff picked yet. */}
                {!staffDraft[s.id] && (
                  <p className="text-[11px] text-red-500">Vui lòng chọn nhân viên</p>
                )}
              </div>
            ))
          )}
          {/* Conflict error box — mirrors the cashier dialog's red box. Shown
              when the conflict check found the picked staff is already booked. */}
          {conflictError && (
            <div className="whitespace-pre-line rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
              {conflictError}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Hủy
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !allPicked || services.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang lưu…
              </>
            ) : (
              "Lưu"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
