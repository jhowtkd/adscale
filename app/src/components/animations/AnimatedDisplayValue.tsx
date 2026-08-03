import { cn } from "@/lib/utils";

export function AnimatedDisplayValue({
  value,
  className,
}: {
  value: number | string;
  className?: string;
}) {
  const display = String(value);

  return (
    <span
      data-testid="motion-value"
      className={cn("inline-grid tabular-nums", className)}
    >
      <span
        key={display}
        data-motion-value={display}
        className="motion-feedback-enter [grid-area:1/1]"
      >
        {display}
      </span>
    </span>
  );
}
