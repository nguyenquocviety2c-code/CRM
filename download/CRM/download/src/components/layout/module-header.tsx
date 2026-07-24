"use client";

import { BranchSelector } from "@/components/layout/branch-selector";

interface ModuleHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * Standard module header with title + branch selector.
 * Used at the top of every module page.
 */
export function ModuleHeader({ title, subtitle, actions, children }: ModuleHeaderProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{title}</h1>
          {subtitle && (
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {actions}
          <BranchSelector />
        </div>
      </div>
      {children}
    </div>
  );
}
