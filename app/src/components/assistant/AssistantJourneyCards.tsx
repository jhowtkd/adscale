"use client";

import { ImageIcon, Sparkles } from "lucide-react";
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
}> = [
  { path: "existing_creative", icon: ImageIcon },
  { path: "from_zero", icon: Sparkles },
];

export default function AssistantJourneyCards({
  onSelectPath,
  disabled = false,
}: AssistantJourneyCardsProps) {
  const t = useTranslations("assistant.start.journeys");

  return (
    <div
      className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2"
      data-testid="assistant-journey-cards"
    >
      {JOURNEYS.map(({ path, icon: Icon }) => (
        <button
          key={path}
          type="button"
          disabled={disabled}
          onClick={() => onSelectPath(path)}
          data-testid={`assistant-journey-card-${path}`}
          className={cn(
            "flex flex-col items-start gap-2 rounded-2xl border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4 text-left transition-colors",
            "hover:border-[var(--accent-primary)] hover:bg-[var(--surface-secondary)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]",
            disabled && "pointer-events-none opacity-50"
          )}
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-[var(--surface-secondary)] text-[var(--accent-primary)]">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {t(`${path}.title`)}
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            {t(`${path}.subtitle`)}
          </span>
        </button>
      ))}
    </div>
  );
}
