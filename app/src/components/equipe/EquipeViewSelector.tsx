"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// "Painel | Pipeline" view selector. Painel is the existing conversation
// home for the account; Pipeline is the client pipeline page. Rendered with
// the product's segmented style (no gradients, no purple accents).

export default function EquipeViewSelector({ active }: { active: "painel" | "pipeline" }) {
  const t = useTranslations("equipe.viewSelector");
  const item = (isActive: boolean) =>
    cn(
      "rounded-full px-3 py-1 text-xs font-medium transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
      isActive
        ? "bg-[var(--active-navigation-bg)] text-[var(--active-navigation-text)]"
        : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
    );
  return (
    <nav
      aria-label={t("label")}
      data-testid="equipe-view-selector"
      className="flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-base)] p-1"
    >
      <Link
        href="/assistant"
        aria-current={active === "painel" ? "page" : undefined}
        className={item(active === "painel")}
        data-testid="equipe-view-painel"
      >
        {t("painel")}
      </Link>
      <Link
        href="/pipeline"
        aria-current={active === "pipeline" ? "page" : undefined}
        className={item(active === "pipeline")}
        data-testid="equipe-view-pipeline"
      >
        {t("pipeline")}
      </Link>
    </nav>
  );
}
