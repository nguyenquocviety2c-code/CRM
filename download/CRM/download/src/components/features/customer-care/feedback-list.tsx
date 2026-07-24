"use client";

import { Star } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "./empty-state";

export interface FeedbackItem {
  id: string;
  rating: number;
  customerName: string;
  customerPhone?: string;
  serviceName: string;
  createdAt: string;
}

interface FeedbackListProps {
  data: FeedbackItem[];
  isLoading: boolean;
}

export function FeedbackList({ data, isLoading }: FeedbackListProps) {
  if (isLoading) {
    return (
      <div className="py-8 text-center text-gray-500">Đang tải...</div>
    );
  }

  if (data.length === 0) {
    return <EmptyState />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-gray-50 hover:bg-gray-50">
          <TableHead className="text-left font-medium text-gray-500">Đánh giá</TableHead>
          <TableHead className="text-left font-medium text-gray-500">Khách hàng</TableHead>
          <TableHead className="text-left font-medium text-gray-500">Dịch vụ</TableHead>
          <TableHead className="text-left font-medium text-gray-500">Thời gian</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((item) => (
          <TableRow key={item.id} className="border-b hover:bg-gray-50">
            <TableCell className="text-left">
              <div className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                <span className="text-sm font-medium">{item.rating}</span>
              </div>
            </TableCell>
            <TableCell className="text-left">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-900">{item.customerName}</span>
                {item.customerPhone && (
                  <span className="text-xs text-gray-500">{item.customerPhone}</span>
                )}
              </div>
            </TableCell>
            <TableCell className="text-left text-sm text-gray-700">
              {item.serviceName}
            </TableCell>
            <TableCell className="text-left text-sm text-gray-500">
              {new Date(item.createdAt).toLocaleDateString("vi-VN", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}