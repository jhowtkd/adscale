"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  HUMAN_QUALITY_FAILURE_REASONS,
  HUMAN_QUALITY_INTENTS,
  type HumanQualityFailureReason,
  type HumanQualityIntent,
  type HumanQualityQualitySnapshot,
} from "@/server/human-quality/corpus";

type CorpusQueueItem = {
  id: string;
  workspaceId: string;
  campaignId: string;
  derivationId: string;
  generationMode: string;
  format: string;
  cohort: string;
  corpusVersion: number;
  artifactRef: { derivationId: string; assetId?: string | null; styleAssetId?: string | null };
  qualitySnapshot: HumanQualityQualitySnapshot;
  selectedAt: string;
  previewImageUrl?: string | null;
};

const FAILURE_REASON_LABELS: Record<HumanQualityFailureReason, string> = {
  visual_overload: "Visual overload",
  weak_hierarchy: "Weak hierarchy",
  generic_template_feel: "Generic template feel",
  illegible_cta: "Illegible CTA",
  unfocused_composition: "Unfocused composition",
  factual_issue: "Factual issue",
  format_or_crop_issue: "Format or crop issue",
  other: "Other",
};

const INTENT_LABELS: Record<HumanQualityIntent, string> = {
  approve: "Approve",
  reject: "Reject",
  regenerate: "Regenerate",
};

async function fetchPendingQueue(workspaceId: string): Promise<CorpusQueueItem[] | null> {
  const res = await apiFetch(
    `/api/feedback/human-quality-corpus?workspaceId=${encodeURIComponent(workspaceId)}&limit=50`
  );
  if (res.status === 403) return null;
  if (!res.ok) throw new Error("failed");
  const payload = (await res.json()) as { items: CorpusQueueItem[] };
  return payload.items;
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="text-right text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

export function HumanQualityCorpusPanel() {
  const queryClient = useQueryClient();
  const [workspaceId, setWorkspaceId] = useState("");
  const [visualScore, setVisualScore] = useState("");
  const [factualPass, setFactualPass] = useState("");
  const [intent, setIntent] = useState("");
  const [primaryFailureReason, setPrimaryFailureReason] = useState("");
  const [otherReasonText, setOtherReasonText] = useState("");
  const [notes, setNotes] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const queueQuery = useQuery({
    queryKey: ["human-quality-corpus-queue", workspaceId],
    queryFn: () => fetchPendingQueue(workspaceId),
    enabled: Boolean(workspaceId),
    retry: false,
  });

  const currentItem = queueQuery.data?.[0] ?? null;

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
      if (!currentItem || !workspaceId) throw new Error("missing item");
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

      const res = await apiFetch(
        `/api/feedback/human-quality-corpus/${currentItem.id}/evaluation`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            visualScore: parsedScore,
            factualPass: factualPass === "true",
            intent,
            primaryFailureReason,
            otherReasonText: primaryFailureReason === "other" ? otherReasonText.trim() : null,
            notes: notes.trim() || null,
          }),
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
      void queryClient.invalidateQueries({ queryKey: ["human-quality-corpus-queue", workspaceId] });
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
    const otherOk =
      primaryFailureReason !== "other" || otherReasonText.trim().length > 0;
    return scoreOk && factualOk && intentOk && reasonOk && otherOk;
  }, [visualScore, factualPass, intent, primaryFailureReason, otherReasonText]);

  if (queueQuery.isFetched && queueQuery.data === null) return null;

  const snapshot = currentItem?.qualitySnapshot;

  return (
    <section className="space-y-4 rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Human quality corpus
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Internal one-at-a-time evaluation queue. Phase 129 stores judgments only — no
          calibration claims yet.
        </p>
      </div>

      <label className="grid max-w-md gap-1 text-xs">
        <span className="font-medium text-[var(--text-primary)]">Workspace ID</span>
        <input
          value={workspaceId}
          onChange={(e) => {
            setWorkspaceId(e.target.value);
            resetForm();
          }}
          placeholder="Required to load queue"
          aria-label="Workspace ID"
          className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
        />
      </label>

      {!workspaceId ? (
        <p className="text-sm text-[var(--text-muted)]">
          Enter a workspace ID to load pending corpus items.
        </p>
      ) : queueQuery.isLoading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading corpus queue…</p>
      ) : queueQuery.isError ? (
        <p className="text-sm text-[var(--text-muted)]">Unable to load corpus queue.</p>
      ) : (queueQuery.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No pending corpus items.</p>
      ) : currentItem ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="space-y-3 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
              <span>{queueQuery.data?.length ?? 0} pending</span>
              <span>
                {currentItem.cohort} · v{currentItem.corpusVersion}
              </span>
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
              <MetadataRow label="Derivation" value={currentItem.derivationId.slice(0, 8) + "…"} />
              <MetadataRow label="Campaign" value={currentItem.campaignId.slice(0, 8) + "…"} />
              <MetadataRow label="Mode" value={currentItem.generationMode} />
              <MetadataRow label="Format" value={currentItem.format || "—"} />
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
              {submitMutation.isPending ? "Submitting…" : "Submit evaluation"}
            </Button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
