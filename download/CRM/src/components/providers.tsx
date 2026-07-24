"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { TableResizer } from "@/components/table-resizer";
import { NavigationProgress } from "@/components/layout/navigation-progress";
import { useAuthStore } from "@/stores/auth-store";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 5-minute staleTime — the app's data (staff, services, branches,
            // bookings, invoices) rarely changes within a working session, and
            // all mutations already invalidate the affected queries. A longer
            // staleTime means far fewer refetches when switching between
            // modules → faster navigation. Individual queries can override
            // this with their own staleTime when they need fresher data.
            staleTime: 5 * 60 * 1000,
            // Don't refetch when the user switches browser tabs and comes back.
            // The data is already cached (and mutations invalidate as needed),
            // so window-focus refetches just add latency without benefit.
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  // Hydrate the auth store once on mount: fetch the logged-in staff profile
  // from the httpOnly cookie via /api/auth/me. Runs client-side only.
  const fetchUser = useAuthStore((s) => s.fetchUser);
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // Cross-tab auth sync: when another tab updates the persisted auth store
  // (e.g. grants a new permission via the staff-group dialog, which calls
  // refreshSession → set({ user }) → persist writes to localStorage), this
  // tab's storage event listener rehydrates the store from localStorage so
  // the new permissions take effect immediately without a page reload.
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "crm-auth" && e.newValue) {
        // Re-read the persisted user from localStorage into this tab's store.
        useAuthStore.persist.rehydrate();
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <NavigationProgress />
      {children}
      <TableResizer />
    </QueryClientProvider>
  );
}