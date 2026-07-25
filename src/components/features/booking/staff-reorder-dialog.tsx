"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GripVertical, Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface StaffReorderItem {
  id: string;
  name: string;
  groupName?: string | null;
  sortOrder: number;
}

interface StaffReorderDialogProps {
  open: boolean;
  onClose: () => void;
  branchId: string | null;
}

/**
 * "Sắp xếp nhân viên" dialog — drag-to-reorder the branch's hairdresser staff.
 * The new order is persisted via PUT /api/supabase/staff/reorder (sort_order
 * stored in each staff's permissions JSONB). After saving, all staff Select
 * dropdowns (booking dialog + dat-lich) reflect the new order because they sort
 * client-side by permissions.sort_order.
 *
 * Only shown to staff whose group has the `reorder_staff` permission.
 */
export function StaffReorderDialog({ open, onClose, branchId }: StaffReorderDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch ALL active hairdresser staff for the branch (same filter as the
  // booking dialog) so the reorder list matches what the user sees in selects.
  const { data: staffData, isLoading } = useQuery<StaffReorderItem[]>({
    queryKey: ["staff-reorder", branchId],
    queryFn: async () => {
      if (!branchId) return [];
      const res = await fetch(
        `/api/supabase/staff?branch_id=${encodeURIComponent(branchId)}&active=true&limit=200`
      );
      const json = await res.json();
      if (!json.ok) return [];
      const hairdresserGroups = ["Artist", "Creative Director", "Master", "Junior"];
      return (json.data as Array<Record<string, unknown>>)
        .filter((s) => {
          const groupName = (s.group as { name?: string } | null)?.name;
          return groupName && hairdresserGroups.includes(groupName);
        })
        .map((s) => {
          const perms = (s.permissions as Record<string, unknown> | null) ?? {};
          const so = typeof perms.sort_order === "number" ? perms.sort_order : Number.MAX_SAFE_INTEGER;
          return {
            id: s.id as string,
            name: s.name as string,
            groupName: (s.group as { name?: string } | null)?.name,
            sortOrder: so,
          };
        })
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    },
    enabled: open && !!branchId,
  });

  // Local order state — initialized from the fetched sort. Drag updates this;
  // "Lưu" persists it.
  const [localOrder, setLocalOrder] = useState<StaffReorderItem[] | null>(null);
  // Sync localOrder when staffData loads / changes.
  const effectiveOrder = localOrder ?? staffData ?? [];
  if (staffData && !localOrder) setLocalOrder(staffData);

  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !localOrder) return;
    const oldIndex = localOrder.findIndex((s) => s.id === active.id);
    const newIndex = localOrder.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setLocalOrder(arrayMove(localOrder, oldIndex, newIndex));
  };

  const handleSave = async () => {
    if (!localOrder) return;
    setSaving(true);
    try {
      const items = localOrder.map((s, idx) => ({ id: s.id, sort_order: idx }));
      const res = await fetch("/api/supabase/staff/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed");
      // Invalidate the staff queries used by booking dialog + dat-lich so they
      // refetch with the new sort_order.
      await queryClient.invalidateQueries({ queryKey: ["booking-dialog-staff"] });
      await queryClient.invalidateQueries({ queryKey: ["dat-lich-staff"] });
      await queryClient.invalidateQueries({ queryKey: ["staff-reorder"] });
      toast({ title: "Đã lưu thứ tự nhân viên" });
      onClose();
      setLocalOrder(null);
    } catch (e: unknown) {
      toast({
        title: "Lỗi",
        description: e instanceof Error ? e.message : "Lưu thất bại",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setLocalOrder(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sắp xếp thứ tự nhân viên</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-gray-500">
          Kéo thả tên nhân viên để thay đổi thứ tự hiển thị. Thứ tự này áp dụng cho
          mọi ô chọn nhân viên (đặt lịch, thu ngân, đặt lịch kiosk).
        </p>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : effectiveOrder.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">
            Không có nhân viên
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={effectiveOrder.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1">
                  {effectiveOrder.map((s, idx) => (
                    <SortableStaffRow key={s.id} staff={s} position={idx + 1} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Hủy
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || effectiveOrder.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? "Đang lưu..." : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SortableStaffRow({ staff, position }: { staff: StaffReorderItem; position: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: staff.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`flex items-center gap-2 rounded-md border bg-white px-2 py-1.5 text-sm ${
        isDragging ? "border-emerald-400 shadow-md opacity-80" : "border-gray-200"
      }`}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-gray-400 hover:text-gray-600 active:cursor-grabbing"
        {...attributes}
        {...listeners}
        title="Kéo để thay đổi thứ tự"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-5 text-xs text-gray-400">{position}</span>
      <span className="flex-1 truncate font-medium text-gray-900">{staff.name}</span>
      {staff.groupName && (
        <span className="text-xs text-gray-400">{staff.groupName}</span>
      )}
    </div>
  );
}
