"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Service } from "@/types";
import { formatMoney } from "@/lib/utils";

interface ServiceListProps {
  services: Service[];
  onToggleAvailability: (id: string, active: boolean) => void;
  onEdit?: (id: string) => void;
  onEditCategory?: (categoryId: string) => void;
  visibleColumns?: Record<string, boolean>;
  // Branch list for resolving the Chi nhánh column. Each service's branchId
  // is a comma-separated UUID string. If it contains ALL branch ids, the
  // column shows "Tất cả"; otherwise it shows the matching branch name(s).
  branches?: { id: string; name: string }[];
}

export function ServiceList({
  services,
  onToggleAvailability,
  onEdit,
  onEditCategory,
  visibleColumns,
  branches,
}: ServiceListProps) {
  const isColVisible = (key: string) => visibleColumns?.[key] !== false;
  const visibleColCount = ["stt", "name", "category", "branch", "price", "active"].filter(
    (k) => isColVisible(k)
  ).length;

  return (
    <div className="rounded-md border">
      <table className="w-full" style={{ fontSize: '13px' }}>
        <thead className="bg-gray-50 border-b">
          <tr>
            {isColVisible("stt") && (
              <th className="px-4 py-3 text-center font-medium text-gray-700 w-12">STT</th>
            )}
            {isColVisible("name") && (
              <th className="px-4 py-3 text-left font-medium text-gray-700 max-w-[180px]">Tên dịch vụ</th>
            )}
            {isColVisible("category") && (
              <th className="px-4 py-3 text-left font-medium text-gray-700 min-w-[200px]">Nhóm</th>
            )}
            {isColVisible("branch") && (
              <th className="px-4 py-3 text-left font-medium text-gray-700 min-w-[140px]">Chi nhánh</th>
            )}
            {isColVisible("price") && (
              <th className="px-4 py-3 text-left font-medium text-gray-700">Đơn giá</th>
            )}
            {isColVisible("active") && (
              <th className="px-4 py-3 text-center font-medium text-gray-700">Sẵn sàng bán</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {services.length === 0 ? (
            <tr>
              <td colSpan={Math.max(visibleColCount, 1)} className="px-4 py-8 text-center text-gray-500">
                Chưa có dịch vụ nào
              </td>
            </tr>
          ) : (
            services.map((service, index) => (
              <ServiceRow
                key={service.id}
                service={service}
                index={index + 1}
                onToggleAvailability={onToggleAvailability}
                onEdit={onEdit}
                onEditCategory={onEditCategory}
                isColVisible={isColVisible}
                branches={branches}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// Resolve a service's branchId (comma-separated UUIDs) to a display label.
// Returns "Tất cả" when the service belongs to every known branch, otherwise
// the comma-separated branch names. Returns "—" when no branch is set or no
// branches are known.
function resolveBranchLabel(
  branchId: string | null | undefined,
  branches: { id: string; name: string }[] | undefined
): string {
  if (!branchId || !branches || branches.length === 0) return "—";
  const ids = branchId.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return "—";
  // "Tất cả" when the service belongs to every known branch.
  if (ids.length >= branches.length && branches.every((b) => ids.includes(b.id))) {
    return "Tất cả";
  }
  // Otherwise show the matching branch names.
  const names = ids
    .map((id) => branches.find((b) => b.id === id)?.name)
    .filter((n): n is string => !!n);
  return names.length > 0 ? names.join(", ") : "—";
}

function ServiceRow({
  service,
  index,
  onToggleAvailability,
  onEdit,
  onEditCategory,
  isColVisible,
  branches,
}: {
  service: Service;
  index: number;
  onToggleAvailability: (id: string, active: boolean) => void;
  onEdit?: (id: string) => void;
  onEditCategory?: (categoryId: string) => void;
  isColVisible: (key: string) => boolean;
  branches?: { id: string; name: string }[];
}) {
  const [isToggling, setIsToggling] = useState(false);

  const handleToggle = async () => {
    if (isToggling) return;
    setIsToggling(true);
    try {
      await onToggleAvailability(service.id, !service.active);
    } finally {
      setIsToggling(false);
    }
  };

  // Parse subPrices from JSON if needed
  const subPrices = service.subPrices || [];

  return (
    <tr className="hover:bg-gray-50">
      {isColVisible("stt") && (
        <td className="px-4 py-3 text-center text-gray-500">{index}</td>
      )}
      {isColVisible("name") && (
        <td className="px-4 py-3 max-w-[180px] overflow-hidden">
          {onEdit ? (
            <button
              onClick={() => onEdit(service.id)}
              className="font-medium text-blue-600 hover:text-blue-800 hover:underline text-left truncate block w-full"
            >
              {service.name}
            </button>
          ) : (
            <div className="font-medium text-gray-900 truncate">{service.name}</div>
          )}
        </td>
      )}
      {isColVisible("category") && (
        <td className="px-4 py-3 min-w-[200px] max-w-[260px] overflow-hidden">
          {service.categoryId && service.category?.name && onEditCategory ? (
            <button
              onClick={() => onEditCategory(service.categoryId!)}
              className="font-medium text-blue-600 hover:text-blue-800 hover:underline text-left truncate block w-full"
            >
              {service.category.name}
            </button>
          ) : (
            <span className="text-gray-600 truncate block">
              {service.category?.name || "-"}
            </span>
          )}
        </td>
      )}
      {isColVisible("branch") && (
        <td className="px-4 py-3 min-w-[140px] max-w-[220px] overflow-hidden">
          <span className="text-gray-700 truncate block">
            {resolveBranchLabel(service.branchId, branches)}
          </span>
        </td>
      )}
      {isColVisible("price") && (
        <td className="px-4 py-3">
          <div className="space-y-1">
            <div className="font-medium text-gray-900">
              {formatMoney(Number(service.price))}
            </div>
            {subPrices.length > 0 && (
              <div className="space-y-0.5">
                {subPrices.map((sp: { label: string; price: number }, idx: number) => (
                  <div key={idx} className="text-xs text-gray-500">
                    {sp.label}: {formatMoney(sp.price)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </td>
      )}
      {isColVisible("active") && (
        <td className="px-4 py-3 text-center">
          <Switch
            checked={service.active}
            onCheckedChange={handleToggle}
            disabled={isToggling}
          />
        </td>
      )}
    </tr>
  );
}
