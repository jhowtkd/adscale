// Escalation detail, right column (#554): covering pauses and the
// separate staff actions — resolve, close, recalibrate — plus the
// operations-only connection revocation, picked from the isolated list.

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { settingsFieldClass } from "@/components/settings/settings-chrome";
import {
  STAFF_ROLE_FOR_COMMAND,
  roleForCloseEscalation,
  roleForResumePause,
} from "./staff-api";
import { enumLabel } from "./labels";
import type {
  EscalationDetailView,
  EquipePauseView,
  StaffRole,
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

export type EscalationActionRunner = (
  type: string,
  payload: Record<string, unknown>,
  role: StaffRole,
  doneMessage: string,
) => Promise<boolean>;

export default function EscalationDetailActions({
  view,
  busy,
  onAction,
}: {
  view: EscalationDetailView;
  busy: boolean;
  onAction: EscalationActionRunner;
}) {
  const t = useTranslations("equipe.escalation");
  const tLabels = useTranslations("equipe.labels");
  const [exit, setExit] = useState<(typeof EXITS)[number]>("fix");
  const [resolveKind, setResolveKind] = useState<"technical" | "security">("technical");
  const [cause, setCause] = useState<(typeof CAUSES)[number]>("model_error");
  const [lesson, setLesson] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [revokeReason, setRevokeReason] = useState("");

  const escalation = view.escalation;
  const unresolvedContent = view.parts.some((part) => part.kind === "content" && !part.resolved);
  const unresolvedTechnical = view.parts.filter(
    (part) => part.kind !== "content" && !part.resolved,
  );
  const frontId = escalation.frontId ?? view.item?.frontId ?? null;
  const isolated = view.isolatedConnections;

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] px-4 py-3">
        <h2 className="text-sm font-medium text-[var(--text-primary)]">{t("pausesTitle")}</h2>
        {view.pauses.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">{t("noPauses")}</p>
        ) : (
          <ul className="grid gap-2">
            {view.pauses.map((pause) => (
              <PauseRow
                key={pause.id}
                pause={pause}
                busy={busy}
                onResume={(pauseId, role) => void onAction("resume_pause", { pauseId }, role, t("resumeDone"))}
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
              void onAction(
                "resolve_content_escalation",
                { escalationId: escalation.id, exit },
                STAFF_ROLE_FOR_COMMAND.resolve_content_escalation,
                t("resolveDone"),
              );
            } else {
              void onAction(
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
          <h2 className="text-sm font-medium text-[var(--text-primary)]">{t("resolveTitle")}</h2>
          <fieldset className="grid gap-1">
            <legend className="text-xs text-[var(--text-secondary)]">{t("resolveExit")}</legend>
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
                onChange={(event) => setResolveKind(event.target.value as typeof resolveKind)}
                disabled={busy}
                className={settingsFieldClass}
              >
                <option value="technical">{enumLabel(tLabels, "kind.technical")}</option>
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
          void onAction(
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
        <h2 className="text-sm font-medium text-[var(--text-primary)]">{t("closeTitle")}</h2>
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
              void onAction(
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
          if (connectionId.length === 0 || revokeReason.trim().length === 0) return;
          void onAction(
            "revoke_connection",
            {
              connectionId,
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
        <h2 className="text-sm font-medium text-[var(--text-primary)]">{t("revokeTitle")}</h2>
        <p className="text-xs text-[var(--text-muted)]">{t("revokeHint")}</p>
        {isolated.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">{t("revokeNone")}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--text-secondary)]">{t("revokeConnection")}</span>
              <select
                value={connectionId}
                onChange={(event) => setConnectionId(event.target.value)}
                disabled={busy}
                className={settingsFieldClass}
              >
                <option value="">{t("revokePick")}</option>
                {isolated.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.provider} · {connection.id.slice(0, 8)} · {connection.status}
                  </option>
                ))}
              </select>
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
        )}
        <Button
          type="submit"
          variant="destructive"
          size="sm"
          disabled={busy || isolated.length === 0}
        >
          {t("revokeSubmit")}
        </Button>
      </form>
    </div>
  );
}

function PauseRow({
  pause,
  busy,
  onResume,
}: {
  pause: EquipePauseView;
  busy: boolean;
  onResume: (pauseId: string, role: StaffRole) => void;
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
