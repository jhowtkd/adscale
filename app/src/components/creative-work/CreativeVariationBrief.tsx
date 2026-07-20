"use client";

import type { RefObject } from "react";
import { useTranslations } from "next-intl";
import type { CreativeWorkSource } from "@/lib/hooks/use-creative-work";

function joinParts(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

export function summarizeVariationContent(
  source: Pick<CreativeWorkSource, "contentAnalysis">,
): string {
  const content = source.contentAnalysis;
  if (!content) return "";

  return joinParts([
    content.product ? `Produto: ${content.product}` : null,
    content.textContent.headline
      ? `Headline: ${content.textContent.headline}`
      : null,
    content.offer ? `Oferta: ${content.offer}` : null,
    content.cta.text ? `CTA: ${content.cta.text}` : null,
  ]);
}

export function summarizeVariationStyle(
  source: Pick<CreativeWorkSource, "styleAnalysis">,
): string {
  const style = source.styleAnalysis;
  if (!style) return "";

  const colors = [
    ...style.colorPalette.dominant,
    ...style.colorPalette.accents,
  ].filter(Boolean);

  return joinParts([
    style.mood ? `Clima: ${style.mood}` : null,
    style.composition ? `Composição: ${style.composition}` : null,
    colors.length > 0 ? `Cores: ${colors.join(", ")}` : null,
    style.typography.personality
      ? `Tipografia: ${style.typography.personality}`
      : null,
  ]);
}

export function CreativeVariationBrief({
  source,
  value,
  onChange,
  textareaRef,
}: {
  source: CreativeWorkSource;
  value: string;
  onChange: (value: string) => void;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const t = useTranslations("dashboard.home.composer");
  const content = summarizeVariationContent(source);
  const style = summarizeVariationStyle(source);

  return (
    <section
      aria-labelledby="variation-analysis-title"
      className="space-y-4 rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4"
    >
      <h2
        id="variation-analysis-title"
        className="text-sm font-semibold text-[var(--text-primary)]"
      >
        {t("variationAnalysisTitle")}
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[var(--radius-control)] bg-[var(--surface-inset)] p-3">
          <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
            {t("variationContentTitle")}
          </h3>
          <p className="mt-1 text-sm text-[var(--text-primary)]">
            {content || t("variationAnalysisUnavailable")}
          </p>
        </div>

        <div className="rounded-[var(--radius-control)] bg-[var(--surface-inset)] p-3">
          <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
            {t("variationStyleTitle")}
          </h3>
          <p className="mt-1 text-sm text-[var(--text-primary)]">
            {style || t("variationAnalysisUnavailable")}
          </p>
        </div>
      </div>

      <label className="block text-sm font-medium text-[var(--text-primary)]">
        {t("variationInstructionsLabel")}
        <span className="mt-1 block text-xs font-normal text-[var(--text-muted)]">
          {t("variationInstructionsHint")}
        </span>
        <textarea
          ref={textareaRef}
          aria-label={t("variationInstructionsLabel")}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t("variationInstructionsPlaceholder")}
          rows={4}
          className="mt-2 w-full resize-y rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
        />
      </label>
    </section>
  );
}
