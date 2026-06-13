import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export default function PageHeader({
  title,
  description,
  meta,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 border-b border-[var(--border-dim)] py-6 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="product-page-title text-[var(--text-primary)]">{title}</h1>
          {meta ? <div className="shrink-0">{meta}</div> : null}
        </div>
        {description ? (
          <p className="text-sm text-[var(--text-secondary)]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
