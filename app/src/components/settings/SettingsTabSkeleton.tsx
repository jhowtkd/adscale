import Panel from "@/components/layout/Panel";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsTabSkeleton() {
  return (
    <Panel padding="md" className="animate-pulse space-y-4">
      <Skeleton className="h-6 w-1/3 bg-[var(--surface-raised)]" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24 bg-[var(--surface-raised)]" />
            <Skeleton className="h-10 w-full bg-[var(--surface-raised)]" />
          </div>
        ))}
      </div>
    </Panel>
  );
}
