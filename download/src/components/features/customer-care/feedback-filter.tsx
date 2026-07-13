"use client";

import { Star } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FeedbackFilterProps {
  ratingFilter: string;
  onRatingChange: (value: string) => void;
}

export function FeedbackFilter({ ratingFilter, onRatingChange }: FeedbackFilterProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-500">Đánh giá:</span>
      <Select value={ratingFilter} onValueChange={onRatingChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Tất cả" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả</SelectItem>
          <SelectItem value="5">
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              <span>5 sao</span>
            </div>
          </SelectItem>
          <SelectItem value="4">
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              <span>4 sao</span>
            </div>
          </SelectItem>
          <SelectItem value="3">
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              <span>3 sao</span>
            </div>
          </SelectItem>
          <SelectItem value="2">
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              <span>2 sao</span>
            </div>
          </SelectItem>
          <SelectItem value="1">
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              <span>1 sao</span>
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}