"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { CreativeWorkSource } from "@/lib/hooks/use-creative-work";

const INPUT_CLASS = "w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]";

const joinList = (values: string[]) => values.join(", ");
const splitList = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
const joinLines = (values: string[]) => values.join("\n");
const splitLines = (value: string) => value.split("\n").map((item) => item.trim()).filter(Boolean);

function Field({ label, value, onChange, multiline = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  const control = multiline ? (
    <textarea aria-label={label} className={INPUT_CLASS} rows={3} value={value} onChange={(event) => onChange(event.target.value)} />
  ) : (
    <input aria-label={label} className={INPUT_CLASS} value={value} onChange={(event) => onChange(event.target.value)} />
  );
  return <label className="text-xs text-[var(--text-secondary)]">{label}{control}</label>;
}

export function CreativeSourceAnalysisEditor({
  source,
  onSave,
  onSaved,
}: {
  source: CreativeWorkSource;
  onSave: (
    content: CreativeWorkSource["contentAnalysis"],
    style: CreativeWorkSource["styleAnalysis"],
  ) => Promise<boolean>;
  onSaved: () => void;
}) {
  const t = useTranslations("dashboard.home.composer");
  const [content, setContent] = useState(source.contentAnalysis);
  const [style, setStyle] = useState(source.styleAnalysis);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const save = async () => {
    setIsSaving(true);
    setSaveFailed(false);
    const saved = await onSave(content, style);
    if (saved) {
      onSaved();
      return;
    }
    setIsSaving(false);
    setSaveFailed(true);
  };

  return (
    <div className="mt-2 space-y-4 rounded-[var(--radius-control)] bg-[var(--surface-inset)] p-4">
      {content ? (
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-[var(--text-primary)]">{t("analysisContent")}</legend>
          <Field label={t("product")} value={content.product} onChange={(product) => setContent({ ...content, product })} />
          <Field label={t("offer")} value={content.offer} onChange={(offer) => setContent({ ...content, offer })} />
          <Field label={t("headline")} value={content.textContent.headline} onChange={(headline) => setContent({ ...content, textContent: { ...content.textContent, headline } })} />
          <Field label={t("ctaText")} value={content.cta.text} onChange={(text) => setContent({ ...content, cta: { ...content.cta, text } })} />
          <Field label={t("ctaStyle")} value={content.cta.style} onChange={(ctaStyle) => setContent({ ...content, cta: { ...content.cta, style: ctaStyle } })} />
          <Field label={t("keyVisual")} value={content.keyVisual} onChange={(keyVisual) => setContent({ ...content, keyVisual })} />
          <Field label={t("brandElements")} value={joinList(content.brandElements)} onChange={(value) => setContent({ ...content, brandElements: splitList(value) })} />
          <Field label={t("extractedFormat")} value={content.format} onChange={(format) => setContent({ ...content, format })} />
          <div className="sm:col-span-2">
            <Field label={t("bullets")} multiline value={joinLines(content.textContent.bullets)} onChange={(value) => setContent({ ...content, textContent: { ...content.textContent, bullets: splitLines(value) } })} />
          </div>
        </fieldset>
      ) : null}
      {style ? (
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-[var(--text-primary)]">{t("analysisStyle")}</legend>
          <Field label={t("mood")} value={style.mood} onChange={(mood) => setStyle({ ...style, mood })} />
          <Field label={t("composition")} value={style.composition} onChange={(composition) => setStyle({ ...style, composition })} />
          <Field label={t("dominantColors")} value={joinList(style.colorPalette.dominant)} onChange={(value) => setStyle({ ...style, colorPalette: { ...style.colorPalette, dominant: splitList(value) } })} />
          <Field label={t("accentColors")} value={joinList(style.colorPalette.accents)} onChange={(value) => setStyle({ ...style, colorPalette: { ...style.colorPalette, accents: splitList(value) } })} />
          <Field label={t("gradients")} value={style.colorPalette.gradients} onChange={(gradients) => setStyle({ ...style, colorPalette: { ...style.colorPalette, gradients } })} />
          <Field label={t("typography")} value={style.typography.personality} onChange={(personality) => setStyle({ ...style, typography: { ...style.typography, personality } })} />
          <Field label={t("typographyEffects")} value={joinList(style.typography.effects)} onChange={(value) => setStyle({ ...style, typography: { ...style.typography, effects: splitList(value) } })} />
          <Field label={t("textures")} value={joinList(style.textures)} onChange={(value) => setStyle({ ...style, textures: splitList(value) })} />
          <Field label={t("decorativeElements")} value={joinList(style.decorativeElements)} onChange={(value) => setStyle({ ...style, decorativeElements: splitList(value) })} />
          <Field label={t("photoTreatment")} value={style.photoTreatment} onChange={(photoTreatment) => setStyle({ ...style, photoTreatment })} />
        </fieldset>
      ) : null}
      <button
        type="button"
        disabled={isSaving}
        onClick={() => void save()}
        className="rounded-[var(--radius-control)] bg-[var(--accent-primary)] px-3 py-2 text-sm font-semibold text-[var(--text-on-accent)] disabled:opacity-50"
      >
        {isSaving ? t("savingData") : t("saveData")}
      </button>
      {saveFailed ? <p role="alert" className="text-sm text-[var(--danger-text)]">{t("saveDataError")}</p> : null}
    </div>
  );
}
