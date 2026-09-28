// "Registrar tempo" for quality (#571): minutes plus an optional note,
// booked through record_quality_effort so the 6 h / 8 h per-front
// monitor (#549) sees it. One form, two homes: the round detail shows
// it open, the quality queue rows behind a toggle.

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { settingsFieldClass } from "@/components/settings/settings-chrome";
import { STAFF_ROLE_FOR_COMMAND, useStaffCommand } from "./staff-api";
import { StaffErrorAlert } from "./staff-ui";

export default function QualityEffortForm({
  workspaceId,
  accountId,
  frontId,
  roundId,
  idPrefix,
}: {
  workspaceId: string;
  accountId: string;
  frontId: string;
  roundId?: string | null;
  idPrefix: string;
}) {
  const t = useTranslations("equipe.quality");
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const command = useStaffCommand();
  const busy = command.isPending;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = Number(minutes);
    if (minutes.trim().length === 0 || !Number.isInteger(parsed) || parsed < 1 || parsed > 480) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setNotice(null);
    try {
      await command.mutateAsync({
        type: "record_quality_effort",
        payload: {
          frontId,
          ...(roundId ? { roundId } : {}),
          minutes: parsed,
          ...(note.trim().length > 0 ? { note: note.trim() } : {}),
        },
        role: STAFF_ROLE_FOR_COMMAND.record_quality_effort,
        workspaceId,
        accountId,
      });
      setMinutes("");
      setNote("");
      setNotice(t("effortDone"));
    } catch {
      // Surfaced below through command.error, in plain language.
    }
  }

  const minutesId = `${idPrefix}-minutes`;
  const noteId = `${idPrefix}-note`;

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto]">
        <label className="grid gap-1 text-sm">
          <span className="text-[var(--text-secondary)]">{t("effortMinutes")}</span>
          <input
            id={minutesId}
            type="number"
            inputMode="numeric"
            min={1}
            max={480}
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
            disabled={busy}
            className={settingsFieldClass}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-[var(--text-secondary)]">{t("effortNote")}</span>
          <input
            id={noteId}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={2000}
            disabled={busy}
            className={settingsFieldClass}
          />
        </label>
        <div className="flex items-end">
          <Button type="submit" size="sm" disabled={busy}>
            {t("effortSubmit")}
          </Button>
        </div>
      </div>
      {invalid ? (
        <p role="alert" className="text-xs text-[var(--danger-text)]">
          {t("effortInvalid")}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-[var(--success-text)]">
          {notice}
        </p>
      ) : null}
      {command.error ? <StaffErrorAlert error={command.error} /> : null}
    </form>
  );
}
