# Phase 104: Manual and CSV Result Import - Research

**Researched:** 2026-06-12
**Phase requirements:** IMPT-01–06
**Confidence:** HIGH

## Summary

Phase 104 layers import orchestration on the Phase 103 canonical snapshot service. No new metric semantics are needed. The work splits into: (1) parse/normalize/preview domain, (2) batch/lineage persistence, (3) authenticated APIs, (4) campaign UI.

## Recommended Architecture

### Batch + row lineage

| Table | Purpose |
|-------|---------|
| `performance_import_batches` | One user action (manual submit or CSV confirm) |
| `performance_import_rows` | Per-source-row outcome linked to optional snapshot |

Batch stores `fileName`, `fileHash` (SHA-256 of raw CSV bytes; null for manual), `columnMapping`, `parseOptions`, counts, `createdByUserId`.

Row stores `rowIndex`, `status`, `errors` JSON, optional `snapshotId`, optional `sourceKey`.

### Preview without persistence

1. Parse CSV to string[][].
2. Apply column mapping → raw row object.
3. Normalize numbers/dates/currency per parse options.
4. Validate with extended Zod (reuse canonical schema pieces).
5. Resolve derivation belongs to campaign.
6. Build canonical input + compute `sourceKey`.
7. Compare with existing snapshot by sourceKey → classify wouldCreate/wouldUpdate/wouldIgnore.

### Confirm

Wrap in transaction: insert batch, for each valid row call `recordPerformanceSnapshot`, insert row lineage, update batch counts.

### Duplicate safety

Phase 103 unique `(workspaceId, sourceKey)` handles metric dedup. Batch `fileHash` is audit-only unless identical re-import should short-circuit preview — not required for IMPT-05.

## CSV Parser

Implement minimal RFC4180-ish parser:
- Detect delimiter from first line (`,` vs `;`)
- Support quoted fields with escaped quotes
- Cap rows at 10_000 for DoS safety
- Max file 5 MB

No new npm dependency required.

## Number Normalization

`normalizeNumericString(raw, { decimalSeparator, percentFormat })`:
- Strip currency symbols and whitespace
- Handle `%` suffix when percentFormat is `percent` (divide by 100)
- Swap thousand separators when decimal is `,`
- Return canonical decimal string matching Phase 103 regex

## API Surface

| Method | Path | Role |
|--------|------|------|
| POST | `/api/campaigns/[id]/performance/import/preview` | CSV multipart or JSON manual preview |
| POST | `/api/campaigns/[id]/performance/import/confirm` | Persist preview token / row set |
| GET | `/api/campaigns/[id]/performance/import/batches` | History list |
| GET | `/api/campaigns/[id]/performance/import/batches/[batchId]` | Batch detail + rows |

Keep existing `POST /performance` for backward compatibility; manual panel should use import confirm for lineage.

## UI

`PerformanceImportPanel` with tabs: Manual | CSV | History.
- Manual: derivation select + metric fields
- CSV: 4-step wizard (upload → map → options → preview → confirm)
- History: table of batches, expandable rows

Add `performance` to `CAMPAIGN_DEEP_LINK_IDS`.

## Risks

| Risk | Mitigation |
|------|------------|
| Large CSV memory | Stream parse optional later; cap size/rows now |
| Locale edge cases | Table-driven tests for pt-BR and en-US |
| Partial failure on confirm | Transaction per batch; all-or-nothing for confirm |

## References

- Phase 103 `recordPerformanceSnapshot`, `source-key.ts`, `validation.ts`
- `app/src/app/api/campaigns/[id]/performance/route.ts`
