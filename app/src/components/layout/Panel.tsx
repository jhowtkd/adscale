import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export default function Panel({
  children,
  className,
  padding = "none",
}: {
  children: ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md";
}) {
  const paddingClass =
    padding === "md" ? "p-6" : padding === "sm" ? "p-3" : undefined;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--radius-object)] border border-[var(--border-dim)] bg-[var(--surface-base)]",
        paddingClass,
        className,
      )}
    >
      {children}
    </div>
  );
}
