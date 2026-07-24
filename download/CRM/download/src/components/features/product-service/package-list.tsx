"use client";

import { Switch } from "@/components/ui/switch";
import { Package } from "@/types/product-service";
import { formatVND } from "@/lib/utils";

interface PackageListProps {
  items: Package[];
  onToggleActive: (id: string) => void;
  visibleColumns?: Record<string, boolean>;
}

export function PackageList({ items, onToggleActive, visibleColumns }: PackageListProps) {
  const isColVisible = (key: string) => visibleColumns?.[key] !== false;
  const visibleColCount = ["name", "code", "discountPrice", "totalPrice", "active"].filter(
    (k) => isColVisible(k)
  ).length;

  return (
    <div className="bg-white rounded-lg border">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              {isColVisible("name") && (
                <th className="px-4 py-3 text-left font-medium text-gray-700">Tên gói dịch vụ</th>
              )}
              {isColVisible("code") && (
                <th className="px-4 py-3 text-left font-medium text-gray-700">Mã gói</th>
              )}
              {isColVisible("discountPrice") && (
                <th className="px-4 py-3 text-right font-medium text-gray-700">Giá khuyến mãi</th>
              )}
              {isColVisible("totalPrice") && (
                <th className="px-4 py-3 text-right font-medium text-gray-700">Giá gói</th>
              )}
              {isColVisible("active") && (
                <th className="px-4 py-3 text-center font-medium text-gray-700">Sẵn sàng bán</th>
              )}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={Math.max(visibleColCount, 1)} className="px-4 py-8 text-center text-gray-500">
                  Không có gói dịch vụ nào
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-b hover:bg-gray-50">
                  {isColVisible("name") && (
                    <td className="px-4 py-3 text-gray-900">{item.name}</td>
                  )}
                  {isColVisible("code") && (
                    <td className="px-4 py-3 text-gray-900">{item.code}</td>
                  )}
                  {isColVisible("discountPrice") && (
                    <td className="px-4 py-3 text-right text-gray-900">{formatVND(item.discountPrice)}</td>
                  )}
                  {isColVisible("totalPrice") && (
                    <td className="px-4 py-3 text-right text-gray-900">{formatVND(item.totalPrice)}</td>
                  )}
                  {isColVisible("active") && (
                    <td className="px-4 py-3 text-center">
                      <Switch
                        checked={item.active}
                        onCheckedChange={() => onToggleActive(item.id)}
                      />
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
