"use client";

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
}: {
  source: CreativeWorkSource;
}) {
  const t = useTranslations("dashboard.home.composer");
  const content = source.contentAnalysis;
  const style = source.styleAnalysis;

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
          {content ? (
            <>
              <p className="mt-2 text-sm text-[var(--text-primary)]">
                {content.summaryPt || summarizeVariationContent(source)}
              </p>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                {[
                  [t("product"), content.product],
                  [t("headline"), content.textContent.headline],
                  [t("offer"), content.offer],
                  [t("ctaText"), content.cta.text],
                  [t("keyVisual"), content.keyVisual],
                  [t("extractedFormat"), content.format],
                ].map(([label, fieldValue]) => fieldValue ? (
                  <div key={label}>
                    <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
                    <dd className="font-medium text-[var(--text-primary)]">{fieldValue}</dd>
                  </div>
                ) : null)}
              </dl>
              {content.entities?.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5" aria-label={t("identifiedEntities")}>
                  {content.entities.map((entity) => (
                    <span key={entity} className="rounded-full bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-secondary)]">{entity}</span>
                  ))}
                </div>
              ) : null}
              <details className="mt-3 rounded-[var(--radius-control)] bg-[var(--surface-raised)] px-3 py-2">
                <summary className="cursor-pointer text-xs font-semibold text-[var(--text-secondary)]">
                  {t("literalTextTitle")}
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-primary)]">
                  {content.literalText || t("literalTextUnavailable")}
                </p>
              </details>
            </>
          ) : <p className="mt-1 text-sm text-[var(--text-primary)]">{t("variationAnalysisUnavailable")}</p>}
        </div>

        <div className="rounded-[var(--radius-control)] bg-[var(--surface-inset)] p-3">
          <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
            {t("variationStyleTitle")}
          </h3>
          {style ? (
            <div className="mt-2 space-y-3 text-sm text-[var(--text-primary)]">
              <p>{summarizeVariationStyle(source)}</p>
              {style.palette?.length ? (
                <div>
                  <p className="text-xs text-[var(--text-muted)]">{t("dominantColors")}</p>
                  <div className="mt-1 flex flex-wrap gap-2" aria-label={t("paletteAria")}>
                    {style.palette.map((sample) => (
                      <span key={`${sample.hex}-${sample.labelPt}`} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-raised)] px-2 py-1 text-xs">
                        <span className="h-4 w-4 rounded-full border border-black/10" style={{ backgroundColor: sample.hex }} aria-hidden="true" />
                        {sample.labelPt}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p><span className="text-xs text-[var(--text-muted)]">{t("dominantColors")}: </span>{style.colorPalette.dominant.concat(style.colorPalette.accents).join(", ") || t("variationAnalysisUnavailable")}</p>
              )}

              <div>
                <p className="text-xs text-[var(--text-muted)]">{t("typography")}</p>
                <p className="mt-1 text-lg" style={style.typography.family ? { fontFamily: style.typography.family } : undefined}>
                  Aa · {style.typography.stylePt || style.typography.personality || t("variationAnalysisUnavailable")}
                </p>
                {style.typography.weight ? <p className="text-xs text-[var(--text-muted)]">{style.typography.weight}</p> : null}
              </div>

              <div>
                <p className="text-xs text-[var(--text-muted)]">{t("mood")}</p>
                <div className="mt-1 flex flex-wrap gap-1.5" aria-label={t("moodAria")}>
                  {(style.moodChipsPt?.length ? style.moodChipsPt : style.mood ? [style.mood] : []).map((chip) => (
                    <span key={chip} className="rounded-full bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-secondary)]">{chip}</span>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs text-[var(--text-muted)]">{t("composition")}</p>
                <div className="mt-1 flex items-center gap-2" aria-label={t("compositionDiagramAria")}>
                  <span className="grid h-10 w-14 grid-cols-3 gap-0.5 rounded border border-[var(--border-default)] bg-[var(--surface-raised)] p-1" aria-hidden="true">
                    <span className="col-span-2 rounded-sm bg-[var(--neutral-bg)]" />
                    <span className="rounded-sm bg-[var(--text-muted)]/30" />
                    <span className="col-span-3 rounded-sm bg-[var(--text-muted)]/20" />
                  </span>
                  <span>{style.compositionPt || style.composition || t("variationAnalysisUnavailable")}</span>
                </div>
              </div>
            </div>
          ) : <p className="mt-1 text-sm text-[var(--text-primary)]">{t("variationAnalysisUnavailable")}</p>}
        </div>
      </div>

    </section>
  );
}
