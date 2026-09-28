// I2 · Cross-account pipeline (#554): open escalations, open exceptions
// and active pauses per account. Stuck items — past their deadline or
// critical — stand out; the API stays the authority for every action.

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
import { staffFetchJson, useStaffCommand } from "./staff-api";
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
import OpenAccountDialog from "./OpenAccountDialog";
import type {
  CrossAccountEntryView,
  CrossAccountPipelineView,
  EquipeEscalationView,
  EquipeExceptionView,
  EquipePauseView,
  OpenAccountCandidateView,
  StaffRole,
} from "./types";

function isPastDue(dueAt: string | null, now: number): boolean {
  if (!dueAt) return false;
  const time = new Date(dueAt).getTime();
  return !Number.isNaN(time) && time < now;
}

function stuckCount(entry: CrossAccountEntryView, now: number): number {
  const escalations = entry.escalations.filter(
    (row) =>
      row.severity === "critical" ||
      row.severity === "critical_cross_account" ||
      isPastDue(row.dueAt, now),
  ).length;
  const exceptions = entry.exceptions.filter((row) => isPastDue(row.dueAt, now)).length;
  return escalations + exceptions;
}

export default function CrossAccountPipeline({
  candidates = [],
  canOpenAccount = false,
  activationRole = "support",
}: {
  // #582 — open-account candidates from the server component; the dialog
  // renders its action only for operations staff.
  candidates?: OpenAccountCandidateView[];
  canOpenAccount?: boolean;
  /**
   * The caller's held role for "Propor ativação", picked by the page from
   * its staff rows (support if held, else operations). Null hides the
   * propose button — staff holding neither role only sees the state.
   */
  activationRole?: StaffRole | null;
}) {
  const t = useTranslations("equipe.accounts");
  const tCommon = useTranslations("equipe.common");
  const query = useQuery({
    queryKey: ["equipe-staff-accounts"],
    queryFn: () => staffFetchJson<CrossAccountPipelineView>("/api/equipe/staff/accounts"),
    retry: false,
  });

  return (
    <PageFrame width="operational" className="min-w-0 space-y-6 py-8">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <>
            <EquipeViewToggle active="accounts" />
            <OpenAccountDialog canOpen={canOpenAccount} candidates={candidates} />
          </>
        }
      />
      {query.isLoading ? <StaffLoading label={tCommon("loading")} /> : null}
      {query.error ? (
        <StaffErrorAlert error={query.error} onRetry={() => void query.refetch()} />
      ) : null}
      {query.data ? <PipelineEntries view={query.data} activationRole={activationRole} /> : null}
    </PageFrame>
  );
}

function PipelineEntries({
  view,
  activationRole,
}: {
  view: CrossAccountPipelineView;
  activationRole: StaffRole | null;
}) {
  const t = useTranslations("equipe.accounts");
  const [now] = useState(() => Date.now());
  const entries = [...view.entries]
    .filter(
      (entry) =>
        entry.escalations.length > 0 ||
        entry.exceptions.length > 0 ||
        entry.pauses.length > 0 ||
        // #584: a shadow mandate needs staff — propose, or await the client.
        entry.mandate?.approved?.shadow === true,
    )
    .sort((a, b) => stuckCount(b, now) - stuckCount(a, now));
  if (entries.length === 0) return <StaffEmpty label={t("empty")} />;
  return (
    <div className="grid gap-4">
      {entries.map((entry) => (
        <AccountCard
          key={entry.scope.accountId}
          entry={entry}
          now={now}
          activationRole={activationRole}
        />
      ))}
    </div>
  );
}

function AccountCard({
  entry,
  now,
  activationRole,
}: {
  entry: CrossAccountEntryView;
  now: number;
  activationRole: StaffRole | null;
}) {
  const t = useTranslations("equipe.accounts");
  const tCommon = useTranslations("equipe.common");
  const stuck = stuckCount(entry, now);
  const accountName = accountDisplayName(
    entry,
    tCommon("account", { id: shortAccountId(entry.scope.accountId) }),
  );
  return (
    <section
      aria-label={accountName}
      className={cn(
        "rounded-lg border bg-[var(--surface-raised)] px-4 py-3",
        stuck > 0 ? "border-[var(--warning-border)]" : "border-[var(--border-dim)]",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{accountName}</h2>
        <div className="flex items-center gap-2">
          {stuck > 0 ? (
            <Badge variant="warning">{t("stuckBadge", { count: stuck })}</Badge>
          ) : null}
          {entry.exceptions.length > 0 ? (
            <Link
              href={`/admin/equipe/exceptions?workspaceId=${entry.scope.workspaceId}&accountId=${entry.scope.accountId}`}
              className="text-xs font-medium text-[var(--active-navigation-text)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              {t("openException")}
            </Link>
          ) : null}
        </div>
      </div>
      {entry.mandate?.approved?.shadow === true ? (
        <div className="mt-3">
          <MandateActivation entry={entry} activationRole={activationRole} />
        </div>
      ) : null}
      <div className="mt-3 grid gap-4 md:grid-cols-3">
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            {t("sectionEscalations")}
          </h3>
          {entry.escalations.length === 0 ? (
            <SectionEmpty />
          ) : (
            <ul className="grid gap-2">
              {entry.escalations.map((row) => (
                <EscalationRow
                  key={row.id}
                  row={row}
                  workspaceId={entry.scope.workspaceId}
                  accountId={entry.scope.accountId}
                  now={now}
                />
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            {t("sectionExceptions")}
          </h3>
          {entry.exceptions.length === 0 ? (
            <SectionEmpty />
          ) : (
            <ul className="grid gap-2">
              {entry.exceptions.map((row) => (
                <ExceptionRow key={row.id} row={row} now={now} />
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            {t("sectionPauses")}
          </h3>
          {entry.pauses.length === 0 ? (
            <SectionEmpty />
          ) : (
            <ul className="grid gap-2">
              {entry.pauses.map((row) => (
                <PauseRow key={row.id} row={row} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

// #584 — the account's mandate on the internal account card: "Propor
// ativação" with a confirmation while the approved mandate is in shadow
// mode, the wait note once the activation pends the client.
function MandateActivation({
  entry,
  activationRole,
}: {
  entry: CrossAccountEntryView;
  activationRole: StaffRole | null;
}) {
  const t = useTranslations("equipe.accounts");
  const tCommon = useTranslations("equipe.common");
  const [confirming, setConfirming] = useState(false);
  const command = useStaffCommand({ invalidateQueries: [["equipe-staff-accounts"]] });
  const approved = entry.mandate?.approved;
  const pending = entry.mandate?.activationPending;
  if (!approved?.shadow) return null;
  const mandateId = approved.id;

  async function send() {
    if (!activationRole) return;
    try {
      await command.mutateAsync({
        type: "propose_mandate_activation",
        payload: { mandateId },
        role: activationRole,
        workspaceId: entry.scope.workspaceId,
        accountId: entry.scope.accountId,
      });
      setConfirming(false);
    } catch {
      // StaffErrorAlert below shows it; the confirmation stays open to retry.
    }
  }

  return (
    <div
      className="rounded-md border border-[var(--border-dim)] px-3 py-2"
      data-testid={`staff-mandate-${entry.scope.accountId}`}
    >
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {t("mandateTitle")}
      </h3>
      {pending ? (
        <p className="text-sm text-[var(--text-secondary)]" data-testid="staff-mandate-pending">
          {t("mandateActivationPending", { version: pending.version })}
        </p>
      ) : confirming ? (
        <div className="space-y-2">
          <p className="text-sm text-[var(--text-primary)]">{t("proposeActivationConfirm")}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={command.isPending}
              onClick={() => void send()}
              data-testid="staff-mandate-confirm"
            >
              {t("proposeActivationSubmit")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={command.isPending}
              onClick={() => setConfirming(false)}
              data-testid="staff-mandate-cancel"
            >
              {tCommon("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-[var(--text-secondary)]">
            {t("mandateShadow", { version: approved.version })}
          </p>
          {activationRole ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirming(true)}
              data-testid="staff-mandate-propose"
            >
              {t("proposeActivation")}
            </Button>
          ) : null}
        </div>
      )}
      {command.error ? (
        <div className="mt-2">
          <StaffErrorAlert error={command.error} />
        </div>
      ) : null}
    </div>
  );
}

function SectionEmpty() {
  const t = useTranslations("equipe.accounts");
  return <p className="text-xs text-[var(--text-muted)]">{t("noneInSection")}</p>;
}

function EscalationRow({
  row,
  workspaceId,
  accountId,
  now,
}: {
  row: EquipeEscalationView;
  workspaceId: string;
  accountId: string;
  now: number;
}) {
  const tLabels = useTranslations("equipe.labels");
  const tCommon = useTranslations("equipe.common");
  const locale = useLocale();
  const critical = row.severity === "critical" || row.severity === "critical_cross_account";
  const pastDue = isPastDue(row.dueAt, now);
  const due = formatDue(row.dueAt, locale);
  return (
    <li
      className={cn(
        "rounded-md border px-3 py-2",
        critical || pastDue
          ? "border-[var(--danger-border)] bg-[var(--danger-bg)]"
          : "border-[var(--border-dim)]",
      )}
    >
      <Link
        href={`/admin/equipe/escalations/${row.id}?workspaceId=${workspaceId}&accountId=${accountId}`}
        className="text-sm font-medium text-[var(--text-primary)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      >
        {enumLabel(tLabels, `kind.${row.kind}`)} · {enumLabel(tLabels, `severity.${row.severity}`)}
      </Link>
      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
        {enumLabel(tLabels, `escalationStatus.${row.status}`)}
        {due ? ` · ${tCommon("dueAt", { date: due })}` : ""}
        {pastDue ? ` · ${tCommon("breached")}` : ""}
      </p>
    </li>
  );
}

function ExceptionRow({ row, now }: { row: EquipeExceptionView; now: number }) {
  const tLabels = useTranslations("equipe.labels");
  const tCommon = useTranslations("equipe.common");
  const locale = useLocale();
  const pastDue = isPastDue(row.dueAt, now);
  const due = formatDue(row.dueAt, locale);
  return (
    <li
      className={cn(
        "rounded-md border px-3 py-2",
        pastDue
          ? "border-[var(--danger-border)] bg-[var(--danger-bg)]"
          : "border-[var(--border-dim)]",
      )}
    >
      <p className="text-sm font-medium text-[var(--text-primary)]">
        {enumLabel(tLabels, `trigger.${row.trigger}`)}
      </p>
      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
        {enumLabel(tLabels, `exceptionStatus.${row.status}`)}
        {" · "}
        {tCommon("attempts", { count: row.attempts })}
        {due ? ` · ${tCommon("dueAt", { date: due })}` : ""}
        {pastDue ? ` · ${tCommon("breached")}` : ""}
      </p>
    </li>
  );
}

function PauseRow({ row }: { row: EquipePauseView }) {
  const tLabels = useTranslations("equipe.labels");
  return (
    <li className="rounded-md border border-[var(--border-dim)] px-3 py-2">
      <p className="text-sm font-medium text-[var(--text-primary)]">
        {enumLabel(tLabels, `pauseLevel.${row.level}`)} ·{" "}
        {enumLabel(tLabels, `pauseScope.${row.scope}`)}
      </p>
      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
        {enumLabel(tLabels, `pauseOrigin.${row.origin}`)}
      </p>
    </li>
  );
}
