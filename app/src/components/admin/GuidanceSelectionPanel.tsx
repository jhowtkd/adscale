"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import type { GuidanceHistoryRevision } from "@/server/brand-taste/guidance-history";
import type { GuidanceSelection, NumericGuidanceRef } from "@/server/brand-taste/guidance-selection-types";

export function GuidanceSelectionPanel({ clientProfileId, selection, history, retiredIds, onChanged }: {
  clientProfileId: string; selection: GuidanceSelection; history: readonly GuidanceHistoryRevision[];
  retiredIds: readonly string[]; onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [refs, setRefs] = useState<NumericGuidanceRef[]>(selection.refs);
  const [conflict, setConflict] = useState(false);
  const mutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const res = await apiFetch(`/api/admin/quality/brands/${clientProfileId}/rules`, { method: "PATCH",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pin_selection", refs, expectedVersion: selection.version }) });
      if (!res.ok) {
        const body = await res.json();
        if (body.code === "selection_conflict") { setConflict(true); throw new Error("A seleção mudou. Recarregue e confira as revisões antes de fixar."); }
        throw new Error(body.code === "budget_exceeded" ? "O conjunto excede os limites de 5 regras por papel, 280 caracteres por regra ou 1.500 por fragmento. Nenhuma revisão foi cortada."
          : body.code === "forbidden" ? "Somente o Dono da plataforma pode fixar orientações." : "Não foi possível fixar estas revisões. Confira a seleção.");
      }
    },
    onSuccess: () => { setEditing(false); onChanged(); },
  });
  const options = history.filter(row => row.status === "approved" && row.confirmedMetadata
    && row.metadataConfirmedBy && row.metadataConfirmedAt && row.confirmedMetadata.contentHash === row.contentHash);
  return <section className="space-y-2 rounded-md border border-[var(--border-dim)] p-3 text-xs">
    <h3 className="text-sm font-medium">Seleção da marca</h3>
    <p>{selection.pinnedBy ? `Fixada por ${selection.pinnedBy} em ${new Date(selection.pinnedAt!).toLocaleString("pt-BR")}`
      : "Acompanha automaticamente as revisões aprovadas."}</p>
    <p>Depreciação e rejeição interrompem o uso mesmo com fixação. Orientações visuais exigem calibração do conjunto e contexto exatos; papéis, modos e formatos continuam valendo.</p>
    <ul>{selection.refs.map(ref => {
      const row = history.find(row => row.ruleId === ref.ruleId && row.revisionNumber === ref.revision && row.contentHash === ref.contentHash);
      return <li key={ref.ruleId} className="break-all">Revisão {ref.revision}: {row?.text ?? ref.ruleId} · Hash: {ref.contentHash}
        {retiredIds.includes(ref.ruleId) ? " · Omitida: orientação depreciada ou rejeitada." : !row ? " · Omitida: referência indisponível." : null}</li>;
    })}</ul>
    {!selection.refs.length ? <p>Seleção vazia.</p> : null}
    {selection.previousSelection ? <p>Seleção anterior: {selection.previousSelection.refs.map(ref => `${ref.ruleId} · revisão ${ref.revision}`).join("; ") || "vazia"}.</p> : null}
    <Button size="sm" variant="outline" onClick={() => { setRefs(selection.refs); setEditing(!editing); }} disabled={mutation.isPending}>
      {editing ? "Cancelar fixação" : "Escolher revisões para fixar"}
    </Button>
    {editing ? <form className="space-y-2" onSubmit={event => { event.preventDefault(); mutation.mutate(); }}>
      <p>Fixar impede o acompanhamento automático. Escolha uma revisão por orientação; uma seleção vazia também pode ser fixada.</p>
      <fieldset disabled={mutation.isPending || conflict}>
        <legend>Revisões aprovadas e conferidas</legend>
        {options.map(row => <label key={row.id} className="block">
          <input type="checkbox" checked={refs.some(ref => ref.ruleId === row.ruleId && ref.revision === row.revisionNumber && ref.contentHash === row.contentHash)}
            onChange={event => setRefs(previous => [...previous.filter(ref => ref.ruleId !== row.ruleId), ...(event.target.checked
              ? [{ ruleId: row.ruleId, revision: row.revisionNumber, contentHash: row.contentHash }] : [])])} />
          Revisão {row.revisionNumber}: {row.text}{row.confirmedMetadata?.nature === "visual" ? " · Visual: depende de calibração pertinente" : ""}
        </label>)}
      </fieldset>
      <Button size="sm" type="submit" disabled={mutation.isPending || conflict}>Confirmar fixação</Button>
      {mutation.isError ? <p role="alert">{mutation.error.message}</p> : null}
      {conflict ? <Button size="sm" variant="outline" type="button" onClick={onChanged}>Recarregar seleção</Button> : null}
    </form> : null}
  </section>;
}
