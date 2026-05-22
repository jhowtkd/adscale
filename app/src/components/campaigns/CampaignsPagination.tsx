"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslations } from "next-intl";

interface CampaignsPaginationProps {
  startIndex: number;
  endIndex: number;
  totalCount: number;
  pageNumbers: (number | "ellipsis")[];
  visibleCurrentPage: number;
  totalPages: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (value: number) => void;
}

export default function CampaignsPagination({
  startIndex,
  endIndex,
  totalCount,
  pageNumbers,
  visibleCurrentPage,
  totalPages,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
}: CampaignsPaginationProps) {
  const tc = useTranslations("common");

  return (
    <div
      className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 animate-fade-in"
      style={{ animationDelay: "200ms" }}
    >
      <p className="text-sm text-[var(--text-muted)]">
        {tc("showingResults", { start: startIndex, end: endIndex, total: totalCount })}
      </p>

      <div className="flex items-center gap-2">
        {/* Prev */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(1, visibleCurrentPage - 1))}
          disabled={visibleCurrentPage === 1}
          className="h-8 px-2 border-[var(--border-dim)] text-[var(--text-secondary)] disabled:opacity-30"
        >
          <ChevronLeft size={16} />
        </Button>

        {/* Page Numbers */}
        {pageNumbers.map((page, i) =>
          page === "ellipsis" ? (
            <span key={`ellipsis-${i}`} className="text-[var(--text-muted)] px-1">
              ...
            </span>
          ) : (
            <Button
              key={page}
              variant={visibleCurrentPage === page ? "default" : "outline"}
              size="sm"
              onClick={() => onPageChange(page)}
              className={cn(
                "h-8 w-8 p-0 text-xs font-medium",
                visibleCurrentPage === page
                  ? "bg-[var(--accent-mint)] text-white hover:bg-[var(--accent-mint-light)] border-transparent"
                  : "border-[var(--border-dim)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)]"
              )}
            >
              {page}
            </Button>
          )
        )}

        {/* Next */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages, visibleCurrentPage + 1))}
          disabled={visibleCurrentPage === totalPages}
          className="h-8 px-2 border-[var(--border-dim)] text-[var(--text-secondary)] disabled:opacity-30"
        >
          <ChevronRight size={16} />
        </Button>

        {/* Items per page */}
        <Select
          value={String(itemsPerPage)}
          onValueChange={(v) => onItemsPerPageChange(Number(v))}
        >
          <SelectTrigger className="h-8 w-[70px] ml-2 bg-[var(--surface-raised)] border-[var(--border-dim)] text-[var(--text-primary)] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[var(--surface-raised)] border-[var(--border-dim)]">
            <SelectItem value="10" className="text-[var(--text-primary)] text-xs">10</SelectItem>
            <SelectItem value="25" className="text-[var(--text-primary)] text-xs">25</SelectItem>
            <SelectItem value="50" className="text-[var(--text-primary)] text-xs">50</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
