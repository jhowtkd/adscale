"use client";

import { ChevronRight, ImageIcon, PenLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { GuidedFlowPath } from "@/lib/hooks/use-guided-flow";

export interface AssistantJourneyCardsProps {
  onSelectPath: (path: Exclude<GuidedFlowPath, "unclassified">) => void;
  disabled?: boolean;
}

const JOURNEYS: Array<{
  path: Exclude<GuidedFlowPath, "unclassified">;
  icon: typeof ImageIcon;
  step: string;
}> = [
  { path: "existing_creative", icon: ImageIcon, step: "01" },
  { path: "from_zero", icon: PenLine, step: "02" },
];

export default function AssistantJourneyCards({
  onSelectPath,
  disabled = false,
}: AssistantJourneyCardsProps) {
  const t = useTranslations("assistant.start.journeys");

  return (
    <div
      className="w-full max-w-2xl overflow-hidden rounded-[var(--radius-object)] border border-[var(--border-dim)] bg-[var(--surface-base)]"
      data-testid="assistant-journey-cards"
    >
      {JOURNEYS.map(({ path, icon: Icon, step }, index) => (
        <button
          key={path}
          type="button"
          disabled={disabled}
          onClick={() => onSelectPath(path)}
          data-testid={`assistant-journey-card-${path}`}
          className={cn(
            "flex w-full items-center gap-4 px-4 py-4 text-left transition-colors",
            index > 0 && "border-t border-[var(--border-dim)]",
            "hover:bg-[var(--surface-raised)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]",
            disabled && "pointer-events-none opacity-50"
          )}
        >
          <span className="w-6 shrink-0 font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            {step}
          </span>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--surface-inset)] text-[var(--accent-primary)]">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-[var(--text-primary)]">{t(`${path}.title`)}</span>
            <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{t(`${path}.subtitle`)}</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
