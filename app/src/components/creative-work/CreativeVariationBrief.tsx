"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { CreativeWorkSource } from "@/lib/hooks/use-creative-work";

function joinParts(parts: Array<string | null | undefined>): string {
  return parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part)).join(" · ");
}

export function summarizeVariationContent(
  source: Pick<CreativeWorkSource, "contentAnalysis">,
): string {
  const content = source.contentAnalysis;
  if (!content) return "";

  return joinParts([
    content.product ? `Produto: ${content.product}` : null,
    content.textContent.headline ? `Headline: ${content.textContent.headline}` : null,
    content.offer ? `Oferta: ${content.offer}` : null,
    content.cta.text ? `CTA: ${content.cta.text}` : null,
  ]);
}

export function summarizeVariationStyle(
  source: Pick<CreativeWorkSource, "styleAnalysis">,
): string {
  const style = source.styleAnalysis;
  if (!style) return "";

  const colors = [...style.colorPalette.dominant, ...style.colorPalette.accents].filter(Boolean);
  return joinParts([
    style.mood ? `Clima: ${style.mood}` : null,
    style.composition ? `Composição: ${style.composition}` : null,
    colors.length > 0 ? `Cores: ${colors.join(", ")}` : null,
    style.typography.personality ? `Tipografia: ${style.typography.personality}` : null,
  ]);
}

type AnalysisDraft = Pick<CreativeWorkSource, "contentAnalysis" | "styleAnalysis">;

export function CreativeVariationBrief({
  source,
  request = "",
  brandName = null,
  onSave,
}: {
  source: CreativeWorkSource;
  request?: string;
  brandName?: string | null;
  onSave?: (draft: AnalysisDraft) => Promise<boolean | void>;
}) {
  const t = useTranslations("dashboard.home.composer");
  const [draft, setDraft] = useState<AnalysisDraft>({
    contentAnalysis: source.contentAnalysis,
    styleAnalysis: source.styleAnalysis,
  });
  const [editing, setEditing] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const sourceVersion = `${source.id}:${String(source.updatedAt)}`;
  const lastSourceVersion = useRef(sourceVersion);

  useEffect(() => {
    if (editing || lastSourceVersion.current === sourceVersion) return;
    lastSourceVersion.current = sourceVersion;
    setDraft({ contentAnalysis: source.contentAnalysis, styleAnalysis: source.styleAnalysis });
  }, [editing, source.contentAnalysis, source.styleAnalysis, sourceVersion]);

  const content = source.usage === "style" ? null : draft.contentAnalysis;
  const style = draft.styleAnalysis;
  const unknown = t("unknownValue");
  const setContentField = (field: "product" | "offer" | "keyVisual", value: string) => {
    if (!draft.contentAnalysis) return;
    setDraft((current) => current.contentAnalysis ? {
      ...current,
      contentAnalysis: { ...current.contentAnalysis, [field]: value, summaryPt: undefined },
    } : current);
  };
  const save = async () => {
    if (!onSave) return;
    setSaveState("saving");
    try {
      const saved = await onSave({
        contentAnalysis: source.usage === "style" ? null : draft.contentAnalysis,
        styleAnalysis: draft.styleAnalysis,
      });
      if (saved === false) {
        setSaveState("error");
        return;
      }
      setSaveState("saved");
      setEditing(false);
    } catch {
      setSaveState("error");
    }
  };

  const contentFields = content ? [
    ["product", t("product"), content.product],
    ["headline", t("headline"), content.textContent.headline],
    ["offer", t("offer"), content.offer],
    ["cta", t("ctaText"), content.cta.text],
    ["keyVisual", t("keyVisual"), content.keyVisual],
    ["conditions", t("complementaryText"), content.textContent.bullets.join(" · ")],
    ["format", t("extractedFormat"), content.format],
  ] as const : [];

  return (
    <section aria-labelledby="variation-analysis-title">
      <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full py-1.5 text-[var(--text-muted)] marker:content-none hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] [&::-webkit-details-marker]:hidden">
        <h2 id="variation-analysis-title" className="text-xs font-medium uppercase tracking-[0.14em]">
          {t("variationAnalysisTitle")}
        </h2>
      </summary>
      <div className="mt-4 space-y-4">
      {onSave && !editing ? (
        <button type="button" onClick={() => { setEditing(true); setSaveState("idle"); }} className="rounded-full px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-white/6 hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          {t("editAnalysis")}
        </button>
      ) : null}

      <div>
        <h3 className="text-xs font-semibold text-[var(--text-secondary)]">{t("provenanceTitle")}</h3>
        <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[
            [t("provenanceRequest"), request, "request"],
            [t("provenanceSource"), source.name, "source"],
            [t("provenanceBrand"), brandName, "brand"],
            [t("provenanceInference"), style?.mood, "inferred"],
          ].map(([label, value, origin]) => (
            <div key={String(label)} className="rounded-[var(--radius-control)] bg-[var(--surface-inset)] px-3 py-2">
              <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
              <dd data-origin={value ? origin : "unknown"} className="mt-0.5 font-medium text-[var(--text-primary)]">{value || unknown}</dd>
            </div>
          ))}
        </dl>
      </div>

      {source.usage === "style" ? (
        <p className="rounded-[var(--radius-control)] bg-[var(--surface-inset)] p-3 text-sm text-[var(--text-secondary)]">
          {t("provenanceVisualOnly")}
        </p>
      ) : null}

      {editing ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {content ? (
            <fieldset className="grid gap-3 rounded-[var(--radius-control)] bg-[var(--surface-inset)] p-3">
              <legend className="px-1 text-xs font-semibold text-[var(--text-secondary)]">{t("variationContentTitle")}</legend>
              <label className="text-xs text-[var(--text-muted)]">{t("product")}<input value={content.product} onChange={(event) => setContentField("product", event.target.value)} className="mt-1 w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]" /></label>
              <label className="text-xs text-[var(--text-muted)]">{t("headline")}<input value={content.textContent.headline} onChange={(event) => setDraft((current) => current.contentAnalysis ? { ...current, contentAnalysis: { ...current.contentAnalysis, summaryPt: undefined, textContent: { ...current.contentAnalysis.textContent, headline: event.target.value } } } : current)} className="mt-1 w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]" /></label>
              <label className="text-xs text-[var(--text-muted)]">{t("offer")}<input value={content.offer} onChange={(event) => setContentField("offer", event.target.value)} className="mt-1 w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]" /></label>
              <label className="text-xs text-[var(--text-muted)]">{t("ctaText")}<input value={content.cta.text} onChange={(event) => setDraft((current) => current.contentAnalysis ? { ...current, contentAnalysis: { ...current.contentAnalysis, summaryPt: undefined, cta: { ...current.contentAnalysis.cta, text: event.target.value } } } : current)} className="mt-1 w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]" /></label>
              <label className="text-xs text-[var(--text-muted)]">{t("keyVisual")}<input value={content.keyVisual} onChange={(event) => setContentField("keyVisual", event.target.value)} className="mt-1 w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]" /></label>
              <label className="text-xs text-[var(--text-muted)]">{t("complementaryText")}<textarea value={content.textContent.bullets.join("\n")} onChange={(event) => setDraft((current) => current.contentAnalysis ? { ...current, contentAnalysis: { ...current.contentAnalysis, summaryPt: undefined, textContent: { ...current.contentAnalysis.textContent, bullets: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean) } } } : current)} rows={3} className="mt-1 w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]" /></label>
            </fieldset>
          ) : null}
          {style ? (
            <fieldset className="grid content-start gap-3 rounded-[var(--radius-control)] bg-[var(--surface-inset)] p-3">
              <legend className="px-1 text-xs font-semibold text-[var(--text-secondary)]">{t("variationStyleTitle")}</legend>
              <label className="text-xs text-[var(--text-muted)]">{t("mood")}<input value={style.mood} onChange={(event) => setDraft((current) => current.styleAnalysis ? { ...current, styleAnalysis: { ...current.styleAnalysis, mood: event.target.value, moodChipsPt: undefined } } : current)} className="mt-1 w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]" /></label>
              <label className="text-xs text-[var(--text-muted)]">{t("composition")}<input value={style.composition} onChange={(event) => setDraft((current) => current.styleAnalysis ? { ...current, styleAnalysis: { ...current.styleAnalysis, composition: event.target.value, compositionPt: undefined } } : current)} className="mt-1 w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]" /></label>
            </fieldset>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[var(--radius-control)] bg-[var(--surface-inset)] p-3">
            <h3 className="text-xs font-semibold text-[var(--text-secondary)]">{t("variationContentTitle")}</h3>
            {content ? (
              <>
                <p className="mt-2 text-sm text-[var(--text-primary)]">{content.summaryPt || summarizeVariationContent({ contentAnalysis: content })}</p>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  {contentFields.map(([key, label, value]) => (
                    <div key={key} data-testid={`variation-field-${key}`} data-origin={value ? "source" : "unknown"}>
                      <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
                      <dd className="font-medium text-[var(--text-primary)]">
                        {value || unknown}
                        <span className="ml-1.5 rounded-full bg-[var(--surface-raised)] px-1.5 py-0.5 text-xs font-normal text-[var(--text-muted)]">
                          {value ? t("provenanceSource") : t("provenanceUnknown")}
                        </span>
                      </dd>
                    </div>
                  ))}
                </dl>
                {content.entities?.length ? <div role="group" className="mt-3 flex flex-wrap gap-1.5" aria-label={t("identifiedEntities")}>{content.entities.map((entity) => <span key={entity} className="rounded-full bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-secondary)]">{entity}</span>)}</div> : null}
                <details className="mt-3 rounded-[var(--radius-control)] bg-[var(--surface-raised)] px-3 py-2"><summary className="cursor-pointer text-xs font-semibold text-[var(--text-secondary)]">{t("literalTextTitle")}</summary><p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-primary)]">{content.literalText || t("literalTextUnavailable")}</p></details>
              </>
            ) : <p className="mt-1 text-sm text-[var(--text-primary)]">{t("variationAnalysisUnavailable")}</p>}
          </div>

          <div className="rounded-[var(--radius-control)] bg-[var(--surface-inset)] p-3">
            <h3 className="text-xs font-semibold text-[var(--text-secondary)]">{t("variationStyleTitle")}</h3>
            {style ? (
              <div className="mt-2 space-y-3 text-sm text-[var(--text-primary)]">
                <p>{summarizeVariationStyle({ styleAnalysis: style })}</p>
                {style.palette?.length ? <div><p className="text-xs text-[var(--text-muted)]">{t("dominantColors")}</p><div role="group" className="mt-1 flex flex-wrap gap-2" aria-label={t("paletteAria")}>{style.palette.map((sample) => <span key={`${sample.hex}-${sample.labelPt}`} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-raised)] px-2 py-1 text-xs"><span className="h-4 w-4 rounded-full border border-black/10" style={{ backgroundColor: sample.hex }} aria-hidden="true" />{sample.labelPt}</span>)}</div></div> : <p><span className="text-xs text-[var(--text-muted)]">{t("dominantColors")}: </span>{style.colorPalette.dominant.concat(style.colorPalette.accents).join(", ") || unknown}</p>}
                <div><p className="text-xs text-[var(--text-muted)]">{t("typography")}</p><p className="mt-1 text-lg" style={style.typography.family ? { fontFamily: style.typography.family } : undefined}>Aa · {style.typography.stylePt || style.typography.personality || unknown}</p>{style.typography.weight ? <p className="text-xs text-[var(--text-muted)]">{style.typography.weight}</p> : null}</div>
                <div><p className="text-xs text-[var(--text-muted)]">{t("mood")}</p><div role="group" className="mt-1 flex flex-wrap gap-1.5" aria-label={t("moodAria")}>{(style.moodChipsPt?.length ? style.moodChipsPt : style.mood ? [style.mood] : []).map((chip) => <span key={chip} data-origin="inferred" className="rounded-full bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-secondary)]">{chip}</span>)}</div></div>
                <div><p className="text-xs text-[var(--text-muted)]">{t("composition")}</p><div role="group" className="mt-1 flex items-center gap-2" aria-label={t("compositionDiagramAria")}><span className="grid h-10 w-14 grid-cols-3 gap-0.5 rounded border border-[var(--border-default)] bg-[var(--surface-raised)] p-1" aria-hidden="true"><span className="col-span-2 rounded-sm bg-[var(--neutral-bg)]" /><span className="rounded-sm bg-[var(--text-muted)]/30" /><span className="col-span-3 rounded-sm bg-[var(--text-muted)]/20" /></span><span>{style.compositionPt || style.composition || unknown}</span></div></div>
              </div>
            ) : <p className="mt-1 text-sm text-[var(--text-primary)]">{t("variationAnalysisUnavailable")}</p>}
          </div>
        </div>
      )}

      {editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={saveState === "saving"} onClick={() => void save()} className="rounded-[var(--radius-control)] bg-[var(--accent-solid)] px-3 py-2 text-sm font-semibold text-[var(--accent-solid-foreground)] disabled:opacity-60">{saveState === "saving" ? t("savingAnalysis") : saveState === "error" ? t("retryAnalysis") : t("saveAnalysis")}</button>
          <button type="button" disabled={saveState === "saving"} onClick={() => { setDraft({ contentAnalysis: source.contentAnalysis, styleAnalysis: source.styleAnalysis }); setEditing(false); setSaveState("idle"); }} className="rounded-[var(--radius-control)] border border-[var(--border-default)] px-3 py-2 text-sm">{t("cancelAnalysis")}</button>
        </div>
      ) : null}
      <div aria-live="polite">{saveState === "error" ? <p role="alert" className="text-sm text-[var(--danger-text)]">{t("saveAnalysisError")}</p> : saveState === "saved" ? <p className="text-sm text-[var(--success-text)]">{t("savedAnalysis")}</p> : null}</div>
      </div>
      </details>
    </section>
  );
}
