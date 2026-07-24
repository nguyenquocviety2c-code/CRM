/**
 * Reusable skeleton loaders shown instantly by App Router's `loading.tsx`
 * while a route segment is compiling (dev) or fetching data. Without these,
 * the previous page stays frozen during navigation, which feels laggy.
 */
import { cn } from "@/lib/utils";

export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-gray-200/80",
        className
      )}
    />
  );
}

/** Full-page skeleton matching the typical module layout: title bar + cards. */
export function PageSkeleton() {
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-4">
      {/* Title row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SkeletonBlock className="h-8 w-40" />
          <SkeletonBlock className="h-7 w-36" />
        </div>
        <div className="flex items-center gap-3">
          <SkeletonBlock className="h-8 w-40" />
          <SkeletonBlock className="h-8 w-32" />
        </div>
      </div>

      {/* Content cards */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        <SkeletonBlock className="h-full w-[68%] rounded-lg" />
        <SkeletonBlock className="h-full w-[32%] rounded-lg" />
      </div>
    </div>
  );
}

/** Skeleton for table-heavy pages (customers, invoices, lists). */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <SkeletonBlock className="h-8 w-56" />
        <SkeletonBlock className="h-8 w-32" />
      </div>
      {/* Table header */}
      <div className="rounded-lg border bg-white">
        <div className="flex gap-4 border-b p-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-4 flex-1" />
          ))}
        </div>
        {/* Table rows */}
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4 border-b p-3 last:border-0">
            {Array.from({ length: 6 }).map((_, j) => (
              <SkeletonBlock key={j} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Centered spinner for small inline loading states. */
export function InlineSpinner({ label }: { label?: string }) {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-gray-400">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-emerald-500" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}
