"use client";

import { CreativeResultCard } from "@/components/creative-work/CreativeResultCard";
import type { CreativeWorkOutput } from "@/lib/hooks/use-creative-work";

type CreativeProposalGridProps = {
  outputs: CreativeWorkOutput[];
  onRetry: (outputId: string) => void;
  onRetryRevision?: (output: CreativeWorkOutput) => void | Promise<void>;
  onApprove?: (outputId: string) => void;
  /** Legacy wizard alias; remove with the wizard redirect. */
  onSave?: (outputId: string) => void;
  onDownload: (outputId: string) => void;
  onRevise?: (outputId: string, instruction: string, attachment: File | null) => void | Promise<void>;
  isRetrying?: (outputId: string) => boolean;
  isApproving?: (outputId: string) => boolean;
  isRevising?: (outputId: string) => boolean;
  isSaving?: (outputId: string) => boolean;
};

const LEVEL_ORDER: CreativeWorkOutput["creativeLevel"][] = ["conservative", "balanced", "bold"];
const LEVEL_LABELS: Record<CreativeWorkOutput["creativeLevel"], string> = {
  conservative: "Conservadora",
  balanced: "Equilibrada",
  bold: "Ousada",
};

export default function CreativeProposalGrid({
  outputs,
  onRetry,
  onRetryRevision,
  onApprove,
  onSave,
  onDownload,
  onRevise,
  isRetrying,
  isApproving,
  isRevising,
  isSaving,
}: CreativeProposalGridProps) {
  const latest = new Map<string, CreativeWorkOutput>();
  for (const output of outputs) {
    const key = output.directionId
      ? `${output.targetFormat ?? "4:5"}:direction:${output.directionId}`
      : `${output.targetFormat ?? "4:5"}:${output.creativeLevel}`;
    const current = latest.get(key);
    if (!current || (output.versionNumber ?? 1) > (current.versionNumber ?? 1)) latest.set(key, output);
  }
  const visible = [...latest.values()].sort((left, right) =>
    (left.targetFormat ?? "4:5").localeCompare(right.targetFormat ?? "4:5")
      || (left.directionSnapshot?.order ?? LEVEL_ORDER.indexOf(left.creativeLevel))
        - (right.directionSnapshot?.order ?? LEVEL_ORDER.indexOf(right.creativeLevel)),
  );
  const approve = onApprove ?? onSave ?? (() => undefined);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="list" aria-label="Propostas criativas">
      {visible.map((output) => (
        <CreativeResultCard
          key={output.id}
          output={output}
          label={output.directionSnapshot?.label ?? LEVEL_LABELS[output.creativeLevel]}
          onRetry={onRetry}
          onRetryRevision={onRetryRevision}
          onApprove={approve}
          onDownload={onDownload}
          onRevise={onRevise}
          isRetrying={isRetrying?.(output.id)}
          isApproving={isApproving?.(output.id) ?? isSaving?.(output.id)}
          isRevising={isRevising?.(output.id)}
        />
      ))}
    </div>
  );
}
