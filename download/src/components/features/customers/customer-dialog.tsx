"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Customer } from "@/stores/customer-store";
import { useBranchStore } from "@/stores/branch-store";
import { queryKeys } from "@/lib/query-keys";
import { customerSchema } from "@/lib/validations";

type CustomerFormValues = z.infer<typeof customerSchema>;

interface CustomerDialogProps {
  open: boolean;
  onClose: () => void;
  customer: Customer | null;
}

interface Option {
  id: string;
  name: string;
}

export function CustomerDialog({ open, onClose, customer }: CustomerDialogProps) {
  const queryClient = useQueryClient();
  const isEditMode = !!customer;
  const { selectedBranchId } = useBranchStore();

  const { data: sourcesData } = useQuery({
    queryKey: queryKeys.settings.section("sources"),
    queryFn: async () => {
      const res = await fetch("/api/supabase/customer-sources");
      const json = await res.json();
      return json.data || [];
    },
    enabled: open,
  });

  const { data: groupsData } = useQuery({
    queryKey: queryKeys.settings.section("groups"),
    queryFn: async () => {
      const res = await fetch("/api/supabase/customer-groups");
      const json = await res.json();
      return json.data || [];
    },
    enabled: open,
  });

  const sources: Option[] = sourcesData || [];
  const groups: Option[] = groupsData || [];

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: "",
      phone: "",
      code: "",
      email: "",
      gender: undefined,
      birthday: "",
      address: "",
      note: "",
      receiveNotification: undefined,
      profileCreatedAt: "",
      sourceId: "",
      groupId: "",
      referrerId: "",
      isRegular: false,
    },
  });

  useEffect(() => {
    if (customer) {
      reset({
        name: customer.name,
        phone: customer.phone,
        code: customer.code || "",
        email: customer.email || "",
        gender: (customer.gender as "male" | "female") || undefined,
        birthday: customer.birthday ? customer.birthday.split("T")[0] : "",
        address: customer.address || "",
        note: customer.note || "",
        receiveNotification: undefined,
        profileCreatedAt: "",
        sourceId: customer.sourceId || "",
        groupId: customer.groupId || "",
        referrerId: "",
        isRegular: false,
      });
    } else {
      reset({
        name: "",
        phone: "",
        code: "",
        email: "",
        gender: undefined,
        birthday: "",
        address: "",
        note: "",
        receiveNotification: undefined,
        profileCreatedAt: "",
        sourceId: "",
        groupId: "",
        referrerId: "",
        isRegular: false,
      });
    }
  }, [customer, reset]);

  const createMutation = useMutation({
    mutationFn: async (data: CustomerFormValues) => {
      const payload = {
        name: data.name,
        phone: data.phone,
        code: data.code || undefined,
        email: data.email || undefined,
        gender: data.gender || undefined,
        birthday: data.birthday || undefined,
        address: data.address || undefined,
        note: data.note || undefined,
        source_id: data.sourceId || undefined,
        group_id: data.groupId || undefined,
        branch_id: selectedBranchId || undefined,
      };
      const res = await fetch("/api/supabase/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      // Phone-uniqueness conflict (409): surface the error so the user knows
      // a customer with this phone already exists.
      if (!res.ok) {
        throw new Error(json.error || "Không thể tạo khách hàng");
      }
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      onClose();
    },
    onError: (error: Error) => {
      alert(error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: CustomerFormValues) => {
      if (!customer) return;
      const payload = {
        name: data.name,
        phone: data.phone,
        code: data.code || undefined,
        email: data.email || undefined,
        gender: data.gender || undefined,
        birthday: data.birthday || undefined,
        address: data.address || undefined,
        note: data.note || undefined,
        source_id: data.sourceId || undefined,
        group_id: data.groupId || undefined,
        branch_id: selectedBranchId || undefined,
      };
      const res = await fetch(`/api/supabase/customers/${customer.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      onClose();
    },
  });

  const onSubmit = (data: CustomerFormValues) => {
    if (isEditMode) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl p-0 overflow-hidden">
        {/* Sticky Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle>
            {isEditMode ? "Sửa khách hàng" : "Thêm khách hàng"}
          </DialogTitle>
        </DialogHeader>

        {/* Scrollable Body */}
        <div
          className="px-6 py-4 overflow-y-auto"
          style={{
            maxHeight: "calc(80vh - 120px)",
            scrollbarWidth: "thin",
          }}
        >
          <style jsx>{`
            div::-webkit-scrollbar {
              width: 8px;
            }
            div::-webkit-scrollbar-track {
              background: #f1f1f1;
              border-radius: 4px;
            }
            div::-webkit-scrollbar-thumb {
              background: #c1c1c1;
              border-radius: 4px;
            }
            div::-webkit-scrollbar-thumb:hover {
              background: #a1a1a1;
            }
          `}</style>

          <form id="customer-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Row 1: Họ tên */}
            <div className="flex items-start gap-4">
              <Label className="w-[140px] pt-2 text-right shrink-0">
                <span className="text-red-500">*</span> Họ tên
              </Label>
              <div className="flex-1">
                <Input
                  {...register("name")}
                  placeholder="Nhập họ tên"
                  className={errors.name ? "border-red-500" : ""}
                />
                {errors.name && (
                  <p className="text-sm text-red-500 mt-1">{errors.name.message}</p>
                )}
              </div>
            </div>

            {/* Row 2: Số điện thoại */}
            <div className="flex items-start gap-4">
              <Label className="w-[140px] pt-2 text-right shrink-0">
                <span className="text-red-500">*</span> Số điện thoại
              </Label>
              <div className="flex-1">
                <Input
                  {...register("phone")}
                  placeholder="Nhập số điện thoại"
                  className={errors.phone ? "border-red-500" : ""}
                />
                {errors.phone && (
                  <p className="text-sm text-red-500 mt-1">{errors.phone.message}</p>
                )}
              </div>
            </div>

            {/* Row 3: Mã khách hàng */}
            <div className="flex items-start gap-4">
              <Label className="w-[140px] pt-2 text-right shrink-0">
                Mã khách hàng
              </Label>
              <div className="flex-1">
                <Input
                  {...register("code")}
                  placeholder="Nhập mã khách hàng (nếu có)"
                />
              </div>
            </div>

            {/* Row 4: Địa chỉ */}
            <div className="flex items-start gap-4">
              <Label className="w-[140px] pt-2 text-right shrink-0">
                Địa chỉ
              </Label>
              <div className="flex-1">
                <Input
                  {...register("address")}
                  placeholder="Nhập địa chỉ"
                />
              </div>
            </div>

            {/* Row 5: Email */}
            <div className="flex items-start gap-4">
              <Label className="w-[140px] pt-2 text-right shrink-0">
                Email
              </Label>
              <div className="flex-1">
                <Input
                  type="email"
                  {...register("email")}
                  placeholder="Nhập email"
                />
                {errors.email && (
                  <p className="text-sm text-red-500 mt-1">{errors.email.message}</p>
                )}
              </div>
            </div>

            {/* Row 6: Nhận */}
            <div className="flex items-start gap-4">
              <Label className="w-[140px] pt-2 text-right shrink-0">
                Nhận
              </Label>
              <div className="flex-1">
                <Select
                  onValueChange={(value) => setValue("receiveNotification", value as "email" | "sms" | "none")}
                  value={watch("receiveNotification") || ""}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn nhận" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="none">Không nhận</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 7: Ngày khởi tạo hồ sơ */}
            <div className="flex items-start gap-4">
              <Label className="w-[140px] pt-2 text-right shrink-0">
                Ngày khởi tạo hồ sơ
              </Label>
              <div className="flex-1">
                <Input
                  type="date"
                  {...register("profileCreatedAt")}
                  placeholder="Chọn ngày tháng"
                />
              </div>
            </div>

            {/* Row 8: Nhóm khách */}
            <div className="flex items-start gap-4">
              <Label className="w-[140px] pt-2 text-right shrink-0">
                Nhóm khách
              </Label>
              <div className="flex-1">
                <Select
                  onValueChange={(value) => setValue("groupId", value)}
                  value={watch("groupId") || ""}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 9: Nguồn khách */}
            <div className="flex items-start gap-4">
              <Label className="w-[140px] pt-2 text-right shrink-0">
                N Pretend
              </Label>
              <div className="flex-1">
                <Select
                  onValueChange={(value) => setValue("sourceId", value)}
                  value={watch("sourceId") || ""}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn" />
                  </SelectTrigger>
                  <SelectContent>
                    {sources.map((source) => (
                      <SelectItem key={source.id} value={source.id}>
                        {source.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 10: Người giới thiệu */}
            <div className="flex items-start gap-4">
              <Label className="w-[140px] pt-2 text-right shrink-0">
                Người giới thiệu
              </Label>
              <div className="flex-1">
                <Input
                  {...register("referrerId")}
                  placeholder="Nhập tên hoặc mobile để tìm kiếm"
                />
              </div>
            </div>

            {/* Row 11: Sinh nhật */}
            <div className="flex items-start gap-4">
              <Label className="w-[140px] pt-2 text-right shrink-0">
                Sinh nhật
              </Label>
              <div className="flex-1">
                <Input
                  type="date"
                  {...register("birthday")}
                  placeholder="Chọn ngày tháng"
                />
              </div>
            </div>

            {/* Row 12: Giới tính */}
            <div className="flex items-start gap-4">
              <Label className="w-[140px] pt-2 text-right shrink-0">
                Giới tính
              </Label>
              <div className="flex-1 flex items-center gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="male"
                    {...register("gender")}
                    checked={watch("gender") === "male"}
                    onChange={() => setValue("gender", "male")}
                    className="w-4 h-4 text-emerald-600"
                  />
                  <span className="text-sm">Nam</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="female"
                    {...register("gender")}
                    checked={watch("gender") === "female"}
                    onChange={() => setValue("gender", "female")}
                    className="w-4 h-4 text-emerald-600"
                  />
                  <span className="text-sm">Nữ</span>
                </label>
              </div>
            </div>

            {/* Row 13: Là khách quen */}
            <div className="flex items-start gap-4">
              <div className="w-[140px]" />
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="checkbox"
                  {...register("isRegular")}
                  className="w-4 h-4 rounded border-gray-300 text-emerald-600"
                />
                <span className="text-sm">Là khách quen (từng dùng dịch vụ)</span>
              </div>
            </div>

            {/* Row 14: Ghi chú */}
            <div className="flex items-start gap-4">
              <Label className="w-[140px] pt-2 text-right shrink-0">
                Ghi chú
              </Label>
              <div className="flex-1">
                <Textarea
                  {...register("note")}
                  placeholder="Nhập ghi chú"
                  rows={3}
                />
              </div>
            </div>
          </form>
        </div>

        {/* Sticky Footer */}
        <div className="px-6 py-4 border-t bg-white flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            type="submit"
            form="customer-form"
            disabled={createMutation.isPending || updateMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {createMutation.isPending || updateMutation.isPending
              ? "Đang lưu..."
              : "OK"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}