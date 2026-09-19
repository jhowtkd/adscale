# Diagnostics split-topology proof (#396)

Proves traceability on the **split topology** — real web server + local queue +
worker on a single commit SHA — with verifier assertions on traces/IDs, secret
absence, and ledger equivalence. Scope is traceability evidence only:
API/journey-level assertions on diagnostic events, no console-tab UI (the
Diagnóstico tab UI belongs to #394, on top of the evidence proven here).

## Commands

```bash
# Full 7-row matrix (4 min per-row cap, 30 min CI job)
cd app && npm run harness:diagnostics-split-matrix

# Single row (subset via CSV; the Playwright spec runs `success` only)
cd app && npm run harness:diagnostics-split-matrix -- --only success,restart

# Instrumentation overhead probe (p95 + RSS vs instrumented-off, >=200 ops)
cd app && npm run diagnostics:overhead
```

`npm run diagnostics:overhead` measures the synchronous per-command cost of the
diagnostics write path (envelope build + redact + journal enqueue) with flags
on versus a flag-off short-circuit, on one machine/SHA/config, with at least
200 operations per condition (default 500). Gates: instrumented per-op p95
under 5ms and process RSS growth across the instrumented phase under 20 MiB;
the full dispersion summary (min/max/mean/p50/p95/stddev) is reported in
`diagnostics-overhead.json`. The relative delta is reported but not gated —
against a microsecond short-circuit baseline it would measure timer noise.

## Matrix rows and verdicts

| Row | Scenario | Expected |
|-----|----------|----------|
| `success` | Full journey on the split topology | GREEN: required traces, secret-clean, ledger settles exactly once |
| `restart` | Worker reboot around the dispatch | GREEN: exactly-once traces and charges after reboot |
| `replay` | Duplicate delivery + journal `eventId` dedupe | GREEN: zero new charges, no duplicate ledger rows |
| `lost-context` | Envelopeless replay + partial event tolerated | GREEN: work stays readable, required traces hold |
| `unavailable-exporter` | Failing write backend (in-process row) | GREEN: degraded telemetry recorded, command path unblocked |
| `vendor-down` | Unreachable Langfuse (discard-port URL) | GREEN: bounded observe wait, no fabricated trace IDs |
| `instrumented-off` | Flags-off baseline | GREEN: journey settles exactly once without instrumentation |

The verifier asserts required trace sets per row, operation/output ID linkage,
secret absence (known values + generic shapes), and ledger equivalence
(expected debits/refunds, zero duplicate charges) — never emitted line counts.

Exit codes: 0 when every row validates, 1 on validation failure, 2 on
bootstrap failure (infra/config — distinct from a row verdict).

## Reports

Per-row reports plus the summary land under `app/tests/e2e/.evidence/`:

- `diagnostics-split-<row>.json` — row verdict, failures, evidence, telemetry,
  recovery, download, ledger, and proof sections
- `diagnostics-split-matrix.json` — whole-matrix summary
- `diagnostics-overhead.json` — overhead measurement (same directory)

CI (`diagnostics-split-matrix` job) runs the full matrix plus the overhead
measurement and uploads all `diagnostics-*.json` as `diagnostics-split-reports`.

The Playwright spec `tests/e2e/diagnostics-split.spec.ts` (serial-flows
project) runs the `success` row as a bounded smoke; the full matrix runs in CI.

## Signed URLs and boundary receipts

Signed-URL TTL and download receipts are recorded in the row evidence only when
a real signer is configured; on local/CI the receipt section records the
unsigned local-path fallback with its explicit reason. No UI-level download
simulation is asserted.

## Staging gate: BLOCKED

Staging promotion of this proof is **BLOCKED until a staging environment is
provisioned**: the matrix boots local infra (ephemeral Postgres via CI
service / local DATABASE_URL) and asserts against `localhost` web + worker
instances. The issue's synthetic external staging smoke (SHA-linked evidence
without credentials) requires, at minimum, provisioning the staging stack and
pointing `DATABASE_URL`/`APP_URL` at it — until then every verdict above is a
local/CI verdict, not a staging verdict.
