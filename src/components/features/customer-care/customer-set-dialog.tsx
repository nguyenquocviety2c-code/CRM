"use client";

import { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X, ChevronDown, Sparkles } from "lucide-react";
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
import { CustomerSet } from "@/stores/customer-care-store";
import { queryKeys } from "@/lib/query-keys";
import { customerSetSchema } from "@/lib/validations";
import { LOGO_OPTIONS, renderLogo } from "@/lib/customer-set-logos";

type CustomerSetFormValues = z.infer<typeof customerSetSchema>;

interface CustomerSetDialogProps {
  open: boolean;
  onClose: () => void;
  customerSet: CustomerSet | null;
}

// All condition types. Numeric ones support the gt/lt/between operators;
// birthdayMonth + customerGroup use plain equality (a single value).
const conditionOptions = [
  { value: "lastVisitDays", label: "Số ngày từ lần cuối ghé", numeric: true, unit: "ngày" },
  { value: "totalSpent", label: "Tổng chi tiêu", numeric: true, unit: "đ" },
  { value: "serviceCount", label: "Số lần sử dụng dịch vụ", numeric: true, unit: "lần" },
  { value: "avgVisitDays", label: "Số ngày dùng dịch vụ trung bình", numeric: true, unit: "ngày" },
  { value: "avgSpendPerVisit", label: "Chi tiêu trung bình mỗi lần", numeric: true, unit: "đ" },
  { value: "birthdayMonth", label: "Tháng sinh nhật", numeric: false, unit: "tháng" },
  { value: "customerGroup", label: "Nhóm khách hàng", numeric: false, unit: "" },
];

// Operator options for numeric conditions.
const operatorOptions = [
  { value: "gt", label: "Lớn hơn" },
  { value: "lt", label: "Nhỏ hơn" },
  { value: "between", label: "Trong khoảng" },
];

function isNumericCondition(type: string): boolean {
  const opt = conditionOptions.find((o) => o.value === type);
  return !!opt?.numeric;
}

export function CustomerSetDialog({ open, onClose, customerSet }: CustomerSetDialogProps) {
  const queryClient = useQueryClient();
  const isEditMode = !!customerSet;
  // Local state for color + logo (not in react-hook-form because color is a
  // native input type and logo is a base64 string — kept simple).
  const [color, setColor] = useState<string>("#3b82f6");
  const [logo, setLogo] = useState<string>("");
  // Whether the predefined-logo picker popover is open. Clicking the logo
  // button toggles this; clicking a glyph picks it and closes the popover.
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    control,
    formState: { errors },
  } = useForm<CustomerSetFormValues>({
    resolver: zodResolver(customerSetSchema),
    defaultValues: {
      name: "",
      note: "",
      autoUpdate: false,
      conditions: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "conditions",
  });

  useEffect(() => {
    if (customerSet) {
      reset({
        name: customerSet.name,
        note: customerSet.note || "",
        autoUpdate: customerSet.autoUpdate,
        conditions: customerSet.conditions.map((c) => ({
          conditionType: c.conditionType,
          conditionValue: c.conditionValue || "",
          conditionOperator: c.conditionOperator || "",
          conditionValue2: c.conditionValue2 || "",
        })),
      });
      setColor(customerSet.color || "#3b82f6");
      setLogo(customerSet.logo || "");
      setLogoPickerOpen(false);
    } else {
      reset({
        name: "",
        note: "",
        autoUpdate: false,
        conditions: [],
      });
      setColor("#3b82f6");
      setLogo("");
      setLogoPickerOpen(false);
    }
  }, [customerSet, reset]);

  const createMutation = useMutation({
    mutationFn: async (data: CustomerSetFormValues) => {
      const res = await fetch("/api/supabase/customer-sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, color, logo }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customerCare.customerSets.all });
      queryClient.invalidateQueries({ queryKey: ["customer-care-all-sets"] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: CustomerSetFormValues) => {
      if (!customerSet) return;
      const res = await fetch(`/api/supabase/customer-sets/${customerSet.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, color, logo }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customerCare.customerSets.all });
      queryClient.invalidateQueries({ queryKey: ["customer-care-all-sets"] });
      onClose();
    },
  });

  const onSubmit = (data: CustomerSetFormValues) => {
    if (isEditMode) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const handleAddCondition = () => {
    append({ conditionType: "", conditionValue: "", conditionOperator: "", conditionValue2: "" });
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        {/* Sticky Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle>
            {isEditMode ? "Sửa tập khách hàng" : "Tạo mới tập khách hàng"}
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
          <form id="customer-set-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Field 1: Tên — the name input sits on the top row with the
                color + logo buttons. The color button sets the TEXT COLOR of
                the customer-set name (shown beside the name in lists/views).
                The logo button opens a popover with a grid of predefined
                lucide-icon glyphs to pick from. Both buttons are the same
                height as the name input so the row aligns cleanly. */}
            <div className="flex items-start gap-4">
              <Label className="w-[140px] pt-2 text-right shrink-0">
                <span className="text-red-500">*</span> Tên
              </Label>
              <div className="flex-1 space-y-1.5">
                {/* Top row: color button + logo button + name input, same height.
                    All three are 28px tall — the design system forces all
                    <input> elements to height:28px !important (including the
                    color input + the name input), so the logo button matches. */}
                <div className="flex items-center gap-2">
                  {/* Color (text-color) picker — a native color input overlaid
                      on a swatch. Sets the text color of the customer-set name. */}
                  <label
                    className="relative flex h-[28px] w-[28px] shrink-0 cursor-pointer items-center justify-center rounded-md border border-gray-300 hover:border-gray-400"
                    title="Chọn màu chữ"
                  >
                    <span
                      className="h-4 w-4 rounded"
                      style={{ backgroundColor: color }}
                    />
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="absolute inset-0 cursor-pointer opacity-0"
                      aria-label="Chọn màu chữ"
                    />
                  </label>
                  {/* Logo picker button — opens a popover grid of predefined
                      glyphs. Shows the currently-picked glyph (or a + icon). */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setLogoPickerOpen((v) => !v)}
                      className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-md border border-gray-300 hover:border-gray-400"
                      title="Chọn logo"
                      aria-label="Chọn logo"
                    >
                      {logo ? (
                        renderLogo(logo, "h-4 w-4")
                      ) : (
                        <Sparkles className="h-4 w-4 text-gray-400" />
                      )}
                    </button>
                    {logoPickerOpen && (
                      <div className="absolute left-0 z-50 mt-1 w-64 rounded-lg border bg-white p-2 shadow-lg">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[11px] font-medium text-gray-600">
                            Chọn logo
                          </span>
                          <button
                            type="button"
                            onClick={() => setLogoPickerOpen(false)}
                            className="text-gray-400 hover:text-gray-600"
                            aria-label="Đóng"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                        {/* Grid of predefined glyphs. Each is a button that
                            picks its id and closes the popover. */}
                        <div className="grid grid-cols-6 gap-1">
                          {LOGO_OPTIONS.map((opt) => {
                            const { Icon } = opt;
                            const active = logo === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => {
                                  setLogo(opt.id);
                                  setLogoPickerOpen(false);
                                }}
                                title={opt.label}
                                className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${
                                  active
                                    ? "border-emerald-500 bg-emerald-50 text-emerald-600"
                                    : "border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                                }`}
                              >
                                <Icon className="h-4 w-4" />
                              </button>
                            );
                          })}
                        </div>
                        {/* Clear button — removes the picked logo. */}
                        {logo && (
                          <button
                            type="button"
                            onClick={() => {
                              setLogo("");
                              setLogoPickerOpen(false);
                            }}
                            className="mt-1.5 w-full rounded-md border border-gray-200 py-1 text-[11px] text-gray-500 hover:bg-gray-50"
                          >
                            Xóa logo
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Name input — 28px tall (forced by the design system's
                      !important rule on all <input> elements). */}
                  <Input
                    {...register("name")}
                    placeholder="NHẬP TÊN TẬP KHÁCH HÀNG"
                    className={`flex-1 uppercase tracking-wide ${errors.name ? "border-red-500" : ""}`}
                    style={{ color: color || undefined }}
                  />
                </div>
                {errors.name && (
                  <p className="text-sm text-red-500 mt-0.5">{errors.name.message}</p>
                )}
                {/* Live preview of how the name will look (color + logo + UPPERCASE),
                    so the cashier sees the result before saving. */}
                {watch("name") && (
                  <div className="flex items-center gap-1.5 rounded-md bg-gray-50 px-2 py-1">
                    {logo && renderLogo(logo, "h-4 w-4 shrink-0")}
                    <span
                      className="text-xs font-bold uppercase tracking-wide"
                      style={{ color: color || undefined }}
                    >
                      {watch("name")}
                    </span>
                    <span className="ml-auto text-[10px] text-gray-400">Xem trước</span>
                  </div>
                )}
              </div>
            </div>

            {/* Field 2: Mô tả hoặc ghi chú — label on the LEFT, note textarea
                on the RIGHT (same row), matching the layout of the other fields. */}
            <div className="flex items-start gap-4">
              <Label className="w-[140px] pt-2 text-right shrink-0">
                Mô tả hoặc ghi chú
              </Label>
              <div className="flex-1">
                <Textarea
                  {...register("note")}
                  placeholder="Nhập mô tả hoặc ghi chú"
                  rows={3}
                />
              </div>
            </div>

            {/* Field 3: Tự động cập nhật */}
            <div className="flex items-start gap-4">
              <div className="w-[140px]" />
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="checkbox"
                  {...register("autoUpdate")}
                  className="w-4 h-4 rounded border-gray-300 text-emerald-600"
                />
                <span className="text-sm">Tự động cập nhật danh sách khách hàng</span>
              </div>
            </div>

            {/* Field 4: Điều kiện áp dụng — each condition row has:
                [condition type Select] [operator Select] [value input(s)] [×]
                Numeric conditions show operator + 1 (gt/lt) or 2 (between) inputs.
                birthdayMonth/customerGroup show a single value input (no operator). */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Điều kiện áp dụng:</Label>
              {fields.map((field, index) => {
                const condType = watch(`conditions.${index}.conditionType`) || "";
                const operator = watch(`conditions.${index}.conditionOperator`) || "";
                const numeric = isNumericCondition(condType);
                const unit = conditionOptions.find((o) => o.value === condType)?.unit || "";
                return (
                  <div key={field.id} className="rounded-md border border-gray-100 bg-gray-50/50 p-2">
                    <div className="flex items-center gap-2">
                      {/* Condition type Select */}
                      <Select
                        onValueChange={(value) => {
                          setValue(`conditions.${index}.conditionType`, value);
                          // Reset operator + values when type changes.
                          setValue(`conditions.${index}.conditionOperator`, "");
                          setValue(`conditions.${index}.conditionValue`, "");
                          setValue(`conditions.${index}.conditionValue2`, "");
                        }}
                        value={condType}
                      >
                        <SelectTrigger className="flex-1 h-8 text-xs">
                          <SelectValue placeholder="Chọn điều kiện" />
                        </SelectTrigger>
                        <SelectContent>
                          {conditionOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(index)}
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {/* Operator + value input(s) — only after a type is chosen. */}
                    {condType && (
                      <div className="mt-1.5 flex items-center gap-2 pl-1">
                        {numeric ? (
                          <>
                            {/* Operator Select for numeric conditions */}
                            <Select
                              onValueChange={(value) =>
                                setValue(`conditions.${index}.conditionOperator`, value)
                              }
                              value={operator}
                            >
                              <SelectTrigger className="h-7 w-32 shrink-0 text-[11px]">
                                <SelectValue placeholder="Điều kiện" />
                              </SelectTrigger>
                              <SelectContent>
                                {operatorOptions.map((op) => (
                                  <SelectItem key={op.value} value={op.value}>
                                    {op.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {/* Value input(s): 1 for gt/lt, 2 for between */}
                            {operator === "between" ? (
                              <>
                                <div className="relative flex-1">
                                  <Input
                                    type="number"
                                    placeholder="Từ"
                                    className="h-7 pr-7 text-[11px]"
                                    {...register(`conditions.${index}.conditionValue`)}
                                  />
                                  {unit && (
                                    <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
                                      {unit}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-gray-400">→</span>
                                <div className="relative flex-1">
                                  <Input
                                    type="number"
                                    placeholder="Đến"
                                    className="h-7 pr-7 text-[11px]"
                                    {...register(`conditions.${index}.conditionValue2`)}
                                  />
                                  {unit && (
                                    <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
                                      {unit}
                                    </span>
                                  )}
                                </div>
                              </>
                            ) : operator ? (
                              <div className="relative flex-1">
                                <Input
                                  type="number"
                                  placeholder="Giá trị"
                                  className="h-7 pr-7 text-[11px]"
                                  {...register(`conditions.${index}.conditionValue`)}
                                />
                                {unit && (
                                  <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
                                    {unit}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <p className="text-[11px] text-gray-400">
                                Chọn điều kiện (lớn hơn / nhỏ hơn / trong khoảng)
                              </p>
                            )}
                          </>
                        ) : condType === "birthdayMonth" ? (
                          <Select
                            onValueChange={(value) =>
                              setValue(`conditions.${index}.conditionValue`, value)
                            }
                            value={watch(`conditions.${index}.conditionValue`) || ""}
                          >
                            <SelectTrigger className="h-7 flex-1 text-[11px]">
                              <SelectValue placeholder="Chọn tháng" />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                                <SelectItem key={m} value={String(m)}>
                                  Tháng {m}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          // customerGroup — plain text input for the group id/name.
                          <Input
                            placeholder="Nhập id nhóm khách hàng"
                            className="h-7 flex-1 text-[11px]"
                            {...register(`conditions.${index}.conditionValue`)}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddCondition}
                className="text-emerald-600 border-emerald-600 hover:bg-emerald-50"
              >
                <Plus className="mr-1 h-4 w-4" />
                Thêm điều kiện
              </Button>
              <p className="text-[11px] text-gray-400">
                Khi lưu, các khách hàng phù hợp điều kiện sẽ được tự động thêm vào tập.
              </p>
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
            form="customer-set-form"
            disabled={createMutation.isPending || updateMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {createMutation.isPending || updateMutation.isPending
              ? "Đang lưu..."
              : "Lưu"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
