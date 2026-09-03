import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsTabSkeleton() {
  return (
    <div className="max-w-[720px] animate-pulse space-y-5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}
