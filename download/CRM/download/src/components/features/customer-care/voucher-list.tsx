"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { IncentiveActions } from "./incentive-actions";

interface Voucher {
  id: string;
  code: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  discountValue: number;
  applyScope: string | null;
  usageLimit: number;
  usedCount: number;
  unusedCount: number;
  cost: number;
}

interface VoucherListProps {
  vouchers: Voucher[];
  onEdit: (voucher: Voucher) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}

export function VoucherList({ vouchers, onEdit, onDelete, onCreate }: VoucherListProps) {
  const [search, setSearch] = useState("");

  const filtered = vouchers.filter(
    (v) =>
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      v.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Voucher</h2>
        <Button
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={onCreate}
        >
          + Tạo mới
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Tìm kiếm..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <div className="rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3">Mã</th>
              <th className="px-4 py-3">Tên chương trình</th>
              <th className="px-4 py-3">Thời gian khả dụng</th>
              <th className="px-4 py-3">Giảm giá</th>
              <th className="px-4 py-3">Áp dụng</th>
              <th className="px-4 py-3 text-right">Số lượng</th>
              <th className="px-4 py-3 text-right">Đã sử dụng</th>
              <th className="px-4 py-3 text-right">Chưa sử dụng</th>
              <th className="px-4 py-3 text-right">Chi phí</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center justify-center text-gray-400">
                    <Search className="h-8 w-8 mb-2 opacity-50" />
                    <span className="text-sm">Trống</span>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((voucher) => (
                <tr
                  key={voucher.id}
                  className="border-b last:border-b-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">
                    {voucher.code}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {voucher.name}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {voucher.startDate && voucher.endDate
                      ? `${voucher.startDate} - ${voucher.endDate}`
                      : "Không giới hạn"}
                  </td>
                  <td className="px-4 py-3 text-emerald-600 font-medium">
                    {voucher.discountValue}%
                  </td>
                  <td className="px-4 py-3">
                    {voucher.applyScope || "Hóa đơn"}
                  </td>
                  <td className="px-4 py-3 text-right">{voucher.usageLimit}</td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {voucher.usedCount}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {voucher.unusedCount}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900 font-medium">
                    {voucher.cost.toLocaleString("vi-VN")}đ
                  </td>
                  <td className="px-4 py-3">
                    <IncentiveActions
                      onEdit={() => onEdit(voucher)}
                      onDelete={() => onDelete(voucher.id)}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}