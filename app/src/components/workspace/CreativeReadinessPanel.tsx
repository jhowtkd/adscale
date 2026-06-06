"use client";

import { cn } from "@/lib/utils";
import { AlertCircle, Loader2, RefreshCw, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePreflightScore, useAnalyzePreflight } from "@/lib/hooks/use-preflight";
import { useMissionInsightOptional } from "@/components/mission-insights/MissionInsightProvider";
import type { ReadinessDimensionId, ReadinessStatus } from "@/server/ai/creative-readiness";

interface CreativeReadinessPanelProps {
  campaignId: string;
  assetId: string | null | undefined;
  className?: string;
}

const DIMENSION_ORDER: ReadinessDimensionId[] = [
  "offerClarity",
  "textLegibility",
  "visualHierarchy",
  "ctaProminence",
  "brandFit",
  "platformFit",
];

function statusIcon(status: ReadinessStatus | "pending" | "analyzing" | "failed" | "missing") {
  switch (status) {
    case "ready":
      return <ShieldCheck size={18} className="text-[var(--accent-green)]" />;
    case "needs_attention":
      return <ShieldAlert size={18} className="text-[var(--accent-amber)]" />;
    case "blocked":
      return <ShieldX size={18} className="text-[var(--accent-rose)]" />;
    case "failed":
      return <AlertCircle size={18} className="text-[var(--accent-rose)]" />;
    case "analyzing":
    case "pending":
      return <Loader2 size={18} className="animate-spin text-[var(--text-muted)]" />;
    default:
      return null;
  }
}

export default function CreativeReadinessPanel({
  campaignId,
  assetId,
  className,
}: CreativeReadinessPanelProps) {
  const t = useTranslations("readiness");
  const missionInsight = useMissionInsightOptional();
  const { data, isLoading, isError } = usePreflightScore({ campaignId, assetId });
  const analyzePreflight = useAnalyzePreflight();

  if (!assetId) {
    return (
      <section
        className={cn(
          "rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-4",
          className
        )}
        aria-label={t("title")}
      >
        <p className="text-sm font-medium text-[var(--text-primary)]">{t("title")}</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">{t("missingCreative")}</p>
      </section>
    );
  }

  const readiness = data?.readiness;
  const status = data?.status ?? (isLoading ? "pending" : "pending");
  const displayStatus =
    analyzePreflight.isPending || status === "analyzing"
      ? "analyzing"
      : status === "failed" || isError
        ? "failed"
        : readiness?.status ?? "pending";

  const handleRerun = () => {
    void analyzePreflight.mutateAsync({ campaignId, assetId, force: true }).then((result) => {
      if (result.readiness?.status && missionInsight) {
        missionInsight.maybePromptMissionInsight({
          moment: "readiness_first",
          missionKey: "readiness",
          campaignId,
          diagnosticContext: {
            readinessStatus: result.readiness.status,
            operation: "readiness_run",
          },
        });
      }
    });
  };

  return (
    <section
      className={cn(
        "rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-4",
        className
      )}
      aria-label={t("title")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{t("title")}</p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t("subtitle")}</p>
        </div>
        {statusIcon(displayStatus)}
      </div>

      {(displayStatus === "analyzing" || (isLoading && !readiness)) && (
        <p className="mt-4 text-xs text-[var(--text-secondary)]">{t("analyzing")}</p>
      )}

      {displayStatus === "failed" && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-[var(--accent-rose)]">{t("failed")}</p>
          <button
            type="button"
            onClick={handleRerun}
            disabled={analyzePreflight.isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-dim)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--border-medium)]"
          >
            <RefreshCw size={12} />
            {t("rerun")}
          </button>
        </div>
      )}

      {readiness && displayStatus !== "analyzing" && displayStatus !== "failed" && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--ghost)]">
                {t(`status.${readiness.status}`)}
              </p>
              <p className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
                {readiness.overallScore}
              </p>
            </div>
            <button
              type="button"
              onClick={handleRerun}
              disabled={analyzePreflight.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-dim)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--border-medium)]"
            >
              <RefreshCw size={12} className={analyzePreflight.isPending ? "animate-spin" : ""} />
              {t("rerun")}
            </button>
          </div>

          <ul className="space-y-2">
            {DIMENSION_ORDER.map((dimensionId) => {
              const dimension = readiness.dimensions.find((d) => d.id === dimensionId);
              if (!dimension) return null;
              return (
                <li
                  key={dimensionId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-dim)] px-3 py-2"
                >
                  <span className="text-xs text-[var(--text-secondary)]">
                    {t(`dimensions.${dimensionId}`)}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-[var(--text-primary)]">
                    {dimension.score}
                  </span>
                </li>
              );
            })}
          </ul>

          {readiness.blockingIssues.length > 0 && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--accent-rose)]">
                {t("blockingIssues")}
              </p>
              <ul className="mt-2 space-y-1">
                {readiness.blockingIssues.map((issue) => (
                  <li key={issue} className="text-xs text-[var(--text-primary)]">
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {readiness.suggestions.length > 0 && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                {t("suggestions")}
              </p>
              <ul className="mt-2 space-y-1">
                {readiness.suggestions.map((suggestion) => (
                  <li key={suggestion} className="text-xs text-[var(--text-secondary)]">
                    {suggestion}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] text-[var(--text-muted)]">{t("disclaimer")}</p>
        </div>
      )}
    </section>
  );
}
