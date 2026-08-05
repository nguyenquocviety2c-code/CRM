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
import { renderLogo } from "@/lib/customer-set-logos";
import { CustomerSetActions } from "./customer-set-actions";

interface CustomerSetListProps {
  data: CustomerSet[];
  isLoading: boolean;
  onEdit: (item: CustomerSet) => void;
  onDelete: (item: CustomerSet) => void;
  onView: (item: CustomerSet) => void;
}

export function CustomerSetList({ data, isLoading, onEdit, onDelete, onView }: CustomerSetListProps) {
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
              {/* Name row — clickable to open the members view. Color swatch +
                  logo are shown to the LEFT of the name. */}
              <button
                type="button"
                onClick={() => onView(item)}
                className="flex items-center gap-1.5 text-left"
                title={`Xem khách hàng trong "${item.name}"`}
              >
                {item.logo && renderLogo(item.logo, "h-4 w-4 shrink-0")}
                <span
                  className="font-semibold uppercase tracking-wide hover:underline"
                  style={{ color: item.color || undefined }}
                >
                  {item.name}
                </span>
              </button>
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
