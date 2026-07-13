import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  children: React.ReactNode;
  className?: string;
}

const statusStyles: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  inactive: "bg-gray-100 text-gray-800",
  paid: "bg-green-100 text-green-800",
  unpaid: "bg-red-100 text-red-800",
  partial: "bg-yellow-100 text-yellow-800",
  pending: "bg-blue-100 text-blue-800",
  confirmed: "bg-green-100 text-green-800",
  done: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-800",
  onTime: "bg-green-100 text-green-800",
  late: "bg-yellow-100 text-yellow-800",
  early: "bg-orange-100 text-orange-800",
  missing: "bg-gray-100 text-gray-800",
  absent: "bg-red-100 text-red-800",
};

export function StatusBadge({ status, children, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        statusStyles[status] || "bg-gray-100 text-gray-800",
        className
      )}
    >
      {children}
    </span>
  );
}