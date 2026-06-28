"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatCreditImpact,
  getRiskLabelVariant,
  isTerminalActionStatus,
  parseActionCardDisplay,
  shouldShowCreditImpact,
  type ActionCardStatus,
} from "@/lib/assistant/contract-display";
import {
  useCancelAssistantAction,
  useConfirmAssistantAction,
} from "@/lib/hooks/use-assistant-actions";
import { cn } from "@/lib/utils";
import CreditConfirmModal from "./CreditConfirmModal";

export interface AssistantActionCardProps {
  threadId: string | null;
  payload: Record<string, unknown>;
}

function parseStatus(payload: Record<string, unknown>): ActionCardStatus {
  const status = payload.status;
  if (typeof status === "string") {
    return status as ActionCardStatus;
  }
  return "pending";
}

function extractCreditCost(creditImpact: unknown): number | null {
  if (!creditImpact || typeof creditImpact !== "object") return null;
  const record = creditImpact as Record<string, unknown>;
  if (typeof record.credits === "number") return record.credits;
  const label = typeof record.label === "string" ? record.label : "";
  const match = label.match(/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function resolveProposalId(
  payload: Record<string, unknown>,
  display: ReturnType<typeof parseActionCardDisplay>
): string | undefined {
  const displayRecord = payload.display;
  if (displayRecord && typeof displayRecord === "object") {
    const proposalId = (displayRecord as Record<string, unknown>).proposalId;
    if (typeof proposalId === "string") {
      return proposalId;
    }
  }

  const inputSnapshot = payload.inputSnapshot;
  if (inputSnapshot && typeof inputSnapshot === "object") {
    const proposalId = (inputSnapshot as Record<string, unknown>).proposalId;
    if (typeof proposalId === "string") {
      return proposalId;
    }
  }

  if (display && "proposalId" in display) {
    const proposalId = (display as { proposalId?: unknown }).proposalId;
    if (typeof proposalId === "string") {
      return proposalId;
    }
  }

  return undefined;
}

export default function AssistantActionCard({
  threadId,
  payload,
}: AssistantActionCardProps) {
  const t = useTranslations("assistant.actionCard");
  const confirmMutation = useConfirmAssistantAction();
  const cancelMutation = useCancelAssistantAction();
  const [showCreditModal, setShowCreditModal] = useState(false);

  const actionRecordId =
    typeof payload.actionRecordId === "string" ? payload.actionRecordId : "";
  const status = parseStatus(payload);
  const display = parseActionCardDisplay(payload.display);
  const isPending = status === "pending";
  const isActive = status === "confirmed" || status === "running";
  const isFailed = status === "failed";
  const isTerminal = isTerminalActionStatus(status);
  const isMutating = confirmMutation.isPending || cancelMutation.isPending;
  const isRevisePlan = display?.actionType === "revise_creative_plan";
  const isReviseCreative = display?.actionType === "revise_creative";

  const handleConfirm = () => {
    if (!threadId || !actionRecordId || !isPending) {
      return;
    }
    if (isReviseCreative) {
      setShowCreditModal(true);
      return;
    }
    confirmMutation.mutate({ actionId: actionRecordId, threadId });
  };

  const handleModalConfirm = () => {
    if (!threadId || !actionRecordId) {
      return;
    }
    confirmMutation.mutate({ actionId: actionRecordId, threadId });
    setShowCreditModal(false);
  };

  const handleModalCancel = () => {
    setShowCreditModal(false);
  };

  const handleCancel = () => {
    if (!threadId || !actionRecordId || isTerminal) {
      return;
    }
    const proposalId =
      isRevisePlan || isReviseCreative
        ? resolveProposalId(payload, display)
        : undefined;
    cancelMutation.mutate({ actionId: actionRecordId, threadId, proposalId });
  };

  const handleRetry = () => {
    if (!threadId || !actionRecordId) {
      return;
    }
    confirmMutation.mutate({ actionId: actionRecordId, threadId });
  };

  const jobRef =
    typeof payload.jobRef === "object" && payload.jobRef !== null
      ? (payload.jobRef as Record<string, unknown>)
      : null;

  const confirmLabel = isRevisePlan
    ? "Confirmar revisão do plano"
    : isReviseCreative
      ? "Confirmar revisão do criativo"
      : t("confirm");

  const creditCost = extractCreditCost(display?.creditImpact) ?? 5;

  return (
    <div
      className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4"
      data-testid="assistant-action-card"
      data-status={status}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {display?.label ?? t("unknownAction")}
          </p>
        </div>
        {display?.riskLabel ? (
          <Badge variant={getRiskLabelVariant(display.riskLabel)}>
            {display.riskLabel}
          </Badge>
        ) : null}
      </div>

      {display ? (
        <dl className="mt-3 space-y-2 text-xs text-[var(--text-secondary)]">
          {display.summary ? (
            <div>
              <dt className="font-medium text-[var(--text-muted)]">Resumo</dt>
              <dd>{display.summary}</dd>
            </div>
          ) : null}
          {display.sourceVersionLabel ? (
            <div>
              <dt className="font-medium text-[var(--text-muted)]">Versão fonte</dt>
              <dd>Revisando {display.sourceVersionLabel}</dd>
            </div>
          ) : null}
          {display.mismatchWarning ? (
            <div className="text-[var(--warning-text)]">{display.mismatchWarning}</div>
          ) : null}
          {isReviseCreative &&
          display.intendedChanges &&
          display.intendedChanges.length > 0 ? (
            <div>
              <dt className="font-medium text-[var(--text-muted)]">
                Mudanças pretendidas
              </dt>
              <dd>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {display.intendedChanges.map((change) => (
                    <li key={change}>{change}</li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
          {isReviseCreative && display.format ? (
            <div>
              <dt className="font-medium text-[var(--text-muted)]">Formato</dt>
              <dd>{display.format}</dd>
            </div>
          ) : null}
          {isReviseCreative &&
          display.referenceItems &&
          display.referenceItems.length > 0 ? (
            <div>
              <dt className="font-medium text-[var(--text-muted)]">Referências</dt>
              <dd>
                <ul className="mt-1 space-y-2">
                  {display.referenceItems.map((item) => (
                    <li key={item.id} className="flex items-center gap-2">
                      {item.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.thumbnailUrl}
                          alt={item.name}
                          className="size-8 rounded object-cover"
                        />
                      ) : null}
                      <span>{item.name}</span>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : isReviseCreative && typeof display.referenceCount === "number" ? (
            <div>
              <dt className="font-medium text-[var(--text-muted)]">Referências</dt>
              <dd>{display.referenceCount} referências</dd>
            </div>
          ) : null}
          {isReviseCreative && display.planVersionLabel ? (
            <div>
              <dt className="font-medium text-[var(--text-muted)]">Plano</dt>
              <dd>Plano: {display.planVersionLabel}</dd>
            </div>
          ) : null}
          {display.writes && display.writes.length > 0 ? (
            <div>
              <dt className="font-medium text-[var(--text-muted)]">Efeitos</dt>
              <dd>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {display.writes.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
          {display.proposalStatus === "stale" ? (
            <div className="text-[var(--warning-text)]">
              Esta proposta pode estar obsoleta. Atualize antes de confirmar.
            </div>
          ) : null}
          {shouldShowCreditImpact(display) ? (
            <div>
              <dt className="font-medium text-[var(--text-muted)]">
                {t("creditImpact")}
              </dt>
              <dd>{formatCreditImpact(display.creditImpact)}</dd>
            </div>
          ) : null}
          {display.confirmationPolicy ? (
            <div>
              <dt className="font-medium text-[var(--text-muted)]">
                {t("confirmationPolicy")}
              </dt>
              <dd>
                {display.confirmationPolicy === "required"
                  ? t("confirmationRequired")
                  : t("confirmationNone")}
              </dd>
            </div>
          ) : null}
          {display.riskCopyLines && display.riskCopyLines.length > 0 ? (
            <div>
              <dt className="font-medium text-[var(--text-muted)]">
                {t("riskDetails")}
              </dt>
              <dd>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {display.riskCopyLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      <div
        className={cn(
          "mt-3 flex items-center gap-2 text-xs",
          isActive ? "text-[var(--info-text)]" : "text-[var(--text-muted)]"
        )}
      >
        {isActive ? (
          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
        ) : null}
        <span>{t(`status.${status}`)}</span>
        {jobRef && typeof jobRef.id === "string" ? (
          <span className="text-[var(--text-muted)]">Processamento vinculado</span>
        ) : null}
      </div>

      {isPending ? (
        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            size="sm"
            onClick={handleConfirm}
            disabled={!threadId || isMutating}
          >
            {confirmLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleCancel}
            disabled={!threadId || isMutating}
          >
            {t("cancel")}
          </Button>
        </div>
      ) : null}

      {isFailed && isReviseCreative ? (
        <div className="mt-4">
          <p className="text-xs text-[var(--warning-text)]">
            A geração falhou. Você pode tentar novamente.
          </p>
          <Button
            type="button"
            size="sm"
            onClick={handleRetry}
            disabled={!threadId || isMutating}
            className="mt-2"
          >
            Tentar novamente
          </Button>
        </div>
      ) : null}

      {isReviseCreative ? (
        <CreditConfirmModal
          open={showCreditModal}
          creditCost={creditCost}
          isPending={confirmMutation.isPending}
          onConfirm={handleModalConfirm}
          onCancel={handleModalCancel}
        />
      ) : null}
    </div>
  );
}
