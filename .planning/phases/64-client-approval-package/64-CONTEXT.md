# Phase 64: Client Approval Package - Context

**Gathered:** 2026-06-05
**Status:** Locked for execution
**Source:** v11.6 milestone, Phases 61–63 complete, `--auto` discuss defaults

<domain>

## Phase Boundary

Phase 64 turns approved derivations into a client-facing approval package with selectable creatives, formats, creative notes, status, signed downloads, and workspace-safe share links. Users can refresh the package when approvals or derivations change.

This phase does not build milestone verification (Phase 65).

</domain>

<decisions>

## Implementation Decisions

### Product Direction

- Package is campaign-scoped; user selects one or more **approved** root derivations (plus their approved format children).
- Package shows per-item format, status, CTA, and creative note derived from derivation + campaign context.
- Share link reuses existing `share_links` table and `/share/[token]` gallery.
- Share gallery serves assets via signed URLs through a token-scoped asset route (not public R2 URLs).
- Package notes editable in-panel; persisted on `campaigns.notes`.
- Stale indicator when selected derivations change status or new approvals are not yet in the link.

### Architecture

- Pure server module `client-approval-package.ts` for item building, selection expansion, and staleness detection.
- API `GET/POST /api/campaigns/[id]/approval-package` for snapshot and create/refresh.
- API `GET /api/share/[token]/asset/[derivationId]` for signed asset access.
- Client hook `use-approval-package.ts` and `ClientApprovalPackagePanel` in campaign workspace actions area.
- Reuse `createShareToken`, `useExport`, existing delivery-package format children.

### UI

- Panel appears in actions workspace when approved derivations exist.
- Multi-select approved roots, notes field, status list, copy link, download actions, refresh when stale.

### i18n

- `clientApprovalPackage` namespace for `en` and `pt-BR`.

</decisions>

<specifics>

## Specific Ideas

- Existing: `DeliveryPackageModal`, delivery-package API, share links, exports with signed URLs.
- Integration: `campaigns/[id]/page.tsx` actions section after preview gate.

</specifics>

---

*Phase: 64-client-approval-package*
*Context locked: 2026-06-05*
