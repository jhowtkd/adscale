"use client";

import { useTranslations } from "next-intl";
import type { CarouselVisualContractV1 } from "@/server/creative-work/carousel-contracts";

const FAMILY_DENSITY = {
  impact: "high",
  development: "medium",
  respite: "low",
} as const;

/**
 * Read-only view of the frozen visual contract: palette, type authority,
 * motifs, the three layout families, prohibitions, exact assets and the
 * temporary-reference scope. Renders nothing before prepare freezes a
 * contract.
 */
export function CarouselVisualSummary({ visualContract }: { visualContract: CarouselVisualContractV1 | null }) {
  const t = useTranslations("dashboard.home.composer.carousel");
  if (!visualContract) return null;

  return (
    <section
      aria-labelledby="carousel-visual-title"
      data-testid="carousel-visual-summary"
      className="rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4"
    >
      <h2 id="carousel-visual-title" className="text-base font-semibold text-[var(--text-primary)]">
        {t("visualTitle")}
      </h2>
      <dl className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{t("paletteLabel")}</dt>
          <dd className="mt-2 flex flex-wrap gap-2">
            {visualContract.palette.map((color) => (
              <span
                key={color}
                title={color}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-secondary)]"
              >
                <span aria-hidden="true" className="size-4 rounded-full border border-[var(--border-default)]" style={{ backgroundColor: color }} />
                {color}
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{t("typographyLabel")}</dt>
          <dd data-testid="carousel-visual-typography" className="mt-2 text-sm text-[var(--text-secondary)]">
            {visualContract.typography.authority === "approved" ? t("fontApproved") : t("fontFallback")}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{t("motifsLabel")}</dt>
          <dd>
            <ul data-testid="carousel-visual-motifs" className="mt-2 list-disc space-y-1 pl-4 text-sm text-[var(--text-secondary)]">
              {visualContract.recurringMotifs.map((motif) => (
                <li key={motif}>{motif}</li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{t("layoutFamiliesLabel")}</dt>
          <dd>
            <ul data-testid="carousel-visual-families" className="mt-2 space-y-1 text-sm text-[var(--text-secondary)]">
              {(Object.keys(FAMILY_DENSITY) as Array<keyof typeof FAMILY_DENSITY>).map((family) => (
                <li key={family}>
                  {t(`layout_${family}`)} · {t(`density_${FAMILY_DENSITY[family]}`)}
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{t("prohibitedLabel")}</dt>
          <dd>
            <ul data-testid="carousel-visual-prohibitions" className="mt-2 list-disc space-y-1 pl-4 text-sm text-[var(--text-secondary)]">
              {visualContract.prohibitedElements.map((element) => (
                <li key={element}>{element}</li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{t("exactAssetsLabel")}</dt>
          <dd>
            <ul data-testid="carousel-visual-exact-assets" className="mt-2 list-disc space-y-1 pl-4 text-sm text-[var(--text-secondary)]">
              {visualContract.exactAssetKeys.map((asset) => (
                <li key={asset}>{asset}</li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>
      <p data-testid="carousel-visual-temporary" className="mt-4 text-xs text-[var(--text-muted)]">
        {visualContract.temporaryReferenceId
          ? t("temporaryReferenceWith", { id: visualContract.temporaryReferenceId })
          : t("temporaryReferenceWithout")}
      </p>
    </section>
  );
}
