"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { SubSidebar } from "./sub-sidebar";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuthStore();
  const isCskhModule = pathname?.startsWith("/customer-care");
  const isProductServiceModule = pathname?.startsWith("/product-service");
  const isReportModule = pathname?.startsWith("/report");
  const hasSubSidebar = isCskhModule || isProductServiceModule;
  // Standalone routes (customer-facing / auth) — no admin sidebar/subsidebar,
  // no left padding. Used by the "Đặt lịch" kiosk page, the login page, and
  // the root "/" (which server-redirects to /dat-lich but may briefly render
  // the Shell during hydration).
  const isStandalone =
    pathname === "/" ||
    pathname?.startsWith("/dat-lich") ||
    pathname?.startsWith("/login");

  // Auth guard: admin routes (everything except /dat-lich and /login) require
  // a logged-in staff. Once the initial /api/auth/me fetch resolves, if the
  // user is null, redirect to /login. The /dat-lich kiosk and /login itself
  // stay public (customers book without an account).
  useEffect(() => {
    if (loading) return; // still hydrating the session
    if (isStandalone) return; // public routes
    if (!user) {
      router.replace("/login");
    }
  }, [loading, isStandalone, user, router]);

  // While the session is hydrating on an admin route, show a loader instead of
  // flashing the admin sidebar (which would briefly appear before the redirect
  // to /login when not authenticated).
  const showLoader = !isStandalone && loading;

  return (
    <div className="flex min-h-screen bg-gray-50">
      {!isStandalone && !showLoader && <Sidebar />}
      {!isStandalone && !showLoader && <SubSidebar />}
      <main
        className={cn(
          "flex-1 min-w-0 overflow-x-hidden",
          isStandalone || showLoader
            ? "p-0"
            : cn(isReportModule ? "p-4" : "p-6", hasSubSidebar ? "pl-[25rem]" : "pl-48")
        )}
      >
        {showLoader ? (
          <div className="flex h-screen items-center justify-center text-gray-400">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-emerald-500" />
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}