"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

type LearningProposal = {
  id: string;
  sliceKey: string;
  primaryFailureReason: string;
  rationale: string;
  evidenceRefs: {
    corpusItemIds?: string[];
    stats: { count: number };
    fixtureOnly?: boolean;
  };
};

type GenerateResult = {
  generated: number;
  globalProposals: number;
  proposals: LearningProposal[];
};

const learningProposalsQueryKey = (workspaceId?: string, clientProfileId?: string) =>
  ["learning-proposals", workspaceId, clientProfileId] as const;

async function fetchLearningProposals(
  workspaceId?: string,
  clientProfileId?: string
): Promise<LearningProposal[] | null> {
  const params = new URLSearchParams({ status: "proposed" });
  if (workspaceId) params.set("workspaceId", workspaceId);
  if (clientProfileId) params.set("clientProfileId", clientProfileId);
  const res = await apiFetch(`/api/admin/quality/learning/proposals?${params.toString()}`);
  if (res.status === 403) return null;
  if (!res.ok) throw new Error("failed");
  const data = (await res.json()) as { proposals: LearningProposal[] };
  return data.proposals;
}

export function LearningProposalsTab({
  workspaceId,
  clientProfileId,
  onOpenCalibration,
  variant = "workspace",
}: {
  workspaceId?: string;
  clientProfileId?: string;
  onOpenCalibration: () => void;
  variant?: "workspace" | "brand";
}) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [generateSummary, setGenerateSummary] = useState<string | null>(null);
  const [fixtureAcknowledged, setFixtureAcknowledged] = useState<Record<string, boolean>>({});

  const queryKey = learningProposalsQueryKey(workspaceId, clientProfileId);

  const proposalsQuery = useQuery({
    queryKey,
    queryFn: () => fetchLearningProposals(workspaceId, clientProfileId),
    retry: false,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/admin/quality/learning/proposals/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(workspaceId ? { workspaceId } : {}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err.error as string | undefined) ?? "Generate failed");
      }
      return (await res.json()) as GenerateResult;
    },
    onSuccess: (result) => {
      setActionError(null);
      setGenerateSummary(
        `Generated ${result.generated} client proposal(s). ${result.globalProposals} global proposal(s) saved to rubric calibration adjustments.`
      );
      void queryClient.invalidateQueries({ queryKey: ["learning-proposals"] });
      void queryClient.invalidateQueries({ queryKey: ["score-calibration"] });
    },
    onError: (error: Error) => {
      setGenerateSummary(null);
      setActionError(error.message);
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async ({
      proposalId,
      acknowledgeFixtureOnly,
    }: {
      proposalId: string;
      acknowledgeFixtureOnly?: boolean;
    }) => {
      const init: RequestInit = { method: "POST" };
      if (acknowledgeFixtureOnly) {
        init.headers = { "content-type": "application/json" };
        init.body = JSON.stringify({ acknowledgeFixtureOnly: true });
      }
      const res = await apiFetch(
        `/api/admin/quality/learning/proposals/${proposalId}/accept`,
        init
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err.error as string | undefined) ?? "Accept failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ["learning-proposals"] });
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ proposalId, reason }: { proposalId: string; reason: string }) => {
      const res = await apiFetch(
        `/api/admin/quality/learning/proposals/${proposalId}/reject`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err.error as string | undefined) ?? "Reject failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ["learning-proposals"] });
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const handleReject = (proposalId: string) => {
    const reason = window.prompt("Rejection reason (required):");
    if (!reason?.trim()) return;
    rejectMutation.mutate({ proposalId, reason: reason.trim() });
  };

  if (proposalsQuery.isFetched && proposalsQuery.data === null) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Learning proposals are restricted to platform owners.
      </p>
    );
  }

  if (proposalsQuery.isLoading) {
    return <p className="text-sm text-[var(--text-muted)]">Loading learning proposals…</p>;
  }

  if (proposalsQuery.isError) {
    return (
      <p className="text-sm text-[var(--text-muted)]">Unable to load learning proposals.</p>
    );
  }

  const proposals = proposalsQuery.data ?? [];
  const busyId =
    acceptMutation.isPending
      ? acceptMutation.variables?.proposalId
      : rejectMutation.isPending
        ? rejectMutation.variables?.proposalId
        : null;

  const isBrandVariant = variant === "brand";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {isBrandVariant
              ? "Propostas de aprendizado desta marca"
              : "Client learning proposals"}
          </h3>
          <p className="text-xs text-[var(--text-secondary)]">
            {isBrandVariant ? (
              <>Propostas de calibração pendentes para esta marca.</>
            ) : (
              <>
                Proposed calibration rules from evaluated corpus slices. Global cross-client
                proposals appear under{" "}
                <button
                  type="button"
                  onClick={onOpenCalibration}
                  className="font-medium text-[var(--text-primary)] underline underline-offset-2"
                >
                  Calibration
                </button>{" "}
                (rubric calibration adjustments).
              </>
            )}
          </p>
        </div>
        {!isBrandVariant ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={generateMutation.isPending}
            onClick={() => generateMutation.mutate()}
          >
            {generateMutation.isPending ? "Generating…" : "Generate proposals"}
          </Button>
        ) : null}
      </div>

      {generateSummary ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          {generateSummary}
        </p>
      ) : null}

      {actionError ? (
        <p className="text-xs text-rose-400">{actionError}</p>
      ) : null}

      {proposals.length === 0 ? (
        <p className="rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-muted)]">
          No proposed client learning rules. Run generate after enough evaluated corpus items exist
          per slice.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--border-dim)]">
          <table className="min-w-full text-xs">
            <thead className="bg-[var(--surface-base)] text-[var(--text-muted)]">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Slice</th>
                <th className="px-2 py-1.5 text-left font-medium">Failure reason</th>
                <th className="px-2 py-1.5 text-left font-medium">Rationale</th>
                <th className="px-2 py-1.5 text-right font-medium">Evidence</th>
                <th className="px-2 py-1.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((proposal) => {
                const isFixtureOnly = proposal.evidenceRefs.fixtureOnly === true;
                const acked = fixtureAcknowledged[proposal.id] === true;
                const acceptDisabled = busyId === proposal.id || (isFixtureOnly && !acked);

                return (
                  <tr key={proposal.id} className="border-t border-[var(--border-dim)]">
                    <td className="max-w-[12rem] truncate px-2 py-1.5 font-mono text-[10px]">
                      {proposal.sliceKey}
                    </td>
                    <td className="px-2 py-1.5">{proposal.primaryFailureReason}</td>
                    <td className="max-w-md px-2 py-1.5 text-[var(--text-secondary)]">
                      {proposal.rationale}
                      {isFixtureOnly ? (
                        <label className="mt-1.5 flex items-start gap-2 text-[10px] text-amber-200/90">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={acked}
                            onChange={(event) =>
                              setFixtureAcknowledged((prev) => ({
                                ...prev,
                                [proposal.id]: event.target.checked,
                              }))
                            }
                          />
                          <span>
                            Reconheço que esta proposta usa apenas evidência de fixture
                          </span>
                        </label>
                      ) : null}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {proposal.evidenceRefs.stats.count}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={acceptDisabled}
                          onClick={() =>
                            acceptMutation.mutate({
                              proposalId: proposal.id,
                              acknowledgeFixtureOnly: isFixtureOnly ? true : undefined,
                            })
                          }
                        >
                          Accept
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busyId === proposal.id}
                          onClick={() => handleReject(proposal.id)}
                        >
                          Reject
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
