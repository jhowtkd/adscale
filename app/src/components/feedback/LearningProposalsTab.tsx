"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { GuidanceProposalEditor, GUIDANCE_CATEGORY_LABELS, GUIDANCE_ROLE_LABELS } from "./GuidanceProposalEditor";
import type { GuidanceProposalDraft } from "@/server/brand-taste/proposal-review";
import { ProposalEvidenceDetails } from "./ProposalEvidenceDetails";

type LearningProposal = {
  id: string;
  clientProfileId?: string;
  sliceKey: string;
  primaryFailureReason: string;
  rationale: string;
  expectedRevision?: string;
  proposalDraft?: GuidanceProposalDraft | null;
  status: "proposed" | "accepted" | "rejected";
  rejectedReason?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  cooldownUntil?: string | null;
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

const STATUS_LABELS = { proposed: "Candidata", accepted: "Aprovada", rejected: "Rejeitada" };
const REASON_LABELS: Record<string, string> = {
  visual_overload: "Sobrecarga visual", weak_hierarchy: "Hierarquia fraca", generic_template_feel: "Aparência genérica",
  illegible_cta: "Convite ilegível", unfocused_composition: "Composição sem foco", factual_issue: "Problema factual",
  format_or_crop_issue: "Problema de formato ou recorte", other: "Outro motivo",
};

const learningProposalsQueryKey = (workspaceId?: string, clientProfileId?: string, status?: string) =>
  ["learning-proposals", workspaceId, clientProfileId, status] as const;

async function fetchLearningProposals(
  workspaceId?: string,
  clientProfileId?: string,
  status = "proposed"
): Promise<LearningProposal[] | null> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
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
  const [fixtureRequired, setFixtureRequired] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState("proposed");

  const queryKey = learningProposalsQueryKey(workspaceId, clientProfileId, status);

  const proposalsQuery = useQuery({
    queryKey,
    queryFn: () => fetchLearningProposals(workspaceId, clientProfileId, status),
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
        throw new Error((err.error as string | undefined) ?? "Não foi possível gerar propostas");
      }
      return (await res.json()) as GenerateResult;
    },
    onSuccess: (result) => {
      setActionError(null);
      setGenerateSummary(
        `Geradas ${result.generated} propostas de marca. ${result.globalProposals} propostas globais salvas nos ajustes de calibração da rubrica.`
      );
      void queryClient.invalidateQueries({ queryKey: ["learning-proposals"] });
      void queryClient.invalidateQueries({ queryKey: ["score-calibration"] });
    },
    onError: (error: Error) => {
      setGenerateSummary(null);
      setActionError(error.message);
    },
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
        throw new Error((err.error as string | undefined) ?? "Não foi possível rejeitar a proposta");
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
    const reason = window.prompt("Motivo da rejeição (obrigatório):");
    if (!reason?.trim()) return;
    rejectMutation.mutate({ proposalId, reason: reason.trim() });
  };

  if (proposalsQuery.isFetched && proposalsQuery.data === null) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Propostas de aprendizado são restritas ao Dono da plataforma.
      </p>
    );
  }

  if (proposalsQuery.isLoading) {
    return <p className="text-sm text-[var(--text-muted)]">Carregando propostas de aprendizado…</p>;
  }

  if (proposalsQuery.isError) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger-text)]"
      >
        <span>Não foi possível carregar as propostas de aprendizado.</span>
        <Button type="button" variant="outline" size="sm" onClick={() => void proposalsQuery.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const proposals = proposalsQuery.data ?? [];
  const busyId = rejectMutation.isPending ? rejectMutation.variables?.proposalId : null;

  const isBrandVariant = variant === "brand";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {isBrandVariant
              ? "Propostas de aprendizado desta marca"
              : "Propostas de aprendizado da marca"}
          </h3>
          <p className="text-xs text-[var(--text-secondary)]">
            {isBrandVariant ? (
              <>Aprendizado da marca reúne orientações propostas. Calibração da marca valida exemplos do treinamento; revisão da Peça pede mudanças e Aprovação humana decide sobre uma Peça.</>
            ) : (
              <>
                Orientações propostas a partir de avaliações do corpus. Propostas globais entre marcas
                aparecem em{" "}
                <button
                  type="button"
                  onClick={onOpenCalibration}
                  className="font-medium text-[var(--text-primary)] underline underline-offset-2"
                >
                  Calibração da rubrica
                </button>{" "}
                (ajustes da rubrica).
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
            {generateMutation.isPending ? "Gerando…" : "Gerar propostas"}
          </Button>
        ) : null}
      </div>

      <label className="flex items-center gap-2 text-xs">
        Estado das propostas
        <select className="rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-2" value={status} onChange={event => setStatus(event.target.value)}>
          <option value="">Todos</option>
          <option value="proposed">Candidatas</option>
          <option value="accepted">Aprovadas</option>
          <option value="rejected">Rejeitadas</option>
        </select>
      </label>

      {generateSummary ? (
        <p className="rounded-md border border-[var(--success-border)] bg-[var(--success-bg)] px-3 py-2 text-xs text-[var(--success-text)]">
          {generateSummary}
        </p>
      ) : null}

      {actionError ? (
        <p className="text-xs text-[var(--danger-text)]">{actionError}</p>
      ) : null}

      {proposals.length === 0 ? (
        <p className="rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-muted)]">
          Nenhuma proposta neste estado para a marca selecionada.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--border-dim)]">
          <table className="min-w-full text-xs">
            <thead className="bg-[var(--surface-base)] text-[var(--text-muted)]">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Categoria e escopo</th>
                <th className="px-2 py-1.5 text-left font-medium">Motivo</th>
                <th className="px-2 py-1.5 text-left font-medium">Orientação e apoio</th>
                <th className="px-2 py-1.5 text-right font-medium">Estado</th>
                <th className="px-2 py-1.5 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((proposal) => {
                const isFixtureOnly = proposal.evidenceRefs.fixtureOnly === true || fixtureRequired[proposal.id] === true;
                const acked = fixtureAcknowledged[proposal.id] === true;

                return (
                  <tr key={proposal.id} className="border-t border-[var(--border-dim)]">
                    <td className="max-w-[16rem] break-words px-2 py-1.5 text-[10px]">
                      <p>{GUIDANCE_CATEGORY_LABELS[proposal.proposalDraft?.metadata.category ?? "corpus_quality"]}</p>
                      {proposal.sliceKey}
                      <p>Papéis de destino: {proposal.proposalDraft ? proposal.proposalDraft.metadata.roles.map(role => GUIDANCE_ROLE_LABELS[role]).join(", ") : "não registrados"}</p>
                    </td>
                    <td className="px-2 py-1.5">{REASON_LABELS[proposal.primaryFailureReason] ?? "Motivo não identificado"}</td>
                    <td className="max-w-md px-2 py-1.5 text-[var(--text-secondary)]">
                      <GuidanceProposalEditor proposal={proposal} kind="corpus_quality" fixtureRequired={isFixtureOnly} fixtureAcknowledged={acked} onFixtureRequired={() => {
                        setFixtureRequired(prev => ({ ...prev, [proposal.id]: true }));
                        setFixtureAcknowledged(prev => ({ ...prev, [proposal.id]: false }));
                      }} onChanged={() => {
                        void queryClient.invalidateQueries({ queryKey: ["learning-proposals"] });
                        void queryClient.invalidateQueries({ queryKey: ["brand-calibration-rules"] });
                      }} />
                      {proposal.rejectedReason ? <p>Motivo da rejeição: {proposal.rejectedReason}</p> : null}
                      {proposal.status === "rejected" ? <>
                        <p>Rejeitada por: {proposal.rejectedBy ?? "Autoria não registrada"}
                          {proposal.rejectedAt ? ` em ${new Date(proposal.rejectedAt).toLocaleString("pt-BR")}` : ""}</p>
                        {proposal.cooldownUntil ? <p>Quarentena até: {new Date(proposal.cooldownUntil).toLocaleString("pt-BR")}. Uma nova proposta exige evidência posterior à rejeição.</p> : null}
                      </> : null}
                      {clientProfileId || proposal.clientProfileId ? (
                        <ProposalEvidenceDetails clientProfileId={(clientProfileId ?? proposal.clientProfileId)!}
                          proposalId={proposal.id} proposalKind="corpus_quality" />
                      ) : null}
                      {isFixtureOnly && proposal.status === "proposed" ? (
                        <label className="mt-1.5 flex items-start gap-2 text-[10px] text-[var(--warning-text)]">
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
                            Reconheço que esta proposta usa apenas evidência de fixture sintética, sem validação com cliente real
                          </span>
                        </label>
                      ) : null}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {STATUS_LABELS[proposal.status]}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {proposal.status === "proposed" ? <div className="inline-flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busyId === proposal.id}
                          onClick={() => handleReject(proposal.id)}
                        >
                          Rejeitar
                        </Button>
                      </div> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {proposalsQuery.dataUpdatedAt > 0 ? (
        <p className="text-xs text-[var(--text-muted)]">
          Atualizado às {new Date(proposalsQuery.dataUpdatedAt).toLocaleTimeString()}
        </p>
      ) : null}
    </div>
  );
}
