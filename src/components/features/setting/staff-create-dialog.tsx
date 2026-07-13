"use client";

import { useState, useEffect } from "react";
import { ImagePlus, Trash2, Upload, User as UserIcon, ChevronDown, Check, Loader2 } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useSettingStore,
  StaffStatusOptions,
} from "@/stores/setting-store";
import { useBranchStore } from "@/stores/branch-store";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { uploadImagesToR2 } from "@/lib/upload";

type DialogTab = "info" | "account";

type AccountType = "invoice_only" | "with_payment";

interface StaffFormState {
  name: string;
  groups: string[]; // multiple staff group IDs (primary = first)
  branches: string[];
  status: string;
  birthday: string;
  phone: string;
  avatar: string;
  allowBooking: boolean;
  allowOverlap: boolean;
  appLogin: boolean;
  accountType: AccountType;
  permissions: Record<string, boolean>;
}

// Account-tab fields, kept separate from StaffFormState so they are only sent
// when the user actually fills them (avoids overwriting the password on every
// edit save when the account tab wasn't touched).
interface AccountFormState {
  username: string;
  email: string;
  password: string;        // create: new password; edit: new password (optional)
  confirmPassword: string; // create: must match password
  oldPassword: string;     // edit only: required when changing password
  newConfirmPassword: string; // edit only: must match password
}

const initialState: StaffFormState = {
  name: "",
  groups: [],
  branches: [],
  status: "active",
  birthday: "",
  phone: "",
  avatar: "",
  allowBooking: true,
  allowOverlap: true,
  appLogin: false,
  accountType: "invoice_only",
  permissions: {},
};

function StaffCreateFormBody({ onClose }: { onClose: () => void }) {
  const {
    staffDialog,
    selectedStaffId,
    staff,
    staffGroups,
    createStaff,
    updateStaff,
    refreshStaffById,
  } = useSettingStore();
  const { branches } = useBranchStore();
  const { toast } = useToast();
  const isEdit = staffDialog === "edit";
  const existing = staff.find((s) => s.id === selectedStaffId);

  // On edit, fetch the staff member's fresh data (especially has_password) so
  // the dialog reflects the real current state — not a stale snapshot from
  // when the staff list was last loaded. This prevents the "old password
  // optional" UI from showing for an account that actually already has a
  // password set.
  useEffect(() => {
    if (isEdit && selectedStaffId) {
      refreshStaffById(selectedStaffId);
    }
  }, [isEdit, selectedStaffId, refreshStaffById]);

  const [tab, setTab] = useState<DialogTab>("info");
  const [form, setForm] = useState<StaffFormState>(() => {
    if (isEdit && existing) {
      // Multi-group: read the full group list from permissions.group_ids if
      // present (saved by this dialog); otherwise fall back to the single
      // primary group_id. The first entry is treated as the primary group.
      const perm = (existing.permissions ?? {}) as Record<string, unknown>;
      const savedGroupIds = Array.isArray(perm.group_ids)
        ? (perm.group_ids as unknown[]).filter((x): x is string => typeof x === "string")
        : [];
      const groupIds =
        savedGroupIds.length > 0
          ? savedGroupIds
          : existing.groupId
            ? [existing.groupId]
            : [];
      return {
        ...initialState,
        name: existing.name,
        groups: groupIds,
        branches: existing.branches ?? (existing.branchId ? [existing.branchId] : []),
        status: existing.status,
        phone: existing.phone,
        avatar: existing.avatar ?? "",
        allowBooking: existing.allowBooking ?? true,
        allowOverlap: existing.allowOverlap ?? false,
        appLogin: existing.appLogin ?? false,
        accountType: (existing.accountType as AccountType) ?? "invoice_only",
        permissions: existing.permissions ?? {},
      };
    }
    return initialState;
  });
  // Account-tab state. Pre-fill username/email on edit; never pre-fill
  // passwords (they're write-only).
  const [account, setAccount] = useState<AccountFormState>(() => ({
    username: existing?.username ?? "",
    email: existing?.email ?? "",
    password: "",
    confirmPassword: "",
    oldPassword: "",
    newConfirmPassword: "",
  }));
  const updateAccount = <K extends keyof AccountFormState>(
    key: K,
    value: AccountFormState[K]
  ) => setAccount((prev) => ({ ...prev, [key]: value }));

  // Whether the staff account already has a login password set. When false,
  // the "old password" field in the edit dialog may be left empty (first-time
  // password set).
  const hasExistingPassword = isEdit ? !!existing?.hasPassword : false;

  const update = <K extends keyof StaffFormState>(
    key: K,
    value: StaffFormState[K]
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  // Avatar upload — uploads to R2, then stores the public URL in form.avatar.
  // Uses accept="image/*" so both desktop (file picker) and mobile (camera +
  // gallery chooser) work.
  const [avatarUploading, setAvatarUploading] = useState(false);
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setAvatarUploading(true);
    try {
      const urls = await uploadImagesToR2(files, "avatars");
      if (urls.length > 0) update("avatar", urls[0]!);
    } finally {
      setAvatarUploading(false);
      e.target.value = "";
    }
  };
  const handleRemoveAvatar = () => update("avatar", "");

  const toggleBranch = (branchId: string) => {
    setForm((prev) => {
      const exists = prev.branches.includes(branchId);
      return {
        ...prev,
        branches: exists
          ? prev.branches.filter((id) => id !== branchId)
          : [...prev.branches, branchId],
      };
    });
  };

  // Toggle a staff group in the multi-select. The first-selected group becomes
  // the primary (stored in the staff table's group_id column).
  const toggleGroup = (groupId: string) => {
    setForm((prev) => {
      const exists = prev.groups.includes(groupId);
      return {
        ...prev,
        groups: exists
          ? prev.groups.filter((id) => id !== groupId)
          : [...prev.groups, groupId],
      };
    });
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast({
        title: "Thiếu thông tin",
        description: "Vui lòng nhập tên nhân viên",
        variant: "destructive",
      });
      setTab("info");
      return;
    }
    if (form.groups.length === 0) {
      toast({
        title: "Thiếu thông tin",
        description: "Vui lòng chọn chức danh",
        variant: "destructive",
      });
      setTab("info");
      return;
    }
    if (form.branches.length === 0) {
      toast({
        title: "Thiếu thông tin",
        description: "Vui lòng chọn ít nhất 1 chi nhánh",
        variant: "destructive",
      });
      setTab("info");
      return;
    }

    // --- Account-tab validation (only when fields were filled) ----------
    // CREATE: if any account field is filled, require username + email +
    // password + confirm match. (Account is optional overall, but if the user
    // starts filling it, require it complete.)
    // EDIT: username/email are always editable; password change is optional
    // but if attempted requires old + new + confirm-match.
    const accountTouched =
      !!account.username || !!account.email || !!account.password ||
      !!account.confirmPassword || !!account.oldPassword ||
      !!account.newConfirmPassword;
    if (!isEdit && accountTouched) {
      if (!account.username.trim()) {
        toast({ title: "Thiếu thông tin", description: "Vui lòng nhập tên tài khoản", variant: "destructive" });
        setTab("account");
        return;
      }
      if (!account.email.trim()) {
        toast({ title: "Thiếu thông tin", description: "Vui lòng nhập email", variant: "destructive" });
        setTab("account");
        return;
      }
      if (!account.password) {
        toast({ title: "Thiếu thông tin", description: "Vui lòng nhập mật khẩu", variant: "destructive" });
        setTab("account");
        return;
      }
      if (account.password !== account.confirmPassword) {
        toast({ title: "Lỗi", description: "Mật khẩu nhập lại không khớp", variant: "destructive" });
        setTab("account");
        return;
      }
    }
    if (isEdit) {
      // Password change is optional. If the user typed a new password, the
      // new + new-confirm must be present and must match. The old password is
      // ALWAYS optional — this is an admin staff-edit dialog, so the admin
      // can reset any account's password without knowing the old one.
      const changingPassword = !!account.password || !!account.newConfirmPassword || !!account.oldPassword;
      if (changingPassword) {
        if (!account.password) {
          toast({ title: "Thiếu thông tin", description: "Vui lòng nhập mật khẩu mới", variant: "destructive" });
          setTab("account");
          return;
        }
        if (account.password !== account.newConfirmPassword) {
          toast({ title: "Lỗi", description: "Mật khẩu mới nhập lại không khớp", variant: "destructive" });
          setTab("account");
          return;
        }
      }
    }

    // Multi-group: the staff table has a single `group_id` column, so the
    // FIRST selected group is stored there (primary group, backwards compat
    // for existing queries/JOINs). The FULL list of group IDs is persisted in
    // the `permissions` JSONB column under the `group_ids` key so the dialog
    // can restore all groups on edit. Group IDs are already UUIDs from the
    // multi-select (no name→id mapping needed).
    const primaryGroupId = form.groups[0] || null;
    const permissionsWithGroups: Record<string, boolean | string[]> = {
      ...form.permissions,
      group_ids: form.groups,
    };

    // Use first selected branch as primary branch_id (for backwards compat)
    const primaryBranchId = form.branches[0] || null;

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      avatar: form.avatar || "",
      groupId: primaryGroupId,
      branchId: primaryBranchId,
      active: form.status === "active",
      allowBooking: form.allowBooking,
      allowOverlap: form.allowOverlap,
      appLogin: form.appLogin,
      accountType: form.accountType,
      permissions: permissionsWithGroups,
      branchIds: form.branches,
    };
    // Account-tab fields — only attach when filled so we don't overwrite the
    // stored password with empty on edit.
    if (!isEdit && accountTouched) {
      payload.username = account.username.trim();
      payload.email = account.email.trim();
      payload.password = account.password;
    } else if (isEdit) {
      // Username/email can be updated independently of password.
      if (account.username !== (existing?.username ?? "")) {
        payload.username = account.username.trim();
      }
      if (account.email !== (existing?.email ?? "")) {
        payload.email = account.email.trim();
      }
      // Password change is optional. When attempted, the new password + its
      // confirm must both be filled and match. The old password is ALWAYS
      // optional (admin can reset without knowing the old password).
      const newPwdFilled = !!account.password && !!account.newConfirmPassword &&
        account.password === account.newConfirmPassword;
      if (newPwdFilled) {
        payload.password = account.password;
        payload.oldPassword = account.oldPassword || "";
      }
    }

    const res = isEdit
      ? await updateStaff(selectedStaffId ?? "", payload)
      : await createStaff(payload);

    if (!res.ok) {
      // Password-change errors: the backend may know the account already has
      // a password even when the frontend's cached data said it didn't (stale
      // snapshot). Refresh the staff member's data so the dialog UI switches
      // to "old password required" mode, switch to the account tab, and show
      // the clear message from the backend.
      const isPasswordError =
        !!res.error &&
        (res.error.includes("mật khẩu cũ") || res.error.includes("đã có mật khẩu"));
      if (isPasswordError && isEdit && selectedStaffId) {
        await refreshStaffById(selectedStaffId);
        setTab("account");
      }
      toast({
        title: isEdit ? "Không thể cập nhật nhân viên" : "Không thể tạo mới nhân viên",
        description: res.error || form.name,
        variant: "destructive",
      });
      return;
    }

    // Build a display string of selected group names for the toast.
    const selectedGroupNames = form.groups
      .map((gid) => staffGroups.find((g) => g.id === gid)?.name)
      .filter(Boolean)
      .join(", ");
    toast({
      title: isEdit ? "Đã cập nhật nhân viên" : "Đã tạo mới nhân viên",
      description: `${form.name} · ${selectedGroupNames || "—"}`,
    });
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-[640px]">
      <DialogHeader>
        <DialogTitle className="text-lg font-semibold text-gray-900">
          {isEdit ? "Cập nhật nhân viên" : "Tạo mới nhân viên"}
        </DialogTitle>
      </DialogHeader>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setTab("info")}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors",
              tab === "info"
                ? "border-b-2 border-sky-500 text-sky-600"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            Cài đặt thông tin
          </button>
          <button
            type="button"
            onClick={() => setTab("account")}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors",
              tab === "account"
                ? "border-b-2 border-sky-500 text-sky-600"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            Tài khoản
          </button>
        </div>
      </div>

      {/* Tab content */}
      {tab === "info" ? (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Label className="w-28 text-sm text-gray-700">Ảnh đại diện:</Label>
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-50">
              {form.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.avatar} alt="Ảnh đại diện" className="h-full w-full object-cover" />
              ) : (
                <UserIcon className="h-8 w-8 text-gray-300" />
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5"
                disabled={avatarUploading}
                onClick={() => document.getElementById("avatar-upload")?.click()}
              >
                {avatarUploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {avatarUploading ? "Đang tải..." : "Tải ảnh lên"}
              </Button>
              <input
                id="avatar-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
              {form.avatar && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={handleRemoveAvatar}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Xóa ảnh
                </Button>
              )}
            </div>
            <ImagePlus className="ml-auto hidden h-4 w-4 text-gray-300" />
          </div>

          {/* Form fields grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            {/* Tên nhân viên */}
            <div className="space-y-1.5">
              <Label className="text-sm text-gray-700">
                <span className="text-red-500">*</span> Tên nhân viên:
              </Label>
              <Input
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Nhập tên nhân viên"
                className="h-9"
              />
            </div>

            {/* Nhóm (multi-select) — a button that opens a dropdown listing all
                groups to tick. The first-selected group is the primary (stored
                in the staff table's group_id column); the full list is
                persisted in permissions.group_ids. The button shows the count
                of selected groups (or the group names when few). */}
            <div className="space-y-1.5">
              <Label className="text-sm text-gray-700">
                <span className="text-red-500">*</span> Nhóm:
                <span className="ml-1 text-xs font-normal text-gray-400">
                  (chọn được nhiều nhóm)
                </span>
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 w-full justify-between font-normal"
                    disabled={staffGroups.length === 0}
                  >
                    <span className={cn("truncate", form.groups.length === 0 && "text-gray-400")}>
                      {staffGroups.length === 0
                        ? "Chưa có chức danh"
                        : form.groups.length === 0
                          ? "Chọn nhóm"
                          : form.groups
                              .map((gid) => staffGroups.find((g) => g.id === gid)?.name)
                              .filter(Boolean)
                              .join(", ")}
                    </span>
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-gray-400" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[240px] p-1" align="start">
                  <div className="max-h-[260px] overflow-y-auto">
                    {staffGroups.map((g) => {
                      const checked = form.groups.includes(g.id);
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => toggleGroup(g.id)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors",
                            checked
                              ? "bg-emerald-50 text-emerald-700"
                              : "text-gray-700 hover:bg-gray-100"
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                              checked
                                ? "border-emerald-500 bg-emerald-500 text-white"
                                : "border-gray-300 bg-white"
                            )}
                          >
                            {checked && <Check className="h-3 w-3" />}
                          </span>
                          <span className="flex-1 truncate text-left">{g.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  {form.groups.length > 0 && (
                    <button
                      type="button"
                      onClick={() => update("groups", [])}
                      className="mt-1 w-full border-t px-2 py-1.5 text-left text-xs text-gray-500 hover:bg-gray-100"
                    >
                      Bỏ chọn tất cả
                    </button>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            {/* Chi nhánh (multi-select) */}
            <div className="space-y-1.5">
              <Label className="text-sm text-gray-700">
                <span className="text-red-500">*</span> Chi nhánh:
              </Label>
              <div className="flex flex-wrap gap-2 rounded-md border border-gray-200 p-2 min-h-9">
                {branches.length === 0 ? (
                  <span className="text-sm text-gray-400 py-1">Chưa có chi nhánh</span>
                ) : (
                  branches.map((b) => (
                    <label
                      key={b.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors",
                        form.branches.includes(b.id)
                          ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                      )}
                    >
                      <Checkbox
                        checked={form.branches.includes(b.id)}
                        onCheckedChange={() => toggleBranch(b.id)}
                        className="h-3.5 w-3.5"
                      />
                      {b.name}
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* Trạng thái */}
            <div className="space-y-1.5">
              <Label className="text-sm text-gray-700">
                <span className="text-red-500">*</span> Trạng thái:
              </Label>
              <Select value={form.status} onValueChange={(v) => update("status", v)}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="Chọn trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  {StaffStatusOptions.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Ngày sinh */}
            <div className="space-y-1.5">
              <Label className="text-sm text-gray-700">Ngày sinh:</Label>
              <DatePicker
                value={form.birthday}
                onChange={(v) => update("birthday", v)}
                placeholder="dd/mm/yyyy"
              />
            </div>

            {/* Số điện thoại */}
            <div className="space-y-1.5">
              <Label className="text-sm text-gray-700">Số điện thoại:</Label>
              <Input
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                placeholder="Nhập số điện thoại"
                className="h-9"
                inputMode="numeric"
              />
            </div>
          </div>

          {/* Checkboxes */}
          <div className="space-y-2.5 border-t border-gray-100 pt-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="allow-booking"
                checked={form.allowBooking}
                onCheckedChange={(v) => update("allowBooking", v === true)}
              />
              <Label
                htmlFor="allow-booking"
                className="cursor-pointer text-sm font-normal text-gray-700"
              >
                Cho phép đặt lịch
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="allow-overlap"
                checked={form.allowOverlap}
                onCheckedChange={(v) => update("allowOverlap", v === true)}
              />
              <Label
                htmlFor="allow-overlap"
                className="cursor-pointer text-sm font-normal text-gray-700"
              >
                Đặt trùng lịch hẹn trên 1 khung giờ
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="app-login"
                checked={form.appLogin}
                onCheckedChange={(v) => update("appLogin", v === true)}
              />
              <Label
                htmlFor="app-login"
                className="cursor-pointer text-sm font-normal text-gray-700"
              >
                Đăng nhập app chuyên viên bằng số điện thoại
              </Label>
            </div>
          </div>
        </div>
      ) : (
        /* Account tab */
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            {/* Tên tài khoản */}
            <div className="space-y-1.5">
              <Label className="text-sm text-gray-700">
                Tên tài khoản:
              </Label>
              <Input
                value={account.username}
                onChange={(e) => updateAccount("username", e.target.value)}
                placeholder="Nhập tên đăng nhập"
                className="h-9"
                autoComplete="username"
              />
            </div>
            {/* Email */}
            <div className="space-y-1.5">
              <Label className="text-sm text-gray-700">
                Email:
              </Label>
              <Input
                type="email"
                value={account.email}
                onChange={(e) => updateAccount("email", e.target.value)}
                placeholder="email@example.com"
                className="h-9"
                autoComplete="email"
              />
            </div>
          </div>

          {/* CREATE: password + confirm */}
          {!isEdit && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm text-gray-700">
                  Mật khẩu:
                </Label>
                <Input
                  type="password"
                  value={account.password}
                  onChange={(e) => updateAccount("password", e.target.value)}
                  placeholder="Nhập mật khẩu"
                  className="h-9"
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-gray-700">
                  Nhập lại mật khẩu:
                </Label>
                <Input
                  type="password"
                  value={account.confirmPassword}
                  onChange={(e) => updateAccount("confirmPassword", e.target.value)}
                  placeholder="Nhập lại mật khẩu"
                  className="h-9"
                  autoComplete="new-password"
                />
                {account.confirmPassword && account.password !== account.confirmPassword && (
                  <p className="text-xs text-red-500">Mật khẩu không khớp</p>
                )}
              </div>
            </div>
          )}

          {/* EDIT: old (optional) + new + confirm. Admin can reset any password. */}
          {isEdit && (
            <>
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {hasExistingPassword
                  ? "Nhập 2 lần mật khẩu mới để đổi mật khẩu. Mật khẩu cũ có thể bỏ trống (đặt lại mật khẩu) hoặc nhập để xác nhận."
                  : "Tài khoản chưa có mật khẩu. Nhập 2 lần mật khẩu mới để tạo mật khẩu (mật khẩu cũ để trống)."}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-gray-700">Mật khẩu cũ (tùy chọn):</Label>
                <Input
                  type="password"
                  value={account.oldPassword}
                  onChange={(e) => updateAccount("oldPassword", e.target.value)}
                  placeholder={hasExistingPassword ? "Để trống để đặt lại, hoặc nhập mật khẩu hiện tại" : "Tài khoản chưa có mật khẩu — để trống"}
                  className="h-9"
                  autoComplete="current-password"
                />
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                <div className="space-y-1.5">
                  <Label className="text-sm text-gray-700">Mật khẩu mới:</Label>
                  <Input
                    type="password"
                    value={account.password}
                    onChange={(e) => updateAccount("password", e.target.value)}
                    placeholder="Nhập mật khẩu mới"
                    className="h-9"
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm text-gray-700">Nhập lại mật khẩu mới:</Label>
                  <Input
                    type="password"
                    value={account.newConfirmPassword}
                    onChange={(e) => updateAccount("newConfirmPassword", e.target.value)}
                    placeholder="Nhập lại mật khẩu mới"
                    className="h-9"
                    autoComplete="new-password"
                  />
                  {account.newConfirmPassword && account.password !== account.newConfirmPassword && (
                    <p className="text-xs text-red-500">Mật khẩu mới không khớp</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

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

export function StaffCreateDialog() {
  const { staffDialog, closeStaffDialog, selectedStaffId } = useSettingStore();
  const open = staffDialog !== null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && closeStaffDialog()}>
      {open && (
        <StaffCreateFormBody
          key={`${staffDialog}-${selectedStaffId ?? "new"}`}
          onClose={closeStaffDialog}
        />
      )}
    </Dialog>
  );
}
