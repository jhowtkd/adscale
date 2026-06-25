# Phase 169: Real Corpus and Claim Gates - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning
**Source:** Phase 168 verification and v13.3 milestone reset

<domain>
## Phase Boundary

This phase turns generic human decision intake into honest product evidence. The product needs a client-agnostic path to bring real customer or operator-imported corpus rows into the human-quality loop, then keep customer-real, agreement-rate and quality-improvement claims blocked until the selected brand/profile has enough real source and sample coverage.

It must not create a Cenbrap-specific corpus path. Cenbrap may remain as fixture/seed compatibility data, or as ordinary data only if it enters through the same generic source-labeled path as any other client.
</domain>

<decisions>
## Implementation Decisions

### Source truth
- `synthetic_fixture`, `operator_imported` and `real_customer` are distinct evidence sources.
- `operator_imported` is useful operational evidence, but it is not customer-real proof.
- `real_customer` rows can unlock customer-real claims only when sample and source sufficiency pass for the active brand/profile.

### Scope truth
- Claims must be evaluated for the selected `workspaceId`/`clientProfileId` when that scope is active.
- Global reports can summarize multiple scopes, but external claims must identify the active brand sample behind the claim.
- Fixture-only evidence validates workflow operation, not market/customer proof.

### Release truth
- Release evidence must separate technical regression status from operational evidence status.
- A phase can be technically green while still reporting operational `insufficient_sample` or claim-withheld status.
- Planning closure for Phase 169 should mark SOURCE requirements complete only after tests and evidence artifacts prove the gates.
</decisions>

<specifics>
## Relevant Existing Surface

- `captureCorpusCandidateFromDerivation` auto-captures derivation candidates and resolves source via `resolveAutoCaptureSourceLabel`.
- `promoteCorpusCandidateToQueue` promotes candidates into the human-quality queue and already requires `clientProfileId`.
- `GET /api/feedback/human-quality-corpus/candidates` exposes candidate source and profile metadata.
- `POST /api/feedback/human-quality-corpus/candidates/[id]/promote` promotes a candidate but currently accepts only `cohort`.
- `runGlobalCorpusEvidence` builds global evidence from source composition, sample coverage and evaluated rows.
- `countFeedbackArtifactsBySourceLabel` can count by workspace/cohort, but not by `clientProfileId`.
- `evaluateGlobalCorpusClaims` already blocks customer-real claims when no `real_customer` rows exist.
- Release evidence scripts already distinguish technical regression from operational evidence in the v12.6/v13 family.
</specifics>

<deferred>
## Deferred Ideas

- Bulk CSV/customer import UX.
- Agency-facing self-serve corpus upload.
- Automated uncertainty routing.
- Multi-brand evidence dashboard index.
- New creative axes such as competitor analysis, smart resize preview or prompt performance learnings.
</deferred>

---

*Phase: 169-real-corpus-and-claim-gates*
*Context gathered: 2026-06-25*
