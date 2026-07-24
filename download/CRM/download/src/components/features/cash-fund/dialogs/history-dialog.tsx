"use client";

import { FolderOpen, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCashFundStore, useCashFundHistoriesData } from "@/stores/cash-fund-store";
import { formatVND, formatDate, paginationRange } from "@/lib/cash-fund-utils";
import { useState } from "react";

export function HistoryDialog() {
  const { isHistoryOpen, closeAllDialogs } = useCashFundStore();
  const { data: histories, isLoading } = useCashFundHistoriesData();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const total = histories.length;
  const skip = (page - 1) * pageSize;
  const data = histories.slice(skip, skip + pageSize);
  const { from, to } = paginationRange(skip, pageSize, total);

  return (
    <Dialog
      open={isHistoryOpen}
      onOpenChange={(open) => !open && closeAllDialogs()}
    >
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Lá»‹ch sá»­ cÃ i Ä‘áº·t quá»¹ Ä‘áº§u ngÃ y</DialogTitle>
        </DialogHeader>

        {/* Date Range Filter */}
        <div className="flex items-center gap-2 py-2">
          <input
            type="text"
            placeholder="DD/MM/YYYY"
            className="border rounded px-2 py-1 text-sm w-32"
            defaultValue="22/06/2026"
          />
          <span className="text-muted-foreground">~</span>
          <input
            type="text"
            placeholder="DD/MM/YYYY"
            className="border rounded px-2 py-1 text-sm w-32"
            defaultValue="22/06/2026"
          />
        </div>

        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>GiÃ¡ trá»‹</TableHead>
                <TableHead>Thá»i gian</TableHead>
                <TableHead>NgÆ°á»i thao tÃ¡c</TableHead>
                <TableHead>LÃ½ do</TableHead>
                <TableHead>CÆ¡ cháº¿ cÃ i Ä‘áº·t</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      {isLoading ? (
                        <span>Äang táº£i...</span>
                      ) : (
                        <>
                          <FolderOpen className="h-10 w-10 mb-2" />
                          <span>Trá»‘ng</span>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                data.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>{formatVND(h.value)}</TableCell>
                    <TableCell>{formatDate(h.createdAt, "datetime")}</TableCell>
                    <TableCell>{h.createdBy}</TableCell>
                    <TableCell>{h.reason}</TableCell>
                    <TableCell>
                      {h.mechanism === "manual" ? "Thá»§ cÃ´ng" : "Tá»± Ä‘á»™ng cá»™ng dá»“n"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="text-sm text-muted-foreground">
            Hiá»ƒn thá»‹ tá»« {from} Ä‘áº¿n {to} trÃªn tá»•ng sá»‘ {total}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="p-2 border rounded hover:bg-muted disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-3 py-1 border rounded bg-primary text-primary-foreground">
             {page}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={to >= total}
              className="p-2 border rounded hover:bg-muted disabled:opacity-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">/ trang</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
