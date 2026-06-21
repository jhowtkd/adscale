# Phase 139: Dual Verdict and Export Validator - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning
**Source:** Roadmap v12.7, Phase 138 artifacts, live code inspection

<domain>
## Phase Boundary

Phase 139 introduces the data and gate layer for two separate truths:

- `Olhar`: is the output good as a graphic/ad piece?
- `Exportacao`: can the output be exported/approved without factual, format, text or setup risk?

This phase does not rewrite the advisor voice, generation prompts or review UI. Those belong to Phases 140 and 141. Phase 139 must create contracts and deterministic gates that later surfaces can trust.

</domain>

<decisions>
## Implementation Decisions

### Dual Verdict Model

- Add a typed `olharVerdict` contract with values `pronta`, `quase`, `sem_opiniao`, `confusa`.
- Add four axis scores: `figura`, `gestalt`, `voz`, `convite`, each integer 0-3.
- Add compact direction payload: what works, what blocks, direction note.
- Add independent `exportStatus` contract with values `ok`, `ajuste_menor`, `bloqueado`.
- Keep compatibility with existing `qualityVerdict`, `hardFailures`, `qaStatus`, `qualityScore` fields; do not break legacy rows.

### Persistence Boundary

- Prefer nullable `jsonb` columns on `derivations` for `olhar_verdict` and `export_status` over overloading `qualityVerdict`.
- Add repository update helpers rather than writing raw payloads from route handlers.
- Existing `completed` derivations without dual verdict should not become automatically approvable if hard failures or export blocks exist.

### Export Validation Boundary

- Export validation is deterministic and conservative.
- Export issues include source/brand identity, CTA drift after normalization, offer/claim drift, required text readability, format ratio, resolution and campaign setup mismatch.
- Setup mismatch is reported as setup/contract issue, not as art-direction weakness.
- Character-level CTA normalization handles punctuation, NBSP, hyphen variants, typographic quotes and whitespace before drift decisions.

### Approval Boundary

- Approval APIs must reject normal `approved + invalid` states.
- In Phase 139, the route can reject blocked export/creative states without building the full override UX. Audited override belongs to Phase 141.
- Approval response details should expose separate `olharVerdict` and `exportStatus` where available, while preserving existing `derivationHardFailures` behavior.

</decisions>

<specifics>
## Current Code Facts

- `app/src/server/db/schema.ts` stores derivation quality in `qualityVerdict`, `hardFailures`, `polishSuggestions`, `qaStatus`, `qaChecklist`, `qualityScore` and related fields.
- `app/src/server/repositories/derivation.ts` owns `updateDerivationQualityGate()` and `getDerivationById()`.
- `app/src/server/ai/creative-quality-gate.ts` owns `CreativeHardFailureCode`, `assertDerivationApprovable()` and current hard-failure blocking.
- `app/src/app/api/derivations/[id]/review/route.ts` checks `assertDerivationApprovable()` before setting status to `approved`.
- Phase 138 added `app/src/server/ai/olhar/art-direction-verdict.ts`, which maps visual hard failures to `sem_opiniao` or `confusa` without touching persistence.

</specifics>

<deferred>
## Deferred Ideas

- Advisor/preflight prompt rewrite: Phase 140.
- Client voice injection into generation prompts: Phase 140, after voice review.
- Review card/modal language and override reason UI: Phase 141.
- Real campaign calibration and release evidence: Phase 142.

</deferred>

---

*Phase: 139-dual-verdict-and-export-validator*
*Context gathered: 2026-06-19*
