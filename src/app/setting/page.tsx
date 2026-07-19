"use client";

import dynamic from "next/dynamic";
import {
  Store,
  Users,
  Clock,
  Percent,
  Calendar,
  UserPlus,
  Users2,
  Settings,
} from "lucide-react";
import { useSettingStore, SettingTabs, SettingTab } from "@/stores/setting-store";
import { cn } from "@/lib/utils";
import { StaffSettingsView } from "@/components/features/setting/staff-settings-view";
import { StaffGroupsView } from "@/components/features/setting/staff-groups-view";
import { ShiftSettingsView } from "@/components/features/setting/shift-settings-view";
import { CustomerSourcesView } from "@/components/features/setting/customer-sources-view";
import { BookingChannelsView } from "@/components/features/setting/booking-channels-view";
import { SalonInfoView } from "@/components/features/setting/salon-info-view";
import { BranchSelector } from "@/components/layout/branch-selector";

// Lazy-load the create dialogs — they're only opened on demand (user clicks
// "Thêm" / "Tạo mới"). Loading their code only when first needed keeps the
// Setting module's initial bundle small and the tab loads faster. ssr:false
// because these are client-only interactive dialogs.
const StaffCreateDialog = dynamic(
  () => import("@/components/features/setting/staff-create-dialog").then((m) => m.StaffCreateDialog),
  { ssr: false }
);
const StaffGroupCreateDialog = dynamic(
  () => import("@/components/features/setting/staff-group-create-dialog").then((m) => m.StaffGroupCreateDialog),
  { ssr: false }
);
const ShiftCreateDialog = dynamic(
  () => import("@/components/features/setting/shift-create-dialog").then((m) => m.ShiftCreateDialog),
  { ssr: false }
);
const CustomerSourceCreateDialog = dynamic(
  () => import("@/components/features/setting/customer-source-create-dialog").then((m) => m.CustomerSourceCreateDialog),
  { ssr: false }
);

const tabIcons: Record<SettingTab, React.ComponentType<{ className?: string }>> = {
  "salon-info": Store,
  "staff-settings": Users,
  "work-shift": Clock,
  commission: Percent,
  "booking-channel": Calendar,
  "customer-sources": UserPlus,
  "customer-groups": Users2,
  "booking-settings": Settings,
};

export default function SettingPage() {
  const { activeTab, setActiveTab } = useSettingStore();

  return (
    <div className="flex h-full">
      {/* Sub-sidebar */}
      <div className="w-52 shrink-0 border-r border-gray-200 bg-gray-50">
        <div className="p-4 pl-2">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">CÀI ĐẶT</h2>
          <nav className="space-y-1">
            {SettingTabs.map((tab) => {
              const Icon = tabIcons[tab.id];
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-emerald-600 text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  )}
                >
                  {Icon && <Icon className="h-4 w-4" />}
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 p-6">
        {/* Top header bar with branch selector */}
        <div className="mb-4 flex items-center justify-end">
          <BranchSelector />
        </div>
        {activeTab === "salon-info" ? (
          <SalonInfoView />
        ) : activeTab === "staff-settings" ? (
          <StaffSettingsContent />
        ) : activeTab === "work-shift" ? (
          <ShiftSettingsView />
        ) : activeTab === "customer-sources" ? (
          <CustomerSourcesView />
        ) : activeTab === "booking-channel" ? (
          <BookingChannelsView />
        ) : (
          <EmptyContent label={SettingTabs.find((t) => t.id === activeTab)?.label ?? ""} />
        )}
      </div>

      {/* Dialogs */}
      <StaffCreateDialog />
      <StaffGroupCreateDialog />
      <ShiftCreateDialog />
      <CustomerSourceCreateDialog />
    </div>
  );
}

function StaffSettingsContent() {
  const { staffView } = useSettingStore();
  if (staffView === "groups") return <StaffGroupsView />;
  return <StaffSettingsView />;
}

function EmptyContent({ label }: { label: string }) {
  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-gray-900">{label}</h1>
      <div className="rounded-lg border bg-white p-8 text-center">
        <Settings className="mx-auto h-12 w-12 text-gray-300" />
        <p className="mt-4 text-gray-500">Chưa có cài đặt nào</p>
        <p className="mt-1 text-sm text-gray-400">
          Cài đặt sẽ được hiển thị tại đây
        </p>
      </div>
    </div>
  );
}
