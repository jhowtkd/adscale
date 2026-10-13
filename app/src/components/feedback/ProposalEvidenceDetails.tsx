"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { ProposalEvidenceReport } from "@/server/brand-taste/proposal-evidence-types";

const SOURCE_LABELS: Record<string, string> = {
  synthetic_fixture: "Fixture sintética", operator_imported: "Importada pelo operador", real_customer: "Cliente real",
};
const STRENGTH_LABELS: Record<string, string> = { strong: "Forte", medium: "Média", weak: "Fraca" };

export function ProposalEvidenceDetails({ clientProfileId, proposalId, proposalKind }: {
  clientProfileId: string; proposalId: string; proposalKind: ProposalEvidenceReport["kind"];
}) {
  const [expanded, setExpanded] = useState(false);
  const evidence = useQuery({
    queryKey: ["proposal-evidence", clientProfileId, proposalKind, proposalId],
    retry: false,
    queryFn: async (): Promise<ProposalEvidenceReport> => {
      const params = new URLSearchParams({ proposalKind, proposalId });
      const res = await apiFetch(`/api/admin/quality/brands/${clientProfileId}/evidence?${params}`);
      if (!res.ok) throw new Error("Evidência indisponível");
      const report = ((await res.json()) as { proposal: ProposalEvidenceReport }).proposal;
      if (!report) throw new Error("Evidência indisponível");
      return report;
    },
  });
  return (
    <div className="mt-2 space-y-2 text-xs">
      {evidence.isLoading ? <p>Carregando apoio…</p> : null}
      {evidence.isError ? <p role="alert">Apoio indisponível — contagem não conferida.</p> : null}
      {evidence.data ? <>
        {evidence.data.counts ? <>
          <p>Decisões independentes: {evidence.data.counts.independentDecisions} · Peças independentes: {evidence.data.counts.independentPieces}</p>
          <p className="text-[var(--text-muted)]">Decisões agrupadas por Peça ou Item; repetições não contam como pessoas ou votos adicionais.</p>
          {evidence.data.counts.unavailableReferences > 0 ? <p>Referências indisponíveis ou removidas: {evidence.data.counts.unavailableReferences}</p> : null}
          {evidence.data.counts.ungroupedReferences > 0 ? <p>Decisões sem contexto verificável, fora da contagem: {evidence.data.counts.ungroupedReferences}</p> : null}
        </> : <p>Contagem independente não disponível.</p>}
        {[...new Set(evidence.data.support.filter(ref => ref.availability === "available").map(ref =>
          `Origem: ${ref.label} · ${SOURCE_LABELS[ref.sourceLabel ?? ""] ?? "Proveniência não identificada"} · Força: ${STRENGTH_LABELS[ref.strength ?? ""] ?? "Não identificada"}`
        ))].map(label => <p key={label}>{label}</p>)}
      </> : null}
      <button type="button" aria-expanded={expanded} className="underline underline-offset-2"
        onClick={() => setExpanded(value => !value)}>{expanded ? "Ocultar evidências" : "Ver evidências"}</button>
      {expanded ? (
        <div className="space-y-2 rounded-md border border-[var(--border-dim)] p-3">
          {evidence.isLoading ? <p>Carregando evidências…</p> : null}
          {evidence.isError ? <p role="alert">Evidência indisponível — não foi possível conferir.</p> : null}
          {evidence.data ? <>
            <h4 className="font-medium">Apoio à proposta</h4>
            <p className="text-[var(--text-muted)]">Registros relacionados podem representar a mesma decisão; não são votos independentes.</p>
            <ul className="space-y-2">
              {evidence.data.support.map(ref => <li key={`${ref.kind}:${ref.id}`}>
                <p className="font-medium">{ref.label}</p>
                {ref.availability === "available" ? <>
                  <p>{ref.summary}</p>
                  <p>Origem: {SOURCE_LABELS[ref.sourceLabel ?? ""] ?? "Não identificada"}</p>
                  <p>Força: {STRENGTH_LABELS[ref.strength ?? ""] ?? "Não identificada"}</p>
                  {ref.occurredAt ? <p>{new Date(ref.occurredAt).toLocaleString("pt-BR")}</p> : null}
                  {ref.pieceHref ? <a href={ref.pieceHref} target="_blank" rel="noreferrer" className="underline">Abrir Peça</a> : null}
                </> : <p>{ref.availability === "removed"
                  ? "Evidência removida — não foi possível conferir."
                  : "Evidência indisponível — não foi possível conferir."}</p>}
              </li>)}
            </ul>
            {evidence.data.caveats.length ? <section>
              <h4 className="font-medium">Ressalvas</h4>
              <ul className="list-disc pl-4">{evidence.data.caveats.map(caveat => <li key={caveat}>{caveat}</li>)}</ul>
            </section> : null}
          </> : null}
        </div>
      ) : null}
    </div>
  );
}
