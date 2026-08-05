"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Search } from "lucide-react";
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
import { renderLogo } from "@/lib/customer-set-logos";

interface CustomerSetMembersViewProps {
  customerSet: CustomerSet;
  onBack: () => void;
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
  customer_id: string;
  added_at: string;
  customer: {
    id: string;
    name: string;
    phone: string | null;
    code: string | null;
  } | null;
  total_spent: number | null;
  service_count: number;
  last_visit: string | null;
  avg_visit_days: number | null;
  avg_spend_per_visit: number | null;
}

export function CustomerSetMembersView({
  customerSet,
  onBack,
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
      return { items: json.data || [] };
    },
  });

  const members = (data?.items || []).filter(
    (m) =>
      !search ||
      (m.customer?.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (m.customer?.phone || "").includes(search)
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
            title="Quay lại"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {/* Logo glyph + name (name uses the set's text color, uppercase). */}
          {customerSet.logo && renderLogo(customerSet.logo, "h-6 w-6 shrink-0")}
          <h1
            className="text-lg font-bold uppercase tracking-wide"
            style={{ color: customerSet.color || undefined }}
          >
            {customerSet.name}
          </h1>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            {members.length} khách hàng
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="px-6 py-3">
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
                  <TableRow key={m.customer_id} className="border-b hover:bg-gray-50">
                    <TableCell className="text-left text-xs text-gray-400">{idx + 1}</TableCell>
                    <TableCell className="text-left">
                      <span className="font-medium text-gray-900">
                        {m.customer?.name || "Khách"}
                      </span>
                    </TableCell>
                    <TableCell className="text-left text-gray-600">
                      {m.customer?.phone || "—"}
                    </TableCell>
                    <TableCell className="text-right text-gray-700">
                      {formatVND(Number(m.total_spent) || 0)}đ
                    </TableCell>
                    <TableCell className="text-right text-gray-700">
                      {m.service_count || 0}
                    </TableCell>
                    <TableCell className="text-right text-gray-700">
                      {formatVND(Number(m.avg_spend_per_visit) || 0)}đ
                    </TableCell>
                    <TableCell className="text-right text-gray-700">
                      {m.avg_visit_days || 0} ngày
                    </TableCell>
                    <TableCell className="text-left text-gray-600">
                      {m.last_visit ? fmtDate(new Date(m.last_visit).getTime()) : "—"}
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
