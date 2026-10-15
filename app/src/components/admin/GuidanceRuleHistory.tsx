"use client";

import type { GuidanceHistoryRevision } from "@/server/brand-taste/guidance-history";
import type { ProposalEvidenceRef } from "@/server/brand-taste/proposal-evidence-types";
import type { GuidanceRole } from "@/server/brand-taste/learned-guidance";
import { labelEntryValue } from "@/lib/studio/entry-catalog";

const SUPPORT_LABELS: Record<ProposalEvidenceRef["kind"], string> = {
  corpus_item: "Item do corpus", corpus_evaluation: "Avaliação do corpus",
  feedback_artifact: "Feedback do corpus", calibration_signal: "Sinal de calibração",
  output_decision: "Decisão da Peça", equipe_event: "Evento da Equipe",
  equipe_item_version: "Versão do Item",
};
const STATES: Record<string, string> = { candidate: "Candidata", approved: "Aprovada", rejected: "Rejeitada", deprecated: "Depreciada" };
function date(value: string | null) {
  if (!value) return "data desconhecida";
  // PostgreSQL snapshots contain UTC timestamps without a zone suffix.
  const parsed = new Date(/Z$|[+-]\d\d:\d\d$/.test(value) ? value : value + "Z");
  return Number.isNaN(parsed.getTime()) ? "data desconhecida" : parsed.toLocaleString("pt-BR");
}
export function GuidanceRuleHistory({ history, categoryLabel, roleLabel }: {
  history: readonly GuidanceHistoryRevision[];
  categoryLabel: (category: string | null) => string;
  roleLabel: (role: GuidanceRole) => string;
}) {
  if (!history.length) return <p className="text-[var(--text-muted)]">Sem revisões no histórico.</p>;
  return <details className="mt-2 space-y-2">
    <summary className="cursor-pointer underline">Histórico da orientação ({history.length} {history.length === 1 ? "revisão" : "revisões"})</summary>
    <ol className="space-y-3">
      {history.map(row => <li key={row.id} className="rounded border border-[var(--border-dim)] p-2">
        <p>Revisão {row.revisionNumber} · <strong>{STATES[row.status ?? ""] ?? "Estado não registrado"}</strong></p>
        {row.origin === "legacy" ? <p>Referência legacy preservada; sem reatribuição numérica.</p> : null}
        <p className="whitespace-pre-wrap">{row.text}</p>
        <p>Categoria: {categoryLabel(row.confirmedMetadata?.category ?? row.category)}</p>
        {row.confirmedMetadata ? <>
          <p>{row.confirmedMetadata.nature === "text" ? "Textual" : "Visual"} · {row.confirmedMetadata.roles.map(roleLabel).join(", ")}</p>
          <p>Modos: {row.confirmedMetadata.generationModes.map(mode => labelEntryValue("protocol", mode, "pt-BR")).join(", ")} · Formatos: {row.confirmedMetadata.formats.join(", ")}</p>
          <p>Conferência: {row.metadataConfirmedBy ?? "autoria desconhecida"} · {date(row.metadataConfirmedAt)}</p>
          {row.confirmedMetadata.contentHash !== row.contentHash ? <p>Conferência referente a outro texto; esta revisão não está conferida.</p> : null}
        </> : <p>Natureza, papéis e escopo não conferidos.</p>}
        <p>Criação: {date(row.createdAt)} · {row.createdBy ?? "autoria desconhecida"}</p>
        <p>Autoria da decisão: {row.decisionBy ?? "desconhecida"}</p>
        {row.decisionAt ? <p>Data da decisão: {date(row.decisionAt)}</p> : null}
        {row.decisionReason ? <p className="whitespace-pre-wrap">Motivo: {row.decisionReason}</p> : null}
        {row.approvedBy || row.approvedAt ? <p>Aprovação registrada: {row.approvedBy ?? "autoria desconhecida"} · {date(row.approvedAt)}</p> : null}
        <p>Registrado no histórico: {date(row.recordedAt)}</p>
        <p className="break-all">Hash do texto: {row.contentHash}</p>
        <ul>
          {row.supportingEvidenceRefs.map((ref, i) => <li key={i}>Apoio ({SUPPORT_LABELS[ref.kind]}): {ref.id}</li>)}
          {row.legacySupportingIds.map((id, i) => <li key={i}>Apoio legado (tipo não registrado): {id}</li>)}
        </ul>
        {row.caveats.map((caveat, i) => <p key={i}>Ressalva: {caveat}</p>)}
      </li>)}
    </ol>
  </details>;
}
