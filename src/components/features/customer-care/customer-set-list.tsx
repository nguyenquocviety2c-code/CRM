"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CustomerSet } from "@/stores/customer-care-store";
import { CustomerSetActions } from "./customer-set-actions";

interface CustomerSetListProps {
  data: CustomerSet[];
  isLoading: boolean;
  onEdit: (item: CustomerSet) => void;
  onDelete: (item: CustomerSet) => void;
}

export function CustomerSetList({ data, isLoading, onEdit, onDelete }: CustomerSetListProps) {
  if (isLoading) {
    return (
      <div className="py-8 text-center text-gray-500">Đang tải...</div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="py-8 text-center text-gray-500">Không có tập khách hàng nào</div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-gray-50 hover:bg-gray-50">
          <TableHead className="text-left font-medium text-gray-500">Tên tập</TableHead>
          <TableHead className="text-left font-medium text-gray-500">Mô tả hoặc ghi chú</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((item) => (
          <TableRow key={item.id} className="border-b hover:bg-gray-50">
            <TableCell className="text-left">
              <span className="text-emerald-600">{item.name}</span>
            </TableCell>
            <TableCell className="text-left">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">{item.note || ""}</span>
                <CustomerSetActions onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}