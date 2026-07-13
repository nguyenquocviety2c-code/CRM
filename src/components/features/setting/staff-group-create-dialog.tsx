"use client";

import { useEffect, useState } from "react";
import { HelpCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useSettingStore } from "@/stores/setting-store";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";

// Single unified permission catalog for a staff group. A staff inherits the
// permissions of its group(s). (Previously split into two account-type lists;
// consolidated into one flat list per the user's request.)
const GROUP_PERMISSIONS = [
  { key: "assign_staff", label: "Xếp nhân viên" },
  { key: "view_all_invoices", label: "Hiển thị hóa đơn toàn hệ thống" },
  { key: "upload_photo", label: "Tải ảnh từ thiết bị" },
  { key: "delete_past_photos", label: "Xóa ảnh tải lên trong quá khứ ở hóa đơn đã thanh toán" },
  { key: "view_customer_photo", label: "Xem hình ảnh của khách" },
  { key: "view_customer_phone", label: "Xem số điện thoại của khách" },
  { key: "create_invoice", label: "Tạo hóa đơn" },
  { key: "edit_unpaid_invoice", label: "Chỉnh sửa hóa đơn chưa thanh toán" },
  { key: "invoice_discount", label: "Sử dụng chương trình khuyến mãi" },
  { key: "cancel_payment", label: "Hủy thanh toán" },
  { key: "print_temp_bill", label: "In bill tạm tính" },
  { key: "hide_revenue", label: "Ẩn doanh thu" },
  { key: "book_past_date", label: "Đặt lịch ngày đã qua" },
  { key: "confirm_old_invoice", label: "Xác nhận đơn hàng và hóa đơn cũ" },
  { key: "edit_reminder", label: "Sửa nhắc lịch" },
  { key: "resize_table", label: "Chỉnh sửa kích thước bảng" },
];

function StaffGroupCreateFormBody({ onClose }: { onClose: () => void }) {
  const {
    staffGroupDialog,
    selectedGroupId,
    staffGroups,
    createStaffGroup,
    updateStaffGroup,
  } = useSettingStore();
  const { toast } = useToast();
  const refreshSession = useAuthStore((s) => s.refreshSession);
  const isEdit = staffGroupDialog === "edit";
  const existing = staffGroups.find((g) => g.id === selectedGroupId);

  const [name, setName] = useState(existing?.name ?? "");
  const [isOfficeStaff, setIsOfficeStaff] = useState(existing?.isOfficeStaff ?? false);

  // Permissions state — a single flat { [action]: boolean } map. Loaded from
  // /permissions on edit. A staff inherits the union of its group(s) perms.
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [permsLoading, setPermsLoading] = useState(false);

  // Load existing permissions when editing.
  useEffect(() => {
    if (!isEdit || !selectedGroupId) return;
    let cancelled = false;
    (async () => {
      setPermsLoading(true);
      try {
        const res = await fetch(
          `/api/supabase/staff-groups/${encodeURIComponent(selectedGroupId)}/permissions`
        );
        const json = await res.json();
        if (cancelled || !json.ok) return;
        const all = (json.data || {}) as Record<string, boolean>;
        // Keep only keys that exist in the catalog (drop any legacy keys).
        const next: Record<string, boolean> = {};
        for (const p of GROUP_PERMISSIONS) {
          if (all[p.key] !== undefined) next[p.key] = all[p.key];
        }
        setPerms(next);
      } catch {
        /* ignore — empty permissions is fine */
      } finally {
        if (!cancelled) setPermsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, selectedGroupId]);

  const allChecked = GROUP_PERMISSIONS.every((p) => perms[p.key]);
  const someChecked = GROUP_PERMISSIONS.some((p) => perms[p.key]);

  const togglePermission = (key: string, checked: boolean) =>
    setPerms((prev) => ({ ...prev, [key]: checked }));

  const toggleAllPermissions = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    for (const p of GROUP_PERMISSIONS) next[p.key] = checked;
    setPerms(next);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({
        title: "Thiếu thông tin",
        description: "Vui lòng nhập tên nhóm",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      name: name.trim(),
      isOfficeStaff,
      active: true,
    };

    const res = isEdit
      ? await updateStaffGroup(selectedGroupId ?? "", payload)
      : await createStaffGroup(payload);

    if (!res.ok) {
      toast({
        title: isEdit ? "Không thể cập nhật nhóm" : "Không thể tạo mới nhóm",
        description: res.error || name,
        variant: "destructive",
      });
      return;
    }

    // Save permissions for the group. For a new group, the create response
    // returns the new group's id; for edit, use selectedGroupId.
    const groupId = isEdit ? selectedGroupId : (res.data as { id?: string } | undefined)?.id;
    if (groupId) {
      try {
        const permRes = await fetch(
          `/api/supabase/staff-groups/${encodeURIComponent(groupId)}/permissions`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ permissions: perms }),
          }
        );
        // Refresh the logged-in user's permissions in the auth store so the
        // UI (e.g. the "Tải ảnh lên" button) immediately reflects the change
        // if this edit affected the user's own group. Uses refreshSession
        // (not fetchUser) so a transient /api/auth/me failure doesn't clear
        // the session and redirect to /login.
        if (permRes.ok) {
          await refreshSession();
        }
      } catch {
        /* best-effort — the group was created/updated successfully */
      }
    }

    toast({
      title: isEdit ? "Đã cập nhật nhóm" : "Đã tạo mới nhóm",
      description: `${name}${isOfficeStaff ? " · Khối văn phòng" : ""}`,
    });
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-[560px]">
      <DialogHeader>
        <DialogTitle className="text-lg font-semibold text-gray-900">
          {isEdit ? "Cập nhật chức danh" : "Tạo chức danh mới"}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        {/* Name */}
        <div className="space-y-1.5">
          <Label className="text-sm text-gray-700">
            <span className="text-red-500">*</span> Nhập tên nhóm:
          </Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tên nhóm"
            className="h-9"
            autoFocus
          />
        </div>

        {/* Office staff checkbox */}
        <div className="flex items-start gap-2">
          <Checkbox
            id="office-staff"
            checked={isOfficeStaff}
            onCheckedChange={(v) => setIsOfficeStaff(v === true)}
            className="mt-0.5"
          />
          <div className="flex items-center gap-1">
            <Label
              htmlFor="office-staff"
              className="cursor-pointer text-sm font-normal text-gray-700"
            >
              Nhân viên khối văn phòng
            </Label>
            <button
              type="button"
              className="text-gray-400 hover:text-gray-600"
              title="Chức danh khối văn phòng không tính doanh thu / hoa hồng dịch vụ"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <p className="-mt-2 pl-6 text-xs text-gray-400">
          Đánh dấu nếu nhóm này thuộc khối văn phòng (Back Office, Kế toán, Quản lý...)
        </p>

        {/* Permissions — managed per-group so all staff in the group inherit
            the same permission set. A single flat list of access rights. */}
        <div className="space-y-2 border-t pt-3">
          <Label className="text-sm font-semibold text-gray-800">
            Phân quyền
          </Label>

          {/* Permissions list */}
          <div className="rounded-md border border-gray-200 bg-gray-50/50">
            <div className="flex items-center justify-between border-b border-gray-200 bg-white px-3 py-2">
              <span className="text-sm font-semibold text-gray-800">
                Quyền truy cập
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Chọn tất cả</span>
                <Checkbox
                  id="perm-all"
                  checked={allChecked ? true : someChecked ? "indeterminate" : false}
                  onCheckedChange={(v) => toggleAllPermissions(v === true)}
                  disabled={permsLoading}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-3 py-3 max-h-[320px] overflow-y-auto">
              {GROUP_PERMISSIONS.map((p) => (
                <div key={p.key} className="flex items-center gap-2">
                  <Checkbox
                    id={`perm-${p.key}`}
                    checked={perms[p.key] ?? false}
                    onCheckedChange={(v) => togglePermission(p.key, v === true)}
                    disabled={permsLoading}
                  />
                  <Label
                    htmlFor={`perm-${p.key}`}
                    className={cn(
                      "cursor-pointer text-sm font-normal text-gray-700",
                      permsLoading && "opacity-50"
                    )}
                  >
                    {p.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Mọi nhân viên thuộc nhóm này sẽ kế thừa quyền truy cập ở trên.
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Hủy
        </Button>
        <Button
          onClick={handleSubmit}
          className="bg-sky-500 text-white hover:bg-sky-600"
        >
          OK
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function StaffGroupCreateDialog() {
  const { staffGroupDialog, closeStaffGroupDialog, selectedGroupId } =
    useSettingStore();
  const open = staffGroupDialog !== null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && closeStaffGroupDialog()}>
      {open && (
        <StaffGroupCreateFormBody
          key={`${staffGroupDialog}-${selectedGroupId ?? "new"}`}
          onClose={closeStaffGroupDialog}
        />
      )}
    </Dialog>
  );
}
