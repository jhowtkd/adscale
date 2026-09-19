"use client";

import { useTranslations } from "next-intl";
import type { DiagnosticEventEnvelopeMirror } from "@/lib/diagnostics/types";
import {
  DIAGNOSTIC_BUCKETS,
  summarizeOperations,
  type DiagnosticBucket,
  type OperationBadge,
} from "@/lib/diagnostics/timeline-model";
import { cn } from "@/lib/utils";

const BADGE_TONE: Record<OperationBadge, string> = {
  recovered: "bg-[var(--success-bg)] text-[var(--success-text)]",
  terminal: "bg-[var(--danger-bg)] text-[var(--danger-text)]",
  unconfirmed: "bg-[var(--surface-raised)] text-[var(--text-muted)]",
  partial: "bg-[var(--warning-bg)] text-[var(--warning-text)]",
};

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/**
 * Operation/stage timeline from journal telemetry. Time splits use only
 * measured `durationMs` values; stored walls are displayed, never
 * differenced across processes.
 */
export function DiagnosticsTimeline({
  events,
}: {
  events: DiagnosticEventEnvelopeMirror[];
}) {
  const t = useTranslations("feedback.triage.diagnostics.timeline");
  const operations = summarizeOperations(events);

  if (operations.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">{t("empty")}</p>
    );
  }

  return (
    <div className="space-y-6">
      {operations.map((operation) => (
        <section
          key={operation.operationId || "unscoped"}
          aria-label={t("operation", {
            id: operation.operationId || t("unscoped"),
          })}
          className="space-y-3 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <code className="max-w-full truncate text-xs text-[var(--text-primary)]">
              {operation.operationId || t("unscoped")}
            </code>
            <span className="text-xs text-[var(--text-muted)]">
              {t("release", { sha: operation.releaseSha ?? t("unknown") })}
            </span>
            {operation.badges.map((badge) => (
              <span
                key={badge}
                data-testid={`diagnostics-badge-${badge}`}
                className={cn(
                  "rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-wide",
                  BADGE_TONE[badge],
                )}
              >
                {t(`badges.${badge}`)}
              </span>
            ))}
          </div>

          <dl className="grid gap-2 text-xs sm:grid-cols-2">
            {(DIAGNOSTIC_BUCKETS as readonly DiagnosticBucket[]).map(
              (bucket) => {
                const total = operation.buckets[bucket];
                return (
                  <div
                    key={bucket}
                    className="rounded-md border border-[var(--border-dim)] px-3 py-2"
                  >
                    <dt className="font-medium text-[var(--text-primary)]">
                      {t(`buckets.${bucket}`)}
                    </dt>
                    <dd className="mt-1 text-[var(--text-secondary)]">
                      {total.measured > 0 ? (
                        t("measured", {
                          time: formatMs(total.totalMs),
                          count: total.measured,
                        })
                      ) : (
                        <span className="text-[var(--text-muted)]">
                          {t("noDuration")}
                        </span>
                      )}
                      {total.unmeasured > 0 ? (
                        <span className="text-[var(--text-muted)]">
                          {" "}
                          {t("unmeasured", { count: total.unmeasured })}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                );
              },
            )}
          </dl>

          <ol className="space-y-1 text-xs text-[var(--text-secondary)]">
            {events
              .filter(
                (event) =>
                  (event.context?.operationId ?? "") ===
                  operation.operationId,
              )
              .map((event) => (
                <li
                  key={event.eventId}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-t border-[var(--border-dim)] py-1.5"
                >
                  <span className="font-medium text-[var(--text-primary)]">
                    {event.event}
                  </span>
                  {event.stage ? (
                    <span className="text-[var(--text-muted)]">
                      {event.stage}
                    </span>
                  ) : null}
                  <span className="text-[var(--text-muted)]">
                    {t("occurredAt", {
                      time: new Date(event.occurredAt).toLocaleString(),
                    })}
                  </span>
                  {typeof event.durationMs === "number" ? (
                    <span className="text-[var(--text-muted)]">
                      {t("duration", { time: formatMs(event.durationMs) })}
                    </span>
                  ) : null}
                  {event.correlation === "partial" ? (
                    <span className="rounded-full bg-[var(--warning-bg)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--warning-text)]">
                      {t("badges.partial")}
                    </span>
                  ) : null}
                </li>
              ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
