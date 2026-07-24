"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Check, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { incentiveSchema } from "@/lib/validations";
import { IncentiveApplyScopeLabel } from "@/lib/constants";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { format as fmtDate, parse as parseDate, isValid } from "date-fns";

interface IncentiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: unknown) => void;
  initialData?: unknown;
  // Pending-state flags (drives the submit button's disabled + "Đang lưu..." label).
  // Passed in from the page so create vs update pending is reflected correctly.
  isSubmitting?: boolean;
}

// Normalise an incentive row (as returned by GET /api/supabase/incentives)
// into the form shape. The API stores branchIds / serviceIds as JSON strings
// and dates as ISO strings; the form expects string[] and "YYYY-MM-DD".
function normalizeInitialData(raw: unknown): z.infer<typeof incentiveSchema> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const parseIds = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
    if (typeof v === "string" && v.trim().startsWith("[")) {
      try {
        const arr = JSON.parse(v);
        return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
      } catch {
        return [];
      }
    }
    return [];
  };
  const toDate = (v: unknown): string => {
    if (typeof v !== "string" || !v) return "";
    // ISO -> YYYY-MM-DD (the <input type="date"> value format).
    return v.slice(0, 10);
  };
  return {
    id: typeof r.id === "string" ? r.id : undefined,
    code: typeof r.code === "string" ? r.code : "",
    name: typeof r.name === "string" ? r.name : "",
    applyScope: typeof r.applyScope === "string" ? r.applyScope : "time_range",
    startDate: toDate(r.startDate),
    endDate: toDate(r.endDate),
    branchIds: parseIds(r.branchIds),
    discountType: typeof r.discountType === "string" ? r.discountType : "service",
    serviceIds: parseIds(r.serviceIds),
    discountValue: Number(r.discountValue) || 0,
    usageLimit: Number(r.usageLimit) || 1,
    autoApplyTarget: typeof r.autoApplyTarget === "string" ? r.autoApplyTarget : "",
  };
}

// Sentinel value for the "Tất cả cửa hàng" option in the branch selector.
const ALL_BRANCHES = "all";

// Discount-type options. The conditional selector below (Nhóm dịch vụ / Dịch vụ)
// only appears when one of these is chosen, and is filtered by the selected
// store(s). "Sản phẩm" also shows a product selector for completeness.
const DISCOUNT_TYPE_OPTIONS = [
  { value: "service_category", label: "Nhóm dịch vụ" },
  { value: "service", label: "Dịch vụ" },
  { value: "product", label: "Sản phẩm" },
];

interface Branch {
  id: string;
  name: string;
  active: boolean;
}

interface ServiceCategory {
  id: string;
  name: string;
  active: boolean;
  branches: string[];
}

interface Service {
  id: string;
  name: string;
  code: string | null;
  branch_id: string | null;
  active: boolean;
}

interface Product {
  id: string;
  name: string;
  code: string | null;
  branch_id: string | null;
  active: boolean;
  price?: number;
  product_type?: string | null;
}

export function IncentiveDialog({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  isSubmitting,
}: IncentiveDialogProps) {
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  // Tracks the currently-selected entities (service categories / services /
  // products) in the conditional multi-select so the trigger can display the
  // chosen items. Mirrors the form field `serviceIds` for controlled display.
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  // While pre-filling the form in EDIT mode we set selectedBranches, which
  // would otherwise trigger the "clear on branch change" effect below and wipe
  // the pre-filled entity. This ref suppresses that clear for the pre-fill tick.
  const isPrefilling = useRef(false);

  // Normalize the incoming incentive row once so the pre-fill effect and
  // isEdit flag can be derived before useForm is declared.
  const normalizedInitial = useMemo(() => normalizeInitialData(initialData), [initialData]);
  const isEdit = !!normalizedInitial?.id;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof incentiveSchema>>({
    resolver: zodResolver(incentiveSchema),
    defaultValues: (initialData as z.infer<typeof incentiveSchema>) || {
      code: "",
      name: "",
      applyScope: "time_range",
      startDate: "",
      endDate: "",
      branchIds: [],
      discountType: "service",
      serviceIds: [],
      discountValue: 0,
      usageLimit: 1,
      autoApplyTarget: "",
    },
  });

  // Pre-fill the form when opening in EDIT mode. `useForm.defaultValues` only
  // applies on first mount, so we reset() here whenever the dialog opens with
  // initialData. Also seeds the local branch-tag + entity-select state so the
  // existing selections are visible immediately.
  useEffect(() => {
    if (open && normalizedInitial) {
      isPrefilling.current = true;
      reset(normalizedInitial);
      setSelectedBranches(normalizedInitial.branchIds || []);
      setSelectedEntityIds(normalizedInitial.serviceIds || []);
      // Release the guard on the next tick so subsequent user-driven changes
      // (switching type/branch) still clear the selection as expected.
      setTimeout(() => {
        isPrefilling.current = false;
      }, 0);
    }
    // Note: the !open branch (reset to empty) is handled by the close effect below.
  }, [open, normalizedInitial, reset]);

  const discountType = watch("discountType") as string;

  // Effective branch ids used for filtering the conditional selector (excludes
  // the "all" sentinel). When "Tất cả cửa hàng" is chosen (or no branch yet),
  // we show every entity regardless of branch.
  const effectiveBranches = selectedBranches.filter((id) => id !== ALL_BRANCHES);
  const isAllBranches =
    selectedBranches.includes(ALL_BRANCHES) || effectiveBranches.length === 0;

  // Fetch the REAL branches from the system (replaces the old hardcoded list
  // that wrongly included a non-existent "Cầu Giấy" store).
  const { data: branchesData } = useQuery<Branch[]>({
    queryKey: ["incentive-branches"],
    queryFn: async () => {
      const res = await fetch("/api/supabase/branches?active=true");
      const json = await res.json();
      return (json.data as Branch[]) || [];
    },
    enabled: open,
  });
  const branches = branchesData || [];

  // Fetch service categories (for "Nhóm dịch vụ").
  const { data: serviceCategoriesData } = useQuery<ServiceCategory[]>({
    queryKey: ["incentive-service-categories"],
    queryFn: async () => {
      const res = await fetch("/api/supabase/service-categories");
      const json = await res.json();
      return (json.data as ServiceCategory[]) || [];
    },
    enabled: open && discountType === "service_category",
  });

  // Fetch services (for "Dịch vụ").
  const { data: servicesData } = useQuery<Service[]>({
    queryKey: ["incentive-services"],
    queryFn: async () => {
      const res = await fetch("/api/supabase/services?limit=200");
      const json = await res.json();
      return (json.data as Service[]) || [];
    },
    enabled: open && discountType === "service",
  });

  // Fetch products (for "Sản phẩm").
  const { data: productsData } = useQuery<Product[]>({
    queryKey: ["incentive-products"],
    queryFn: async () => {
      const res = await fetch("/api/supabase/products?limit=200");
      const json = await res.json();
      return (json.data as Product[]) || [];
    },
    enabled: open && discountType === "product",
  });

  // Filter the entity list by the selected store(s).
  const filteredServiceCategories = useMemo(() => {
    const cats = (serviceCategoriesData || []).filter(
      (c) => c.active !== false
    );
    if (isAllBranches) return cats;
    return cats.filter((c) =>
      (c.branches || []).some((b) => effectiveBranches.includes(b))
    );
  }, [serviceCategoriesData, isAllBranches, effectiveBranches]);

  const filteredServices = useMemo(() => {
    const svcs = (servicesData || []).filter((s) => s.active !== false);
    if (isAllBranches) return svcs;
    return svcs.filter(
      (s) => s.branch_id && effectiveBranches.includes(s.branch_id)
    );
  }, [servicesData, isAllBranches, effectiveBranches]);

  const filteredProducts = useMemo(() => {
    // Only Sản phẩm kinh doanh (product_type = "trading") with a real price
    // (> 1000đ) are eligible for promotions. Sản phẩm tiêu thụ
    // (product_type = "consumption") are internal-use only (e.g. tools,
    // supplies) and are excluded — they are not sold to customers, so
    // discounting them makes no sense. Products with price <= 1000đ are
    // also excluded (cheap/free items, sample sizes, placeholder entries).
    const prods = (productsData || []).filter(
      (p) =>
        p.active !== false &&
        (p.product_type || "trading") === "trading" &&
        (p.price || 0) > 1000
    );
    if (isAllBranches) return prods;
    return prods.filter(
      (p) => p.branch_id && effectiveBranches.includes(p.branch_id)
    );
  }, [productsData, isAllBranches, effectiveBranches]);

  // Clear the selected entity whenever the discount type or branch selection
  // changes (user-driven), so a stale id from a previous type/branch set
  // doesn't linger. Skipped during the EDIT-mode pre-fill so the loaded
  // entity stays selected.
  useEffect(() => {
    if (isPrefilling.current) return;
    setValue("serviceIds", []);
    setSelectedEntityIds([]);
  }, [discountType, selectedBranches, setValue]);

  // Reset local + form state when the dialog closes so the next open is clean.
  // (Edit mode pre-fill is handled by the open effect above.)
  useEffect(() => {
    if (!open) {
      setSelectedBranches([]);
      setSelectedEntityIds([]);
      reset({
        code: "",
        name: "",
        applyScope: "time_range",
        startDate: "",
        endDate: "",
        branchIds: [],
        discountType: "service",
        serviceIds: [],
        discountValue: 0,
        usageLimit: 1,
        autoApplyTarget: "",
      });
    }
  }, [open, reset]);

  const handleBranchSelect = (branchId: string) => {
    if (branchId === ALL_BRANCHES) {
      // "Tất cả cửa hàng" is exclusive — selecting it clears individual branches.
      const next = [ALL_BRANCHES];
      setSelectedBranches(next);
      setValue("branchIds", next);
      return;
    }
    // Selecting an individual branch clears "Tất cả cửa hàng".
    let next = selectedBranches.filter((id) => id !== ALL_BRANCHES);
    if (!next.includes(branchId)) next = [...next, branchId];
    setSelectedBranches(next);
    setValue("branchIds", next);
  };

  const handleBranchRemove = (branchId: string) => {
    const next = selectedBranches.filter((id) => id !== branchId);
    setSelectedBranches(next);
    setValue("branchIds", next);
  };

  const onFormSubmit = (data: unknown) => {
    onSubmit(data);
    onOpenChange(false);
  };

  // Resolve a branch name for the tag display.
  const branchName = (id: string) =>
    id === ALL_BRANCHES
      ? "Tất cả cửa hàng"
      : branches.find((b) => b.id === id)?.name || id;

  // Branch dropdown options: "Tất cả cửa hàng" (if not already chosen) + branches
  // not yet selected.
  const availableBranchOptions = [
    ...(selectedBranches.includes(ALL_BRANCHES)
      ? []
      : [{ id: ALL_BRANCHES, name: "Tất cả cửa hàng" }]),
    ...branches
      .filter((b) => !selectedBranches.includes(b.id))
      .map((b) => ({ id: b.id, name: b.name })),
  ];

  // The conditional selector (field 7) label + options depend on discountType.
  const selectorLabel =
    discountType === "service_category"
      ? "*Chọn nhóm dịch vụ"
      : discountType === "service"
      ? "*Chọn dịch vụ"
      : discountType === "product"
      ? "*Chọn sản phẩm"
      : "*Chọn";

  const selectorOptions =
    discountType === "service_category"
      ? filteredServiceCategories.map((c) => ({ value: c.id, label: c.name }))
      : discountType === "service"
      ? filteredServices.map((s) => ({
          value: s.id,
          label: s.name,
        }))
      : discountType === "product"
      ? filteredProducts.map((p) => ({ value: p.id, label: p.name }))
      : [];

  const showConditionalSelector =
    discountType === "service_category" ||
    discountType === "service" ||
    discountType === "product";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden flex flex-col max-h-[80vh]">
        {/* Header - fixed */}
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold">
              {isEdit ? "Chỉnh sửa chương trình khuyến mãi" : "Tạo mới chương trình khuyến mãi"}
            </DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Body - scrollable */}
        <div
          className="px-6 py-4 overflow-y-auto flex-1"
          style={{
            maxHeight: "calc(80vh - 120px)",
            scrollbarWidth: "thin",
          }}
        >
          <form
            id="incentive-form"
            onSubmit={handleSubmit(onFormSubmit)}
            className="space-y-5"
          >
            {/* Field 1: Mã khuyến mãi */}
            <div className="space-y-2">
              <Label htmlFor="code" className="text-sm font-medium">
                Mã khuyến mãi
              </Label>
              <Input
                id="code"
                placeholder="Mã tự động"
                {...register("code")}
              />
            </div>

            {/* Field 2: Tên khuyến mãi (required) */}
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium">
                *Tên khuyến mãi
              </Label>
              <Input
                id="name"
                placeholder="Nhập tên khuyến mãi"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-xs text-red-500">{errors.name.message}</p>
              )}
            </div>

            {/* Field 3: Áp dụng (select) */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Áp dụng</Label>
              <Select
                onValueChange={(value) => setValue("applyScope", value)}
                defaultValue="time_range"
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn phạm vi áp dụng" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(IncentiveApplyScopeLabel).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Field 4: Hết hạn sau (date range) — single dual-calendar picker.
                The form stores dates as "YYYY-MM-DD" (from the old type=date
                inputs); convert to/from "dd/MM/yyyy" for the DateRangePicker. */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Hết hạn sau</Label>
              <DateRangePicker
                dateFrom={(() => {
                  const v = watch("startDate") as string;
                  if (!v) return fmtDate(new Date(), "dd/MM/yyyy");
                  const d = parseDate(v, "yyyy-MM-dd", new Date());
                  return isValid(d) ? fmtDate(d, "dd/MM/yyyy") : fmtDate(new Date(), "dd/MM/yyyy");
                })()}
                dateTo={(() => {
                  const v = watch("endDate") as string;
                  if (!v) return fmtDate(new Date(), "dd/MM/yyyy");
                  const d = parseDate(v, "yyyy-MM-dd", new Date());
                  return isValid(d) ? fmtDate(d, "dd/MM/yyyy") : fmtDate(new Date(), "dd/MM/yyyy");
                })()}
                onChange={(from, to) => {
                  const fd = parseDate(from, "dd/MM/yyyy", new Date());
                  const td = parseDate(to, "dd/MM/yyyy", new Date());
                  setValue("startDate", isValid(fd) ? fmtDate(fd, "yyyy-MM-dd") : "", { shouldValidate: true });
                  setValue("endDate", isValid(td) ? fmtDate(td, "yyyy-MM-dd") : "", { shouldValidate: true });
                }}
              />
            </div>

            {/* Field 5: Chỉ dành cho (multi-select tags) — real branches + "Tất cả cửa hàng" */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">*Chỉ dành cho</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {selectedBranches.map((branchId) => (
                  <span
                    key={branchId}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded-full"
                  >
                    {branchName(branchId)}
                    <button
                      type="button"
                      onClick={() => handleBranchRemove(branchId)}
                      className="hover:text-emerald-900 font-bold"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              {availableBranchOptions.length > 0 ? (
                <Select onValueChange={handleBranchSelect} value="">
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn cửa hàng" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBranchOptions.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        {opt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="text-xs text-gray-400 italic">
                  Đã chọn tất cả cửa hàng hiện có.
                </div>
              )}
              {errors.branchIds && (
                <p className="text-xs text-red-500">{errors.branchIds.message}</p>
              )}
            </div>

            {/* Field 6: Loại giảm giá — Nhóm dịch vụ / Dịch vụ / Sản phẩm */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Loại giảm giá</Label>
              <Select
                onValueChange={(value) => setValue("discountType", value)}
                value={discountType || "service"}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn loại giảm giá" />
                </SelectTrigger>
                <SelectContent>
                  {DISCOUNT_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Field 7: Conditional selector — appears for Nhóm dịch vụ / Dịch vụ
                (and Sản phẩm), filtered by the selected store(s). */}
            {showConditionalSelector && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">{selectorLabel}</Label>
                {selectorOptions.length === 0 ? (
                  <div className="flex h-9 items-center rounded-md border border-gray-200 bg-gray-50 px-3 text-xs text-gray-400">
                    Không có mục nào cho cửa hàng đã chọn.
                  </div>
                ) : (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex h-9 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 text-sm text-left hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <span className="truncate">
                          {selectedEntityIds.length === 0 ? (
                            <span className="text-gray-400">Chọn (có thể chọn nhiều)</span>
                          ) : (
                            <span className="flex flex-wrap gap-1">
                              {selectedEntityIds.slice(0, 3).map((id) => {
                                const opt = selectorOptions.find((o) => o.value === id);
                                return (
                                  <span
                                    key={id}
                                    className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700"
                                  >
                                    {opt?.label || id}
                                    <span
                                      role="button"
                                      tabIndex={0}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const next = selectedEntityIds.filter((x) => x !== id);
                                        setSelectedEntityIds(next);
                                        setValue("serviceIds", next, { shouldValidate: true });
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          const next = selectedEntityIds.filter((x) => x !== id);
                                          setSelectedEntityIds(next);
                                          setValue("serviceIds", next, { shouldValidate: true });
                                        }
                                      }}
                                      className="font-bold hover:text-emerald-900 cursor-pointer"
                                    >
                                      ×
                                    </span>
                                  </span>
                                );
                              })}
                              {selectedEntityIds.length > 3 && (
                                <span className="text-xs text-gray-500">
                                  +{selectedEntityIds.length - 3} khác
                                </span>
                              )}
                            </span>
                          )}
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <div className="max-h-60 overflow-y-auto p-1">
                        {selectorOptions.map((opt) => {
                          const checked = selectedEntityIds.includes(opt.value);
                          return (
                            <label
                              key={opt.value}
                              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-100"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(val) => {
                                  const next = val
                                    ? [...selectedEntityIds, opt.value]
                                    : selectedEntityIds.filter((x) => x !== opt.value);
                                  setSelectedEntityIds(next);
                                  setValue("serviceIds", next, { shouldValidate: true });
                                }}
                              />
                              <span className="flex-1 truncate">{opt.label}</span>
                              {checked && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                            </label>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
                {errors.serviceIds && (
                  <p className="text-xs text-red-500">
                    {errors.serviceIds.message}
                  </p>
                )}
              </div>
            )}

            {/* Field 8: Giảm giá (required) */}
            <div className="space-y-2">
              <Label htmlFor="discountValue" className="text-sm font-medium">
                *Giảm giá
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="discountValue"
                  type="number"
                  placeholder="Nhập giảm giá"
                  {...register("discountValue", { valueAsNumber: true })}
                  className="flex-1"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
              {errors.discountValue && (
                <p className="text-xs text-red-500">{errors.discountValue.message}</p>
              )}
            </div>

            {/* Field 9: Số lần sử dụng (required) */}
            <div className="space-y-2">
              <Label htmlFor="usageLimit" className="text-sm font-medium">
                *Số lần sử dụng
              </Label>
              <Input
                id="usageLimit"
                type="number"
                defaultValue={1}
                {...register("usageLimit", { valueAsNumber: true })}
              />
              {errors.usageLimit && (
                <p className="text-xs text-red-500">{errors.usageLimit.message}</p>
              )}
            </div>

            {/* Field 10: Tự động áp dụng */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Tự động áp dụng</Label>
              <Select onValueChange={(value) => setValue("autoApplyTarget", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn nhóm khách hàng mục tiêu" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả khách hàng</SelectItem>
                  <SelectItem value="new">Khách hàng mới</SelectItem>
                  <SelectItem value="vip">Khách hàng VIP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </form>
        </div>

        {/* Footer - fixed */}
        <div className="px-6 py-4 border-t flex items-center justify-between flex-shrink-0 bg-white">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
          >
            Hủy
          </button>
          <Button
            type="submit"
            form="incentive-form"
            disabled={!!isSubmitting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isSubmitting
              ? "Đang lưu..."
              : isEdit
              ? "Lưu"
              : "OK"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
