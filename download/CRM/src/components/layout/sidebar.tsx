"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import {
  Wallet,
  Calendar,
  Users,
  Headset,
  Package,
  BarChart3,
  FileText,
  Settings,
  LogOut,
} from "lucide-react";

const menuItems = [
  { icon: Wallet, label: "Thu ngân", href: "/cashier", badge: 0 },
  { icon: Calendar, label: "Lịch hẹn", href: "/booking", badge: 0 },
  { icon: Users, label: "Khách hàng", href: "/customers", badge: 0 },
  { icon: Headset, label: "CSKH", href: "/customer-care", badge: 0 },
  { icon: Package, label: "Sản phẩm", href: "/product-service", badge: 0 },
  { icon: BarChart3, label: "Báo cáo", href: "/report", badge: 0 },
  { icon: FileText, label: "Quản lý nhân viên", href: "/worker-manager", badge: 0 },
  { icon: Settings, label: "Cài đặt", href: "/setting", badge: 0 },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  // Display name: prefer the staff's name, fall back to username/email, or
  // "Khách" (guest) when not logged in. The avatar initial is the first letter
  // of the display name.
  const displayName = user?.name || user?.username || user?.email || "Khách";
  const initial = (displayName || "?").charAt(0).toUpperCase();

  // Prefetch a route on hover so Next.js compiles it BEFORE the user clicks.
  // In dev mode <Link> does not auto-prefetch, so this eliminates the 1–2s
  // on-demand compile delay when switching modules.
  const handleHover = (href: string) => {
    router.prefetch(href);
  };

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-48 bg-slate-900 text-white">
      {/* Logo — brand name only (the logo image was removed per request). */}
      <div className="flex h-16 items-center px-3">
        <span
          className="text-sm font-semibold tracking-wide"
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            color: "#2DD4BF",
          }}
        >
          Level 1 Haircare
        </span>
      </div>

      {/* Menu */}
      <nav className="mt-4 space-y-1 px-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onMouseEnter={() => handleHover(item.href)}
              onFocus={() => handleHover(item.href)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-emerald-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.badge > 0 && (
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User + logout */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-slate-800">
        <div className="flex items-center gap-3 px-3 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700 text-sm font-medium">
            {initial}
          </div>
          <span className="flex-1 truncate text-sm font-medium" title={displayName}>
            {displayName}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            title="Đăng xuất"
            aria-label="Đăng xuất"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}