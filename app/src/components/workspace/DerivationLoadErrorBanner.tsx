"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DerivationLoadErrorBannerProps {
  kind: string;
  onRetry?: () => void;
}

export function DerivationLoadErrorBanner({ kind, onRetry }: DerivationLoadErrorBannerProps) {
  const te = useTranslations("campaign.errors");
  const title = te.has(`${kind}.title`) ? te(`${kind}.title`) : te("unknown.title");
  const description = te.has(`${kind}.description`) ? te(`${kind}.description`) : te("unknown.description");

  return (
    <div
      className={cn(
        "rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3",
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
      )}
      role="alert"
    >
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">{description}</p>
      </div>
      {onRetry ? (
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          {te("retry")}
        </Button>
      ) : null}
    </div>
  );
}
