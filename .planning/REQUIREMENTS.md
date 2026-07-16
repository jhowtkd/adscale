# Requirements: ADScale v13.9 Copiloto Criativo Iterativo

**Defined:** 2026-06-27
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## v13.9 Requirements

### Artifact Versioning

- [x] **VERS-01**: User can inspect immutable version history for a creative plan or generated creative.
- [x] **VERS-02**: User can see each version's source version, status, creation time, triggering feedback, and provenance.
- [x] **VERS-03**: User sees exactly one current approved version per artifact lineage.
- [x] **VERS-04**: User can reload the thread and resume selected versions, pending proposal, generation status, and approval state.

### Plan Iteration

- [x] **PLAN-01**: User feedback creates a proposed plan revision without changing the current approved plan.
- [x] **PLAN-02**: User can review semantic plan changes before confirming any write.
- [x] **PLAN-03**: User confirmation creates a new immutable plan version linked to its source version.
- [x] **PLAN-04**: Each plan version preserves strategy, angles, hooks, CTAs, constraints, and source feedback as typed provenance.

### Creative Iteration

- [x] **CREV-01**: User feedback on a selected creative creates an inspectable revision proposal tied to the source creative.
- [x] **CREV-02**: User sees intended visual change, format, references, credit impact, and writes before confirming generation.
- [x] **CREV-03**: User confirmation generates a new creative version linked to the source creative and exact plan version.
- [x] **CREV-04**: Failed or canceled generation leaves the source version current and supports idempotent retry.

### Comparison and Approval

- [x] **COMP-01**: User can select and compare two versions from the same artifact lineage.
- [x] **COMP-02**: Plan comparison shows semantic field changes; creative comparison shows actual previews plus safe metadata and change summary.
- [x] **APPR-01**: User can approve a ready version as current without spending credits.
- [x] **APPR-02**: User can promote an older version as current without deleting newer versions or descendants.
- [x] **APPR-03**: User cannot approve a stale, superseded, cross-lineage, or conflicting version.

### Safety and Verification

- [x] **SAFE-01**: Every version, proposal, comparison, and approval is isolated by workspace, client profile, campaign, and assistant thread.
- [x] **SAFE-02**: Confirmations, credit spends, generation jobs, callbacks, and retries cannot create duplicate versions or charges.
- [x] **SAFE-03**: Persisted version snapshots exclude reasoning, signed URLs, raw provider payloads, and unallowlisted prompt data.
- [x] **QA-01**: Operator can query safe telemetry for proposal, confirmation, generation, comparison, approval, promotion, failure, and retry events.
- [x] **QA-02**: Repository, API, component, contract, and authenticated Playwright tests cover plan and creative iteration, reload, conflict, failure, retry, comparison, approval, and promotion.

## Future Requirements

### Memory and Collaboration

- **MEM-01**: User can reuse approved versions and decisions across threads with explicit provenance and consent.
- **COLL-01**: Multiple users can comment, branch, merge, and resolve concurrent creative revisions.
- **LEARN-01**: Approved and rejected versions can influence future recommendations after explicit learning consent.

### Additional Interaction

- **VOICE-01**: User can provide revision feedback by voice.
- **DIFF-01**: User can inspect pixel-level visual differences between creative versions.

## Out of Scope

| Feature | Reason |
|---|---|
| New guided journey types | v13.9 deepens the two existing paths before expanding breadth. |
| Arbitrary branching and merge UI | Linear parent lineage is enough for single-user iteration. |
| Cross-thread memory | Requires separate consent and provenance design. |
| Automatic preference learning | Human approvals remain explicit evidence, not automatic prompt mutation. |
| Pixel-level image diff | Side-by-side previews and semantic change summaries provide sufficient value. |
| Autonomous approval or execution | User retains control over current version, credits, and writes. |

## Traceability

| Requirement | Phase | Status |
|---|---|---|
| VERS-01 | Phase 203 | Complete |
| VERS-02 | Phase 203 | Complete |
| VERS-03 | Phase 203 | Complete |
| VERS-04 | Phase 203 | Complete |
| PLAN-01 | Phase 204 | Complete |
| PLAN-02 | Phase 204 | Complete |
| PLAN-03 | Phase 204 | Complete |
| PLAN-04 | Phase 204 | Complete |
| CREV-01 | Phase 205 | Complete |
| CREV-02 | Phase 205 | Complete |
| CREV-03 | Phase 205 | Complete |
| CREV-04 | Phase 205 | Complete |
| COMP-01 | Phase 206 | Complete |
| COMP-02 | Phase 206 | Complete |
| APPR-01 | Phase 206 | Complete |
| APPR-02 | Phase 206 | Complete |
| APPR-03 | Phase 206 | Complete |
| SAFE-01 | Phase 203 | Complete |
| SAFE-02 | Phase 205 | Complete |
| SAFE-03 | Phase 203 | Complete |
| QA-01 | Phase 207 | Complete |
| QA-02 | Phase 207 | Complete |

**Coverage:**
- v13.9 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0

---
*Requirements defined: 2026-06-27*
*Last updated: 2026-06-27 after research and owner approval*
