"use client";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export default function TableSkeleton() {
  return (
    <div className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border-dim)] bg-[var(--surface-raised)]">
        <div className="flex gap-4">
          <Skeleton className="size-4" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24 ml-auto" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-8" />
        </div>
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "p-4 border-b border-[var(--border-dim)] flex items-center gap-4",
            i % 2 === 1 && "bg-[rgba(0,0,0,0.02)]"
          )}
        >
          <Skeleton className="size-4 flex-shrink-0" />
          <div className="flex-1 min-w-[200px] space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="ml-auto flex gap-2">
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-8" />
        </div>
      ))}
    </div>
  );
}
