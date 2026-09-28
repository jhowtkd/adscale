// I1 · Exceptions queue (#554): one account's open cases with the reason
// recorded by the AI, attempts, the SLA deadline (breach highlighted),
// and "Entrar na conversa" per case.

"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";
import { staffFetchJson } from "./staff-api";
import {
  StaffEmpty,
  StaffErrorAlert,
  StaffLoading,
  accountDisplayName,
  formatDue,
  shortAccountId,
} from "./staff-ui";
import { enumLabel } from "./labels";
import EquipeViewToggle from "./EquipeViewToggle";
import ExceptionConversation from "./ExceptionConversation";
import type {
  CrossAccountPipelineView,
  ExceptionsQueueView,
  QueuedExceptionView,
} from "./types";

export default function ExceptionsQueue({
  workspaceId,
  accountId,
}: {
  workspaceId: string | null;
  accountId: string | null;
}) {
  const t = useTranslations("equipe.exceptions");
  const tCommon = useTranslations("equipe.common");
  const scoped = workspaceId !== null && accountId !== null;
  return (
    <PageFrame width="operational" className="min-w-0 space-y-6 py-8">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={<EquipeViewToggle active="exceptions" />}
      />
      {scoped ? (
        <ScopedQueue workspaceId={workspaceId} accountId={accountId} />
      ) : (
        <AccountPicker
          emptyLabel={t("pickAccountEmpty")}
          loadingLabel={tCommon("loading")}
        />
      )}
    </PageFrame>
  );
}

function AccountPicker({
  emptyLabel,
  loadingLabel,
}: {
  emptyLabel: string;
  loadingLabel: string;
}) {
  const t = useTranslations("equipe.exceptions");
  const tCommon = useTranslations("equipe.common");
  const query = useQuery({
    queryKey: ["equipe-staff-accounts"],
    queryFn: () => staffFetchJson<CrossAccountPipelineView>("/api/equipe/staff/accounts"),
    retry: false,
  });

  if (query.isLoading) return <StaffLoading label={loadingLabel} />;
  if (query.error)
    return <StaffErrorAlert error={query.error} onRetry={() => void query.refetch()} />;

  const entries = [...(query.data?.entries ?? [])].sort(
    (a, b) => b.exceptions.length - a.exceptions.length,
  );
  const withOpen = entries.filter((entry) => entry.exceptions.length > 0);
  if (withOpen.length === 0) return <StaffEmpty label={emptyLabel} />;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-medium text-[var(--text-primary)]">{t("pickAccount")}</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">{t("pickAccountDescription")}</p>
      </div>
      <ul className="grid gap-2">
        {withOpen.map((entry) => (
          <li key={entry.scope.accountId}>
            <Link
              href={`/admin/equipe/exceptions?workspaceId=${entry.scope.workspaceId}&accountId=${entry.scope.accountId}`}
              className={cn(
                "flex items-center justify-between gap-3 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] px-4 py-3",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
              )}
            >
              <span className="text-sm font-medium text-[var(--text-primary)]">
                {accountDisplayName(
                  entry,
                  tCommon("account", { id: shortAccountId(entry.scope.accountId) }),
                )}
              </span>
              <span className="text-xs text-[var(--text-secondary)]">
                {t("openCount", { count: entry.exceptions.length })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScopedQueue({
  workspaceId,
  accountId,
}: {
  workspaceId: string;
  accountId: string;
}) {
  const t = useTranslations("equipe.exceptions");
  const tCommon = useTranslations("equipe.common");
  const query = useQuery({
    queryKey: ["equipe-staff-exceptions", workspaceId, accountId],
    queryFn: () =>
      staffFetchJson<ExceptionsQueueView>(
        `/api/equipe/staff/exceptions?workspaceId=${encodeURIComponent(workspaceId)}&accountId=${encodeURIComponent(accountId)}`,
      ),
    retry: false,
  });

  if (query.isLoading) return <StaffLoading label={tCommon("loading")} />;
  if (query.error)
    return <StaffErrorAlert error={query.error} onRetry={() => void query.refetch()} />;

  const open = query.data?.open ?? [];
  if (open.length === 0) return <StaffEmpty label={t("empty")} />;

  const accountName = accountDisplayName(
    query.data ?? { brandName: null, workspaceName: null },
    tCommon("account", { id: shortAccountId(accountId) }),
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-[var(--text-primary)]">
          {t("queueTitle")} · {accountName}
        </h2>
        <span className="text-xs text-[var(--text-secondary)]">
          {t("openCount", { count: open.length })}
        </span>
      </div>
      <ul className="grid gap-3">
        {open.map((queued) => (
          <ExceptionCard
            key={queued.exception.id}
            queued={queued}
            onChanged={() => void query.refetch()}
          />
        ))}
      </ul>
    </div>
  );
}

function ExceptionCard({
  queued,
  onChanged,
}: {
  queued: QueuedExceptionView;
  onChanged: () => void;
}) {
  const t = useTranslations("equipe.exceptions");
  const tLabels = useTranslations("equipe.labels");
  const tCommon = useTranslations("equipe.common");
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  const { exception, slaBreached } = queued;
  const due = formatDue(exception.dueAt, locale);

  return (
    <li
      className={cn(
        "rounded-lg border bg-[var(--surface-raised)] px-4 py-3",
        slaBreached ? "border-[var(--danger-border)]" : "border-[var(--border-dim)]",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={slaBreached ? "danger" : "neutral"}>
              {enumLabel(tLabels, `trigger.${exception.trigger}`)}
            </Badge>
            <span className="text-xs text-[var(--text-secondary)]">
              {enumLabel(tLabels, `exceptionStatus.${exception.status}`)}
              {" · "}
              {tCommon("attempts", { count: exception.attempts })}
            </span>
          </div>
          {exception.reason ? (
            <p className="text-sm text-[var(--text-primary)]">
              <span className="text-[var(--text-muted)]">{t("aiReason")}: </span>
              {exception.reason}
            </p>
          ) : null}
          <p
            className={cn(
              "text-xs",
              slaBreached ? "font-medium text-[var(--danger-text)]" : "text-[var(--text-secondary)]",
            )}
          >
            {due ? tCommon("dueAt", { date: due }) : tCommon("noDue")}
            {slaBreached ? ` · ${tCommon("breached")}` : null}
          </p>
        </div>
        <Button
          type="button"
          variant={slaBreached ? "default" : "outline"}
          size="sm"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {t("enterConversation")}
        </Button>
      </div>
      {expanded ? (
        <div className="mt-4">
          <ExceptionConversation exception={exception} onChanged={onChanged} />
        </div>
      ) : null}
    </li>
  );
}
