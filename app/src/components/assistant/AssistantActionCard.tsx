"use client";

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

  const actionRecordId =
    typeof payload.actionRecordId === "string" ? payload.actionRecordId : "";
  const status = parseStatus(payload);
  const display = parseActionCardDisplay(payload.display);
  const isPending = status === "pending";
  const isActive = status === "confirmed" || status === "running";
  const isTerminal = isTerminalActionStatus(status);
  const isMutating = confirmMutation.isPending || cancelMutation.isPending;
  const isRevisePlan = display?.actionType === "revise_creative_plan";

  const handleConfirm = () => {
    if (!threadId || !actionRecordId || !isPending) {
      return;
    }
    confirmMutation.mutate({ actionId: actionRecordId, threadId });
  };

  const handleCancel = () => {
    if (!threadId || !actionRecordId || isTerminal) {
      return;
    }
    const proposalId = isRevisePlan
      ? resolveProposalId(payload, display)
      : undefined;
    cancelMutation.mutate({ actionId: actionRecordId, threadId, proposalId });
  };

  const jobRef =
    typeof payload.jobRef === "object" && payload.jobRef !== null
      ? (payload.jobRef as Record<string, unknown>)
      : null;

  const confirmLabel = isRevisePlan ? "Confirmar revisão do plano" : t("confirm");

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
    </div>
  );
}
