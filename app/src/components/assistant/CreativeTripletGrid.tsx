"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { AssistantGoalPresentation } from "@/lib/assistant/goal";

export interface CreativeTripletGridProps {
  candidates: AssistantGoalPresentation["candidates"];
  expectedRevision: number;
  selectedBaseVersionId?: string | null;
  onSelectBase: (versionId: string, expectedRevision: number) => void;
}

const LEVEL_LABEL_KEY: Record<string, string> = {
  conservative: "conservative",
  balanced: "balanced",
  bold: "bold",
};

/**
 * Neutral three-candidate comparison. Candidates render at equal visual weight
 * in the fixed order conservative → balanced → bold. Labels and actions are
 * identical across cards: no score, recommendation, winner badge, or default
 * selection. The user picks one base; the parent advances the goal.
 */
export default function CreativeTripletGrid({
  candidates,
  expectedRevision,
  selectedBaseVersionId,
  onSelectBase,
}: CreativeTripletGridProps) {
  const t = useTranslations("assistant.goal");

  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      data-testid="assistant-triplet-grid"
    >
      {candidates.map((candidate) => {
        const isSelected = selectedBaseVersionId === candidate.versionId;
        const disabled = candidate.status !== "ready" || !candidate.versionId;
        return (
          <div
            key={candidate.derivationId}
            data-testid={`assistant-triplet-card-${candidate.creativeLevel}`}
            data-creative-level={candidate.creativeLevel}
            className={cn(
              "flex flex-col gap-3 rounded-xl border bg-[var(--surface-raised)] p-3",
              isSelected
                ? "border-[var(--selection-border)]"
                : "border-[var(--border-dim)]"
            )}
          >
            <div className="aspect-square w-full overflow-hidden rounded-lg bg-[var(--surface-inset)]">
              {candidate.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={candidate.previewUrl}
                  alt={t(`level.${LEVEL_LABEL_KEY[candidate.creativeLevel]}`)}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center text-sm text-[var(--text-muted)]"
                  data-testid={`assistant-triplet-placeholder-${candidate.creativeLevel}`}
                >
                  {candidate.status === "failed"
                    ? t("failed")
                    : t("running")}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--text-secondary)]">
                {t(`level.${LEVEL_LABEL_KEY[candidate.creativeLevel]}`)}
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                {candidate.status === "failed"
                  ? t("failed")
                  : candidate.status === "running"
                    ? t("running")
                    : t("ready")}
              </span>
            </div>
            <button
              type="button"
              data-testid={`assistant-triplet-select-${candidate.creativeLevel}`}
              disabled={disabled}
              onClick={() =>
                candidate.versionId && onSelectBase(candidate.versionId, expectedRevision)
              }
              className={cn(
                "w-full rounded-lg px-3 py-2 text-sm font-medium transition",
                disabled
                  ? "cursor-not-allowed bg-[var(--surface-inset)] text-[var(--text-muted)]"
                  : isSelected
                    ? "bg-[var(--selection-bg)] text-[var(--selection-text)]"
                    : "border border-[var(--border-dim)] text-[var(--text-primary)] hover:bg-[var(--surface-inset)]"
              )}
            >
              {isSelected ? t("selected") : t("selectBase")}
            </button>
          </div>
        );
      })}
    </div>
  );
}
