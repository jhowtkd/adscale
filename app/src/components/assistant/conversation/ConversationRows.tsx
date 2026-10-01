"use client";

// The v4 conversation rows (H1–H6, D1): the Strategist speaks as a row with the avatar, the name, the IA badge and
// the time, and what it says (a line, a card) hangs under the name; the person's messages are right-aligned bubbles
// with the time. Consecutive Strategist messages share one header.

import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/** "10:02" in the reader's language, as a <time>; nothing when the message has no persisted time (a live one). */
export function MessageTime({ at, className }: { at: string | Date | undefined; className?: string }) {
  const locale = useLocale();
  if (!at) return null;
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  return (
    <time dateTime={date.toISOString()} className={className}>
      {date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
    </time>
  );
}

export function StrategistRow({
  at,
  showHeader = true,
  children,
}: {
  at?: string | Date;
  showHeader?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("assistant.chat");
  return (
    <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-2 gap-y-2" data-testid="strategist-row">
      {showHeader ? (
        <>
          <span
            aria-hidden="true"
            className="grid size-7 place-items-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[var(--text-secondary)]"
          >
            <Sparkles size={14} />
          </span>
          <div className="flex min-w-0 items-center gap-2 self-center">
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">{t("strategist")}</span>
            <span className="rounded border border-[var(--border-default)] px-1 font-mono text-[9px] leading-4 text-[var(--text-secondary)]">
              {t("aiBadge")}
            </span>
            <MessageTime at={at} className="text-xs text-[var(--text-muted)]" />
          </div>
        </>
      ) : null}
      <div className={cn("col-start-2 min-w-0", showHeader ? "" : "-mt-1")}>{children}</div>
    </div>
  );
}

export function StrategistText({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-[645px] text-sm leading-[1.6] text-[var(--text-primary)] whitespace-pre-wrap" data-testid="assistant-message-assistant">
      {children}
    </div>
  );
}

export function UserBubble({ at, children }: { at?: string | Date; children: ReactNode }) {
  return (
    <div
      className="ml-auto flex max-w-[75%] flex-col gap-1 rounded-2xl bg-[var(--surface-raised)] px-3.5 py-2.5 text-sm text-[var(--text-primary)]"
      data-testid="assistant-message-user"
    >
      <div className="whitespace-pre-wrap break-words">{children}</div>
      <MessageTime at={at} className="self-end text-[11px] text-[var(--text-muted)]" />
    </div>
  );
}
