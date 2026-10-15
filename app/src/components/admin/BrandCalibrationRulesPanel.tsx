"use client";

import { GuidanceSelectionPanel } from "./GuidanceSelectionPanel";
import type { GuidanceSelection } from "@/server/brand-taste/guidance-selection-types";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { GuidanceProposalEditor, labelGuidanceMode, GUIDANCE_CATEGORY_LABELS, GUIDANCE_ROLE_LABELS } from "@/components/feedback/GuidanceProposalEditor";
import { RULE_CATEGORIES, type CalibrationRuleCandidate, type RuleCategory } from "@/server/brand-taste/calibration-signal-types";
import type { ConfirmedGuidanceMetadata } from "@/server/brand-taste/guidance-metadata";
import type { GuidanceRole } from "@/server/brand-taste/learned-guidance";
import { ProposalEvidenceDetails } from "@/components/feedback/ProposalEvidenceDetails";
import { GuidanceRuleHistory } from "./GuidanceRuleHistory";
import type { GuidanceHistoryRevision } from "@/server/brand-taste/guidance-history";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type BrandRule = CalibrationRuleCandidate & {
  contentHash: string;
  confirmedMetadata: ConfirmedGuidanceMetadata | null;
  metadataConfirmedBy: string | null;
  metadataConfirmedAt: string | null;
};

type BrandRulesResponse = {
  clientProfileId: string;
  workspaceId: string;
  history?: GuidanceHistoryRevision[];
  selection?: GuidanceSelection;
  approved: BrandRule[];
  candidate: BrandRule[];
  rejected: BrandRule[];
  deprecated: BrandRule[];
};

const CATEGORY_LABELS: Record<RuleCategory, string> = {
  figure: "Figura", gestalt: "Composição", hierarchy: "Hierarquia", voice: "Voz",
  invite: "Convite", export_conflict: "Conflito de exportação", brand_nuance: "Nuance de marca", corpus_quality: "Qualidade do corpus",
};
const ROLE_LABELS: Record<GuidanceRole, string> = {
  copy: "Redação", art_direction: "Direção de arte", image_prompt: "Prompt de imagem",
  carousel_editorial: "Editorial de carrossel", caption_adjustment: "Ajuste de legenda",
  strategist: "Estrategista", legacy_derivation: "Derivação legada",
};
const CONFIRMATION_ERRORS: Record<string, string> = {
  forbidden: "Somente o Dono da plataforma pode conferir regras.",
  factual_rule: "Falhas factuais não podem ser confirmadas como preferências.",
  export_conflict: "Conflitos de exportação não podem ser reclassificados como gosto ou enviados a novos papéis.",
  invalid_metadata: "Confira a categoria e os papéis de destino.",
  content_changed: "O texto mudou. Recarregue as regras e confira novamente.",
  rule_not_approved: "Esta regra não está mais aprovada. Recarregue as regras.",
};

function RuleDecision({ rule, onChanged }: { rule: BrandRule; onChanged: () => void }) {
  const [action, setAction] = useState<"reject" | "deprecate" | null>(null);
  const [reason, setReason] = useState("");
  const [conflict, setConflict] = useState(false);
  const mutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const res = await apiFetch(`/api/admin/quality/brands/${rule.clientProfileId}/rules`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ruleId: rule.id, expectedRevision: rule.expectedRevision, reason }),
      });
      if (!res.ok) {
        const body = await res.json();
        if (res.status === 409) {
          setConflict(true);
          throw new Error("A orientação mudou. Recarregue e confira o estado atual antes de decidir.");
        }
        throw new Error(body.code === "forbidden" ? "Somente o Dono da plataforma pode depreciar ou rejeitar orientações."
          : body.code === "reason_required" ? "Informe um motivo sem dados privados." : "Não foi possível registrar a decisão.");
      }
    },
    onSuccess: onChanged,
  });
  if (rule.status !== "candidate" && rule.status !== "approved") return null;
  return <div className="mt-2 space-y-2">
    {action ? <form onSubmit={event => { event.preventDefault(); mutation.mutate(); }} className="space-y-2">
      <p>{action === "deprecate" ? "Depreciar" : "Rejeitar"} interrompe o uso em novas operações. Operações em andamento mantêm a seleção já recebida.</p>
      <label className="block">Motivo da decisão<Input value={reason} maxLength={1000} disabled={mutation.isPending || conflict}
        onChange={event => setReason(event.target.value)} /></label>
      <Button type="submit" size="sm" disabled={!reason.trim() || !rule.expectedRevision || mutation.isPending || conflict}>
        {action === "deprecate" ? "Confirmar depreciação" : "Confirmar rejeição"}
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={mutation.isPending} onClick={() => setAction(null)}>Cancelar decisão</Button>
      {mutation.isError ? <p role="alert">{mutation.error.message}</p> : null}
      {conflict ? <Button type="button" size="sm" variant="outline" onClick={onChanged}>Recarregar orientação</Button> : null}
    </form> : <>
      {rule.status === "approved" ? <Button size="sm" variant="outline" onClick={() => setAction("deprecate")}>Depreciar orientação</Button> : null}
      <Button size="sm" variant="outline" onClick={() => setAction("reject")}>Rejeitar orientação</Button>
    </>}
  </div>;
}

function RuleConfirmation({ rule }: { rule: BrandRule }) {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const metadata = rule.confirmedMetadata;
  const [category, setCategory] = useState<RuleCategory | null>(metadata?.category ?? null);
  const [nature, setNature] = useState<"text" | "visual" | null>(metadata?.nature ?? null);
  const [roles, setRoles] = useState<GuidanceRole[]>([...(metadata?.roles ?? [])]);
  const [modes, setModes] = useState(metadata?.generationModes.join(", ") ?? "");
  const [formats, setFormats] = useState(metadata?.formats.join(", ") ?? "");
  const values = (text: string) => text.split(",").map(value => value.trim()).filter(Boolean);
  const confirmed = metadata && metadata.contentHash === rule.contentHash && rule.metadataConfirmedBy && rule.metadataConfirmedAt;
  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/admin/quality/brands/${rule.clientProfileId}/rules`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm_metadata", ruleId: rule.id, metadata: {
          category, nature, roles, generationModes: values(modes), formats: values(formats), contentHash: rule.contentHash,
        } }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(CONFIRMATION_ERRORS[body.code] ?? "Não foi possível confirmar a conferência.");
      }
      return (await res.json()) as { rule: BrandRule; history?: GuidanceHistoryRevision[] };
    },
    onSuccess: ({ rule: updated, history }) => {
      client.setQueriesData<BrandRulesResponse | "forbidden">({ queryKey: ["brand-calibration-rules", rule.clientProfileId] }, data => data && data !== "forbidden"
        ? { ...data, history: history ?? data.history, approved: data.approved.map(row => row.id === updated.id ? updated : row) } : data);
      setEditing(false);
    },
  });

  return <div className="space-y-2">
    {confirmed ? <>
      <p>Conferida por {rule.metadataConfirmedBy} em {new Date(rule.metadataConfirmedAt!).toLocaleString("pt-BR")}</p>
      <p>{CATEGORY_LABELS[metadata.category]} · {metadata.nature === "text" ? "Textual" : "Visual"} · {metadata.roles.map(role => ROLE_LABELS[role]).join(", ")}</p>
      <p>Modos: {metadata.generationModes.join(", ")} · Formatos: {metadata.formats.join(", ")}</p>
    </> : <p>Não conferida</p>}
    <Button variant="outline" size="sm" onClick={() => setEditing(!editing)} aria-expanded={editing}>
      {editing ? "Cancelar conferência" : confirmed ? "Revisar conferência" : "Conferir regra"}
    </Button>
    {editing ? <form className="space-y-3" onSubmit={event => { event.preventDefault(); mutation.mutate(); }}>
      <p className="whitespace-pre-wrap">{rule.rationale}</p>
      <fieldset disabled={mutation.isPending} className="space-y-3">
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger aria-label="Categoria de conteúdo"><SelectValue placeholder="Categoria de conteúdo" /></SelectTrigger>
          <SelectContent>{RULE_CATEGORIES.map(value => <SelectItem key={value} value={value}>{CATEGORY_LABELS[value]}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={nature} onValueChange={setNature}>
          <SelectTrigger aria-label="Natureza"><SelectValue placeholder="Natureza" /></SelectTrigger>
          <SelectContent><SelectItem value="text">Textual</SelectItem><SelectItem value="visual">Visual</SelectItem></SelectContent>
        </Select>
        <fieldset className="space-y-1">
          <legend>Papéis de destino</legend>
          {(Object.keys(ROLE_LABELS) as GuidanceRole[]).map(role => <label key={role} className="flex items-center gap-2">
            <input type="checkbox" checked={roles.includes(role)} onChange={event => setRoles(event.target.checked ? [...roles, role] : roles.filter(value => value !== role))} />
            {ROLE_LABELS[role]}
          </label>)}
        </fieldset>
        <label className="block">Modos de geração<Input value={modes} onChange={event => setModes(event.target.value)} /></label>
        <label className="block">Formatos<Input value={formats} onChange={event => setFormats(event.target.value)} /></label>
        <p className="text-[var(--text-muted)]">Separe modos e formatos por vírgulas. A conferência preserva fatos e segurança de exportação; regras visuais ainda exigem calibração pertinente.</p>
        <Button type="submit" size="sm" disabled={!category || !nature || !roles.length || !values(modes).length || !values(formats).length || mutation.isPending}>
          {mutation.isPending ? "Confirmando…" : "Confirmar conferência"}
        </Button>
      </fieldset>
      {mutation.isError ? <p role="alert">{mutation.error.message}</p> : null}
    </form> : null}
  </div>;
}

const CONFIDENCE_LABELS: Record<CalibrationRuleCandidate["confidence"], string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};
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
  history,
  onChanged,
}: {
  rules: BrandRule[];
  showApprovedAt: boolean;
  history: readonly GuidanceHistoryRevision[];
  onChanged: () => void;
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
                <p>{GUIDANCE_CATEGORY_LABELS[rule.confirmedMetadata?.category ?? rule.category] ?? "Categoria não identificada"}</p>
                <p>{rule.confirmedMetadata
                  ? `Escopo: marca selecionada; modos: ${rule.confirmedMetadata.generationModes.map(labelGuidanceMode).join(", ")}; formatos: ${rule.confirmedMetadata.formats.join(", ")}`
                  : "Escopo: marca selecionada; contexto específico não registrado"}</p>
                <p>Papéis de destino: {rule.confirmedMetadata
                  ? rule.confirmedMetadata.roles.map(role => GUIDANCE_ROLE_LABELS[role]).join(", ")
                  : "não registrados"}</p>
              </td>
              <td
                className="max-w-md px-2 py-1.5 text-[var(--text-secondary)]"
                title={rule.rationale}
              >
                <GuidanceProposalEditor proposal={rule} kind="rule" onChanged={onChanged} />
                <ProposalEvidenceDetails clientProfileId={rule.clientProfileId} proposalId={rule.id} proposalKind="rule" />
                <GuidanceRuleHistory history={history.filter(row => row.ruleId === rule.id)}
                  categoryLabel={category => CATEGORY_LABELS[category as RuleCategory] ?? "Categoria não registrada"}
                  roleLabel={role => ROLE_LABELS[role]} />
                {showApprovedAt ? <RuleConfirmation key={`${rule.id}:${rule.contentHash}`} rule={rule} /> : null}
                <RuleDecision key={`decision:${rule.id}:${rule.expectedRevision}`} rule={rule} onChanged={onChanged} />
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
  const queryClient = useQueryClient();
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

  const history = rulesQuery.data.history ?? [];
  const selection = rulesQuery.data.selection;
  const retiredIds = history.filter(row => (row.status === "deprecated" || row.status === "rejected")
    && selection?.refs.some(ref => ref.ruleId === row.ruleId && ref.revision < row.revisionNumber)).map(row => row.ruleId);
  const groups = [
    { state: "approved", title: "Orientações aprovadas", rules: rulesQuery.data.approved },
    { state: "candidate", title: "Orientações candidatas", rules: rulesQuery.data.candidate },
    { state: "rejected", title: "Orientações rejeitadas", rules: rulesQuery.data.rejected },
    { state: "deprecated", title: "Orientações depreciadas", rules: rulesQuery.data.deprecated },
  ];

  return (
    <div className="space-y-6">
      {selection ? <GuidanceSelectionPanel key={`selection:${clientProfileId}:${selection.version}:${rulesQuery.dataUpdatedAt}`}
        clientProfileId={clientProfileId} selection={selection} history={history}
        retiredIds={retiredIds}
        onChanged={() => void queryClient.invalidateQueries({ queryKey: ["brand-calibration-rules", clientProfileId] })} /> : null}
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
        <RulesTable rules={group.rules ?? []} showApprovedAt={group.state === "approved"} history={history}
          onChanged={() => void queryClient.invalidateQueries({ queryKey: ["brand-calibration-rules", clientProfileId] })} />
      </section>)}
    </div>
  );
}
