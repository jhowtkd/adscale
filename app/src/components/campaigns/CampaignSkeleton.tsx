"use client";

import { Skeleton } from "@/components/ui/skeleton";

export default function CampaignSkeleton() {
  return (
    <div className="max-w-[1100px] mx-auto pb-20 space-y-6">
      <h1 className="sr-only">Campanha</h1>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="size-9" />
        </div>
      </div>
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-[400px] w-full rounded-xl" />
      <div className="flex justify-between">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  );
}
