"use client";

import { useState } from "react";
import { Expand } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { CreativeResultCard } from "@/components/creative-work/CreativeResultCard";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CreativeWorkOutput } from "@/lib/hooks/use-creative-work";

type CreativeProposalGridProps = {
  outputs: CreativeWorkOutput[];
  onRetry: (outputId: string) => void;
  onRetryRevision?: (output: CreativeWorkOutput) => void | Promise<void>;
  onApprove?: (outputId: string, confirmObjective?: boolean) => void;
  /** Legacy wizard alias; remove with the wizard redirect. */
  onSave?: (outputId: string) => void;
  onDownload: (outputId: string) => void;
  onRevise?: (outputId: string, instruction: string, attachment: File | null) => void | Promise<void>;
  isRetrying?: (outputId: string) => boolean;
  isApproving?: (outputId: string) => boolean;
  approvalErrorOutputId?: string | null;
  isRevising?: (outputId: string) => boolean;
  isSaving?: (outputId: string) => boolean;
};

const LEVEL_ORDER: CreativeWorkOutput["creativeLevel"][] = ["conservative", "balanced", "bold"];
const LEVEL_LABELS: Record<CreativeWorkOutput["creativeLevel"], string> = {
  conservative: "Conservadora",
  balanced: "Equilibrada",
  bold: "Ousada",
};

function outputLabel(output: CreativeWorkOutput) {
  return output.directionSnapshot?.label ?? LEVEL_LABELS[output.creativeLevel];
}

function outputSource(output: CreativeWorkOutput) {
  if (output.outputKey?.startsWith("data:image/")) return output.outputKey;
  return `/api/creative-work/${output.workItemId}/outputs/${output.id}/download`;
}

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
  approvalErrorOutputId,
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
  const [selectedId, setSelectedId] = useState(visible[0]?.id);
  const [expanded, setExpanded] = useState(false);
  const selected = visible.find((output) => output.id === selectedId) ?? visible[0];

  if (!selected) return null;

  const label = outputLabel(selected);
  const format = selected.targetFormat ?? "4:5";
  const available = selected.status === "completed" && Boolean(selected.outputKey);
  const isGenerating = selected.status === "queued" || selected.status === "processing";

  return (
    <>
      <div className="grid gap-4 rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3 lg:grid-cols-[5.5rem_minmax(0,1fr)_16rem] lg:p-5">
        <nav aria-label="Miniaturas das propostas" className="flex gap-2 overflow-x-auto lg:flex-col">
          {visible.map((output) => {
            const outputFormat = output.targetFormat ?? "4:5";
            const outputName = outputLabel(output);
            const completed = output.status === "completed" && Boolean(output.outputKey);
            return (
              <button
                key={output.id}
                type="button"
                aria-pressed={output.id === selected.id}
                aria-label={`Selecionar ${outputName} em ${outputFormat}`}
                onClick={() => setSelectedId(output.id)}
                className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[var(--radius-control)] border-2 border-transparent bg-[var(--surface-inset)] aria-pressed:border-[var(--focus-ring)]"
              >
                {completed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={outputSource(output)} alt="" className="h-full w-full object-cover" />
                ) : <span className="text-xs text-[var(--text-muted)]">{output.status === "failed" ? "Falhou" : "…"}</span>}
          <span className="absolute inset-x-1 bottom-1 rounded bg-black/70 px-1 py-0.5 text-xs font-medium text-white">{outputFormat}</span>
              </button>
            );
          })}
        </nav>

        <div className="min-w-0">
          <button
            type="button"
            data-testid="review-preview"
            disabled={!available}
            aria-label={`Ampliar ${label} em ${format}`}
            onClick={() => setExpanded(true)}
            className="group relative mx-auto flex w-full items-center justify-center overflow-hidden rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-inset)] disabled:cursor-default"
            style={{ aspectRatio: format.replace(":", " / ") }}
          >
            {available ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={outputSource(selected)} alt={`Proposta ${label}, formato ${format}`} className="h-full w-full object-contain" />
            ) : isGenerating ? (
              <span role="status" className="flex h-full flex-col items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
                <ThinkingOrb state="working" size={64} aria-hidden="true" />
                <span>Gerando…</span>
              </span>
            ) : (
              <span role="status" className="text-sm text-[var(--text-muted)]">{selected.status === "failed" ? "Falhou" : "Gerando…"}</span>
            )}
            {available ? <span className="absolute right-3 top-3 rounded-full bg-black/70 p-2 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100"><Expand aria-hidden="true" className="size-4" /></span> : null}
          </button>
        </div>

        <div role="list" aria-label="Superfície de aprovação" className="min-w-0">
          <CreativeResultCard
            output={selected}
            label={label}
            onRetry={onRetry}
            onRetryRevision={onRetryRevision}
            onApprove={approve}
            onDownload={onDownload}
            onRevise={onRevise}
            isRetrying={isRetrying?.(selected.id)}
            isApproving={isApproving?.(selected.id) ?? isSaving?.(selected.id)}
            approvalError={approvalErrorOutputId === selected.id}
            isRevising={isRevising?.(selected.id)}
            hidePreview
          />
        </div>
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent size="xl" className="h-[min(92dvh,900px)] max-h-[92dvh]">
          <DialogHeader>
            <DialogTitle>{label} · {format}</DialogTitle>
            <DialogDescription>Inspeção ampliada na proporção original, sem corte.</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex min-h-0 items-center justify-center bg-[var(--surface-inset)] p-2 sm:p-4">
            {available ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={outputSource(selected)} alt={`Proposta ${label}, formato ${format}, ampliada`} className="max-h-full max-w-full object-contain" />
            ) : null}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
