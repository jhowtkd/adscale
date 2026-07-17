"use client";

import { useTranslations } from "next-intl";
import { CopyPlus, Image, Maximize, WandSparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComposerIntent } from "./useCreativeComposer";

const TOOLS = [
  { id: "variations", icon: CopyPlus },
  { id: "single", icon: Image },
  { id: "format_adaptation", icon: Maximize },
  { id: "restyle", icon: WandSparkles },
] as const;

export function CreativeToolCards({ selected, onSelect }: {
  selected: ComposerIntent;
  onSelect: (intent: ComposerIntent) => void;
}) {
  const t = useTranslations("dashboard.home.tools");
  return (
    <section aria-labelledby="creative-tools-title">
      <h2 id="creative-tools-title" className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
        {t("title")}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TOOLS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={selected === id}
            onClick={() => onSelect(id)}
            className={cn(
              "rounded-[var(--radius-object)] border bg-[var(--surface-raised)] p-4 text-left",
              "transition-colors hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]",
              selected === id ? "border-[var(--accent-primary)]" : "border-[var(--border-subtle)]",
            )}
          >
            <Icon size={18} aria-hidden="true" className="mb-3 text-[var(--accent-primary-text)]" />
            <span className="block text-sm font-semibold text-[var(--text-primary)]">{t(id)}</span>
            <span className="mt-1 block text-xs text-[var(--text-muted)]">{t(`${id}Description`)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
