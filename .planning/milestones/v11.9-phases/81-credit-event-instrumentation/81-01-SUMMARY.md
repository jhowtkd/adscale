# 81-01 Summary: Credit event enrichment (CRED-03)

- `operation_key` + `creditDelta` on allowlist; `resolveCreditOperationKey` helper.
- `credits.ts` emits enriched payloads; derivations + preflight pass `operation_key` / estimates.
- Aggregate + credit-signals prefer `operation_key` for grouping.
- Tests: credit-operation-key, credits delta, sanitize/aggregate pass.
