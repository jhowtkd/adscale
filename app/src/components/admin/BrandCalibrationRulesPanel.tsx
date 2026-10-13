"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { CalibrationRuleCandidate } from "@/server/brand-taste/calibration-signal-types";
import type { GuidanceRole } from "@/server/brand-taste/learned-guidance";
import { labelEntryValue } from "@/lib/studio/entry-catalog";
import { ProposalEvidenceDetails } from "@/components/feedback/ProposalEvidenceDetails";

type BrandRulesResponse = {
  clientProfileId: string;
  workspaceId: string;
  approved: CalibrationRuleCandidate[];
  candidate: CalibrationRuleCandidate[];
  rejected: CalibrationRuleCandidate[];
  deprecated: CalibrationRuleCandidate[];
};

const CONFIDENCE_LABELS: Record<CalibrationRuleCandidate["confidence"], string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};
const CATEGORY_LABELS: Record<CalibrationRuleCandidate["category"], string> = {
  figure: "Figura", gestalt: "Composição", hierarchy: "Hierarquia", voice: "Voz",
  invite: "Convite", export_conflict: "Conflito de exportação", brand_nuance: "Nuance da marca", corpus_quality: "Qualidade do corpus",
};
const ROLE_LABELS: Record<GuidanceRole, string> = {
  copy: "Redação", art_direction: "Direção de arte", image_prompt: "Instrução de imagem",
  carousel_editorial: "Editorial de carrossel", caption_adjustment: "Ajuste de legenda",
  strategist: "Estratégia", legacy_derivation: "Derivação legada",
};

function truncate(text: string, max = 80): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

async function fetchBrandRules(
  clientProfileId: string, status: string
): Promise<BrandRulesResponse | "forbidden"> {
  const res = await apiFetch(`/api/admin/quality/brands/${clientProfileId}/rules${status ? `?status=${status}` : ""}`);
  if (res.status === 403) return "forbidden";
  if (!res.ok) throw new Error("failed");
  return (await res.json()) as BrandRulesResponse;
}

function RulesTable({
  rules,
  showApprovedAt,
}: {
  rules: CalibrationRuleCandidate[];
  showApprovedAt: boolean;
}) {
  if (rules.length === 0) {
    return (
      <p className="rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-muted)]">
        Nenhuma regra nesta seção.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-[var(--border-dim)]">
      <table className="min-w-full text-xs">
        <thead className="bg-[var(--surface-base)] text-[var(--text-muted)]">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium">Categoria</th>
            <th className="px-2 py-1.5 text-left font-medium">Racional</th>
            <th className="px-2 py-1.5 text-left font-medium">Confiança</th>
            {showApprovedAt ? (
              <th className="px-2 py-1.5 text-left font-medium">Aprovada em</th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr key={rule.id} className="border-t border-[var(--border-dim)]">
              <td className="px-2 py-1.5 text-[10px]">
                <p>{CATEGORY_LABELS[rule.category] ?? "Categoria não identificada"}</p>
                <p>{rule.confirmedMetadata
                  ? `Escopo: marca selecionada; modos: ${rule.confirmedMetadata.generationModes.map(mode => labelEntryValue("protocol", mode, "pt-BR")).join(", ")}; formatos: ${rule.confirmedMetadata.formats.join(", ")}`
                  : "Escopo: marca selecionada; contexto específico não registrado"}</p>
                <p>Papéis de destino: {rule.confirmedMetadata
                  ? rule.confirmedMetadata.roles.map(role => ROLE_LABELS[role]).join(", ")
                  : "não registrados"}</p>
              </td>
              <td
                className="max-w-md px-2 py-1.5 text-[var(--text-secondary)]"
                title={rule.rationale}
              >
                {truncate(rule.rationale)}
                <ProposalEvidenceDetails clientProfileId={rule.clientProfileId} proposalId={rule.id} proposalKind="rule" />
              </td>
              <td className="px-2 py-1.5">{CONFIDENCE_LABELS[rule.confidence]}</td>
              {showApprovedAt ? (
                <td className="px-2 py-1.5 text-[var(--text-muted)]">
                  {rule.approvedAt
                    ? new Date(rule.approvedAt).toLocaleString("pt-BR")
                    : "—"}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BrandCalibrationRulesPanel({
  clientProfileId,
}: {
  clientProfileId: string;
}) {
  const [status, setStatus] = useState("");
  const rulesQuery = useQuery({
    queryKey: ["brand-calibration-rules", clientProfileId, status],
    queryFn: () => fetchBrandRules(clientProfileId, status),
    retry: false,
  });

  if (rulesQuery.isLoading) {
    return <p className="text-sm text-[var(--text-muted)]">Carregando regras de calibração…</p>;
  }

  if (rulesQuery.data === "forbidden") {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        As regras de calibração são restritas a proprietários da plataforma.
      </p>
    );
  }

  if (rulesQuery.isError) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Não foi possível carregar as regras de calibração.
      </p>
    );
  }

  if (!rulesQuery.data) {
    return null;
  }

  const groups = [
    { state: "approved", title: "Orientações aprovadas", rules: rulesQuery.data.approved },
    { state: "candidate", title: "Orientações candidatas", rules: rulesQuery.data.candidate },
    { state: "rejected", title: "Orientações rejeitadas", rules: rulesQuery.data.rejected },
    { state: "deprecated", title: "Orientações depreciadas", rules: rulesQuery.data.deprecated },
  ];

  return (
    <div className="space-y-6">
      <label className="flex items-center gap-2 text-xs">
        Estado das orientações
        <select className="rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-2" value={status} onChange={event => setStatus(event.target.value)}>
          <option value="">Todos</option>
          <option value="candidate">Candidatas</option>
          <option value="approved">Aprovadas</option>
          <option value="rejected">Rejeitadas</option>
          <option value="deprecated">Depreciadas</option>
        </select>
      </label>
      {groups.filter(group => !status || group.state === status).map(group => <section key={group.state} className="space-y-2">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">{group.title}</h3>
        <RulesTable rules={group.rules ?? []} showApprovedAt={group.state === "approved"} />
      </section>)}
    </div>
  );
}
