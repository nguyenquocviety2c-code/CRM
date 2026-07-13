import { FolderOpen } from "lucide-react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  text?: string;
}

export function EmptyState({ icon, text = "Trống" }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      {icon || <FolderOpen className="h-12 w-12 text-gray-300" />}
      <p className="mt-4 text-sm text-gray-400">{text}</p>
    </div>
  );
}