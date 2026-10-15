"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { labelEntryValue } from "@/lib/studio/entry-catalog";
import type { ConfirmedGuidanceMetadata } from "@/server/brand-taste/guidance-metadata";
import type { GuidanceProposalDraft, LearningProposalKind } from "@/server/brand-taste/proposal-review";
import type { GuidanceRole } from "@/server/brand-taste/learned-guidance";

export const GUIDANCE_CATEGORY_LABELS = {
  figure: "Figura", gestalt: "Composição", hierarchy: "Hierarquia", voice: "Voz", invite: "Convite",
  export_conflict: "Conflito de exportação", brand_nuance: "Nuance da marca", corpus_quality: "Qualidade do corpus",
};
export const GUIDANCE_ROLE_LABELS: Record<GuidanceRole, string> = {
  copy: "Redação", art_direction: "Direção de arte", image_prompt: "Prompt de imagem",
  carousel_editorial: "Editorial de carrossel", caption_adjustment: "Ajuste de legenda",
  strategist: "Estratégia", legacy_derivation: "Derivação legada",
};
type Snapshot = {
  id: string; rationale: string; status: string; expectedRevision?: string;
  proposalDraft?: GuidanceProposalDraft | null;
};
type Metadata = Omit<ConfirmedGuidanceMetadata, "contentHash">;
const ACTION_ERRORS: Record<string, string> = {
  client_consent_required: "Consentimento vigente da marca necessário para usar o corpus.",
  brand_out_of_scope: "A proposta está fora do escopo da marca.",
  insufficient_evidence: "A evidência está indisponível, fora do escopo ou inelegível.",
  not_proposed: "Esta proposta já foi decidida. Atualize a lista para conferir.",
  fixture_ack_required: "Confirme que o apoio é exclusivamente sintético antes de aprovar.",
};
const EMPTY_METADATA: Metadata = { category: "brand_nuance", nature: "text", roles: [], generationModes: [], formats: [] };
const modes = ["single", "variations", "format_adaptation", "restyle", "carousel", "art_variation", "restyling", "social_post", "strategist_turn"];
const formats = ["text", "1:1", "4:5", "9:16", "3:4"];
const legacyModeLabels: Record<string, string> = {
  art_variation: "Variação de arte (legado)", restyling: "Mudança de estilo (legado)",
  social_post: "Publicação social (legado)", strategist_turn: "Turno do Estrategista",
};
export function labelGuidanceMode(value: string) {
  return legacyModeLabels[value] ?? labelEntryValue("protocol", value, "pt-BR");
}
function metadataOf(snapshot: Snapshot): Metadata { return snapshot.proposalDraft?.metadata ?? EMPTY_METADATA; }
function editable(snapshot: Snapshot) { return snapshot.status === "candidate" || snapshot.status === "proposed"; }

function Choices({ label, values, selected, onChange, labelOf = value => value }: {
  label: string; values: string[]; selected: readonly string[]; onChange: (values: string[]) => void; labelOf?: (value: string) => string;
}) {
  return <fieldset className="flex flex-wrap gap-2"><legend>{label}</legend>
    {[...new Set([...values, ...selected])].map(value => <label key={value} className="flex items-center gap-1">
      <input type="checkbox" checked={selected.includes(value)} onChange={event => onChange(event.target.checked ? [...selected, value] : selected.filter(item => item !== value))} />{labelOf(value)}
    </label>)}
  </fieldset>;
}

/** The displayed snapshot is replaced only by an explicit save/conflict response, never a background refetch. */
export function GuidanceProposalEditor({ proposal, kind, fixtureRequired = false, fixtureAcknowledged = false, onFixtureRequired, onChanged }: {
  proposal: Snapshot; kind: LearningProposalKind; fixtureRequired?: boolean; fixtureAcknowledged?: boolean; onFixtureRequired?: () => void; onChanged: () => void;
}) {
  const [current, setCurrent] = useState(proposal);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(proposal.proposalDraft?.editedText ?? proposal.rationale);
  const [metadata, setMetadata] = useState<Metadata>(metadataOf(proposal));
  const [confirmed, setConfirmed] = useState(false);
  const [caveatsAcknowledged, setCaveatsAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const draft = current.proposalDraft;
  const dirty = !draft || text !== draft.editedText || JSON.stringify(metadata) !== JSON.stringify(metadataOf(current));
  // A saved draft remains reviewable after reopening; any edit requires another explicit confirmation and save.
  const canApprove = !!draft && !dirty && !conflict && (!fixtureRequired || fixtureAcknowledged) && !!current.expectedRevision;
  function replace(snapshot: Snapshot) {
    setCurrent(snapshot); setText(snapshot.proposalDraft?.editedText ?? snapshot.rationale);
    setMetadata(metadataOf(snapshot)); setConfirmed(false); setCaveatsAcknowledged(false);
  }
  async function command(method: "PATCH" | "POST") {
    setBusy(true); setMessage(null);
    try {
      const response = await apiFetch(`/api/admin/quality/learning/proposals/${current.id}/accept`, {
        method, headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, expectedRevision: current.expectedRevision,
          ...(method === "PATCH" ? { text, metadata: { category: metadata.category, nature: metadata.nature, roles: metadata.roles, generationModes: metadata.generationModes, formats: metadata.formats } }
            : { acknowledgeFixtureOnly: fixtureAcknowledged, acknowledgeCaveats: caveatsAcknowledged }),
        }),
      });
      const data = await response.json();
      if (response.status === 409 && data.current) {
        replace(data.current); setConflict(true); setMessage("A proposta mudou. Leia a revisão atual antes de continuar.");
        onChanged(); return;
      }
      if (!response.ok) {
        const code = data.code ?? data.error;
        if (code === "fixture_ack_required") onFixtureRequired?.();
        setMessage(data.message ?? ACTION_ERRORS[code] ?? "Não foi possível concluir a revisão da orientação."); return;
      }
      if (!data.proposal?.id || !data.proposal?.expectedRevision) throw new Error("Invalid proposal response");
      replace(data.proposal); setConflict(false); onChanged();
      setMessage(method === "PATCH" ? "Revisão salva. Confira o texto antes de aprovar." : "Orientação aprovada.");
    } catch { setMessage("Não foi possível concluir a revisão da orientação."); }
    finally { setBusy(false); }
  }
  if (!open && !(draft && !editable(current))) return <div>
    <p className="whitespace-pre-wrap">{draft?.editedText ?? current.rationale}</p>
    {editable(current) ? <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>Editar e conferir orientação</Button> : null}
  </div>;
  return <div className="space-y-3 rounded-md border border-[var(--border-dim)] p-3 text-xs">
    <div className="grid gap-3 md:grid-cols-2">
      <div><strong>Texto original</strong><p className="whitespace-pre-wrap">{draft?.originalText ?? current.rationale}</p></div>
      <div>{editable(current) ? <label className="block">Texto editado<textarea className="mt-1 w-full rounded border bg-[var(--surface-raised)] p-2" value={text} onChange={event => { setText(event.target.value); setConfirmed(false); }} /></label>
        : <><strong>Texto editado</strong><p className="whitespace-pre-wrap">{draft?.editedText}</p></>}</div>
    </div>
    {draft ? <p>Editado por {draft.editedByName} em {new Date(draft.editedAt).toLocaleString("pt-BR")}. Revisão {draft.revision}.</p> : <p>Texto original ainda sem edição humana.</p>}
    {editable(current) ? <>
      <label className="block">Categoria<select className="ml-2 rounded border bg-[var(--surface-raised)] p-1" value={metadata.category} onChange={event => { setMetadata({ ...metadata, category: event.target.value as Metadata["category"] }); setConfirmed(false); }}>
        {Object.entries(GUIDANCE_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label className="block">Natureza<select className="ml-2 rounded border bg-[var(--surface-raised)] p-1" value={metadata.nature} onChange={event => { setMetadata({ ...metadata, nature: event.target.value as Metadata["nature"] }); setConfirmed(false); }}>
        <option value="text">Textual</option><option value="visual">Visual</option>
      </select></label>
      <Choices label="Papéis de destino" values={Object.keys(GUIDANCE_ROLE_LABELS)} selected={metadata.roles} labelOf={value => GUIDANCE_ROLE_LABELS[value as GuidanceRole]} onChange={roles => { setMetadata({ ...metadata, roles: roles as GuidanceRole[] }); setConfirmed(false); }} />
      <Choices label="Modos de geração" values={modes} selected={metadata.generationModes} labelOf={labelGuidanceMode} onChange={generationModes => { setMetadata({ ...metadata, generationModes }); setConfirmed(false); }} />
      <Choices label="Formatos" values={formats} selected={metadata.formats} labelOf={value => value === "text" ? "Texto" : value} onChange={formats => { setMetadata({ ...metadata, formats }); setConfirmed(false); }} />
      <label className="flex gap-2"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Conferi o texto, a categoria, a natureza, os papéis e o escopo desta revisão</label>
      {kind === "rule" ? <label className="flex gap-2"><input type="checkbox" checked={caveatsAcknowledged} onChange={event => setCaveatsAcknowledged(event.target.checked)} />Reconheço as ressalvas das evidências apresentadas</label> : null}
      {conflict ? <Button size="sm" variant="outline" onClick={() => { setConflict(false); setMessage(null); }}>Li a revisão atual</Button> : null}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={busy || conflict || !confirmed || !current.expectedRevision || !metadata.roles.length || !metadata.generationModes.length || !metadata.formats.length} onClick={() => void command("PATCH")}>Salvar revisão</Button>
        <Button size="sm" disabled={busy || !canApprove} onClick={() => void command("POST")}>Aprovar orientação</Button>
      </div>
    </> : null}
    {message ? <p role="status">{message}</p> : null}
  </div>;
}
