import { InlineSpinner } from "@/components/shared/page-skeleton";
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <InlineSpinner label="Đang tải..." />
    </div>
  );
}
