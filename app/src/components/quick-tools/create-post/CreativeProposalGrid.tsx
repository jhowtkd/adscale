"use client";

import { useEffect, useRef, useState } from "react";
import { Expand } from "lucide-react";
import { useTranslations } from "next-intl";
import { CreativeResultCard, type CreativeResultCardArtRefinement } from "@/components/creative-work/CreativeResultCard";
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
  onApprove?: (outputId: string, confirmObjective?: boolean, saveAsRecipe?: boolean) => void;
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
  /** Work-level automatic-refinement summary (plan 04, T3); absent on legacy works. */
  artRefinement?: CreativeResultCardArtRefinement;
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
  artRefinement,
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
    if ((output.versionNumber ?? 1) > (current.versionNumber ?? 1)) {
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
  const layerEditorMode = isMobile ? "inspect" : "edit";
  const layerizeStartedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!layerEditorOutput || isMobile || !onLayerize || !canLayerize) return;
    const ready = layerEditorOutput.layerization?.status === "completed" || Boolean(layerEditorOutput.layerEditor);
    if (ready || layerizeStartedFor.current === layerEditorOutput.id) return;
    layerizeStartedFor.current = layerEditorOutput.id;
    void onLayerize(layerEditorOutput.id);
  }, [canLayerize, isMobile, layerEditorOutput, onLayerize]);

  if (!selected) return null;

  const label = outputLabel(selected, levelLabels);
  const format = selected.targetFormat ?? "4:5";
  const aspectRatio = format.replace(":", " / ");
  const available = hasUsableOutput(selected);
  const generationCopy = selected.status === "processing"
    ? [t("factoryProcessingTitle"), t("factoryProcessingDescription")]
    : [t("factoryQueuedTitle"), t("factoryQueuedDescription")];
  const selectedLineage = outputLineage(outputs, selected);
  const historyOutput = historyOutputId ? outputs.find((output) => output.id === historyOutputId) : null;
  const historyLineage = historyOutput ? outputLineage(outputs, historyOutput) : [];
  const comparisonOutput = historyLineage.find(hasUsableOutput) ?? null;
  const compareAncestor = compareAncestorId
    ? historyLineage.find((output) => output.id === compareAncestorId && hasUsableOutput(output))
    : null;
  const totalOutputs = outputs.length;
  const readyCount = outputs.filter((output) => output.status === "completed" && (output.hasOutput ?? Boolean(output.outputKey))).length;
  const progressText = t("proposal.progress", { ready: readyCount, total: totalOutputs });

  return (
    <>
      {layout === "piece" ? null : (
      <section aria-live="polite" aria-atomic="true" className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3" data-testid="creative-output-progress">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{progressText}</p>
        <ul className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">{outputs.map((output) => <li key={output.id}>{outputLabel(output, levelLabels)} · {statusLabel(output.status)}</li>)}</ul>
      </section>
      )}
      <div
        data-testid="proposal-review-surface"
        className={cn(
          "grid gap-4",
          layout === "piece"
            ? "w-full grid-cols-1"
            : "rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3 lg:grid-cols-[5.5rem_minmax(0,1fr)_16rem] lg:p-5",
        )}
      >
        <nav
          aria-label={t("proposal.thumbnailsAria")}
          className={cn(
            "flex gap-2 overflow-x-auto",
            layout === "studio" && "lg:flex-col",
            layout === "piece" && visible.length < 2 && "hidden",
          )}
        >
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

        <div className={cn("min-w-0", layout === "piece" && "flex justify-center")}>
          <button
            type="button"
            data-testid="review-preview"
            disabled={!available}
            aria-busy={!available && selected.status !== "failed"}
            aria-label={t("proposal.expandAria", { name: label, format })}
            onClick={() => setExpanded(true)}
            className={cn(
              "group relative flex items-center justify-center overflow-hidden rounded-[var(--radius-object)] disabled:cursor-default",
              layout === "piece"
                ? "max-h-[min(48vh,520px)] w-auto border-0 bg-transparent"
                : "mx-auto w-full border border-[var(--border-subtle)] bg-[var(--surface-inset)]",
            )}
            style={layout === "studio" ? { aspectRatio } : undefined}
          >
            {available ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={outputSource(selected)} alt={t("proposal.previewAlt", { name: label, format })} className={cn("object-contain", layout === "piece" ? "max-h-[min(48vh,520px)] w-auto" : "h-full w-full")} />
            ) : (
              <span role="status" aria-live="polite" className="px-5">
                {selected.status === "failed" ? (
                  <p className="text-center text-sm text-[var(--text-muted)]">{statusLabel(selected.status)}</p>
                ) : (
                  <span className={cn(
                    "flex items-center gap-5 px-5 py-4 text-left",
                    layout !== "piece" && "rounded-[var(--radius-object)] border border-[var(--border-default)] bg-[var(--surface-base)] shadow-sm",
                  )}>
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
            artRefinement={artRefinement}
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
          {selectedLineage.length > 1 ? <button type="button" onClick={() => setHistoryOutputId(selected.id)} className="mt-3 text-sm font-semibold underline">{t("proposal.variations", { count: selectedLineage.length })}</button> : null}
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
            {comparisonOutput && output.id !== comparisonOutput.id && hasUsableOutput(output) ? <button type="button" onClick={() => setCompareAncestorId(output.id)} className="text-sm font-semibold underline">{t("proposal.compare")}</button> : null}
          </article>)}
        </SheetBody></SheetContent>
      </Sheet>
      <Dialog open={Boolean(comparisonOutput && compareAncestor)} onOpenChange={(open) => !open && setCompareAncestorId(null)}>
        <DialogContent size="xl"><DialogHeader><DialogTitle>{t("proposal.compareTitle")}</DialogTitle></DialogHeader><DialogBody className="grid gap-4 sm:grid-cols-2">
          {comparisonOutput ? <figure><figcaption className="mb-2 text-sm font-medium">{t("proposal.currentVariation")}</figcaption><img src={outputSource(comparisonOutput)} alt={t("proposal.currentVariation")} className="h-auto w-full" /></figure> : null}
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
          layerization={layerEditorOutput.layerization ?? null}
          sourceImageUrl={outputSource(layerEditorOutput)}
          hasLayerEditor={Boolean(layerEditorOutput.layerEditor)}
          layerizeRemaining={layerEditorAccess?.layerize?.remaining ?? null}
          onRetryLayerize={() => {
            const state = layerEditorOutput.layerization;
            if (!onLayerize) return;
            const retry = state?.status === "failed";
            const operationId = state?.status === "queued" ? state.operationId : crypto.randomUUID();
            void onLayerize(layerEditorOutput.id, retry, operationId);
          }}
          onOpenChange={(open) => {
            if (!open) {
              setLayerEditorOutputId(null);
              layerizeStartedFor.current = null;
            }
          }}
          onPublished={onLayerEditorPublished}
        />
      ) : null}
    </>
  );
}
