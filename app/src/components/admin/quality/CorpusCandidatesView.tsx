"use client";

import Image from "next/image";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { HUMAN_QUALITY_CORPUS_COHORTS, type HumanQualityCorpusCohort } from "@/server/human-quality/corpus";
import { apiFetch } from "@/lib/api-client";
import { useQualityContext } from "./quality-context";
import {
  fetchCorpusCandidates,
  type CorpusCandidateListResponse,
} from "./corpus-shared";
import { useQualityLabels } from "./quality-labels";

function CandidatesTabContent({
  items,
  isLoading,
  isError,
  promoteCohort,
  onPromoteCohortChange,
  promotingId,
  onPromote,
}: {
  items: CorpusCandidateListResponse["items"];
  isLoading: boolean;
  isError: boolean;
  promoteCohort: HumanQualityCorpusCohort;
  onPromoteCohortChange: (cohort: HumanQualityCorpusCohort) => void;
  promotingId: string | null;
  onPromote: (candidateId: string) => void;
}) {
  const { t, tc } = useQualityLabels();

  if (isLoading) {
    return <p className="text-sm text-[var(--text-muted)]">{t("candidates.loading")}</p>;
  }

  if (isError) {
    return <p className="text-sm text-[var(--text-muted)]">{t("candidates.error")}</p>;
  }

  if (items.length === 0) {
    return (
      <p className="rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-muted)]">
        {t("candidates.empty")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid max-w-xs gap-1 text-xs">
          <span className="font-medium text-[var(--text-primary)]">
            {t("candidates.promoteIntoCohort")}
          </span>
          <select
            value={promoteCohort}
            onChange={(e) => onPromoteCohortChange(e.target.value as HumanQualityCorpusCohort)}
            aria-label={t("candidates.promoteIntoCohort")}
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
          >
            {HUMAN_QUALITY_CORPUS_COHORTS.map((cohort) => (
              <option key={cohort} value={cohort}>
                {cohort}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-[var(--text-secondary)]">
          {t("candidates.unpromotedCount", { count: items.length })}
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border border-[var(--border-dim)]">
        <table className="min-w-full text-xs">
          <thead className="bg-[var(--surface-base)] text-[var(--text-muted)]">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">{tc("preview")}</th>
              <th className="px-2 py-1.5 text-left font-medium">{t("candidates.modeFormat")}</th>
              <th className="px-2 py-1.5 text-left font-medium">{tc("source")}</th>
              <th className="px-2 py-1.5 text-left font-medium">{tc("workspace")}</th>
              <th className="px-2 py-1.5 text-right font-medium">{tc("action")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-[var(--border-dim)]">
                <td className="px-2 py-1.5">
                  {item.previewImageUrl ? (
                    <div className="relative h-12 w-12 overflow-hidden rounded border border-[var(--border-dim)]">
                      <Image
                        src={item.previewImageUrl}
                        alt={t("candidates.previewAlt")}
                        fill
                        sizes="48px"
                        className="object-contain"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <span className="text-[var(--text-muted)]">—</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-[var(--text-primary)]">
                  {item.generationMode} · {item.format || "—"} · v{item.corpusVersion}
                </td>
                <td className="px-2 py-1.5">{item.sourceLabel}</td>
                <td className="px-2 py-1.5 font-mono text-[10px]">
                  {item.workspaceId.slice(0, 8)}…
                </td>
                <td className="px-2 py-1.5 text-right">
                  <Button
                    type="button"
                    size="sm"
                    disabled={promotingId === item.id}
                    onClick={() => onPromote(item.id)}
                  >
                    {promotingId === item.id ? tc("promoting") : tc("promote")}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CorpusCandidatesView() {
  const queryClient = useQueryClient();
  const { scope, workspaceId } = useQualityContext();
  const { t } = useQualityLabels();
  const [promoteCohort, setPromoteCohort] = useState<HumanQualityCorpusCohort>("baseline");
  const [promotingCandidateId, setPromotingCandidateId] = useState<string | null>(null);

  const analyticsEnabled = scope === "global" || (scope === "workspace" && Boolean(workspaceId));

  const candidatesQuery = useQuery({
    queryKey: ["corpus-candidates", scope, workspaceId],
    queryFn: () => fetchCorpusCandidates(scope === "workspace" ? workspaceId : undefined),
    enabled: analyticsEnabled,
    retry: false,
  });

  const promoteCandidateMutation = useMutation({
    mutationFn: async (candidateId: string) => {
      const res = await apiFetch(
        `/api/feedback/human-quality-corpus/candidates/${candidateId}/promote`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cohort: promoteCohort }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err.error as string | undefined) ?? t("candidates.promoteFailed"));
      }
      return res.json();
    },
    onMutate: (candidateId) => {
      setPromotingCandidateId(candidateId);
    },
    onSettled: () => {
      setPromotingCandidateId(null);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["corpus-candidates"] });
      void queryClient.invalidateQueries({
        queryKey: ["human-quality-corpus-queue", scope, workspaceId],
      });
    },
  });

  if (scope === "workspace" && !workspaceId) return null;

  return (
    <div className="space-y-3 pt-2">
      <CandidatesTabContent
        items={candidatesQuery.data?.items ?? []}
        isLoading={candidatesQuery.isLoading}
        isError={candidatesQuery.isError}
        promoteCohort={promoteCohort}
        onPromoteCohortChange={setPromoteCohort}
        promotingId={promotingCandidateId}
        onPromote={(candidateId) => promoteCandidateMutation.mutate(candidateId)}
      />
    </div>
  );
}
