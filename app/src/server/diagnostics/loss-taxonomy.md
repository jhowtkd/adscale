# Diagnostic journal — loss taxonomy (jhowtkd/adscale#387)

The console's Diagnóstico tab must report **"partial record"** honestly: it
must distinguish losses the journal can *detect* (and count) from coverage
gaps it cannot see at all. This doc is the contract between the journal
(`./journal.ts`) and the console/API tickets that read it.

## Detectable losses (counted, reportable)

These surface through `getDiagnosticJournalStats()` (process-local,
best-effort) and through row-level markers. When any of them is nonzero for
the window being displayed, the console shows **"partial record"** next to
the confirmed canonical state — never instead of it.

| Signal | Meaning | Console wording |
|---|---|---|
| `droppedEvents` | An event was intentionally discarded: invalid envelope (bad name, bad version, unparseable date, or **null/missing identity context** — identity is required for workspace isolation), still oversize after reduction (see below), or buffer full (128 events / 512 KiB). | "partial record — N events dropped before storage" |
| `failedFlushes` | A batch write failed or exceeded the 5 s write timeout. The batch is requeued for the next flush, so this is a *delay/retry* signal, not proof of loss — but while retries fail the record is incomplete. | "partial record — index write failing" |
| `degraded` | `droppedEvents > 0 \|\| failedFlushes > 0`. Single boolean for the banner. | "partial record" |
| `duplicateEvents` | Same `eventId` observed twice (buffered replay or DB conflict). **Not a loss** — dedup working as designed. Shown only in diagnostics-about-diagnostics, never as a warning. | — |
| Row `attributes["diagnostic.reduced"] = "oversize-attributes-dropped"` | The event exceeded 16 KiB, so free-form attributes were stripped to fit; every other field is intact. | "partial record — attributes trimmed (event too large)" |
| Row `correlation = "partial"` | Observed without prior context (old event without envelope). The event is real; its ancestry is incomplete. | "partial correlation" (per event, not a banner) |
| Row `export_state` | Telemetry delivery state (`created` / `export_pending` / `observed_at_destination` / `unavailable`). Describes the *telemetry*, never the generation. | "telemetry: <state>" |
| Emergency stderr lines (`[diagnostic-journal] …`) | Rate-limited (5/min), static-text-only operational signal for log-based alerting ("telemetry drops" alert in spec #382). Contains no event data. | (alerting, not UI) |

Notes:

- Stats are **process-local and reset on restart** — the console must treat
  "no signal" as "no *known* loss in this process lifetime", not as proof of
  completeness (see unknown gaps below).
- An event dropped for null identity context is *unindexable by design*: a
  row without `workspaceId`/`workItemId` cannot be workspace-isolated, and
  isolation is non-negotiable. The drop counter is its only trace.
- Shutdown with an exhausted budget counts unflushed buffered + in-flight
  events as dropped. A slow write that lands *after* the budget still
  increments `persistedEvents` — counters are best-effort, never
  double-entry bookkeeping.

## Unknown-coverage gaps (invisible, must be assumed possible)

These leave **no signal** in the journal. The console must never present a
timeline as "complete" — the honest framing is always "record as observed",
with the detectable-loss banner *added* when signals exist.

| Gap | Why it is invisible | Mitigation / honest framing |
|---|---|---|
| Abrupt crash loses buffered, unflushed events | In-memory state dies with the process; no counter survives. | Timeline shows durable rows + canonical state; console never claims "all events". Proven in `journal.pg.test.ts` ("simulated crash"). |
| Events never emitted (unwired call point, capture disabled by flag, producer threw before `emit`) | The journal cannot count what it never saw. | "Missing expected events" alert (later ticket) compares against the canonical funnel; until then, absence of evidence is not evidence of absence. |
| Producer-side clock skew across web/worker | `occurredAt` comes from two processes; visual order follows causality, not absolute time (frozen contract). | Order by `(occurredAt, id)` is *stable*, not *true*. Never render cross-process durations as facts. |
| External-vendor evidence (Sentry/Langfuse/Inngest) missing or expired | The journal stores *references*, not the remote payloads; expiry/deletion happens out of band. | Availability states (`expired`, `unavailable`) per call; Langfuse outage never blanks the console (later tickets). |
| Retention expiry (index 30 d proposed) | Old rows are deleted by `cleanupDiagnosticData` (later ticket). | Console shows the retention window; periods beyond it read "outside retention", never "nothing happened". |

## What the console must never do

- Never render `telemetry.degraded`-era timelines without the partial banner
  when `degraded` is true.
- Never treat `duplicateEvents` as data loss.
- Never treat "no events found" as "the Trabalho did nothing" — it may mean
  capture was off, the buffer was lost to a crash, or the window expired.
- Never mix telemetry delivery states (`export_state`) with generation
  outcome: an `unavailable` export says nothing about whether the Peça was
  generated, billed, approved or delivered.
