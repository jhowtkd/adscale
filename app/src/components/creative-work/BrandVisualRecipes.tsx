"use client";

import { useTranslations } from "next-intl";
import type { VisualRecipeListItem } from "@/lib/hooks/use-visual-recipes";
import type { CommercialOfferListItem } from "@/lib/hooks/use-commercial-offers";

export function BrandVisualRecipes({
  recipes,
  onUse,
  offers = [],
  onUseOffer,
  disabled = false,
}: {
  recipes: VisualRecipeListItem[];
  onUse: (recipeId: string) => void | Promise<void>;
  offers?: CommercialOfferListItem[];
  onUseOffer?: (offerId: string) => void | Promise<void>;
  disabled?: boolean;
}) {
  const t = useTranslations("dashboard.home.composer");
  if (recipes.length === 0 && offers.length === 0) return null;

  return (
    <div className="space-y-4">
      {recipes.length > 0 ? (
        <div className="space-y-2" data-testid="brand-visual-recipes">
          <p className="text-sm font-medium text-[var(--text-secondary)]">{t("recipes.title")}</p>
          <ul className="space-y-2">
            {recipes.map((recipe) => (
              <li key={recipe.id} className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[var(--text-primary)]">
                    {recipe.document.fields.headline}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {recipe.document.format} · v{recipe.version}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void onUse(recipe.id)}
                  className="shrink-0 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t("recipes.use")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {offers.length > 0 && onUseOffer ? (
        <div className="space-y-2" data-testid="brand-commercial-offers">
          <p className="text-sm font-medium text-[var(--text-secondary)]">{t("offers.title")}</p>
          <ul className="space-y-2">
            {offers.map((offer) => (
              <li key={offer.id} className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[var(--text-primary)]">
                    {offer.document.product}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {offer.document.offer}
                    {offer.document.price ? ` · ${offer.document.price}` : ""}
                    {" · v"}
                    {offer.version}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void onUseOffer(offer.id)}
                  className="shrink-0 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t("offers.use")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
