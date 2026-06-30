"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { parseActionCardDisplay } from "@/lib/assistant/contract-display";
import {
  useAssistantThread,
  type AssistantMessage,
} from "@/lib/hooks/use-assistant-threads";
import AssistantReviewPanel from "./AssistantReviewPanel";
import VersionHistory from "./VersionHistory";

export interface AssistantContextPanelProps {
  threadId: string | null;
}

function getActionCardMessages(messages: AssistantMessage[]) {
  return messages.filter((message) => message.type === "action_card");
}

function getCardStatus(message: AssistantMessage): string {
  const status = message.payload.status;
  return typeof status === "string" ? status : "pending";
}

export default function AssistantContextPanel({
  threadId,
}: AssistantContextPanelProps) {
  const t = useTranslations("assistant.context");
  const tStatus = useTranslations("assistant.actionCard");
  const { data, isLoading } = useAssistantThread(threadId, {
    pollWhileActive: true,
  });

  const actionCards = useMemo(
    () => getActionCardMessages(data?.messages ?? []),
    [data?.messages]
  );

  const latestPending = useMemo(() => {
    const pending = actionCards.filter((card) => getCardStatus(card) === "pending");
    return pending[pending.length - 1] ?? null;
  }, [actionCards]);

  const suggestedActions = useMemo(
    () => actionCards.filter((card) => getCardStatus(card) === "pending"),
    [actionCards]
  );

  const activeJobs = useMemo(
    () =>
      actionCards.filter((card) => {
        const status = getCardStatus(card);
        return status === "running" || status === "confirmed";
      }),
    [actionCards]
  );

  if (!threadId) {
    return (
      <div
        className="flex h-full flex-col p-4 pt-12"
        data-testid="assistant-context-panel"
      >
        <div className="border-b border-[var(--border-subtle)] pb-4">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            {t("title")}
          </p>
        </div>
        <p className="mt-4 text-sm text-[var(--text-muted)]">{t("noThread")}</p>
      </div>
    );
  }

  const readinessDisplay = latestPending
    ? parseActionCardDisplay(latestPending.payload.display)
    : null;

  return (
    <div
      className="flex h-full flex-col gap-6 overflow-y-auto p-4 pt-12"
      data-testid="assistant-context-panel"
    >
      <div className="border-b border-[var(--border-subtle)] pb-4">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
          {t("title")}
        </p>
      </div>

      {isLoading ? (
        <>
          <p className="text-sm text-[var(--text-muted)]">{t("loading")}</p>
          <VersionHistory threadId={threadId} lineages={[]} isLoading />
        </>
      ) : (
        <>
          <section data-testid="context-contract-readiness">
            <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
              {t("contractReadiness")}
            </h3>
            {readinessDisplay ? (
              <div className="mt-2 space-y-2 text-sm text-[var(--text-secondary)]">
                <p className="font-medium text-[var(--text-primary)]">
                  {readinessDisplay.label}
                </p>
                {readinessDisplay.riskCopyLines &&
                readinessDisplay.riskCopyLines.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-4">
                    {readinessDisplay.riskCopyLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[var(--text-muted)]">{t("noRiskCopy")}</p>
                )}
              </div>
            ) : (
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                {t("noPending")}
              </p>
            )}
          </section>

          <section data-testid="context-suggested-actions">
            <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
              {t("suggestedActions")}
            </h3>
            {suggestedActions.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {suggestedActions.map((card) => {
                  const display = parseActionCardDisplay(card.payload.display);
                  return (
                    <li
                      key={card.id}
                      className="rounded-md border border-[var(--border-dim)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    >
                      {display?.label ?? t("unknownAction")}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                {t("noPending")}
              </p>
            )}
          </section>

          <AssistantReviewPanel threadId={threadId} />

          <VersionHistory
            threadId={threadId}
            lineages={data?.artifactVersionState?.lineages ?? []}
          />

          <section data-testid="context-job-status">
            <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
              {t("jobStatus")}
            </h3>
            {activeJobs.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {activeJobs.map((card) => {
                  const display = parseActionCardDisplay(card.payload.display);
                  const status = getCardStatus(card);
                  const jobRef =
                    typeof card.payload.jobRef === "object" &&
                    card.payload.jobRef !== null
                      ? (card.payload.jobRef as Record<string, unknown>)
                      : null;
                  return (
                    <li
                      key={card.id}
                      className="rounded-md border border-[var(--border-dim)] px-3 py-2 text-sm"
                    >
                      <p className="font-medium text-[var(--text-primary)]">
                        {display?.label ?? t("unknownAction")}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {tStatus(`status.${status}`)}
                      </p>
                      {jobRef && typeof jobRef.id === "string" ? (
                        <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">
                          {String(jobRef.kind ?? "job")}: {jobRef.id}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                {t("noJobs")}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
