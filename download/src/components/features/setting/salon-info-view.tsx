"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, Clock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useBranchStore } from "@/stores/branch-store";

interface SalonInfo {
  id: string;
  name: string;
  branch_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  fanpage: string | null;
  open_time: string | null;
  close_time: string | null;
  logo: string | null;
  branch_id: string | null;
}

interface SalonFormValues {
  name: string;
  branch_name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  fanpage: string;
  open_time: string;
  close_time: string;
  logo: string;
}

export function SalonInfoView() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { selectedBranchId } = useBranchStore();
  const [addBranchOpen, setAddBranchOpen] = useState(false);
  const [branchForm, setBranchForm] = useState({ name: "", address: "", phone: "", email: "" });
  const [form, setForm] = useState<SalonFormValues>({
    name: "",
    branch_name: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    fanpage: "",
    open_time: "09:30",
    close_time: "20:15",
    logo: "",
  });
  const [salonId, setSalonId] = useState<string | null>(null);

  // Fetch salon info for the selected branch
  const { data, isLoading } = useQuery({
    queryKey: ["salon-info", selectedBranchId],
    queryFn: async () => {
      const url = selectedBranchId
        ? `/api/supabase/salon-info?branch_id=${selectedBranchId}`
        : "/api/supabase/salon-info";
      const res = await fetch(url);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      return json.data as SalonInfo | null;
    },
  });

  // Populate form when data loads OR when branch changes
  useEffect(() => {
    if (data) {
      setSalonId(data.id);
      setForm({
        name: data.name || "",
        branch_name: data.branch_name || "",
        address: data.address || "",
        phone: data.phone || "",
        email: data.email || "",
        website: data.website || "",
        fanpage: data.fanpage || "",
        open_time: data.open_time || "09:30",
        close_time: data.close_time || "20:15",
        logo: data.logo || "",
      });
    } else {
      // No salon_info for this branch — reset form for creating new
      setSalonId(null);
      setForm({
        name: "",
        branch_name: "",
        address: "",
        phone: "",
        email: "",
        website: "",
        fanpage: "",
        open_time: "09:30",
        close_time: "20:15",
        logo: "",
      });
    }
  }, [data, selectedBranchId]);

  // Create or update mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        branch_name: form.branch_name || null,
        address: form.address || null,
        phone: form.phone || null,
        email: form.email || null,
        website: form.website || null,
        fanpage: form.fanpage || null,
        open_time: form.open_time || null,
        close_time: form.close_time || null,
        logo: form.logo || null,
        branch_id: selectedBranchId,
      };

      if (salonId) {
        // Update existing
        const res = await fetch(`/api/supabase/salon-info/${salonId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error);
        return json.data;
      } else {
        // Create new
        const res = await fetch("/api/supabase/salon-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error);
        return json.data;
      }
    },
    onSuccess: (result) => {
      if (result?.id) setSalonId(result.id);
      queryClient.invalidateQueries({ queryKey: ["salon-info"] });
      // Invalidate branches so the BranchSelector everywhere picks up the new name
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      toast({
        title: "Thành công",
        description: "Đã cập nhật thông tin cửa hàng",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể cập nhật thông tin",
        variant: "destructive",
      });
    },
  });

  // Create branch mutation
  const createBranchMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, string | null> = { name: branchForm.name.trim() };
      if (branchForm.address.trim()) payload.address = branchForm.address.trim();
      if (branchForm.phone.trim()) payload.phone = branchForm.phone.trim();
      if (branchForm.email.trim()) payload.email = branchForm.email.trim();
      const res = await fetch("/api/supabase/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to create branch");
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      setAddBranchOpen(false);
      setBranchForm({ name: "", address: "", phone: "", email: "" });
      toast({
        title: "Thành công",
        description: "Đã tạo cửa hàng mới",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể tạo cửa hàng",
        variant: "destructive",
      });
    },
  });

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Convert to base64 for storage (simple approach — could use Supabase Storage in production)
    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({ ...prev, logo: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast({
        title: "Thiếu thông tin",
        description: "Vui lòng nhập tên salon",
        variant: "destructive",
      });
      return;
    }
    saveMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        Đang tải...
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Thông tin Salon</h1>
        <Button
          type="button"
          className="bg-emerald-600 hover:bg-emerald-700"
          onClick={() => setAddBranchOpen(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Thêm cửa hàng
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
        {/* Logo section */}
        <div className="flex items-start gap-6 pb-6 border-b">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 overflow-hidden">
            {form.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.logo} alt="Logo" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs text-gray-400 text-center px-2">
                Chưa có logo
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="default"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => document.getElementById("logo-upload")?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              Tải ảnh lên
            </Button>
            <input
              id="logo-upload"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoUpload}
            />
            <p className="text-xs text-gray-500">
              Hỗ trợ các định dạng ảnh (.PNG JPG JPEG) — chụp hoặc chọn ảnh trên cả máy tính và điện thoại
            </p>
          </div>
        </div>

        {/* Form fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Tên Salon */}
          <div className="space-y-2">
            <Label htmlFor="name">
              <span className="text-red-500">*</span> Tên Salon
            </Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Level 1 Men's Hair Studio"
              required
            />
          </div>

          {/* Tên chi nhánh */}
          <div className="space-y-2">
            <Label htmlFor="branch_name">Tên chi nhánh</Label>
            <Input
              id="branch_name"
              value={form.branch_name}
              onChange={(e) => setForm({ ...form, branch_name: e.target.value })}
              placeholder="Chi nhánh chính"
            />
          </div>

          {/* Địa chỉ */}
          <div className="space-y-2">
            <Label htmlFor="address">
              <span className="text-red-500">*</span> Địa chỉ
            </Label>
            <Input
              id="address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="23 ngõ Hòa Bình 1, Minh Khai, HBT, HN"
              required
            />
          </div>

          {/* Số điện thoại */}
          <div className="space-y-2">
            <Label htmlFor="phone">
              <span className="text-red-500">*</span> Số điện thoại
            </Label>
            <Input
              id="phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="CN MK: 0949669420, Hotline CN VB: 0989100886"
              required
            />
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">
              <span className="text-red-500">*</span> Email
            </Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="lv1.400.c3.ttt@gmail.com"
              required
            />
          </div>

          {/* Website */}
          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              placeholder="https://"
            />
          </div>

          {/* Fanpage */}
          <div className="space-y-2">
            <Label htmlFor="fanpage">Fanpage</Label>
            <Input
              id="fanpage"
              value={form.fanpage}
              onChange={(e) => setForm({ ...form, fanpage: e.target.value })}
              placeholder="Nhập url fanpage"
            />
          </div>

          {/* Giờ mở cửa */}
          <div className="space-y-2">
            <Label htmlFor="open_time">Giờ mở cửa</Label>
            <div className="relative">
              <Input
                id="open_time"
                type="time"
                value={form.open_time}
                onChange={(e) => setForm({ ...form, open_time: e.target.value })}
                className="pr-10"
              />
              <Clock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Giờ đóng cửa */}
          <div className="space-y-2">
            <Label htmlFor="close_time">Giờ đóng cửa</Label>
            <div className="relative">
              <Input
                id="close_time"
                type="time"
                value={form.close_time}
                onChange={(e) => setForm({ ...form, close_time: e.target.value })}
                className="pr-10"
              />
              <Clock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Submit button */}
        <div className="flex justify-start">
          <Button
            type="submit"
            disabled={saveMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 px-8"
          >
            {saveMutation.isPending ? "Đang lưu..." : "Cập nhật"}
          </Button>
        </div>
      </form>

      {/* Add Branch Dialog */}
      <AddBranchDialog
        open={addBranchOpen}
        onOpenChange={(v) => {
          setAddBranchOpen(v);
          if (!v) setBranchForm({ name: "", address: "", phone: "", email: "" });
        }}
        form={branchForm}
        onFormChange={setBranchForm}
        onSubmit={() => createBranchMutation.mutate()}
        isPending={createBranchMutation.isPending}
      />
    </div>
  );
}

// ============================================
// Add Branch Dialog
// ============================================
interface AddBranchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: { name: string; address: string; phone: string; email: string };
  onFormChange: (form: { name: string; address: string; phone: string; email: string }) => void;
  onSubmit: () => void;
  isPending: boolean;
}

function AddBranchDialog({ open, onOpenChange, form, onFormChange, onSubmit, isPending }: AddBranchDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Thêm cửa hàng mới</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.name.trim()) return;
            onSubmit();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="new-branch-name">
              <span className="text-red-500">*</span> Tên chi nhánh
            </Label>
            <Input
              id="new-branch-name"
              value={form.name}
              onChange={(e) => onFormChange({ ...form, name: e.target.value })}
              placeholder="VD: Level 2 Quang Trung"
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-branch-address">Địa chỉ</Label>
            <Input
              id="new-branch-address"
              value={form.address}
              onChange={(e) => onFormChange({ ...form, address: e.target.value })}
              placeholder="Nhập địa chỉ"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="new-branch-phone">Số điện thoại</Label>
              <Input
                id="new-branch-phone"
                value={form.phone}
                onChange={(e) => onFormChange({ ...form, phone: e.target.value })}
                placeholder="Số điện thoại"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-branch-email">Email</Label>
              <Input
                id="new-branch-email"
                type="email"
                value={form.email}
                onChange={(e) => onFormChange({ ...form, email: e.target.value })}
                placeholder="Email"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={isPending || !form.name.trim()}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {isPending ? "Đang lưu..." : "Thêm"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
