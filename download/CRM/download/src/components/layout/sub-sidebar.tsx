"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Users, MessageSquare, Gift, Package, Warehouse, Scissors, Boxes, FolderTree, Wallet, Receipt, FileMinus, AlertCircle } from "lucide-react";

const cskhMenuItems = [
  { icon: Users, label: "Tập khách hàng", href: "/customer-care" },
  { icon: MessageSquare, label: "Phản hồi dịch vụ", href: "/customer-care/feedback" },
  { icon: Gift, label: "Chương trình khuyến mãi", href: "/customer-care/incentives" },
];

const productServiceMenuItems = [
  { icon: Package, label: "Danh sách sản phẩm", href: "/product-service/product" },
  { icon: Warehouse, label: "Kho hàng", href: "/product-service/warehouse" },
  { icon: Scissors, label: "Danh sách dịch vụ", href: "/product-service/service" },
  { icon: Boxes, label: "Danh sách gói dịch vụ", href: "/product-service/package" },
  { icon: FolderTree, label: "Nhóm gói dịch vụ", href: "/product-service/package-categories" },
];

const revExpMenuItems = [
  { icon: Wallet, label: "Sổ quỹ tiền mặt", href: "/rev-exp" },
  { icon: Receipt, label: "Phiếu thu", href: "/rev-exp/revenue" },
  { icon: FileMinus, label: "Phiếu chi", href: "/rev-exp/expenditure" },
  { icon: AlertCircle, label: "Công nợ", href: "/rev-exp/debt" },
];

export function SubSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  // Prefetch sub-routes on hover so they compile before the click.
  const handleHover = (href: string) => router.prefetch(href);

  // Show sub-sidebar when in customer-care, product-service, or rev-exp module
  const isCskhModule = pathname?.startsWith("/customer-care");
  const isProductServiceModule = pathname?.startsWith("/product-service");
  const isRevExpModule = pathname?.startsWith("/rev-exp");

  if (!isCskhModule && !isProductServiceModule && !isRevExpModule) {
    return null;
  }

  let menuItems;
  let moduleTitle;
  if (isCskhModule) {
    menuItems = cskhMenuItems;
    moduleTitle = "CSKH";
  } else if (isProductServiceModule) {
    menuItems = productServiceMenuItems;
    moduleTitle = "Sản phẩm & Dịch vụ";
  } else {
    menuItems = revExpMenuItems;
    moduleTitle = "THU CHI";
  }

  return (
    <aside className="fixed left-48 top-0 z-30 h-screen w-52 border-r border-gray-200 bg-white">
      {/* Module Header */}
      <div className="flex h-16 items-center border-b border-gray-200 px-4">
        <h2 className="text-lg font-semibold text-gray-900">{moduleTitle}</h2>
      </div>

      {/* Sub-menu */}
      <nav className="mt-4 space-y-1 px-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/customer-care" && item.href !== "/rev-exp" && pathname?.startsWith(item.href + "/"));
          return (
            <Link
              key={item.href}
              href={item.href}
              onMouseEnter={() => handleHover(item.href)}
              onFocus={() => handleHover(item.href)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="flex-1">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}