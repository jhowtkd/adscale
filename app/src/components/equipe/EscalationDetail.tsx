// Q3 · Escalation detail (#554): header, fetch and layout shell. History
// and parts live in EscalationDetailHistory, pauses and staff actions in
// EscalationDetailActions; every action goes through POST staff/commands.

"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";
import { staffFetchJson, useStaffCommand, type StaffCommandInput } from "./staff-api";
import {
  StaffErrorAlert,
  StaffLoading,
  accountDisplayName,
  formatDue,
  shortAccountId,
} from "./staff-ui";
import { enumLabel, staffRoleLabel } from "./labels";
import EscalationDetailHistory from "./EscalationDetailHistory";
import EscalationDetailActions from "./EscalationDetailActions";
import type { EscalationDetailView, StaffRole } from "./types";

export default function EscalationDetail({
  escalationId,
  workspaceId,
  accountId,
}: {
  escalationId: string;
  workspaceId: string;
  accountId: string;
}) {
  const t = useTranslations("equipe.escalation");
  const tLabels = useTranslations("equipe.labels");
  const tCommon = useTranslations("equipe.common");
  const locale = useLocale();
  const [notice, setNotice] = useState<string | null>(null);

  const command = useStaffCommand();
  const busy = command.isPending;

  // The scope resolves on the server from the id; queue links still
  // carry it as a hint, notification links carry nothing.
  const scopeQuery =
    workspaceId.length > 0 && accountId.length > 0
      ? `?workspaceId=${encodeURIComponent(workspaceId)}&accountId=${encodeURIComponent(accountId)}`
      : "";
  const query = useQuery({
    queryKey: ["equipe-staff-escalation", workspaceId, accountId, escalationId],
    queryFn: () =>
      staffFetchJson<EscalationDetailView>(
        `/api/equipe/staff/escalations/${escalationId}${scopeQuery}`,
      ),
    retry: false,
  });

  const view = query.data;
  const escalation = view?.escalation;

  async function run(
    type: string,
    payload: Record<string, unknown>,
    role: StaffCommandInput["role"],
    doneMessage: string,
  ) {
    if (!view) return false;
    setNotice(null);
    try {
      await command.mutateAsync({
        type,
        payload,
        role,
        workspaceId: view.workspaceId,
        accountId: view.accountId,
      });
      setNotice(doneMessage);
      void query.refetch();
      return true;
    } catch {
      return false;
    }
  }
  const critical =
    escalation?.severity === "critical" || escalation?.severity === "critical_cross_account";

  return (
    <PageFrame width="operational" className="min-w-0 space-y-6 py-8">
      <PageHeader
        title={
          escalation
            ? `${enumLabel(tLabels, `kind.${escalation.kind}`)} · ${enumLabel(tLabels, `severity.${escalation.severity}`)}`
            : t("historyTitle")
        }
        description={
          escalation && view
            ? [
                accountDisplayName(
                  view,
                  tCommon("account", { id: shortAccountId(escalation.accountId) }),
                ),
                `${t("ownerLabel")}: ${staffRoleLabel(tLabels, escalation.ownerRole)}`,
                escalation.dueAt
                  ? tCommon("dueAt", { date: formatDue(escalation.dueAt, locale) ?? "—" })
                  : tCommon("noDue"),
              ].join(" · ")
            : undefined
        }
        meta={
          escalation ? (
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant={critical ? "danger" : "warning"}>
                {enumLabel(tLabels, `severity.${escalation.severity}`)}
              </Badge>
              <Badge variant="neutral">
                {enumLabel(tLabels, `escalationStatus.${escalation.status}`)}
              </Badge>
            </span>
          ) : undefined
        }
      />

      {query.isLoading ? <StaffLoading label={tCommon("loading")} /> : null}
      {query.error ? (
        <StaffErrorAlert error={query.error} onRetry={() => void query.refetch()} />
      ) : null}

      {view && escalation ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <EscalationDetailHistory view={view} />
          <EscalationDetailActions
            view={view}
            busy={busy}
            onAction={(type, payload, role: StaffRole, doneMessage) =>
              run(type, payload, role, doneMessage)
            }
          />
        </div>
      ) : null}

      {notice ? (
        <p role="status" className="text-sm text-[var(--success-text)]">
          {notice}
        </p>
      ) : null}
      {command.error ? <StaffErrorAlert error={command.error} /> : null}
    </PageFrame>
  );
}
