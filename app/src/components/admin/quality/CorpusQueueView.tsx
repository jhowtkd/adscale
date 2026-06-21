"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  HUMAN_QUALITY_CORPUS_COHORTS,
  HUMAN_QUALITY_FAILURE_REASONS,
  HUMAN_QUALITY_INTENTS,
  HUMAN_QUALITY_SOURCE_LABELS,
  type HumanQualityCorpusCohort,
  type HumanQualityFailureReason,
  type HumanQualityIntent,
  type HumanQualitySourceLabel,
} from "@/server/human-quality/corpus";
import { apiFetch } from "@/lib/api-client";
import { useQualityContext } from "./quality-context";
import {
  DEFAULT_QUEUE_FILTERS,
  FORBIDDEN_EVALUATION_PAYLOAD_KEYS,
  FAILURE_REASON_LABELS,
  INTENT_LABELS,
  TREND_FORMATS,
  TREND_GENERATION_MODES,
  buildEvaluationPayload,
  fetchPendingQueue,
  MetadataRow,
  QueueProgressSummary,
  type CorpusQueueFilterState,
} from "./corpus-shared";

export function CorpusQueueView() {
  const queryClient = useQueryClient();
  const { scope: corpusScope, workspaceId } = useQualityContext();
  const [queueFilters, setQueueFilters] = useState<CorpusQueueFilterState>(DEFAULT_QUEUE_FILTERS);
  const [visualScore, setVisualScore] = useState("");
  const [factualPass, setFactualPass] = useState("");
  const [intent, setIntent] = useState("");
  const [primaryFailureReason, setPrimaryFailureReason] = useState("");
  const [otherReasonText, setOtherReasonText] = useState("");
  const [notes, setNotes] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const queueQuery = useQuery({
    queryKey: [
      "human-quality-corpus-queue",
      corpusScope,
      workspaceId,
      queueFilters.cohort,
      queueFilters.generationMode,
      queueFilters.format,
      queueFilters.sourceLabel,
      queueFilters.status,
    ],
    queryFn: () =>
      fetchPendingQueue(corpusScope === "workspace" ? workspaceId : undefined, queueFilters),
    enabled: corpusScope === "global" || Boolean(workspaceId),
    retry: false,
  });

  const queueItems = queueQuery.data?.items ?? [];
  const queueProgress = queueQuery.data?.progress ?? null;
  const currentItem = queueItems[0] ?? null;
  const pendingCount = queueProgress?.totalPending ?? queueItems.length;

  const resetForm = () => {
    setVisualScore("");
    setFactualPass("");
    setIntent("");
    setPrimaryFailureReason("");
    setOtherReasonText("");
    setNotes("");
    setSubmitError(null);
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!currentItem) throw new Error("missing item");
      if (corpusScope === "workspace" && !workspaceId) throw new Error("missing workspace");
      const parsedScore = Number(visualScore);
      if (!Number.isInteger(parsedScore) || parsedScore < 0 || parsedScore > 100) {
        throw new Error("Visual score must be an integer from 0 to 100");
      }
      if (factualPass !== "true" && factualPass !== "false") {
        throw new Error("Factual pass is required");
      }
      if (!HUMAN_QUALITY_INTENTS.includes(intent as HumanQualityIntent)) {
        throw new Error("Reviewer intent is required");
      }
      if (
        !HUMAN_QUALITY_FAILURE_REASONS.includes(primaryFailureReason as HumanQualityFailureReason)
      ) {
        throw new Error("Primary failure reason is required");
      }
      if (primaryFailureReason === "other" && !otherReasonText.trim()) {
        throw new Error("Describe the other failure reason");
      }

      const evaluationBody = buildEvaluationPayload({
        workspaceId: corpusScope === "workspace" ? workspaceId : undefined,
        visualScore: parsedScore,
        factualPass: factualPass === "true",
        intent: intent as HumanQualityIntent,
        primaryFailureReason: primaryFailureReason as HumanQualityFailureReason,
        otherReasonText: primaryFailureReason === "other" ? otherReasonText.trim() : null,
        notes: notes.trim() || null,
      });

      for (const key of FORBIDDEN_EVALUATION_PAYLOAD_KEYS) {
        if (key in evaluationBody) {
          throw new Error(`Unsafe evaluation payload key: ${key}`);
        }
      }

      const res = await apiFetch(
        `/api/feedback/human-quality-corpus/${currentItem.id}/evaluation`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(evaluationBody),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err.error as string | undefined) ?? "Evaluation failed");
      }
      return res.json();
    },
    onSuccess: () => {
      resetForm();
      void queryClient.invalidateQueries({
        queryKey: [
          "human-quality-corpus-queue",
          corpusScope,
          workspaceId,
          queueFilters.cohort,
          queueFilters.generationMode,
          queueFilters.format,
          queueFilters.sourceLabel,
          queueFilters.status,
        ],
      });
      void queryClient.invalidateQueries({ queryKey: ["score-calibration", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["learning-impact", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["quality-improvement", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["sample-coverage", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["quality-trend", workspaceId] });
    },
    onError: (error: Error) => {
      setSubmitError(error.message);
    },
  });

  const formValid = useMemo(() => {
    const parsedScore = Number(visualScore);
    const scoreOk = Number.isInteger(parsedScore) && parsedScore >= 0 && parsedScore <= 100;
    const factualOk = factualPass === "true" || factualPass === "false";
    const intentOk = HUMAN_QUALITY_INTENTS.includes(intent as HumanQualityIntent);
    const reasonOk = HUMAN_QUALITY_FAILURE_REASONS.includes(
      primaryFailureReason as HumanQualityFailureReason
    );
    const otherOk = primaryFailureReason !== "other" || otherReasonText.trim().length > 0;
    return scoreOk && factualOk && intentOk && reasonOk && otherOk;
  }, [visualScore, factualPass, intent, primaryFailureReason, otherReasonText]);

  const queueForbidden = queueQuery.isFetched && queueQuery.data === null;
  const snapshot = currentItem?.qualitySnapshot;

  if (corpusScope === "workspace" && !workspaceId) return null;

  return (
    <div className="space-y-3 pt-2">
      {queueForbidden ? (
        <p className="text-sm text-[var(--text-muted)]">
          Corpus evaluation queue is restricted to platform owners.
        </p>
      ) : queueQuery.isLoading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading corpus queue…</p>
      ) : queueQuery.isError ? (
        <p className="text-sm text-[var(--text-muted)]">Unable to load corpus queue.</p>
      ) : (
        <div className="space-y-3 pt-2">
          {corpusScope === "global" ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid max-w-xs gap-1 text-xs">
                <span className="font-medium text-[var(--text-primary)]">Status</span>
                <select
                  value={queueFilters.status}
                  onChange={(e) =>
                    setQueueFilters({
                      ...queueFilters,
                      status: e.target.value as CorpusQueueFilterState["status"],
                    })
                  }
                  aria-label="Queue status filter"
                  className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
                >
                  <option value="pending">Pending</option>
                  <option value="evaluated">Evaluated</option>
                  <option value="removed">Removed</option>
                </select>
              </label>
              <label className="grid max-w-xs gap-1 text-xs">
                <span className="font-medium text-[var(--text-primary)]">Cohort</span>
                <select
                  value={queueFilters.cohort}
                  onChange={(e) =>
                    setQueueFilters({
                      ...queueFilters,
                      cohort: e.target.value as HumanQualityCorpusCohort | "",
                    })
                  }
                  aria-label="Queue cohort filter"
                  className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
                >
                  <option value="">All cohorts</option>
                  {HUMAN_QUALITY_CORPUS_COHORTS.map((cohort) => (
                    <option key={cohort} value={cohort}>
                      {cohort}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid max-w-xs gap-1 text-xs">
                <span className="font-medium text-[var(--text-primary)]">Source</span>
                <select
                  value={queueFilters.sourceLabel}
                  onChange={(e) =>
                    setQueueFilters({
                      ...queueFilters,
                      sourceLabel: e.target.value as HumanQualitySourceLabel | "",
                    })
                  }
                  aria-label="Queue source label filter"
                  className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
                >
                  <option value="">All sources</option>
                  {HUMAN_QUALITY_SOURCE_LABELS.map((label) => (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid max-w-xs gap-1 text-xs">
                <span className="font-medium text-[var(--text-primary)]">Mode</span>
                <select
                  value={queueFilters.generationMode}
                  onChange={(e) =>
                    setQueueFilters({ ...queueFilters, generationMode: e.target.value })
                  }
                  aria-label="Queue generation mode filter"
                  className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
                >
                  <option value="">All modes</option>
                  {TREND_GENERATION_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid max-w-xs gap-1 text-xs">
                <span className="font-medium text-[var(--text-primary)]">Format</span>
                <select
                  value={queueFilters.format}
                  onChange={(e) =>
                    setQueueFilters({ ...queueFilters, format: e.target.value })
                  }
                  aria-label="Queue format filter"
                  className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
                >
                  <option value="">All formats</option>
                  {TREND_FORMATS.map((format) => (
                    <option key={format} value={format}>
                      {format}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          {queueItems.length === 0 ? (
        <div className="space-y-3 pt-2">
          {queueProgress ? (
            <QueueProgressSummary
              progress={queueProgress}
              reviewPosition={0}
              pendingInView={0}
            />
          ) : null}
          <p className="rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-muted)]">
            {corpusScope === "global"
              ? "No pending global corpus items. Open the Candidates tab to promote captured creatives into a review cohort."
              : "Queue is clear — no pending corpus items remain for review. Promote candidates or select new derivations from campaign review."}
          </p>
        </div>
      ) : currentItem && queueFilters.status === "pending" ? (
        <div className="space-y-4 pt-2">
          {queueProgress ? (
            <QueueProgressSummary
              progress={queueProgress}
              reviewPosition={1}
              pendingInView={queueItems.length}
            />
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="space-y-3 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Current item
              </p>
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {currentItem.generationMode} · {currentItem.format || "—"} ·{" "}
                {currentItem.cohort} · v{currentItem.corpusVersion}
              </p>
            </div>

            <div className="relative aspect-square w-full overflow-hidden rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)]">
              {currentItem.previewImageUrl ? (
                <Image
                  src={currentItem.previewImageUrl}
                  alt="Derivation preview"
                  fill
                  sizes="(max-width: 1024px) 100vw, 480px"
                  className="object-contain"
                  unoptimized
                />
              ) : (
                <div className="flex size-full items-center justify-center text-xs text-[var(--text-muted)]">
                  Preview unavailable
                </div>
              )}
            </div>

            <dl className="space-y-1.5">
              <MetadataRow label="Workspace" value={currentItem.workspaceId.slice(0, 8) + "…"} />
              <MetadataRow label="Campaign" value={currentItem.campaignId.slice(0, 8) + "…"} />
              <MetadataRow
                label="Derivation"
                value={currentItem.derivationId.slice(0, 8) + "…"}
              />
              <MetadataRow label="Mode" value={currentItem.generationMode} />
              <MetadataRow label="Format" value={currentItem.format || "—"} />
              <MetadataRow label="Cohort" value={currentItem.cohort} />
              {currentItem.sourceLabel ? (
                <MetadataRow label="Source" value={currentItem.sourceLabel} />
              ) : null}
              <MetadataRow label="Corpus version" value={`v${currentItem.corpusVersion}`} />
              {snapshot?.qualityScore != null ? (
                <MetadataRow label="Auto score" value={String(snapshot.qualityScore)} />
              ) : null}
              {snapshot?.qualityVerdict ? (
                <MetadataRow label="Auto verdict" value={snapshot.qualityVerdict} />
              ) : null}
            </dl>

            {snapshot?.hardFailures && snapshot.hardFailures.length > 0 ? (
              <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                  Auto hard failures
                </p>
                <ul className="space-y-1 text-xs text-rose-300/90">
                  {snapshot.hardFailures.map((failure, index) => (
                    <li key={`${failure.code ?? "failure"}-${index}`}>
                      {failure.code ?? "failure"}
                      {failure.message ? ` — ${failure.message}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <form
            className="space-y-3 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!formValid || submitMutation.isPending) return;
              submitMutation.mutate();
            }}
          >
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Human evaluation
            </h3>

            <label className="grid gap-1 text-xs">
              <span className="font-medium text-[var(--text-primary)]">
                Visual score (0–100)
              </span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={visualScore}
                onChange={(e) => setVisualScore(e.target.value)}
                aria-label="Visual score (0–100)"
                className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2"
              />
            </label>

            <label className="grid gap-1 text-xs">
              <span className="font-medium text-[var(--text-primary)]">Factual pass</span>
              <select
                value={factualPass}
                onChange={(e) => setFactualPass(e.target.value)}
                aria-label="Factual pass"
                className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2"
              >
                <option value="">Select…</option>
                <option value="true">Pass</option>
                <option value="false">Fail</option>
              </select>
            </label>

            <label className="grid gap-1 text-xs">
              <span className="font-medium text-[var(--text-primary)]">Reviewer intent</span>
              <select
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                aria-label="Reviewer intent"
                className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2"
              >
                <option value="">Select…</option>
                {HUMAN_QUALITY_INTENTS.map((value) => (
                  <option key={value} value={value}>
                    {INTENT_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-xs">
              <span className="font-medium text-[var(--text-primary)]">
                Primary visible failure reason
              </span>
              <select
                value={primaryFailureReason}
                onChange={(e) => setPrimaryFailureReason(e.target.value)}
                aria-label="Primary visible failure reason"
                className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2"
              >
                <option value="">Select…</option>
                {HUMAN_QUALITY_FAILURE_REASONS.map((value) => (
                  <option key={value} value={value}>
                    {FAILURE_REASON_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>

            {primaryFailureReason === "other" ? (
              <label className="grid gap-1 text-xs">
                <span className="font-medium text-[var(--text-primary)]">Other reason</span>
                <input
                  value={otherReasonText}
                  onChange={(e) => setOtherReasonText(e.target.value)}
                  aria-label="Other reason"
                  className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2"
                />
              </label>
            ) : null}

            <label className="grid gap-1 text-xs">
              <span className="font-medium text-[var(--text-primary)]">Notes (optional)</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                aria-label="Notes"
                className="rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2 py-1.5"
              />
            </label>

            {submitError ? (
              <p className="text-xs text-rose-400">{submitError}</p>
            ) : null}

            <Button type="submit" disabled={!formValid || submitMutation.isPending}>
              {submitMutation.isPending
                ? "Submitting…"
                : pendingCount > 1
                  ? "Submit & next"
                  : "Submit evaluation"}
            </Button>
          </form>
          </div>
        </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
