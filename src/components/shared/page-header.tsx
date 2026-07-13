import { cn } from "@/lib/utils";
import { BranchSelector } from "@/components/layout/branch-selector";

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
  /** Set to false to hide the branch selector (e.g., on settings pages where branch is not relevant) */
  showBranch?: boolean;
}

export function PageHeader({
  title,
  description,
  children,
  className,
  showBranch = true,
}: PageHeaderProps) {
  return (
    <div className={cn("mb-6 flex items-center justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-gray-900 truncate">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {children}
        {showBranch && <BranchSelector />}
      </div>
    </div>
  );
}
