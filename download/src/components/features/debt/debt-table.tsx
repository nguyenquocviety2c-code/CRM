"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Debt } from "@/types/debt";
import { formatVND } from "@/lib/debt-utils";
import { useDebtStore } from "@/stores/debt-store";

interface DebtTableProps {
  debts: Debt[];
}

export function DebtTable({ debts }: DebtTableProps) {
  const openCreatePaymentDialog = useDebtStore(
    (state) => state.openCreatePaymentDialog
  );

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40%]">Tên khách hàng</TableHead>
            <TableHead className="w-[30%]">Công nợ</TableHead>
            <TableHead className="w-[30%] text-right">Hành động</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {debts.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="h-24 text-center">
                <div className="flex flex-col items-center justify-center text-gray-500">
                  <svg
                    className="h-8 w-8 mb-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    />
                  </svg>
                  <span className="text-sm">Trống</span>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            debts.map((debt) => (
              <TableRow key={debt.id}>
                <TableCell className="font-medium">
                  {debt.customerName}
                </TableCell>
                <TableCell>{formatVND(debt.totalAmount)}</TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    onClick={() => openCreatePaymentDialog(debt)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Tạo thu nợ
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}