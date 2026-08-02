import { cn } from "@/lib/utils";

export function MotionValue({
  value,
  suffix = "",
  className,
}: {
  value: number | string;
  suffix?: string;
  className?: string;
}) {
  const display = `${value}${suffix}`;

  return (
    <span
      data-testid="motion-value"
      data-motion-value={display}
      className={cn("inline-grid tabular-nums", className)}
    >
      <span
        key={display}
        className="motion-value-enter [grid-area:1/1]"
      >
        {display}
      </span>
    </span>
  );
}
