"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import { useTranslations } from "next-intl";
import { ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LayerEditorAccessV1, PublicLayerEditorDocumentV1 } from "@/server/layer-editor/contracts";

type Props = {
  document: PublicLayerEditorDocumentV1;
  selectedLayerId: string | null;
  access: LayerEditorAccessV1;
  mode: "edit" | "read";
  inputRef?: Ref<HTMLTextAreaElement>;
  onClearSelection?: () => void;
  onRegenerate?: (id: string, instruction: string) => void;
  onAccept?: () => void;
  onDiscard?: () => void;
  onRetryDispatch?: () => void;
};

export function LayerRegenerationPanel({ document, selectedLayerId, access, mode, inputRef, onClearSelection, onRegenerate, onAccept, onDiscard, onRetryDispatch }: Props) {
  const t = useTranslations("dashboard.home.composer.results");
  const [instruction, setInstruction] = useState("");
  const panelRef = useRef<HTMLElement>(null);
  const previousStatus = useRef(document.regeneration?.status);
  const layer = document.layers.find((item) => item.id === selectedLayerId);
  const regeneration = document.regeneration;
  const remaining = access.regeneration?.remaining ?? 0;
  const pending = regeneration?.status === "reserved" || regeneration?.status === "processing";
  const blocked = mode !== "edit" || !layer || !instruction.trim() || remaining < 1 || pending;
  const statusText = pending && layer ? t("adjustingLayer", { name: layer.name }) : regeneration?.status ?? t("editorNoActiveRegeneration");

  useEffect(() => {
    const wasPending = previousStatus.current === "reserved" || previousStatus.current === "processing";
    const terminal = regeneration?.status === "ready" || regeneration?.status === "failed" || regeneration?.status === "submission_unknown";
    if (wasPending && terminal) panelRef.current?.focus();
    previousStatus.current = regeneration?.status;
  }, [regeneration?.status]);

  const submit = () => {
    if (blocked || !layer) return;
    onRegenerate?.(layer.id, instruction.trim());
  };

  return (
    <section ref={panelRef} tabIndex={-1} aria-label={t("editorRegenerate")} className="space-y-3 border-t border-[var(--border-subtle)] bg-[var(--surface-overlay)] px-4 py-3">
      {regeneration?.status === "ready" && layer ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={layer.imageUrl} alt={t("editorCurrent", { name: layer.name })} className="aspect-square w-full rounded object-contain" />
            {regeneration.candidateUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={regeneration.candidateUrl} alt={t("editorCandidate", { name: layer.name })} className="aspect-square w-full rounded object-contain" />
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button className="min-h-11 flex-1" disabled={mode !== "edit"} onClick={onAccept}>{t("editorAcceptCandidate")}</Button>
            <Button variant="outline" className="min-h-11 flex-1" disabled={mode !== "edit"} onClick={onDiscard}>{t("editorDiscardCandidate")}</Button>
          </div>
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        {layer ? (
          <span className="mb-0.5 inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 text-sm">
            {layer.name}
            <button type="button" className="min-h-11 min-w-11 text-lg leading-none text-[var(--text-muted)]" aria-label={t("clearSelection")} onClick={onClearSelection}>×</button>
          </span>
        ) : <p className="mb-0.5 flex min-h-11 items-center text-sm text-[var(--text-muted)]">{t("editorSelectLayer")}</p>}
        <label className="min-w-0 flex-1">
          <span className="sr-only">{t("editorInstruction")}</span>
          <textarea
            ref={inputRef}
            className="min-h-11 w-full resize-none rounded-full border border-[var(--border-default)] bg-[var(--surface-raised)] px-4 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60"
            value={instruction}
            maxLength={2000}
            rows={1}
            disabled={mode !== "edit" || !layer || pending}
            placeholder={t("askAiPlaceholder")}
            onChange={(event) => setInstruction(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
          />
        </label>
        {(!regeneration || regeneration.status === "failed" || regeneration.status === "submission_unknown") ? (
          <Button className="min-h-11 min-w-11 rounded-full" disabled={blocked} onClick={submit} aria-label={t("editorRegenerate")}>
            <ArrowUp />
            <span className="sr-only">{t("editorRegenerate")}</span>
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p role="status" aria-live="polite" className="text-xs text-[var(--text-muted)]">{t("editorQuotaRemaining", { count: remaining })}</p>
        <small className="sr-only">{instruction.length}/2000</small>
      </div>
      <p role="status" className={cn("text-sm", pending || regeneration?.status === "failed" || regeneration?.status === "submission_unknown" ? "text-[var(--text-secondary)]" : "sr-only")}>
        {statusText}
      </p>
      {regeneration?.status === "reserved" ? <Button className="min-h-11 w-full" disabled={mode !== "edit"} onClick={onRetryDispatch}>{t("editorRetryDispatch")}</Button> : null}
      {regeneration?.status === "submission_unknown" ? <p role="alert" className="rounded border border-[var(--warning-border)] bg-[var(--warning-bg)] p-2 text-sm text-[var(--warning-text)]">{t("editorSubmissionUnknown")}</p> : null}
    </section>
  );
}
