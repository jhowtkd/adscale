"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass-card rounded-lg p-5">
            <Skeleton className="h-3 w-24 mb-4" />
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-9 w-32" />
          </div>
          <div className="glass-card rounded-xl p-6">
            <Skeleton className="h-[280px] w-full" />
          </div>
        </div>
        
        <div className="space-y-4">
          <Skeleton className="h-6 w-32" />
          <div className="glass-card rounded-xl p-6">
            <Skeleton className="h-[160px] w-full" />
          </div>
          <div className="glass-card rounded-xl p-6">
            <Skeleton className="h-[160px] w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
