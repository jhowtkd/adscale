"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import type { GetDiagnosticCallResultMirror } from "@/lib/diagnostics/types";
import {
  ownerButtonClass,
  ownerFieldClass,
} from "@/components/feedback/owner-chrome";
import { DiagnosticsLinks } from "./DiagnosticsLinks";

export const DIAGNOSTIC_CALL_REASON_MAX_LENGTH = 500;

function retryDiagnosticsQuery(failureCount: number, error: unknown) {
  return !(error instanceof Error && error.message === "forbidden") && failureCount < 1;
}

export async function fetchDiagnosticCall(
  workspaceId: string,
  workItemId: string,
  callId: string,
  reason: string,
): Promise<GetDiagnosticCallResultMirror> {
  const params = new URLSearchParams({
    workspaceId,
    reason,
  });
  const res = await apiFetch(
    `/api/feedback/diagnostics/works/${encodeURIComponent(workItemId)}/calls/${encodeURIComponent(callId)}?${params.toString()}`,
  );
  if (res.status === 403) throw new Error("forbidden");
  if (res.status === 404) return { found: false };
  if (!res.ok) throw new Error("failed");
  return (await res.json()) as GetDiagnosticCallResultMirror;
}

/**
 * Per-call AI panel. The audited content read needs an explicit purpose,
 * so nothing is fetched until the operator submits a reason.
 */
export function DiagnosticCallPanel({
  workspaceId,
  workItemId,
  callId,
  isPlatformOwner,
}: {
  workspaceId: string;
  workItemId: string;
  callId: string;
  isPlatformOwner: boolean;
}) {
  const t = useTranslations("feedback.triage.diagnostics.call");
  const [reason, setReason] = useState("");
  const [submittedReason, setSubmittedReason] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState(false);

  const callQuery = useQuery({
    queryKey: [
      "diagnostic-call",
      workspaceId,
      workItemId,
      callId,
      submittedReason,
    ],
    queryFn: () =>
      fetchDiagnosticCall(workspaceId, workItemId, callId, submittedReason!),
    retry: retryDiagnosticsQuery,
    enabled: isPlatformOwner && submittedReason !== null,
  });

  const submitReason = () => {
    const trimmed = reason.trim();
    if (trimmed.length === 0 || trimmed.length > DIAGNOSTIC_CALL_REASON_MAX_LENGTH) {
      setReasonError(true);
      return;
    }
    setReasonError(false);
    setSubmittedReason(trimmed);
  };

  if (callQuery.error instanceof Error && callQuery.error.message === "forbidden") {
    return (
      <p role="alert" className="text-sm text-[var(--text-secondary)]">
        {t("forbidden")}
      </p>
    );
  }

  const result = callQuery.data;

  return (
    <div className="space-y-4">
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          submitReason();
        }}
      >
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-[var(--text-primary)]">
            {t("reasonLabel")}
          </span>
          <input
            type="text"
            value={reason}
            maxLength={DIAGNOSTIC_CALL_REASON_MAX_LENGTH}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("reasonPlaceholder")}
            aria-label={t("reasonLabel")}
            className={ownerFieldClass}
          />
        </label>
        {reasonError ? (
          <p role="alert" className="text-xs text-[var(--danger-text)]">
            {t("reasonRequired")}
          </p>
        ) : null}
        <Button
          type="submit"
          variant="outline"
          size="sm"
          className={ownerButtonClass}
        >
          {t("load")}
        </Button>
      </form>

      {submittedReason === null ? (
        <p className="text-sm text-[var(--text-muted)]">{t("needsReason")}</p>
      ) : callQuery.isLoading ? (
        <p className="text-sm text-[var(--text-muted)]">{t("loading")}</p>
      ) : callQuery.error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger-text)]"
        >
          <span>{t("loadError")}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void callQuery.refetch()}
            className={ownerButtonClass}
          >
            {t("retry")}
          </Button>
        </div>
      ) : result && !result.found ? (
        <p className="text-sm text-[var(--text-muted)]">{t("notFound")}</p>
      ) : result && result.found ? (
        <div className="space-y-4">
          <dl className="grid gap-2 text-xs text-[var(--text-secondary)] sm:grid-cols-2">
            <div className="rounded-md border border-[var(--border-dim)] px-3 py-2">
              <dt className="font-medium text-[var(--text-primary)]">
                {t("requestedModel")}
              </dt>
              <dd className="mt-1">{result.call.requestedModel}</dd>
            </div>
            <div className="rounded-md border border-[var(--border-dim)] px-3 py-2">
              <dt className="font-medium text-[var(--text-primary)]">
                {t("returnedModel")}
              </dt>
              <dd className="mt-1">
                {result.call.returnedModel ?? t("unknown")}
              </dd>
            </div>
            <div className="rounded-md border border-[var(--border-dim)] px-3 py-2">
              <dt className="font-medium text-[var(--text-primary)]">
                {t("provider")}
              </dt>
              <dd className="mt-1">{result.call.provider}</dd>
            </div>
            <div className="rounded-md border border-[var(--border-dim)] px-3 py-2">
              <dt className="font-medium text-[var(--text-primary)]">
                {t("status")}
              </dt>
              <dd className="mt-1">
                {result.call.status}
                {result.call.validationFailed
                  ? ` · ${t("validationFailed")}`
                  : ""}
              </dd>
            </div>
            {result.call.providerRequestId ? (
              <div className="rounded-md border border-[var(--border-dim)] px-3 py-2">
                <dt className="font-medium text-[var(--text-primary)]">
                  {t("providerRequestId")}
                </dt>
                <dd className="mt-1 break-all">
                  {result.call.providerRequestId}
                </dd>
              </div>
            ) : null}
            {typeof result.call.inputTokens === "number" ||
            typeof result.call.outputTokens === "number" ? (
              <div className="rounded-md border border-[var(--border-dim)] px-3 py-2">
                <dt className="font-medium text-[var(--text-primary)]">
                  {t("tokens")}
                </dt>
                <dd className="mt-1">
                  {t("tokensValue", {
                    input: result.call.inputTokens ?? t("unknown"),
                    output: result.call.outputTokens ?? t("unknown"),
                  })}
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4 text-sm">
            <h4 className="font-medium text-[var(--text-primary)]">
              {t("contentTitle")}
            </h4>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {t("availability", {
                state: result.content.availability,
                policy: result.content.policyVersion,
              })}
            </p>
            {!result.content.allowed ? (
              <p
                role="alert"
                className="mt-2 rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger-text)]"
              >
                {t("denied")}
              </p>
            ) : result.content.verbatim === false ||
              result.content.truncated === true ||
              result.content.notice ? (
              <p
                role="note"
                className="mt-2 rounded-md border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3 py-2 text-sm text-[var(--warning-text)]"
              >
                {t("maskWarning")}
                {result.content.notice ? ` ${result.content.notice}` : ""}
              </p>
            ) : null}
          </div>

          <DiagnosticsLinks links={result.links.items} />
        </div>
      ) : null}
    </div>
  );
}
