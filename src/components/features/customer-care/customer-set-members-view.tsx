"use client";

import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CustomerSet } from "@/stores/customer-care-store";
import { formatVND } from "@/lib/utils";

interface CustomerSetMembersViewProps {
  customerSet: CustomerSet;
}

/** Format an epoch ms as "DD/MM/YYYY" (Vietnam-friendly). Empty when 0. */
function fmtDate(ms: number): string {
  if (!ms) return "—";
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

interface Member {
  memberId: string;
  addedAt: string;
  customerId: string;
  name: string;
  phone: string | null;
  code: string | null;
  birthday: string | null;
  totalSpent: number;
  serviceCount: number;
  lastVisitMs: number;
  avgVisitDays: number;
  avgSpendPerVisit: number;
  createdAt: string | null;
}

/**
 * Inline members view — rendered INSIDE the customer-care page (replaces the
 * customer-set list table when a set is selected). No overlay / fixed header
 * of its own: the parent page owns the title bar, back button and search.
 */
export function CustomerSetMembersView({
  customerSet,
}: CustomerSetMembersViewProps) {
  const [search, setSearch] = useState("");

  // Fetch members with their metrics.
  const { data, isLoading } = useQuery<{ items: Member[] }>({
    queryKey: ["customer-set-members", customerSet.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/supabase/customer-sets/${encodeURIComponent(customerSet.id)}/members`
      );
      const json = await res.json();
      if (!json.ok) return { items: [] };
      // The API returns an array directly under `data` (see route.ts).
      const arr = Array.isArray(json.data) ? json.data : [];
      return { items: arr };
    },
  });

  const members = (data?.items || []).filter(
    (m) =>
      !search ||
      (m.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (m.phone || "").includes(search)
  );

  return (
    <div className="flex h-full flex-col">
      {/* Search */}
      <div className="px-6 pb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm khách hàng theo tên / SĐT..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        <div className="rounded-lg border bg-white">
          {isLoading ? (
            <div className="py-8 text-center text-gray-500">Đang tải...</div>
          ) : members.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              Chưa có khách hàng nào trong tập này. Hãy lưu lại tập để tự động thêm khách hàng phù hợp điều kiện.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 hover:bg-gray-50">
                  <TableHead className="w-[40px] text-left font-medium text-gray-500">#</TableHead>
                  <TableHead className="text-left font-medium text-gray-500">Khách hàng</TableHead>
                  <TableHead className="text-left font-medium text-gray-500">SĐT</TableHead>
                  <TableHead className="text-right font-medium text-gray-500">Tổng chi tiêu</TableHead>
                  <TableHead className="text-right font-medium text-gray-500">Số lần DV</TableHead>
                  <TableHead className="text-right font-medium text-gray-500">TB / lần</TableHead>
                  <TableHead className="text-right font-medium text-gray-500">TB ngày</TableHead>
                  <TableHead className="text-left font-medium text-gray-500">Lần cuối ghé</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m, idx) => (
                  <TableRow key={m.memberId || m.customerId} className="border-b hover:bg-gray-50">
                    <TableCell className="text-left text-xs text-gray-400">{idx + 1}</TableCell>
                    <TableCell className="text-left">
                      <span className="font-medium text-gray-900">{m.name}</span>
                    </TableCell>
                    <TableCell className="text-left text-gray-600">{m.phone || "—"}</TableCell>
                    <TableCell className="text-right text-gray-700">
                      {formatVND(Number(m.totalSpent) || 0)}đ
                    </TableCell>
                    <TableCell className="text-right text-gray-700">
                      {m.serviceCount || 0}
                    </TableCell>
                    <TableCell className="text-right text-gray-700">
                      {formatVND(Number(m.avgSpendPerVisit) || 0)}đ
                    </TableCell>
                    <TableCell className="text-right text-gray-700">
                      {m.avgVisitDays || 0} ngày
                    </TableCell>
                    <TableCell className="text-left text-gray-600">
                      {m.lastVisitMs ? fmtDate(m.lastVisitMs) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
