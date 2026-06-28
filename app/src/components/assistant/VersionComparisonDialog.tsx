"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";
import { AlertTriangle, CheckCircle2, Minus, Plus, RotateCcw, X } from "lucide-react";
import type {
  ArtifactVersionComparison,
  ArtifactVersionPresentation,
} from "@/lib/assistant/artifact-version";
import {
  ArtifactPromotionConflictError,
  useAcknowledgeLinkedPlanComparison,
  useAssistantArtifactComparison,
  usePromoteAssistantArtifactVersion,
} from "@/lib/hooks/use-assistant-artifact-versions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { VersionComparisonRequest } from "./AssistantSurfaceContext";

interface VersionComparisonDialogProps {
  open: boolean;
  request: VersionComparisonRequest;
  lineages: ArtifactVersionPresentation[];
  onOpenChange: (open: boolean) => void;
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

const fieldOrder = ["strategy", "angles", "hooks", "ctas", "constraints"];
const changeLabels = {
  add: "Adicionado",
  remove: "Removido",
  edit: "Editado",
  move: "Movido",
  unchanged: "Sem alteração",
} as const;

function versionLabel(version: { versionNumber: number }) {
  return `v${version.versionNumber}`;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    approved: "Oficial",
    ready: "Pronta",
    pending: "Pendente",
    running: "Em geração",
    failed: "Com falha",
    canceled: "Cancelada",
    invalid: "Inválida",
    stale: "Obsoleta",
    superseded: "Substituída",
  };
  return labels[status] ?? "Estado desconhecido";
}

function eligibility(
  target: ArtifactVersionPresentation["versions"][number] | undefined,
  officialId: string | undefined
) {
  if (!target) return { eligible: false, reason: "Selecione uma versão válida." };
  if (target.id === officialId) {
    return { eligible: false, reason: `${versionLabel(target)} já é a versão oficial.` };
  }
  if (target.status === "ready" || target.status === "approved" || target.previouslyApproved) {
    return { eligible: true, reason: "Esta versão pode se tornar oficial." };
  }
  return {
    eligible: false,
    reason: `Esta versão não pode se tornar oficial porque está ${statusLabel(target.status).toLowerCase()}. Escolha uma versão pronta ou aprovada anteriormente.`,
  };
}

function VersionHeader({
  label,
  version,
}: {
  label: string;
  version: { versionNumber: number; status: string; createdAt: Date; feedback: string | null };
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-[var(--text-muted)]">{label}</p>
      <p className="font-mono text-xs font-medium text-[var(--text-primary)]">
        v{version.versionNumber} · {statusLabel(version.status)}
      </p>
      <p className="text-xs text-[var(--text-muted)]">{dateFormatter.format(version.createdAt)}</p>
      {version.feedback ? (
        <p className="text-xs text-[var(--text-secondary)]">{version.feedback}</p>
      ) : null}
    </div>
  );
}

function PlanComparison({ comparison }: { comparison: Extract<ArtifactVersionComparison, { type: "plan" }> }) {
  const fields = [...comparison.fields].sort(
    (left, right) => fieldOrder.indexOf(left.field) - fieldOrder.indexOf(right.field)
  );
  if (fields.length === 0) {
    return <p>Estas versões não têm diferenças nos campos do plano.</p>;
  }
  return (
    <div className="space-y-6" data-testid="plan-comparison">
      {fields.map((field) => (
        <section key={field.field} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
          <h3 className="text-base font-medium">{field.label}</h3>
          <div className="mt-3 space-y-3">
            {field.changes.map((change, index) => (
              <div key={`${change.kind}-${index}`} className="rounded-md border border-[var(--border-dim)] p-3">
                <p className="text-xs font-medium text-[var(--text-secondary)]">{changeLabels[change.kind]}</p>
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Antes — v{comparison.versionA.versionNumber}</p>
                    <p className="mt-1 text-sm">{change.before ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Depois — v{comparison.versionB.versionNumber}</p>
                    <p className="mt-1 text-sm">{change.after ?? "—"}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

type View = { zoom: number; x: number; y: number };

function CreativeComparison({
  comparison,
  onRetry,
}: {
  comparison: Extract<ArtifactVersionComparison, { type: "creative" }>;
  onRetry: () => void;
}) {
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const [failed, setFailed] = useState<Record<"A" | "B", boolean>>({ A: false, B: false });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const pinchDistance = useRef<number | null>(null);

  const updateZoom = (next: number) =>
    setView((current) => ({ ...current, zoom: Math.min(4, Math.max(1, next)) }));
  const pan = (x: number, y: number) =>
    setView((current) => ({ ...current, x: current.x + x, y: current.y + y }));
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    lastPoint.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    if (points.length === 2) {
      const distance = Math.hypot(points[0]!.x - points[1]!.x, points[0]!.y - points[1]!.y);
      if (pinchDistance.current) updateZoom(view.zoom * (distance / pinchDistance.current));
      pinchDistance.current = distance;
    } else if (lastPoint.current) {
      pan((event.clientX - lastPoint.current.x) / 100, (event.clientY - lastPoint.current.y) / 100);
      lastPoint.current = { x: event.clientX, y: event.clientY };
    }
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    lastPoint.current = null;
    pinchDistance.current = null;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-0.05, 0],
      ArrowRight: [0.05, 0],
      ArrowUp: [0, -0.05],
      ArrowDown: [0, 0.05],
    };
    const movement = delta[event.key];
    if (movement) {
      event.preventDefault();
      pan(...movement);
    }
  };
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    updateZoom(view.zoom + (event.deltaY > 0 ? -0.1 : 0.1));
  };

  const renderPreview = (side: "A" | "B", value: typeof comparison.versionA) => {
    const hasError = failed[side] || value.previewError || !value.previewUrl;
    return (
      <section className="space-y-3" aria-label={`Versão ${side}`}>
        <VersionHeader label={`Versão ${side}`} version={value} />
        <div
          className="flex aspect-square min-h-64 touch-none items-center justify-center overflow-hidden rounded-lg bg-[var(--surface-inset)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          onWheel={onWheel}
        >
          {hasError ? (
            <div className="p-4 text-center">
              <p className="text-sm">Não foi possível carregar esta prévia.</p>
              <Button
                type="button"
                variant="outline"
                className="mt-3 min-h-11"
                onClick={() => {
                  setFailed((current) => ({ ...current, [side]: false }));
                  onRetry();
                }}
              >
                Tentar novamente
              </Button>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value.previewUrl!}
              alt={`Prévia do criativo v${value.versionNumber}, ${value.format ?? "formato não informado"}`}
              className="h-full w-full object-contain motion-reduce:transition-none"
              style={{ transform: `scale(${view.zoom}) translate(${view.x * 100}%, ${view.y * 100}%)` }}
              onError={() => setFailed((current) => ({ ...current, [side]: true }))}
            />
          )}
        </div>
        <dl className="grid grid-cols-2 gap-2 text-xs text-[var(--text-secondary)]">
          <div><dt>Formato</dt><dd>{value.format ?? "Não informado"}</dd></div>
          <div><dt>Dimensões</dt><dd>{value.dimensions ? `${value.dimensions.width} × ${value.dimensions.height}` : "Não informadas"}</dd></div>
          <div><dt>Plano</dt><dd>{value.boundPlanVersion ?? "Não informado"}</dd></div>
          <div><dt>CTA</dt><dd>{value.cta ?? "Não informado"}</dd></div>
        </dl>
        {value.intendedChanges.length ? (
          <div className="text-sm">
            <h4 className="font-medium">Mudanças pretendidas</h4>
            <p className="text-xs text-[var(--text-muted)]">Com base no pedido desta revisão:</p>
            <ul className="mt-1 list-disc pl-5">{value.intendedChanges.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        ) : null}
      </section>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" aria-label="Controles de visualização sincronizada">
        <Button type="button" size="icon" variant="outline" className="min-h-11 min-w-11" aria-label="Reduzir" onClick={() => updateZoom(view.zoom - 0.25)}><Minus /></Button>
        <span className="min-w-14 text-center text-xs">{Math.round(view.zoom * 100)}%</span>
        <Button type="button" size="icon" variant="outline" className="min-h-11 min-w-11" aria-label="Ampliar" onClick={() => updateZoom(view.zoom + 0.25)}><Plus /></Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setView({ zoom: 1, x: 0, y: 0 })}>Ajustar</Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setView((current) => ({ ...current, x: 0, y: 0 }))}><RotateCcw /> Redefinir posição</Button>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {renderPreview("A", comparison.versionA)}
        {renderPreview("B", comparison.versionB)}
      </div>
    </div>
  );
}

export default function VersionComparisonDialog({
  open,
  request,
  lineages,
  onOpenChange,
}: VersionComparisonDialogProps) {
  const lineage = lineages.find((item) => item.lineageId === request.lineageId);
  const [versionAId, setVersionAId] = useState(request.versionAId);
  const [versionBId, setVersionBId] = useState(request.versionBId);
  const [includeUnchanged, setIncludeUnchanged] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ previous: string; current: string } | null>(null);
  const [reviewLinkedPlan, setReviewLinkedPlan] = useState(false);
  const [acknowledgement, setAcknowledgement] = useState<{
    id: string;
    revision: number;
    officialId: string;
    linkedId: string;
  } | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const conflictHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setVersionAId(request.versionAId);
    setVersionBId(request.versionBId);
    setConflict(null);
    setConfirmationOpen(false);
    setAcknowledgement(null);
    setMutationError(null);
    setReviewLinkedPlan(false);
  }, [request]);

  const comparison = useAssistantArtifactComparison({
    threadId: open ? request.threadId : null,
    lineageId: lineage?.lineageId ?? null,
    versionAId,
    versionBId,
    includeUnchanged,
  });
  const acknowledgeMutation = useAcknowledgeLinkedPlanComparison(request.threadId);
  const promotionMutation = usePromoteAssistantArtifactVersion(request.threadId);
  const target = lineage?.versions.find((version) => version.id === versionBId);
  const official = lineage?.approvedCurrent ?? undefined;
  const targetEligibility = eligibility(target, official?.id);

  const linkedPlanVersionId = target?.snapshot.type === "creative" ? target.snapshot.planVersionId : null;
  const planLineage = linkedPlanVersionId
    ? lineages.find((item) => item.artifactType === "plan" && item.versions.some((version) => version.id === linkedPlanVersionId))
    : undefined;
  const linkedPlan = planLineage?.versions.find((version) => version.id === linkedPlanVersionId);
  const planOfficial = planLineage?.approvedCurrent;
  const needsPlanReview = Boolean(linkedPlan && planOfficial && linkedPlan.id !== planOfficial.id);
  const linkedComparison = useAssistantArtifactComparison({
    threadId: open && reviewLinkedPlan && needsPlanReview ? request.threadId : null,
    lineageId: planLineage?.lineageId ?? null,
    versionAId: planOfficial?.id ?? null,
    versionBId: linkedPlan?.id ?? null,
  });
  const busy = submitting || promotionMutation.isPending || acknowledgeMutation.isPending;

  useEffect(() => {
    if (
      acknowledgement &&
      (acknowledgement.officialId !== planOfficial?.id ||
        acknowledgement.linkedId !== linkedPlan?.id ||
        (linkedComparison.data && acknowledgement.revision !== linkedComparison.data.headRevision))
    ) {
      setAcknowledgement(null);
    }
  }, [acknowledgement, linkedComparison.data, linkedPlan?.id, planOfficial?.id]);

  const canPromote =
    targetEligibility.eligible &&
    !success &&
    (!needsPlanReview || Boolean(acknowledgement));
  const actionLabel = target
    ? `${target.previouslyApproved || target.status === "approved" ? "Promover" : "Aprovar"} ${versionLabel(target)}`
    : "Aprovar versão";

  const handleOpenChange = (next: boolean) => {
    if (!next && busy) return;
    onOpenChange(next);
  };

  const acknowledgeLinkedPlan = async () => {
    if (!target || !planLineage || !linkedPlan || !planOfficial || !linkedComparison.data) return;
    setMutationError(null);
    try {
      const receipt = await acknowledgeMutation.mutateAsync({
        creativeTargetVersionId: target.id,
        planLineageId: planLineage.lineageId,
        linkedPlanVersionId: linkedPlan.id,
        comparedOfficialPlanVersionId: planOfficial.id,
        expectedPlanRevision: linkedComparison.data.headRevision,
      });
      setAcknowledgement({
        id: receipt.id,
        revision: linkedComparison.data.headRevision,
        officialId: planOfficial.id,
        linkedId: linkedPlan.id,
      });
      setReviewLinkedPlan(false);
    } catch {
      setMutationError("Não foi possível registrar a revisão do plano. Revise o estado e tente novamente.");
    }
  };

  const promote = async () => {
    if (!target || !official || !comparison.data || !canPromote) return;
    setSubmitting(true);
    setConflict(null);
    setMutationError(null);
    try {
      const baseCommand = {
        operationId: crypto.randomUUID(),
        lineageId: lineage!.lineageId,
        targetVersionId: target.id,
        expectedOfficialVersionId: official.id,
        expectedRevision: comparison.data.headRevision,
      };
      await promotionMutation.mutateAsync(
        lineage!.artifactType === "creative"
          ? {
              ...baseCommand,
              type: "creative",
              planTransition:
                needsPlanReview && planLineage && linkedPlan && planOfficial && linkedComparison.data && acknowledgement
                  ? {
                      lineageId: planLineage.lineageId,
                      targetVersionId: linkedPlan.id,
                      expectedOfficialVersionId: planOfficial.id,
                      expectedRevision: linkedComparison.data.headRevision,
                      acknowledgementId: acknowledgement.id,
                    }
                  : null,
            }
          : { ...baseCommand, type: "plan" }
      );
      setConfirmationOpen(false);
      setSuccess(`${versionLabel(target)} agora é a versão oficial.`);
    } catch (error) {
      if (error instanceof ArtifactPromotionConflictError) {
        setConfirmationOpen(false);
        setAcknowledgement(null);
        setConflict({
          previous: error.recovery.previousOfficialLabel,
          current: error.recovery.currentOfficialLabel,
        });
        queueMicrotask(() => conflictHeadingRef.current?.focus());
      } else {
        setMutationError("Não foi possível atualizar a versão oficial. Revise o estado e tente novamente.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!lineage) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="inset-0 h-dvh max-h-dvh rounded-none sm:inset-auto sm:h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-2rem)] sm:w-[min(calc(100dvw-2rem),80rem)] sm:max-w-none sm:rounded-[var(--radius-overlay)]"
          aria-busy={busy}
        >
          <DialogHeader className="sticky top-0 z-10 bg-[var(--surface-overlay)] pr-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle>{lineage.artifactType === "plan" ? "Comparar versões do plano" : "Comparar versões do criativo"}</DialogTitle>
                <DialogDescription>Selecione duas versões da mesma linha para comparar.</DialogDescription>
              </div>
              <Button type="button" size="icon" variant="ghost" className="min-h-11 min-w-11" aria-label="Fechar comparação" disabled={busy} onClick={() => handleOpenChange(false)}><X /></Button>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {(["A", "B"] as const).map((side) => {
                const value = side === "A" ? versionAId : versionBId;
                const setter = side === "A" ? setVersionAId : setVersionBId;
                return (
                  <label key={side} className="text-xs font-medium">
                    Versão {side}
                    <Select value={value} onValueChange={(next) => {
                      setter(next as string);
                      setConfirmationOpen(false);
                      setConflict(null);
                      setAcknowledgement(null);
                    }}>
                      <SelectTrigger className="mt-1 min-h-11 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {lineage.versions.map((version) => (
                          <SelectItem key={version.id} value={version.id} disabled={version.id === (side === "A" ? versionBId : versionAId)}>
                            v{version.versionNumber} · {statusLabel(version.status)} · {dateFormatter.format(version.createdAt)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                );
              })}
            </div>
          </DialogHeader>
          <DialogBody className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8">
            {lineage.artifactType === "plan" ? (
              <label className="mb-4 flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" checked={includeUnchanged} onChange={(event) => setIncludeUnchanged(event.target.checked)} />
                Mostrar campos sem alteração
              </label>
            ) : null}
            {comparison.isLoading ? <p>Carregando comparação…</p> : null}
            {comparison.isError ? <p role="alert">Não foi possível comparar estas versões. Atualize o histórico e tente novamente.</p> : null}
            {comparison.data?.type === "plan" ? <PlanComparison comparison={comparison.data} /> : null}
            {comparison.data?.type === "creative" ? <CreativeComparison comparison={comparison.data} onRetry={() => void comparison.refetch()} /> : null}
            {reviewLinkedPlan && linkedComparison.data?.type === "plan" ? (
              <section className="mt-6 rounded-lg border border-[var(--warning-text)] p-4" aria-label="Comparação do plano vinculado">
                <h3 className="text-base font-medium">Revisar plano vinculado</h3>
                <div className="mt-4"><PlanComparison comparison={linkedComparison.data} /></div>
                <Button type="button" className="mt-4 min-h-11" disabled={busy} onClick={() => void acknowledgeLinkedPlan()}>Confirmar revisão do plano</Button>
              </section>
            ) : null}
          </DialogBody>
          <DialogFooter className="sticky bottom-0 bg-[var(--surface-overlay)]">
            <div className="mr-auto text-sm">
              {conflict ? (
                <div role="alert" className="rounded-md bg-[var(--warning-bg)] p-3 text-[var(--warning-text)]">
                  <h3 ref={conflictHeadingRef} tabIndex={-1} className="font-medium">A versão oficial mudou enquanto você comparava.</h3>
                  <p>Antes: {conflict.previous}. Agora: {conflict.current}.</p>
                  <Button type="button" variant="outline" className="mt-2 min-h-11" onClick={() => { setConflict(null); void comparison.refetch(); }}>Revisar estado atualizado</Button>
                </div>
              ) : needsPlanReview && !acknowledgement ? (
                <div className="rounded-md bg-[var(--warning-bg)] p-3 text-[var(--warning-text)]">
                  <p>Revise o plano vinculado antes da promoção conjunta.</p>
                  <Button type="button" variant="outline" className="mt-2 min-h-11" onClick={() => setReviewLinkedPlan(true)}>
                    Comparar plano {linkedPlan ? versionLabel(linkedPlan) : "v?"} com {planOfficial ? versionLabel(planOfficial) : "v?"}
                  </Button>
                </div>
              ) : acknowledgement ? (
                <p className="inline-flex items-center gap-2"><CheckCircle2 className="size-4" /> Plano comparado</p>
              ) : (
                <p>{targetEligibility.reason}</p>
              )}
              <p aria-live="polite" className="mt-1">{success}</p>
              {mutationError ? <p role="alert" className="mt-1 text-[var(--danger-text)]">{mutationError}</p> : null}
            </div>
            <Button type="button" variant="outline" disabled={busy} onClick={() => handleOpenChange(false)}>Fechar comparação</Button>
            <Button type="button" disabled={!canPromote || busy || Boolean(conflict)} onClick={() => setConfirmationOpen(true)}>{actionLabel}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmationOpen} onOpenChange={(next) => { if (!busy) setConfirmationOpen(next); }}>
        <DialogContent showCloseButton={false} aria-busy={busy}>
          <DialogHeader>
            <DialogTitle>{needsPlanReview ? "Tornar plano e criativo oficiais?" : `Tornar ${target ? versionLabel(target) : "a versão"} oficial?`}</DialogTitle>
            <DialogDescription>
              {official && target ? `A versão oficial muda de ${versionLabel(official)} para ${versionLabel(target)}.` : "Revise a transição."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3 text-sm">
            {needsPlanReview && planOfficial && linkedPlan ? (
              <ul className="space-y-1"><li><strong>Plano:</strong> {versionLabel(planOfficial)} → {versionLabel(linkedPlan)}</li><li><strong>Criativo:</strong> {official ? versionLabel(official) : "—"} → {target ? versionLabel(target) : "—"}</li></ul>
            ) : null}
            <p>Atualiza a versão oficial e a versão em trabalho usadas fora do assistente.</p>
            <p>{lineage.pendingProposals.length} proposta(s) pendente(s) se tornarão obsoletas.</p>
            {needsPlanReview ? <p>Esta ação é única: ou as duas versões mudam, ou nenhuma muda.</p> : null}
            <p>Esta ação não usa créditos e não exclui nenhuma versão.</p>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmationOpen(false)}>Voltar à comparação</Button>
            <Button type="button" disabled={busy} onClick={() => void promote()}>{busy ? "Atualizando versão oficial…" : needsPlanReview ? "Tornar plano e criativo oficiais" : `Tornar ${target ? versionLabel(target) : "a versão"} oficial`}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
