import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion"

interface SkeletonProps extends React.ComponentProps<"div"> {
  shimmer?: boolean
}

function Skeleton({ className, shimmer = true, ...props }: SkeletonProps) {
  const reducedMotion = useReducedMotion()

  if (shimmer && !reducedMotion) {
    return (
      <div
        data-slot="skeleton"
        className={cn(
          "relative overflow-hidden rounded-[var(--radius-panel)] bg-[var(--surface-inset)]",
          className
        )}
        {...props}
      >
        <div
          className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-[var(--text-muted)]/10 to-transparent"
          aria-hidden="true"
        />
      </div>
    )
  }

  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-pulse rounded-[var(--radius-panel)] bg-[var(--surface-inset)] motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
