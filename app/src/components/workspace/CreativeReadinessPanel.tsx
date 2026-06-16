"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { AlertCircle, ChevronDown, Loader2, RefreshCw, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  usePreflightScore,
  useAnalyzePreflight,
  useReadinessOverride,
} from "@/lib/hooks/use-preflight";
import { useRecordBetaEvent } from "@/lib/hooks/use-record-beta-event";
import { useMissionInsightOptional } from "@/components/mission-insights/MissionInsightProvider";
import type { ReadinessDimensionId, ReadinessStatus } from "@/server/ai/creative-readiness";

interface CreativeReadinessPanelProps {
  campaignId: string;
  assetId: string | null | undefined;
  className?: string;
  onOverride?: () => void;
}

const DIMENSION_ORDER: ReadinessDimensionId[] = [
  "offerClarity",
  "textLegibility",
  "visualHierarchy",
  "ctaProminence",
  "brandFit",
  "platformFit",
];

const DIMENSION_IDS = new Set<string>(DIMENSION_ORDER);

function parseIssueText(
  text: string,
  t: ReturnType<typeof useTranslations<"readiness">>
): { title: string; detail: string; collapsible: boolean } {
  const dimensionMatch = text.match(/^([a-zA-Z]+):\s*([\s\S]+)$/);
  if (dimensionMatch) {
    const [, rawId, detail] = dimensionMatch;
    const dimensionKey = `dimensions.${rawId}` as `dimensions.${ReadinessDimensionId}`;
    if (DIMENSION_IDS.has(rawId)) {
      return {
        title: t(dimensionKey),
        detail,
        collapsible: detail.trim().length > 0,
      };
    }
  }

  const firstSentence = text.match(/^(.+?[.!?])(?:\s|$)/)?.[1];
  if (firstSentence && firstSentence.length < text.length && firstSentence.length <= 120) {
    return {
      title: firstSentence,
      detail: text,
      collapsible: true,
    };
  }

  if (text.length > 96) {
    return {
      title: `${text.slice(0, 93).trimEnd()}…`,
      detail: text,
      collapsible: true,
    };
  }

  return { title: text, detail: text, collapsible: false };
}

function ReadinessIssueList({
  items,
  variant,
  t,
}: {
  items: string[];
  variant: "blocking" | "suggestion";
  t: ReturnType<typeof useTranslations<"readiness">>;
}) {
  if (items.length === 0) return null;

  const borderClass =
    variant === "blocking"
      ? "border-[var(--accent-rose)]/25 bg-[var(--accent-rose)]/5"
      : "border-[var(--border-dim)] bg-[var(--surface-raised)]/40";

  return (
    <ul className="mt-2 space-y-2">
      {items.map((item, index) => {
        const { title, detail, collapsible } = parseIssueText(item, t);

        if (!collapsible) {
          return (
            <li
              key={`${variant}-${index}-${item}`}
              className={cn("rounded-lg border px-3 py-2 text-xs text-[var(--text-primary)]", borderClass)}
            >
              {item}
            </li>
          );
        }

        return (
          <li key={`${variant}-${index}-${item}`}>
            <details
              open={variant === "blocking" && index === 0}
              className={cn("group overflow-hidden rounded-lg border", borderClass)}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-xs font-medium text-[var(--text-primary)] [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 text-left leading-snug">{title}</span>
                <ChevronDown
                  size={14}
                  aria-hidden="true"
                  className="shrink-0 text-[var(--text-muted)] transition-transform duration-200 group-open:rotate-180"
                />
              </summary>
              <p className="border-t border-[var(--border-dim)]/80 px-3 py-2.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                {detail}
              </p>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

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
  onOverride,
}: CreativeReadinessPanelProps) {
  const t = useTranslations("readiness");
  const missionInsight = useMissionInsightOptional();
  const { data, isLoading, isError } = usePreflightScore({ campaignId, assetId });
  const analyzePreflight = useAnalyzePreflight();
  const readinessOverride = useReadinessOverride();
  const { recordEvent } = useRecordBetaEvent(campaignId);
  const completedRef = useRef(false);

  const STAGE_PROPS = { stage: "readiness", missionKey: "readiness" } as const;

  useEffect(() => {
    if (!assetId) return;
    completedRef.current = false;
    recordEvent("cockpit_stage_entered", STAGE_PROPS);
    return () => {
      if (!completedRef.current) {
        recordEvent("cockpit_stage_abandoned", STAGE_PROPS);
      }
    };
  }, [assetId, recordEvent]);

  useEffect(() => {
    if (!assetId || !data?.readiness) return;
    const status = data.readiness.status;
    if (
      data.status === "completed" &&
      (status === "ready" || status === "needs_attention") &&
      !completedRef.current
    ) {
      completedRef.current = true;
      recordEvent("cockpit_stage_completed", STAGE_PROPS);
    }
  }, [assetId, data, recordEvent]);

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

  const handleOverride = () => {
    if (!assetId) return;
    void readinessOverride
      .mutateAsync({ campaignId, assetId })
      .then(() => {
        completedRef.current = true;
        recordEvent("cockpit_stage_completed", STAGE_PROPS);
        onOverride?.();
      })
      .catch(() => undefined);
  };

  const handleRerun = () => {
    void analyzePreflight.mutateAsync({ campaignId, assetId: assetId!, force: true }).then((result) => {
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
                <span className="ml-1.5 text-[var(--text-muted)]">({readiness.blockingIssues.length})</span>
              </p>
              <ReadinessIssueList items={readiness.blockingIssues} variant="blocking" t={t} />
              {(readiness.status === "blocked" || readiness.blockingIssues.length > 0) && (
                <button
                  type="button"
                  onClick={handleOverride}
                  disabled={readinessOverride.isPending}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[var(--accent-amber)]/40 bg-[var(--accent-amber)]/10 px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent-amber)]"
                >
                  {t("overrideFalsePositive")}
                </button>
              )}
            </div>
          )}

          {readiness.suggestions.length > 0 && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                {t("suggestions")}
                <span className="ml-1.5">({readiness.suggestions.length})</span>
              </p>
              <ReadinessIssueList items={readiness.suggestions} variant="suggestion" t={t} />
            </div>
          )}

          <p className="text-[11px] text-[var(--text-muted)]">{t("disclaimer")}</p>
        </div>
      )}
    </section>
  );
}
