"use client";

import { useState } from "react";
import { Expand } from "lucide-react";
import { useTranslations } from "next-intl";
import { CreativeResultCard } from "@/components/creative-work/CreativeResultCard";
import { LayerEditorDialog } from "@/components/creative-work/layer-editor/LayerEditorDialog";
import { TetrisLoader } from "@/components/ui/loader-tetris";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CreativeWorkOutput } from "@/lib/hooks/use-creative-work";
import { useIsMobile } from "@/lib/hooks/use-media-query";
import { cn } from "@/lib/utils";
import type { LayerEditorAccessV1 } from "@/server/layer-editor/contracts";

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
  canLayerize?: boolean;
  onLayerize?: (outputId: string, retry?: boolean, operationId?: string) => Promise<"accepted" | "terminal" | "uncertain" | void> | void;
  onDownloadLayerized?: (outputId: string, format: "psd" | "zip") => void;
  isLayerizing?: (outputId: string) => boolean;
  layerEditorAccess?: LayerEditorAccessV1;
  onLayerEditorPublished?: () => void | Promise<void>;
  layout?: "studio" | "piece";
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
  if (output.status === "completed" && (output.hasOutput ?? Boolean(output.outputKey))) return `/api/creative-work/${output.workItemId}/outputs/${output.id}/download`;
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
  canLayerize,
  onLayerize,
  onDownloadLayerized,
  isLayerizing,
  layerEditorAccess,
  onLayerEditorPublished,
  layout = "studio",
}: CreativeProposalGridProps) {
  const t = useTranslations("dashboard.home.composer");
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
  const [layerEditorOutputId, setLayerEditorOutputId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const selected = visible.find((output) => output.id === selectedId) ?? visible[0];
  const layerEditorOutput = layerEditorOutputId
    ? outputs.find((output) => output.id === layerEditorOutputId)
    : null;
  const layerEditorMode = isMobile || !layerEditorOutput?.isSelected ? "inspect" : "edit";

  if (!selected) return null;

  const label = outputLabel(selected);
  const format = selected.targetFormat ?? "4:5";
  const aspectRatio = format.replace(":", " / ");
  const available = selected.status === "completed" && (selected.hasOutput ?? Boolean(selected.outputKey));
  const generationCopy = selected.status === "processing"
    ? [t("factoryProcessingTitle"), t("factoryProcessingDescription")]
    : [t("factoryQueuedTitle"), t("factoryQueuedDescription")];

  return (
    <>
      <div
        data-testid="proposal-review-surface"
        className={cn(
          "grid gap-4 rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3 lg:p-5",
          layout === "piece"
            ? "mx-auto w-full max-w-4xl grid-cols-1"
            : "lg:grid-cols-[5.5rem_minmax(0,1fr)_16rem]",
        )}
      >
        <nav aria-label="Miniaturas das propostas" className={cn("flex gap-2 overflow-x-auto", layout === "studio" && "lg:flex-col")}>
          {visible.map((output) => {
            const outputFormat = output.targetFormat ?? "4:5";
            const outputName = outputLabel(output);
            const completed = output.status === "completed" && (output.hasOutput ?? Boolean(output.outputKey));
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

        <div className={cn("min-w-0", layout === "piece" && "flex justify-center rounded-[var(--radius-object)] bg-[var(--surface-inset)] p-4 sm:p-6")}>
          <button
            type="button"
            data-testid="review-preview"
            disabled={!available}
            aria-busy={!available && selected.status !== "failed"}
            aria-label={`Ampliar ${label} em ${format}`}
            onClick={() => setExpanded(true)}
            className={cn(
              "group relative mx-auto flex w-full items-center justify-center overflow-hidden rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-inset)] disabled:cursor-default",
              layout === "piece" && "h-[min(72vh,680px)]",
            )}
            style={layout === "studio" ? { aspectRatio } : undefined}
          >
            {available ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={outputSource(selected)} alt={`Proposta ${label}, formato ${format}`} className="h-full w-full object-contain" />
            ) : (
              <span role="status" aria-live="polite" className="px-5">
                {selected.status === "failed" ? (
                  <p className="text-center text-sm text-[var(--text-muted)]">Falhou</p>
                ) : (
                  <span className="flex items-center gap-5 rounded-[var(--radius-object)] border border-[var(--border-default)] bg-[var(--surface-base)] px-5 py-4 text-left shadow-sm">
                    <TetrisLoader label={t("factoryActiveLabel")} />
                    <span>
                      <span className="block text-sm font-semibold text-[var(--text-primary)]">{generationCopy[0]}</span>
                      <span className="mt-1 block text-xs text-[var(--text-muted)]">{generationCopy[1]}</span>
                    </span>
                  </span>
                )}
              </span>
            )}
            {available ? <span className="absolute right-3 top-3 rounded-full bg-black/70 p-2 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100"><Expand aria-hidden="true" className="size-4" /></span> : null}
          </button>
        </div>

        <div role="list" aria-label="Superfície de aprovação" className={cn("min-w-0", layout === "piece" && "border-t border-[var(--border-subtle)] pt-4")}>
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
            canLayerize={canLayerize}
            onLayerize={onLayerize}
            onDownloadLayerized={onDownloadLayerized}
            isLayerizing={isLayerizing?.(selected.id)}
            layerEditorAccess={layerEditorAccess}
            isMobile={isMobile}
            onOpenLayerEditor={(outputId) => {
              setExpanded(false);
              setLayerEditorOutputId(outputId);
            }}
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

      {layerEditorOutput ? (
        <LayerEditorDialog
          key={layerEditorOutput.id}
          open
          workItemId={layerEditorOutput.workItemId}
          outputId={layerEditorOutput.id}
          mode={layerEditorMode}
          onOpenChange={(open) => {
            if (!open) setLayerEditorOutputId(null);
          }}
          onPublished={onLayerEditorPublished}
        />
      ) : null}
    </>
  );
}
