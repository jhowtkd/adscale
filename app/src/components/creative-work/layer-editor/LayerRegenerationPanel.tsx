"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { LayerEditorAccessV1, PublicLayerEditorDocumentV1 } from "@/server/layer-editor/contracts";

type Props = {
  document: PublicLayerEditorDocumentV1;
  selectedLayerId: string | null;
  access: LayerEditorAccessV1;
  mode: "edit" | "read";
  onRegenerate?: (id: string, instruction: string) => void;
  onAccept?: () => void;
  onDiscard?: () => void;
  onRetryDispatch?: () => void;
};

export function LayerRegenerationPanel({ document, selectedLayerId, access, mode, onRegenerate, onAccept, onDiscard, onRetryDispatch }: Props) {
  const t = useTranslations("dashboard.home.composer.results");
  const [instruction, setInstruction] = useState("");
  const [confirm, setConfirm] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const previousStatus = useRef(document.regeneration?.status);
  const layer = document.layers.find((item) => item.id === selectedLayerId);
  const regeneration = document.regeneration;
  const blocked = mode !== "edit" || !layer || !instruction.trim() || (access.regeneration?.remaining ?? 0) < 1 || regeneration?.status === "reserved" || regeneration?.status === "processing";
  useEffect(() => {
    const wasPending = previousStatus.current === "reserved" || previousStatus.current === "processing";
    const terminal = regeneration?.status === "ready" || regeneration?.status === "failed" || regeneration?.status === "submission_unknown";
    if (wasPending && terminal) panelRef.current?.focus();
    previousStatus.current = regeneration?.status;
  }, [regeneration?.status]);

  return <section ref={panelRef} tabIndex={-1} aria-label={t("editorRegenerate")} className="space-y-3 border-t p-4">
    <div><h3 className="font-medium">{t("editorRegenerate")}</h3><p className="text-sm text-muted-foreground">{layer?.name ?? t("editorSelectLayer")}</p></div>
    <p role="status" aria-live="polite" className="rounded bg-background px-3 py-2 text-sm">{t("editorQuotaRemaining", { count: access.regeneration?.remaining ?? 0 })}</p>
    <label className="block text-sm font-medium">{t("editorInstruction")}<textarea className="mt-1 min-h-24 w-full rounded border bg-background p-2" value={instruction} maxLength={2000} disabled={mode !== "edit"} onChange={(event) => { setInstruction(event.target.value); setConfirm(false); }} /></label>
    <small className="block text-right text-muted-foreground">{instruction.length}/2000</small>
    <p role="status" className="text-sm">{regeneration?.status ?? t("editorNoActiveRegeneration")}</p>
    {regeneration?.status === "reserved" ? <Button className="min-h-11 w-full" disabled={mode !== "edit"} onClick={onRetryDispatch}>{t("editorRetryDispatch")}</Button> : null}
    {regeneration?.status === "submission_unknown" ? <p role="alert" className="rounded border border-amber-500/50 bg-amber-50 p-2 text-sm text-amber-900">{t("editorSubmissionUnknown")}</p> : null}
    {regeneration?.status === "ready" && layer ? <div className="space-y-2"><div className="grid grid-cols-2 gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={layer.imageUrl} alt={t("editorCurrent", { name: layer.name })} className="aspect-square w-full rounded object-contain" />
      {regeneration.candidateUrl ? <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={regeneration.candidateUrl} alt={t("editorCandidate", { name: layer.name })} className="aspect-square w-full rounded object-contain" />
      </> : null}
    </div><div className="flex gap-2"><Button className="min-h-11 flex-1" disabled={mode !== "edit"} onClick={onAccept}>{t("editorAcceptCandidate")}</Button><Button variant="outline" className="min-h-11 flex-1" disabled={mode !== "edit"} onClick={onDiscard}>{t("editorDiscardCandidate")}</Button></div></div> : null}
    {!regeneration || regeneration.status === "failed" || regeneration.status === "submission_unknown" ? <Button className="min-h-11 w-full" disabled={blocked} onClick={() => confirm ? layer && onRegenerate?.(layer.id, instruction.trim()) : setConfirm(true)}>{confirm ? t("editorConfirmRegeneration") : t("editorRegenerate")}</Button> : null}
  </section>;
}
