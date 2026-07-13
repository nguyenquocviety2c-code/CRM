"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Plus, Inbox } from "lucide-react";
import { BonusTypeLabel } from "@/lib/constants";

interface BonusItem {
  id: string;
  minTopupAmount: number;
  bonusValue: number;
  bonusType: "VND" | "PERCENT";
}

interface BonusListProps {
  onAdd: () => void;
}

export function BonusList({ onAdd }: BonusListProps) {
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.cashcardSettings.bonus.list({ page, limit }),
    queryFn: async () => {
      const res = await fetch(`/api/supabase/cashcard-settings/bonus?page=${page}&limit=${limit}`);
      const json = await res.json();
      return json.ok ? json.data : { items: [], total: 0 };
    },
  });

  const items: BonusItem[] = data?.items || [];
  const total = data?.total || 0;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Danh sách bonus</h2>
        <Button onClick={onAdd} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="mr-2 h-4 w-4" />
          Thêm khoản bonus
        </Button>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-gray-500">Đang tải...</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <Inbox className="mb-2 h-12 w-12" />
          <p>Trống</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Số tiền nạp vào tối thiểu
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Số tiền bonus
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.minTopupAmount.toLocaleString("vi-VN")}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.bonusType === "PERCENT"
                      ? `${item.bonusValue}%`
                      : `${item.bonusValue.toLocaleString("vi-VN")} ${BonusTypeLabel[item.bonusType]}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            Hiển thị từ {from} đến {to} trên tổng số {total}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Trước
            </Button>
            <span>
              Trang {page} / {Math.ceil(total / limit)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= Math.ceil(total / limit)}
            >
              Sau
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}