"use client";

import { useTranslations } from "next-intl";

type Usage = "content" | "style" | "both";
type Status = "uploaded" | "analyzing" | "ready" | "failed";

type Props = {
  source: {
    id: string;
    name: string;
    origin: "upload" | "template" | "approved_work";
    usage: Usage;
    usageConfirmed: boolean;
    status: Status;
    contentAnalysis: Record<string, unknown> | null;
    styleAnalysis: Record<string, unknown> | null;
  };
  onUsageChange: (usage: Usage) => void;
  onReview: () => void;
  onRetry: () => void;
  onRemove: () => void;
  simple?: boolean;
};

export function CreativeSourceChip({ source, onUsageChange, onReview, onRetry, onRemove, simple = false }: Props) {
  const t = useTranslations("dashboard.home.composer");
  const chips = [
    source.contentAnalysis?.product,
    source.contentAnalysis?.offer,
    source.styleAnalysis?.mood,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  return (
    <article className="rounded-[var(--radius-object)] border border-[var(--border-subtle)] p-3">
      <div className="flex items-center justify-between gap-3">
        <div><strong>{source.name}</strong><div className="text-xs text-[var(--text-muted)]">{t(`sourceOrigin_${source.origin}`)}</div></div>
        <button type="button" onClick={onRemove} aria-label={t("removeSourceAria")}>{t("removeSource")}</button>
      </div>
      {!simple ? <div className="mt-2 flex gap-2" role="group" aria-label={t("sourceUsageAria")}>
        {(["content", "style", "both"] as const).map((usage) => (
          <button key={usage} type="button" aria-pressed={source.usageConfirmed && source.usage === usage} onClick={() => onUsageChange(usage)}>
            {t(`sourceUsage_${usage}`)}
          </button>
        ))}
      </div> : null}
      {!simple && !source.usageConfirmed && <p className="mt-2 text-xs font-medium text-[var(--accent-amber-text)]">{t("sourceUsageRequired")}</p>}
      <p role="status" aria-live="polite" className="mt-2 text-sm">{t(`sourceStatus_${source.status}`)}</p>
      {!simple && chips.length > 0 && (
        <details className="mt-2">
          <summary>{t("extractedData")}</summary>
          <div className="flex flex-wrap gap-1">{chips.map((chip) => <span key={chip}>{chip}</span>)}</div>
        </details>
      )}
      <div className="mt-2 flex gap-2">
        {!simple && source.status === "ready" && <button type="button" onClick={onReview}>{t("reviewData")}</button>}
        {source.status === "failed" && <button type="button" onClick={onRetry}>{t("retrySource")}</button>}
      </div>
    </article>
  );
}
