// "Entrar na conversa": the staff side of an open support exception (#554).
//
// Staff join the account's main conversation from here — messages go
// through post_staff_message and render in that thread (#551) — assume
// the case, log off-app contact, and close handing back to the AI.

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  settingsFieldClass,
  settingsTextareaClass,
} from "@/components/settings/settings-chrome";
import { STAFF_ROLE_FOR_COMMAND, useStaffCommand } from "./staff-api";
import { StaffErrorAlert } from "./staff-ui";
import { enumLabel } from "./labels";
import type { EquipeExceptionView } from "./types";

const CHANNELS = ["phone", "whatsapp", "in_person", "other"] as const;
const CLOSE_REASONS = ["resolved", "commercial_forwarded", "client_no_response"] as const;

export default function ExceptionConversation({
  exception,
  onChanged,
}: {
  exception: EquipeExceptionView;
  onChanged: () => void;
}) {
  const t = useTranslations("equipe.exceptions");
  const tLabels = useTranslations("equipe.labels");
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>("whatsapp");
  const [summary, setSummary] = useState("");
  const [closeReason, setCloseReason] =
    useState<(typeof CLOSE_REASONS)[number]>("resolved");
  const [notice, setNotice] = useState<string | null>(null);

  const command = useStaffCommand();
  const scope = {
    role: STAFF_ROLE_FOR_COMMAND.post_staff_message,
    workspaceId: exception.workspaceId,
    accountId: exception.accountId,
  };

  async function run(
    type: "assume_exception" | "post_staff_message" | "register_contact" | "close_exception",
    payload: Record<string, unknown>,
    doneMessage: string,
  ): Promise<boolean> {
    setNotice(null);
    try {
      await command.mutateAsync({ type, payload, ...scope });
      setNotice(doneMessage);
      onChanged();
      return true;
    } catch {
      // Surfaced below through command.error.
      return false;
    }
  }

  const busy = command.isPending;

  return (
    <div className="space-y-5 border-t border-[var(--border-dim)] pt-4">
      <h3 className="text-sm font-medium text-[var(--text-primary)]">
        {t("conversationTitle")}
      </h3>
      <p className="text-xs text-[var(--text-muted)]">{t("conversationHint")}</p>

      {exception.status === "open" ? (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              void run("assume_exception", { exceptionId: exception.id }, t("assumed"))
            }
          >
            {t("assume")}
          </Button>
        </div>
      ) : null}

      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (message.trim().length === 0) return;
          void run(
            "post_staff_message",
            { exceptionId: exception.id, body: message.trim() },
            t("messageSent"),
          ).then((sent) => {
            if (sent) setMessage("");
          });
        }}
      >
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-[var(--text-primary)]">{t("messageLabel")}</span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t("messagePlaceholder")}
            rows={2}
            maxLength={4000}
            disabled={busy}
            className={settingsTextareaClass}
          />
        </label>
        <Button type="submit" size="sm" disabled={busy || message.trim().length === 0}>
          {t("messageSend")}
        </Button>
      </form>

      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (summary.trim().length === 0) return;
          void run(
            "register_contact",
            { exceptionId: exception.id, channel, summary: summary.trim() },
            t("contactDone"),
          ).then((logged) => {
            if (logged) setSummary("");
          });
        }}
      >
        <h3 className="text-sm font-medium text-[var(--text-primary)]">{t("contactTitle")}</h3>
        <div className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--text-secondary)]">{t("contactChannel")}</span>
            <select
              value={channel}
              onChange={(event) => setChannel(event.target.value as typeof channel)}
              disabled={busy}
              className={settingsFieldClass}
            >
              {CHANNELS.map((value) => (
                <option key={value} value={value}>
                  {enumLabel(tLabels, `channel.${value}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--text-secondary)]">{t("contactSummary")}</span>
            <input
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              maxLength={2000}
              disabled={busy}
              className={settingsFieldClass}
            />
          </label>
        </div>
        <Button type="submit" variant="outline" size="sm" disabled={busy || summary.trim().length === 0}>
          {t("contactSubmit")}
        </Button>
      </form>

      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run(
            "close_exception",
            { exceptionId: exception.id, reason: closeReason },
            t("closeDone"),
          );
        }}
      >
        <h3 className="text-sm font-medium text-[var(--text-primary)]">{t("closeTitle")}</h3>
        <label className="grid max-w-xs gap-1 text-sm">
          <span className="text-[var(--text-secondary)]">{t("closeReason")}</span>
          <select
            value={closeReason}
            onChange={(event) => setCloseReason(event.target.value as typeof closeReason)}
            disabled={busy}
            className={settingsFieldClass}
          >
            {CLOSE_REASONS.map((value) => (
              <option key={value} value={value}>
                {enumLabel(tLabels, `closeReason.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <div>
          <Button type="submit" variant="outline" size="sm" disabled={busy}>
            {t("closeSubmit")}
          </Button>
        </div>
      </form>

      {notice ? (
        <p role="status" className="text-sm text-[var(--success-text)]">
          {notice}
        </p>
      ) : null}
      {command.error ? <StaffErrorAlert error={command.error} /> : null}
    </div>
  );
}
