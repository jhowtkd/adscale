// Segmented consoles switcher (Exceções · Pipeline · Qualidade), in the
// product's white-pill style — the v3 gradient pills stay in the export.

"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export default function EquipeViewToggle({
  active,
}: {
  active: "exceptions" | "accounts" | "quality";
}) {
  const t = useTranslations("equipe.common");
  const items = [
    { key: "exceptions", href: "/admin/equipe/exceptions", label: t("viewToggleExceptions") },
    { key: "accounts", href: "/admin/equipe/accounts", label: t("viewTogglePipeline") },
    { key: "quality", href: "/admin/equipe/quality", label: t("viewToggleQuality") },
  ] as const;
  return (
    <nav
      aria-label={t("viewToggleLabel")}
      className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--border-dim)] bg-[var(--surface-base)] p-1"
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={active === item.key ? "page" : undefined}
          className={cn(
            "rounded-[var(--radius-pill)] px-3 py-1 text-sm font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
            active === item.key
              ? "bg-[var(--action-primary-bg)] text-[var(--action-primary-text)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
