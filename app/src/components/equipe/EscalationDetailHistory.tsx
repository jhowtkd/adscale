// Escalation detail, left column (#554): history by actor, resolution
// parts, the item at risk and the linked support case. Read-only.

"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { formatDue } from "./staff-ui";
import { enumLabel } from "./labels";
import type { EscalationDetailView, EquipeEventView } from "./types";

export default function EscalationDetailHistory({ view }: { view: EscalationDetailView }) {
  const t = useTranslations("equipe.escalation");
  const tLabels = useTranslations("equipe.labels");
  const locale = useLocale();
  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] px-4 py-3">
        <h2 className="text-sm font-medium text-[var(--text-primary)]">{t("historyTitle")}</h2>
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
        <h2 className="text-sm font-medium text-[var(--text-primary)]">{t("partsTitle")}</h2>
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
        <h2 className="text-sm font-medium text-[var(--text-primary)]">{t("itemTitle")}</h2>
        {view.item ? (
          <p className="text-sm text-[var(--text-secondary)]">
            {enumLabel(tLabels, `itemStatus.${view.item.status}`)}
            {view.item.scheduledFor ? ` · ${formatDue(view.item.scheduledFor, locale) ?? ""}` : ""}
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
