"use client";

import { Pencil, Trash2 } from "lucide-react";
import { PackageCategory } from "@/types/product-service";

interface PackageCategoryListProps {
  items: PackageCategory[];
  onEdit: (id: string) => void;
  onDelete: (id: string, name: string) => void;
}

export function PackageCategoryList({ items, onEdit, onDelete }: PackageCategoryListProps) {
  return (
    <div className="bg-white rounded-lg border">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="px-4 py-3 text-left font-medium text-gray-700">
                Tên nhóm dịch vụ
              </th>
              <th className="px-4 py-3 text-right font-medium text-gray-700 w-32"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-gray-500">
                  Không có nhóm gói dịch vụ nào
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">{item.name}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onEdit(item.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-100 transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Sửa
                      </button>
                      <button
                        onClick={() => onDelete(item.id, item.name)}
                        className="inline-flex items-center justify-center p-1.5 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
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