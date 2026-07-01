"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  useCampaignLearnings,
  useRecomputeCampaignLearnings,
  type PerformanceLearning,
} from "@/lib/hooks/use-performance-learnings";

interface LearningsPanelProps {
  campaignId: string;
}

function LearningCard({ learning }: { learning: PerformanceLearning }) {
  const t = useTranslations("campaigns.learnings");
  const locale = useLocale();

  return (
    <article className="rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-[var(--surface-base)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider">
          {learning.variableKey}
        </span>
        <span className="rounded bg-[var(--surface-base)] px-2 py-0.5 text-xs">
          {t(`confidence.${learning.confidence}`)}
        </span>
        <span className="text-xs text-[var(--text-secondary)]">v{learning.algorithmVersion}</span>
      </div>

      <p className="mt-2 text-[var(--text-primary)]">{learning.statement}</p>

      <dl className="mt-3 grid gap-2 text-xs text-[var(--text-secondary)] sm:grid-cols-2">
        <div>
          <dt className="font-medium text-[var(--text-primary)]">{t("sample")}</dt>
          <dd>
            {t("sampleValue", {
              impressions: learning.sampleImpressions.toLocaleString(locale),
              campaigns: learning.sampleCampaignCount,
            })}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-[var(--text-primary)]">{t("recency")}</dt>
          <dd>
            {learning.lastEvidenceAt
              ? new Date(learning.lastEvidenceAt).toLocaleDateString(locale)
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-[var(--text-primary)]">{t("context")}</dt>
          <dd>
            {learning.contextPlatforms.length > 0 ? learning.contextPlatforms.join(", ") : "—"}
            {learning.contextObjectives.length > 0 ? ` · ${learning.contextObjectives.join(", ")}` : ""}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-[var(--text-primary)]">{t("evidence")}</dt>
          <dd>
            {t("evidenceValue", {
              supporting: learning.supportingEvidence.length,
              contradicting: learning.contradictingEvidence.length,
            })}
          </dd>
        </div>
      </dl>

      {learning.contradictingEvidence.length > 0 ? (
        <p className="mt-3 text-xs text-[var(--warning-text)]">{t("contradictionWarning")}</p>
      ) : null}
    </article>
  );
}

export default function LearningsPanel({ campaignId }: LearningsPanelProps) {
  const t = useTranslations("campaigns.learnings");
  const { data, isLoading, isError, error } = useCampaignLearnings(campaignId);
  const recompute = useRecomputeCampaignLearnings(campaignId);

  if (isLoading) {
    return <p className="text-sm text-[var(--text-secondary)]">{t("loading")}</p>;
  }

  if (isError) {
    return (
      <p className="text-sm text-[var(--danger-text)]" role="alert">
        {error instanceof Error ? error.message : t("loadError")}
      </p>
    );
  }

  if (!data?.clientProfileId) {
    return <p className="text-sm text-[var(--text-secondary)]">{t("noClientProfile")}</p>;
  }

  const learnings = data.learnings ?? [];
  const sourceLabel = data.source === "mem0" ? t("sourceMem0") : t("sourcePostgres");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--text-secondary)]">{t("source", { source: sourceLabel })}</p>
        <button
          type="button"
          className="min-h-9 rounded-md border border-[var(--border-dim)] px-3 py-1.5 text-xs hover:bg-[var(--surface-raised)] disabled:opacity-50"
          disabled={recompute.isPending}
          onClick={() => recompute.mutate()}
        >
          {recompute.isPending ? t("recomputing") : t("recompute")}
        </button>
      </div>

      {learnings.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">{t("empty")}</p>
      ) : (
        <div className="space-y-3">
          {learnings.map((learning) => (
            <LearningCard key={learning.id} learning={learning} />
          ))}
        </div>
      )}
    </div>
  );
}
