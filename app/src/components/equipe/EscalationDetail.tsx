// Q3 · Escalation detail (#554): history by actor, parts, the item at
// risk, covering pauses, and the separate actions — resolve, close,
// resume front, recalibrate — each with its conditions, plus the
// operations-only connection revocation.

"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";
import { settingsFieldClass } from "@/components/settings/settings-chrome";
import {
  STAFF_ROLE_FOR_COMMAND,
  roleForCloseEscalation,
  roleForResumePause,
  useStaffCommand,
  staffFetchJson,
} from "./staff-api";
import {
  StaffEmpty,
  StaffErrorAlert,
  StaffLoading,
  formatDue,
  shortAccountId,
} from "./staff-ui";
import { enumLabel } from "./labels";
import type {
  EscalationDetailView,
  EquipeEventView,
  EquipePauseView,
} from "./types";

const EXITS = ["fix", "confirm_no_issue", "defer_to_client"] as const;
const CAUSES = [
  "missing_source",
  "outdated_offer",
  "model_error",
  "connection",
  "client_request",
  "isolation",
  "other",
  "no_client_response",
] as const;

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
  const [exit, setExit] = useState<(typeof EXITS)[number]>("fix");
  const [resolveKind, setResolveKind] = useState<"technical" | "security">("technical");
  const [cause, setCause] = useState<(typeof CAUSES)[number]>("model_error");
  const [lesson, setLesson] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const command = useStaffCommand();
  const busy = command.isPending;
  const scoped = workspaceId.length > 0 && accountId.length > 0;

  const query = useQuery({
    queryKey: ["equipe-staff-escalation", workspaceId, accountId, escalationId],
    queryFn: () =>
      staffFetchJson<EscalationDetailView>(
        `/api/equipe/staff/escalations/${escalationId}?workspaceId=${encodeURIComponent(workspaceId)}&accountId=${encodeURIComponent(accountId)}`,
      ),
    retry: false,
    enabled: scoped,
  });

  async function run(
    type: string,
    payload: Record<string, unknown>,
    role: Parameters<typeof command.mutateAsync>[0]["role"],
    doneMessage: string,
  ) {
    setNotice(null);
    try {
      await command.mutateAsync({ type, payload, role, workspaceId, accountId });
      setNotice(doneMessage);
      void query.refetch();
      return true;
    } catch {
      return false;
    }
  }

  const view = query.data;
  const escalation = view?.escalation;
  const unresolvedContent = (view?.parts ?? []).some(
    (part) => part.kind === "content" && !part.resolved,
  );
  const unresolvedTechnical = (view?.parts ?? []).filter(
    (part) => part.kind !== "content" && !part.resolved,
  );
  const frontId = escalation?.frontId ?? view?.item?.frontId ?? null;
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
          escalation
            ? [
                tCommon("account", { id: shortAccountId(escalation.accountId) }),
                `${t("ownerLabel")}: ${escalation.ownerRole}`,
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

      {!scoped ? <StaffEmpty label={tCommon("missingScope")} /> : null}
      {scoped && query.isLoading ? <StaffLoading label={tCommon("loading")} /> : null}
      {query.error ? (
        <StaffErrorAlert error={query.error} onRetry={() => void query.refetch()} />
      ) : null}

      {view && escalation ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <section className="space-y-2 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] px-4 py-3">
              <h2 className="text-sm font-medium text-[var(--text-primary)]">
                {t("historyTitle")}
              </h2>
              {view.events.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">{t("historyEmpty")}</p>
              ) : (
                <ol className="space-y-2">
                  {view.events.map((event) => (
                    <HistoryEvent key={event.id} event={event} />
                  ))}
                </ol>
              )}
            </section>

            <section className="space-y-2 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] px-4 py-3">
              <h2 className="text-sm font-medium text-[var(--text-primary)]">
                {t("partsTitle")}
              </h2>
              <ul className="flex flex-wrap gap-1">
                {view.parts.map((part, index) => (
                  <li key={`${part.kind}-${index}`}>
                    <Badge variant={part.resolved ? "success" : "warning"}>
                      {enumLabel(tLabels, `kind.${part.kind}`)} ·{" "}
                      {part.resolved ? t("partResolved") : t("partOpen")}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-2 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] px-4 py-3">
              <h2 className="text-sm font-medium text-[var(--text-primary)]">
                {t("itemTitle")}
              </h2>
              {view.item ? (
                <p className="text-sm text-[var(--text-secondary)]">
                  {enumLabel(tLabels, `itemStatus.${view.item.status}`)}
                  {view.item.scheduledFor
                    ? ` · ${formatDue(view.item.scheduledFor, locale) ?? ""}`
                    : ""}
                </p>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">{t("noItem")}</p>
              )}
            </section>

            {view.exception ? (
              <section className="space-y-2 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] px-4 py-3">
                <h2 className="text-sm font-medium text-[var(--text-primary)]">
                  {t("linkedException")}
                </h2>
                <p className="text-sm text-[var(--text-secondary)]">
                  {enumLabel(tLabels, `trigger.${view.exception.trigger}`)} ·{" "}
                  {enumLabel(tLabels, `exceptionStatus.${view.exception.status}`)}
                </p>
                <Link
                  href={`/admin/equipe/exceptions?workspaceId=${view.workspaceId}&accountId=${view.accountId}`}
                  className="text-xs font-medium text-[var(--active-navigation-text)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                >
                  {t("openException")}
                </Link>
              </section>
            ) : null}
          </div>

          <div className="space-y-4">
            <section className="space-y-3 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] px-4 py-3">
              <h2 className="text-sm font-medium text-[var(--text-primary)]">
                {t("pausesTitle")}
              </h2>
              {view.pauses.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">{t("noPauses")}</p>
              ) : (
                <ul className="grid gap-2">
                  {view.pauses.map((pause) => (
                    <PauseRow
                      key={pause.id}
                      pause={pause}
                      busy={busy}
                      onResume={(pauseId, role) =>
                        void run("resume_pause", { pauseId }, role, t("resumeDone"))
                      }
                    />
                  ))}
                </ul>
              )}
            </section>

            {unresolvedContent || unresolvedTechnical.length > 0 ? (
              <form
                className="space-y-2 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] px-4 py-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (unresolvedContent) {
                    void run(
                      "resolve_content_escalation",
                      { escalationId: escalation.id, exit },
                      STAFF_ROLE_FOR_COMMAND.resolve_content_escalation,
                      t("resolveDone"),
                    );
                  } else {
                    void run(
                      "resolve_technical_escalation",
                      {
                        escalationId: escalation.id,
                        exit,
                        ...(unresolvedTechnical.length > 1 ? { kind: resolveKind } : {}),
                      },
                      STAFF_ROLE_FOR_COMMAND.resolve_technical_escalation,
                      t("resolveDone"),
                    );
                  }
                }}
              >
                <h2 className="text-sm font-medium text-[var(--text-primary)]">
                  {t("resolveTitle")}
                </h2>
                <fieldset className="grid gap-1">
                  <legend className="text-xs text-[var(--text-secondary)]">
                    {t("resolveExit")}
                  </legend>
                  {EXITS.map((value) => (
                    <label
                      key={value}
                      className="flex items-center gap-2 text-sm text-[var(--text-primary)]"
                    >
                      <input
                        type="radio"
                        name="exit"
                        value={value}
                        checked={exit === value}
                        onChange={() => setExit(value)}
                        disabled={busy}
                      />
                      {enumLabel(tLabels, `exit.${value}`)}
                    </label>
                  ))}
                </fieldset>
                {!unresolvedContent && unresolvedTechnical.length > 1 ? (
                  <label className="grid max-w-xs gap-1 text-sm">
                    <span className="text-[var(--text-secondary)]">{t("resolveKind")}</span>
                    <select
                      value={resolveKind}
                      onChange={(event) =>
                        setResolveKind(event.target.value as typeof resolveKind)
                      }
                      disabled={busy}
                      className={settingsFieldClass}
                    >
                      <option value="technical">
                        {enumLabel(tLabels, "kind.technical")}
                      </option>
                      <option value="security">{enumLabel(tLabels, "kind.security")}</option>
                    </select>
                  </label>
                ) : null}
                <Button type="submit" size="sm" disabled={busy}>
                  {t("resolveSubmit")}
                </Button>
              </form>
            ) : null}

            <form
              className="space-y-2 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] px-4 py-3"
              onSubmit={(event) => {
                event.preventDefault();
                void run(
                  "close_escalation",
                  {
                    escalationId: escalation.id,
                    cause,
                    ...(lesson.trim().length > 0 ? { lessonCandidate: lesson.trim() } : {}),
                  },
                  roleForCloseEscalation(escalation.ownerRole),
                  t("closeDone"),
                );
              }}
            >
              <h2 className="text-sm font-medium text-[var(--text-primary)]">
                {t("closeTitle")}
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                {t("closeHint", { role: escalation.ownerRole })}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="text-[var(--text-secondary)]">{t("closeCause")}</span>
                  <select
                    value={cause}
                    onChange={(event) => setCause(event.target.value as typeof cause)}
                    disabled={busy}
                    className={settingsFieldClass}
                  >
                    {CAUSES.map((value) => (
                      <option key={value} value={value}>
                        {enumLabel(tLabels, `cause.${value}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-[var(--text-secondary)]">{t("closeLesson")}</span>
                  <input
                    value={lesson}
                    onChange={(event) => setLesson(event.target.value)}
                    maxLength={2000}
                    disabled={busy}
                    className={settingsFieldClass}
                  />
                </label>
              </div>
              <Button type="submit" variant="outline" size="sm" disabled={busy}>
                {t("closeSubmit")}
              </Button>
            </form>

            {frontId ? (
              <div className="space-y-2 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] px-4 py-3">
                <h2 className="text-sm font-medium text-[var(--text-primary)]">
                  {t("recalibrateTitle")}
                </h2>
                <p className="text-xs text-[var(--text-muted)]">{t("recalibrateHint")}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      "reopen_front_calibration",
                      { frontId, escalationId: escalation.id },
                      STAFF_ROLE_FOR_COMMAND.reopen_front_calibration,
                      t("recalibrateDone"),
                    )
                  }
                >
                  {t("recalibrateSubmit")}
                </Button>
              </div>
            ) : null}

            <form
              className="space-y-2 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] px-4 py-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (connectionId.trim().length === 0 || revokeReason.trim().length === 0) return;
                void run(
                  "revoke_connection",
                  {
                    connectionId: connectionId.trim(),
                    escalationId: escalation.id,
                    reason: revokeReason.trim(),
                  },
                  STAFF_ROLE_FOR_COMMAND.revoke_connection,
                  t("revokeDone"),
                ).then((done) => {
                  if (done) {
                    setConnectionId("");
                    setRevokeReason("");
                  }
                });
              }}
            >
              <h2 className="text-sm font-medium text-[var(--text-primary)]">
                {t("revokeTitle")}
              </h2>
              <p className="text-xs text-[var(--text-muted)]">{t("revokeHint")}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="text-[var(--text-secondary)]">{t("revokeConnection")}</span>
                  <input
                    value={connectionId}
                    onChange={(event) => setConnectionId(event.target.value)}
                    disabled={busy}
                    className={settingsFieldClass}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-[var(--text-secondary)]">{t("revokeReason")}</span>
                  <input
                    value={revokeReason}
                    onChange={(event) => setRevokeReason(event.target.value)}
                    maxLength={2000}
                    disabled={busy}
                    className={settingsFieldClass}
                  />
                </label>
              </div>
              <Button type="submit" variant="destructive" size="sm" disabled={busy}>
                {t("revokeSubmit")}
              </Button>
            </form>
          </div>
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

function PauseRow({
  pause,
  busy,
  onResume,
}: {
  pause: EquipePauseView;
  busy: boolean;
  onResume: (pauseId: string, role: "support" | "quality" | "operations") => void;
}) {
  const t = useTranslations("equipe.escalation");
  const tLabels = useTranslations("equipe.labels");
  const role = roleForResumePause(pause.origin);
  return (
    <li className="rounded-md border border-[var(--border-dim)] px-3 py-2">
      <p className="text-sm font-medium text-[var(--text-primary)]">
        {enumLabel(tLabels, `pauseLevel.${pause.level}`)} ·{" "}
        {enumLabel(tLabels, `pauseScope.${pause.scope}`)}
      </p>
      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
        {enumLabel(tLabels, `pauseOrigin.${pause.origin}`)}
        {pause.reason ? ` · ${pause.reason}` : ""}
      </p>
      <div className="mt-2">
        {role ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onResume(pause.id, role)}
          >
            {t("resumeSubmit")}
          </Button>
        ) : pause.origin === "client" ? (
          <p className="text-xs text-[var(--text-muted)]">
            {t("resumeNotStaff", { who: enumLabel(tLabels, "pauseOrigin.client") })}
          </p>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">{t("resumeAutomatic")}</p>
        )}
      </div>
    </li>
  );
}

const PAYLOAD_KEYS = [
  "cause",
  "exit",
  "reason",
  "lessonCandidate",
  "summary",
  "note",
  "channel",
  "connectionId",
  "from",
  "to",
] as const;

function HistoryEvent({ event }: { event: EquipeEventView }) {
  const tLabels = useTranslations("equipe.labels");
  const locale = useLocale();
  const payload =
    typeof event.payload === "object" && event.payload !== null
      ? (event.payload as Record<string, unknown>)
      : null;
  const facts = (payload ? PAYLOAD_KEYS : [])
    .filter((key) => payload && payload[key] !== undefined && payload[key] !== null)
    .map((key) => `${key}: ${summarize(payload![key])}`);
  const actor = [
    enumLabel(tLabels, `actorType.${event.actorType}`),
    event.actorRole ?? null,
    event.actorId ? event.actorId.slice(0, 8) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="rounded-md border border-[var(--border-dim)] px-3 py-2">
      <p className="text-sm font-medium text-[var(--text-primary)]">
        {enumLabel(tLabels, `eventType.${event.eventType}`)}
      </p>
      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
        {actor} · {formatDue(event.occurredAt, locale) ?? event.occurredAt}
      </p>
      {facts.length > 0 ? (
        <p className="mt-0.5 font-mono text-xs text-[var(--text-muted)]">{facts.join(" · ")}</p>
      ) : null}
    </li>
  );
}

function summarize(value: unknown): string {
  if (typeof value === "string") return value.length > 80 ? `${value.slice(0, 80)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const rendered = JSON.stringify(value);
    return rendered.length > 80 ? `${rendered.slice(0, 80)}…` : rendered;
  } catch {
    return "…";
  }
}
