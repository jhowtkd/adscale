"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { CreativeWorkSource } from "@/lib/hooks/use-creative-work";
import {
  MAX_PIECE_REFERENCES,
  PIECE_REFERENCE_CATEGORIES,
  isPieceReferenceReady,
  pieceReferenceTreatment,
  type PieceReferenceCategory,
} from "@/server/creative-work/piece-reference";

type Props = {
  sources: CreativeWorkSource[];
  assetSourceCount: number;
  disabled: boolean;
  uploading: boolean;
  onAdd: (files: FileList | null) => void;
  onUpdate: (sourceId: string, patch: { category?: PieceReferenceCategory; userInstruction?: string | null }) => Promise<boolean>;
  onReplace: (sourceId: string, file: File) => Promise<boolean>;
  onRetry: (sourceId: string) => Promise<void>;
  onRemove: (sourceId: string) => Promise<boolean | void>;
  onPromote: (sourceId: string) => Promise<boolean>;
};

export function PieceReferenceStrip({ sources, assetSourceCount, disabled, uploading, onAdd, onUpdate, onReplace, onRetry, onRemove, onPromote }: Props) {
  const t = useTranslations("dashboard.home.composer.pieceReferences");
  const addInput = useRef<HTMLInputElement>(null);
  const replaceInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const [promotion, setPromotion] = useState<Record<string, "idle" | "saving" | "saved" | "failed">>({});
  const atLimit = assetSourceCount >= MAX_PIECE_REFERENCES;
  return <section aria-label={t("title")} className="mt-3 space-y-2 border-t border-[var(--border-subtle)] pt-3">
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--text-muted)]">{t("count", { count: assetSourceCount })}</span>
      <input ref={addInput} type="file" multiple accept="image/png,image/jpeg,image/webp" hidden tabIndex={-1} aria-label={t("add")} onChange={(event) => onAdd(event.target.files)} />
      <button type="button" disabled={disabled || uploading || atLimit} aria-label={atLimit ? t("limit") : t("add")} onClick={() => addInput.current?.click()} className="rounded px-2 py-1 text-sm disabled:opacity-50">{atLimit ? t("limit") : t("add")}</button>
      <span aria-live="polite" className="sr-only">{uploading ? t("uploading") : atLimit ? t("limit") : ""}</span>
    </div>
    {sources.map((source) => {
      const reference = source.pieceReference;
      const promotionKey = `${source.id}:${source.assetId ?? ""}`;
      const state = source.status === "failed" ? t("failed")
        : source.status !== "ready" ? t("analyzing")
          : reference?.category === "additional_logo_or_seal" && !reference.hasTransparency ? t("exactIncompatible")
            : !isPieceReferenceReady(reference) ? t("choiceRequired") : t("ready");
      return <article key={source.id} className="grid gap-2 rounded border border-[var(--border-subtle)] p-2 sm:grid-cols-[64px_1fr_auto]">
        {source.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated asset route, matching CreativeSourceChip.
          <img src={source.previewUrl} alt={source.name} className="h-16 w-16 rounded object-cover" />
        ) : <div className="h-16 w-16 rounded bg-[var(--surface-inset)]" />}
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm">{source.name}</p>
          <p aria-live="polite" className="text-xs text-[var(--text-muted)]">{state}</p>
          <label className="block text-xs">{t("category")}
            <select aria-label={`${t("category")}: ${source.name}`} disabled={disabled || source.status !== "ready"} value={reference?.category ?? ""} onChange={(event) => { const category = event.target.value as PieceReferenceCategory; if (category) void onUpdate(source.id, { category }); }}>
              <option value="">{t("choose")}</option>
              {PIECE_REFERENCE_CATEGORIES.map((category) => <option key={category} value={category}>{t(`categories.${category}`)}</option>)}
            </select>
          </label>
          {reference?.category ? <p className="text-xs text-[var(--text-muted)]">{t(`treatments.${pieceReferenceTreatment(reference.category)}`)}</p> : null}
          <label className="block text-xs">{t("instruction")}
            <textarea aria-label={`${t("instruction")}: ${source.name}`} maxLength={240} disabled={disabled || source.status !== "ready"} defaultValue={reference?.userInstruction ?? ""} onBlur={(event) => { void onUpdate(source.id, { userInstruction: event.target.value.trim() || null }); }} />
          </label>
        </div>
        <div className="flex flex-wrap gap-1 self-start">
          <input ref={(node) => { replaceInputs.current[source.id] = node; }} type="file" accept="image/png,image/jpeg,image/webp" hidden tabIndex={-1} aria-label={`${t("replace")}: ${source.name}`} onChange={(event) => { const file = event.target.files?.[0]; if (file) void (async () => { setPromotion((current) => ({ ...current, [promotionKey]: "idle" })); await onReplace(source.id, file); })(); }} />
          <button type="button" disabled={disabled} aria-label={`${t("replace")}: ${source.name}`} onClick={() => replaceInputs.current[source.id]?.click()}>{t("replace")}</button>
          <button type="button" disabled={disabled} aria-label={`${t("remove")}: ${source.name}`} onClick={() => void onRemove(source.id)}>{t("remove")}</button>
          {source.status === "failed" ? <button type="button" disabled={disabled} aria-label={`${t("retry")}: ${source.name}`} onClick={() => void onRetry(source.id)}>{t("retry")}</button> : null}
          <button type="button" disabled={disabled || source.status !== "ready" || !reference?.category || promotion[promotionKey] === "saving"} aria-label={`${t("promote")}: ${source.name}`} onClick={() => void (async () => { setPromotion((current) => ({ ...current, [promotionKey]: "saving" })); const saved = await onPromote(source.id); setPromotion((current) => ({ ...current, [promotionKey]: saved ? "saved" : "failed" })); })()}>{t("promote")}</button>
          {promotion[promotionKey] === "saved" ? <span aria-live="polite">{t("promoted")}</span> : promotion[promotionKey] === "failed" ? <span aria-live="polite">{t("promotionFailed")}</span> : null}
        </div>
      </article>;
    })}
  </section>;
}
