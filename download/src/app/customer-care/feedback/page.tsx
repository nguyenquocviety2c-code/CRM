"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FeedbackList, FeedbackItem } from "@/components/features/customer-care/feedback-list";
import { FeedbackFilter } from "@/components/features/customer-care/feedback-filter";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";

export default function CustomerFeedbackPage() {
  const [ratingFilter, setRatingFilter] = useState("all");
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useQuery<{
    feedbacks: FeedbackItem[];
    total: number;
    page: number;
    limit: number;
  }>({
    queryKey: queryKeys.customerCare.feedback.list({
      rating: ratingFilter,
      page,
    }),
    queryFn: async () => {
      const params = new URLSearchParams({
        rating: ratingFilter,
        page: String(page),
        limit: String(limit),
      });
      const res = await fetch(`/api/supabase/customer-feedback?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to fetch feedback");
      }
      return json.data || { feedbacks: [], total: 0, page, limit };
    },
    placeholderData: {
      feedbacks: [],
      total: 0,
      page: 1,
      limit: 20,
    },
  });

  const feedbacks = data?.feedbacks || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900">Phản hồi dịch vụ</h1>
      </div>

      {/* Filter */}
      <div className="px-6 pb-4">
        <FeedbackFilter
          ratingFilter={ratingFilter}
          onRatingChange={setRatingFilter}
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6">
        <div className="rounded-lg border bg-white">
          <FeedbackList data={feedbacks} isLoading={isLoading} />
        </div>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="mt-4 flex items-center justify-between px-6 py-4">
          <p className="text-sm text-gray-500">
            Hiển thị {(page - 1) * limit + 1}-
            {Math.min(page * limit, total)} trên tổng {total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
            >
              Sau
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}