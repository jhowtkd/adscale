"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Kanban, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";

// "Painel | Pipeline" view selector. Painel is the conversation home for the account; Pipeline is the client
// pipeline page. Rendered with the product's segmented style (no gradients, no purple accents). It sits in the
// header of every screen of the rail shell, where Painel is the view of everything but /pipeline.
// The pipeline link carries the chosen account so it survives the switch.

export default function EquipeViewSelector({
  active,
  accountId,
}: {
  active: "painel" | "pipeline" | null;
  accountId: string | null;
}) {
  const t = useTranslations("equipe.viewSelector");
  const item = (isActive: boolean) =>
    cn(
      "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
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
        href="/"
        aria-current={active === "painel" ? "page" : undefined}
        className={item(active === "painel")}
        data-testid="equipe-view-painel"
      >
        <LayoutGrid size={12} aria-hidden="true" />
        {t("painel")}
      </Link>
      <Link
        href={accountId ? `/pipeline?account=${accountId}` : "/pipeline"}
        aria-current={active === "pipeline" ? "page" : undefined}
        className={item(active === "pipeline")}
        data-testid="equipe-view-pipeline"
      >
        <Kanban size={12} aria-hidden="true" />
        {t("pipeline")}
      </Link>
    </nav>
  );
}
