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
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
function outputLabel(output: CreativeWorkOutput, levels: Record<CreativeWorkOutput["creativeLevel"], string>) {
  return output.directionSnapshot?.label ?? levels[output.creativeLevel];
}

function outputSource(output: CreativeWorkOutput) {
  return `/api/creative-work/${output.workItemId}/outputs/${output.id}/download`;
}

function hasUsableOutput(output: CreativeWorkOutput) {
  return output.status === "completed" && (output.hasOutput ?? Boolean(output.outputKey));
}

function outputLineage(
  outputs: readonly CreativeWorkOutput[],
  current: CreativeWorkOutput,
): CreativeWorkOutput[] {
  const byId = new Map(outputs.map((output) => [output.id, output]));
  const visited = new Set<string>();
  const lineage: CreativeWorkOutput[] = [];
  let cursor: CreativeWorkOutput | undefined = current;
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    lineage.push(cursor);
    cursor = cursor.parentOutputId ? byId.get(cursor.parentOutputId) : undefined;
  }
  return lineage;
}

function lineageRootId(outputs: readonly CreativeWorkOutput[], output: CreativeWorkOutput) {
  const lineage = outputLineage(outputs, output);
  return lineage.at(-1)?.id ?? output.id;
}

// History is the connected parent/child family rather than only ancestors of
// the current visual. This retains failed descendants for retry while the
// usable ancestor remains the visible source.
function outputFamily(outputs: readonly CreativeWorkOutput[], current: CreativeWorkOutput) {
  const byId = new Map(outputs.map((output) => [output.id, output]));
  const visited = new Set<string>([current.id]);
  const queue = [current.id];
  while (queue.length) {
    const id = queue.shift()!;
    const output = byId.get(id);
    const neighbours = [
      output?.parentOutputId ? byId.get(output.parentOutputId) : undefined,
      ...outputs.filter((candidate) => candidate.parentOutputId === id),
    ];
    for (const neighbour of neighbours) {
      if (neighbour && !visited.has(neighbour.id)) {
        visited.add(neighbour.id);
        queue.push(neighbour.id);
      }
    }
  }
  return outputs
    .filter((output) => visited.has(output.id))
    .sort((left, right) => (right.versionNumber ?? 1) - (left.versionNumber ?? 1));
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
  const levelLabels: Record<CreativeWorkOutput["creativeLevel"], string> = {
    conservative: t("proposal.level.conservative"), balanced: t("proposal.level.balanced"), bold: t("proposal.level.bold"),
  };
  const statusLabel = (status: CreativeWorkOutput["status"]) => t(`proposal.status.${status}`);
  const latest = new Map<string, CreativeWorkOutput>();
  for (const output of outputs) {
    const key = lineageRootId(outputs, output);
    const current = latest.get(key);
    if (!current) {
      latest.set(key, output);
      continue;
    }
    const outputIsUsable = hasUsableOutput(output);
    const currentIsUsable = hasUsableOutput(current);
    if ((outputIsUsable && (!currentIsUsable || (output.versionNumber ?? 1) > (current.versionNumber ?? 1)))
      || (!currentIsUsable && !outputIsUsable && (output.versionNumber ?? 1) > (current.versionNumber ?? 1))) {
      latest.set(key, output);
    }
  }
  const visible = [...latest.values()].sort((left, right) =>
    (left.targetFormat ?? "4:5").localeCompare(right.targetFormat ?? "4:5")
      || (left.directionSnapshot?.order ?? LEVEL_ORDER.indexOf(left.creativeLevel))
        - (right.directionSnapshot?.order ?? LEVEL_ORDER.indexOf(right.creativeLevel)),
  );
  const approve = onApprove ?? onSave ?? (() => undefined);
  const [selectedId, setSelectedId] = useState(visible[0]?.id);
  const [expanded, setExpanded] = useState(false);
  const [historyOutputId, setHistoryOutputId] = useState<string | null>(null);
  const [compareAncestorId, setCompareAncestorId] = useState<string | null>(null);
  const [layerEditorOutputId, setLayerEditorOutputId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const selected = visible.find((output) => output.id === selectedId) ?? visible[0];
  const layerEditorOutput = layerEditorOutputId
    ? outputs.find((output) => output.id === layerEditorOutputId)
    : null;
  const layerEditorMode = isMobile || !layerEditorOutput?.isSelected ? "inspect" : "edit";

  if (!selected) return null;

  const label = outputLabel(selected, levelLabels);
  const format = selected.targetFormat ?? "4:5";
  const aspectRatio = format.replace(":", " / ");
  const available = hasUsableOutput(selected);
  const generationCopy = selected.status === "processing"
    ? [t("factoryProcessingTitle"), t("factoryProcessingDescription")]
    : [t("factoryQueuedTitle"), t("factoryQueuedDescription")];
  const selectedFamily = outputFamily(outputs, selected);
  const historyOutput = historyOutputId ? visible.find((output) => output.id === historyOutputId) : null;
  const historyLineage = historyOutput ? outputFamily(outputs, historyOutput) : [];
  const compareAncestor = compareAncestorId
    ? historyLineage.find((output) => output.id === compareAncestorId && hasUsableOutput(output))
    : null;
  const totalOutputs = outputs.length;
  const readyCount = outputs.filter((output) => output.status === "completed" && (output.hasOutput ?? Boolean(output.outputKey))).length;
  const progressText = t("proposal.progress", { ready: readyCount, total: totalOutputs });

  return (
    <>
      <section aria-live="polite" aria-atomic="true" className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3" data-testid="creative-output-progress">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{progressText}</p>
        <ul className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">{outputs.map((output) => <li key={output.id}>{outputLabel(output, levelLabels)} · {statusLabel(output.status)}</li>)}</ul>
      </section>
      <div
        data-testid="proposal-review-surface"
        className={cn(
          "grid gap-4 rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3 lg:p-5",
          layout === "piece"
            ? "mx-auto w-full max-w-4xl grid-cols-1"
            : "lg:grid-cols-[5.5rem_minmax(0,1fr)_16rem]",
        )}
      >
        <nav aria-label={t("proposal.thumbnailsAria")} className={cn("flex gap-2 overflow-x-auto", layout === "studio" && "lg:flex-col")}>
          {visible.map((output) => {
            const outputFormat = output.targetFormat ?? "4:5";
            const outputName = outputLabel(output, levelLabels);
            const completed = hasUsableOutput(output);
            return (
              <button
                key={output.id}
                type="button"
                aria-pressed={output.id === selected.id}
                aria-label={t("proposal.selectAria", { name: outputName, format: outputFormat })}
                onClick={() => setSelectedId(output.id)}
                className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[var(--radius-control)] border-2 border-transparent bg-[var(--surface-inset)] aria-pressed:border-[var(--focus-ring)]"
              >
                {completed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={outputSource(output)} alt="" className="h-full w-full object-cover" />
                ) : <span className="text-xs text-[var(--text-muted)]">{output.status === "failed" ? statusLabel(output.status) : "…"}</span>}
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
            aria-label={t("proposal.expandAria", { name: label, format })}
            onClick={() => setExpanded(true)}
            className={cn(
              "group relative mx-auto flex w-full items-center justify-center overflow-hidden rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-inset)] disabled:cursor-default",
              layout === "piece" && "h-[min(72vh,680px)]",
            )}
            style={layout === "studio" ? { aspectRatio } : undefined}
          >
            {available ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={outputSource(selected)} alt={t("proposal.previewAlt", { name: label, format })} className="h-full w-full object-contain" />
            ) : (
              <span role="status" aria-live="polite" className="px-5">
                {selected.status === "failed" ? (
                  <p className="text-center text-sm text-[var(--text-muted)]">{statusLabel(selected.status)}</p>
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

        <div role="list" aria-label={t("proposal.approvalSurfaceAria")} className={cn("min-w-0", layout === "piece" && "border-t border-[var(--border-subtle)] pt-4")}>
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
          {selectedFamily.length > 1 ? <button type="button" onClick={() => setHistoryOutputId(selected.id)} className="mt-3 text-sm font-semibold underline">{t("proposal.variations", { count: selectedFamily.length })}</button> : null}
        </div>
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent size="xl" className="h-[min(92dvh,900px)] max-h-[92dvh]">
          <DialogHeader>
            <DialogTitle>{label} · {format}</DialogTitle>
            <DialogDescription>{t("proposal.expandedDescription")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex min-h-0 items-center justify-center bg-[var(--surface-inset)] p-2 sm:p-4">
            {available ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={outputSource(selected)} alt={t("proposal.expandedAlt", { name: label, format })} className="max-h-full max-w-full object-contain" />
            ) : null}
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Sheet open={Boolean(historyOutput)} onOpenChange={(open) => { if (!open) { setHistoryOutputId(null); setCompareAncestorId(null); } }}>
        <SheetContent side="right" size="lg"><SheetHeader><SheetTitle>{t("proposal.variations", { count: historyLineage.length })}</SheetTitle></SheetHeader><SheetBody className="space-y-3">
          {historyLineage.map((output) => <article key={output.id} className="flex items-center gap-3 rounded-[var(--radius-control)] border border-[var(--border-subtle)] p-3">
            {hasUsableOutput(output) ? <img src={outputSource(output)} alt={t("proposal.variationAlt", { count: output.versionNumber ?? 1 })} className="size-14 rounded object-cover" /> : null}
            <div className="min-w-0 flex-1"><p className="text-sm font-medium">{t("proposal.variation", { count: output.versionNumber ?? 1 })}</p><p className="text-xs text-[var(--text-muted)]">{new Date(output.createdAt).toLocaleDateString()} · {output.revisionInstruction ?? t("proposal.originalPiece")}</p><p className="text-xs text-[var(--text-muted)]">{statusLabel(output.status)}</p></div>
            {output.status === "failed" ? <button type="button" onClick={() => {
              if (output.parentOutputId && onRetryRevision) void onRetryRevision(output);
              else onRetry(output.id);
            }} className="text-sm font-semibold underline">{t("proposal.retry")}</button> : null}
            {historyOutput && output.id !== historyOutput.id && hasUsableOutput(historyOutput) && hasUsableOutput(output) ? <button type="button" onClick={() => setCompareAncestorId(output.id)} className="text-sm font-semibold underline">{t("proposal.compare")}</button> : null}
          </article>)}
        </SheetBody></SheetContent>
      </Sheet>
      <Dialog open={Boolean(historyOutput && hasUsableOutput(historyOutput) && compareAncestor)} onOpenChange={(open) => !open && setCompareAncestorId(null)}>
        <DialogContent size="xl"><DialogHeader><DialogTitle>{t("proposal.compareTitle")}</DialogTitle></DialogHeader><DialogBody className="grid gap-4 sm:grid-cols-2">
          {historyOutput ? <figure><figcaption className="mb-2 text-sm font-medium">{t("proposal.currentVariation")}</figcaption><img src={outputSource(historyOutput)} alt={t("proposal.currentVariation")} className="h-auto w-full" /></figure> : null}
          {compareAncestor ? <figure><figcaption className="mb-2 text-sm font-medium">{t("proposal.previousVariation")}</figcaption><img src={outputSource(compareAncestor)} alt={t("proposal.previousVariation")} className="h-auto w-full" /></figure> : null}
        </DialogBody></DialogContent>
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
