"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Package,
  List,
  Warehouse,
  Scissors,
  Gift,
} from "lucide-react";

interface SidebarItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface SidebarGroup {
  title: string;
  items: SidebarItem[];
}

const sidebarGroups: SidebarGroup[] = [
  {
    title: "Sản phẩm",
    items: [
      {
        label: "Danh sách sản phẩm",
        href: "/product-service/product",
        icon: <List className="h-4 w-4" />,
      },
      {
        label: "Kho hàng",
        href: "/product-service/warehouse",
        icon: <Warehouse className="h-4 w-4" />,
      },
    ],
  },
  {
    title: "Dịch vụ",
    items: [
      {
        label: "Danh sách dịch vụ",
        href: "/product-service/service",
        icon: <Scissors className="h-4 w-4" />,
      },
    ],
  },
  {
    title: "Gói dịch vụ",
    items: [
      {
        label: "Danh sách gói dịch vụ",
        href: "/product-service/package",
        icon: <Gift className="h-4 w-4" />,
      },
      {
        label: "Nhóm gói dịch vụ",
        href: "/product-service/package-categories",
        icon: <Package className="h-4 w-4" />,
      },
    ],
  },
];

export function ProductServiceSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const handleHover = (href: string) => router.prefetch(href);

  return (
    <aside className="w-52 min-h-[calc(100vh-4rem)] border-r bg-white -ml-1">
      <div className="p-4 pl-2">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Package className="h-5 w-5" />
          Sản phẩm & Dịch vụ
        </h2>
        <nav className="space-y-4">
          {sidebarGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">
                {group.title}
              </h3>
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onMouseEnter={() => handleHover(item.href)}
                        onFocus={() => handleHover(item.href)}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                          isActive
                            ? "bg-emerald-50 text-emerald-700 font-medium"
                            : "text-gray-700 hover:bg-gray-100"
                        )}
                      >
                        {item.icon}
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}