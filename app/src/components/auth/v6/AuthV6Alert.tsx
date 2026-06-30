import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AuthV6ErrorAlert({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-[var(--radius-control)] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger-text)]"
    >
      {children}
    </div>
  );
}

export function AuthV6SuccessAlert({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-control)] border border-[var(--success-border)] bg-[var(--success-bg)] px-3 py-2 text-sm text-[var(--success-text)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
