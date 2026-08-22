"use client";

import { useState, type SetStateAction } from "react";
import { Expand } from "lucide-react";
import { useTranslations } from "next-intl";
import CreativeAnnotationEditor from "@/components/assistant/CreativeAnnotationEditor";
import { CreativeResultCard } from "@/components/creative-work/CreativeResultCard";
import {
  OUTPUT_ANNOTATION_COMMENT_MAX_LENGTH,
  OUTPUT_ANNOTATION_MAX_COUNT,
  compileOutputAnnotationInstruction,
  renderAnnotatedOutputFile,
  type OutputAnnotation,
} from "@/components/creative-work/output-annotation";
import { Button } from "@/components/ui/button";
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
import { GENERATION_CREDIT_COSTS } from "@/server/generation/canonical/types";

type CreativeProposalGridProps = {
  outputs: CreativeWorkOutput[];
  onRetry: (outputId: string) => void;
  onRetryRevision?: (output: CreativeWorkOutput) => void | Promise<void>;
  onApprove?: (outputId: string, confirmObjective?: boolean) => void;
  /** Legacy wizard alias; remove with the wizard redirect. */
  onSave?: (outputId: string) => void;
  onDownload: (outputId: string) => void;
  onRevise?: (outputId: string, instruction: string, attachment: File | null) => Promise<boolean>;
  isRetrying?: (outputId: string) => boolean;
  isApproving?: (outputId: string) => boolean;
  approvalErrorOutputId?: string | null;
  isRevising?: (outputId: string) => boolean;
  isSaving?: (outputId: string) => boolean;
  canLayerize?: boolean;
  onLayerize?: (outputId: string, retry?: boolean) => void;
  onDownloadLayerized?: (outputId: string, format: "psd" | "zip") => void;
  isLayerizing?: (outputId: string) => boolean;
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
  canLayerize,
  onLayerize,
  onDownloadLayerized,
  isLayerizing,
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
  const [annotationsByOutput, setAnnotationsByOutput] = useState<Record<string, OutputAnnotation[]>>({});
  const [generalCommentsByOutput, setGeneralCommentsByOutput] = useState<Record<string, string>>({});
  const [submittingAnnotations, setSubmittingAnnotations] = useState(false);
  const [annotationError, setAnnotationError] = useState<string | null>(null);
  const [annotationVoiceBusy, setAnnotationVoiceBusy] = useState(false);
  const isMobile = useIsMobile();
  const t = useTranslations("dashboard.home.composer.results");
  const selected = visible.find((output) => output.id === selectedId) ?? visible[0];
  const selectedAnnotations = selected ? annotationsByOutput[selected.id] ?? [] : [];
  const selectedGeneralComment = selected ? generalCommentsByOutput[selected.id] ?? "" : "";

  const updateSelectedAnnotations = (next: OutputAnnotation[]) => {
    if (!selected) return;
    setAnnotationsByOutput((current) => ({ ...current, [selected.id]: next }));
  };

  const updateSelectedGeneralComment = (update: SetStateAction<string>) => {
    const outputId = selected?.id;
    if (!outputId) return;
    setGeneralCommentsByOutput((current) => ({
      ...current,
      [outputId]: typeof update === "function" ? update(current[outputId] ?? "") : update,
    }));
  };

  if (!selected) return null;

  const label = outputLabel(selected);
  const format = selected.targetFormat ?? "4:5";
  const available = selected.status === "completed" && Boolean(selected.outputKey);

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
            canLayerize={canLayerize}
            onLayerize={onLayerize}
            onDownloadLayerized={onDownloadLayerized}
            isLayerizing={isLayerizing?.(selected.id)}
            hidePreview
          />
        </div>
      </div>

      <Dialog open={expanded} onOpenChange={(open) => {
        setExpanded(open);
        if (!open) setAnnotationVoiceBusy(false);
      }}>
        <DialogContent size="xl" className="h-[min(92dvh,900px)] max-h-[92dvh]">
          <DialogHeader>
            <DialogTitle>{label} · {format}</DialogTitle>
            <DialogDescription>Inspeção ampliada na proporção original, sem corte.</DialogDescription>
          </DialogHeader>
          <DialogBody className="min-h-0 overflow-y-auto">
            {available ? <CreativeAnnotationEditor
              imageUrl={outputSource(selected)}
              annotations={selectedAnnotations}
              isMobile={isMobile}
              layout="split"
              onBusyChange={setAnnotationVoiceBusy}
              generalComment={selectedGeneralComment}
              onGeneralCommentChange={updateSelectedGeneralComment}
              maxAnnotations={OUTPUT_ANNOTATION_MAX_COUNT}
              commentMaxLength={OUTPUT_ANNOTATION_COMMENT_MAX_LENGTH}
              onAdd={(annotation) => updateSelectedAnnotations([
                ...selectedAnnotations,
                { id: crypto.randomUUID(), status: "draft", ...annotation },
              ])}
              onRemove={(annotationId) => updateSelectedAnnotations(selectedAnnotations.filter((annotation) => annotation.id !== annotationId))}
              sidePanel={<>
                <p className="text-sm text-[var(--text-secondary)]">{t("annotationHelp")}</p>
                {annotationError ? <p role="alert" className="text-sm text-[var(--danger-text)]">{annotationError}</p> : null}
                <Button
                  type="button"
                  disabled={!onRevise || (!selectedGeneralComment.trim() && selectedAnnotations.length === 0) || annotationVoiceBusy || submittingAnnotations || isRevising?.(selected.id)}
                  onClick={async () => {
                    if (!onRevise || (!selectedGeneralComment.trim() && selectedAnnotations.length === 0) || annotationVoiceBusy) return;
                    setSubmittingAnnotations(true);
                    setAnnotationError(null);
                    try {
                      const instruction = compileOutputAnnotationInstruction(selectedAnnotations, selectedGeneralComment);
                      const file = selectedAnnotations.length > 0
                        ? await renderAnnotatedOutputFile({ outputId: selected.id, imageUrl: outputSource(selected), annotations: selectedAnnotations })
                        : null;
                      const accepted = await onRevise(selected.id, instruction, file);
                      if (accepted) {
                        setAnnotationsByOutput((current) => {
                          const next = { ...current };
                          delete next[selected.id];
                          return next;
                        });
                        setGeneralCommentsByOutput((current) => {
                          const next = { ...current };
                          delete next[selected.id];
                          return next;
                        });
                        setExpanded(false);
                      }
                    } catch {
                      setAnnotationError(t("annotationPreparationError"));
                    } finally {
                      setSubmittingAnnotations(false);
                    }
                  }}
                >
                  {t("revisionCta", { credits: GENERATION_CREDIT_COSTS.creativeWorkOutput })}
                </Button>
              </>}
            /> : null}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
