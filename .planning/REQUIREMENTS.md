# Requirements: ADScale v13.8 Conversa Guiada Adaptativa

**Defined:** 2026-06-26
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## v13.8 Requirements

### Adaptive Flow Contract

- [x] **FLOW-01**: User journey state is parsed from a versioned path-and-step schema before it is read or changed.
- [x] **FLOW-02**: User actions change journey state only through server-owned typed commands and legal deterministic transitions.
- [x] **FLOW-03**: User can resume the exact persisted question, answers, resources, review state, and recoverable error after reload.
- [x] **FLOW-04**: User can go back or edit a prior answer while preserving unrelated confirmed answers and invalidating dependent derived content.
- [x] **FLOW-05**: User can switch path or restart after seeing which answers and resources will be retained or cleared.
- [x] **FLOW-06**: User receives explicit conflict recovery when another tab or stale request changes the same journey revision first.
- [x] **FLOW-07**: User free text and guided controls update the same canonical journey state without letting the model choose transitions or IDs.

### From-Zero Conversation

- [x] **ZERO-01**: User answers one meaningful briefing decision at a time instead of completing an all-at-once form.
- [x] **ZERO-02**: User can answer each turn with free text or valid quick replies, including `Não sei` and optional skip where allowed.
- [x] **ZERO-03**: User receives contextual suggestions with visible provenance and can ignore or edit them when AI suggestions are unavailable or wrong.
- [x] **ZERO-04**: User accepted answers persist immediately and survive navigation, reload, and later correction.
- [x] **ZERO-05**: User reviews and edits a compact briefing summary before advancing to references or an action proposal.
- [x] **ZERO-06**: User cannot advance from briefing review until deterministic readiness rules for the intended action pass.

### Collaborative Diagnosis

- [x] **DIAG-01**: User can analyze a selected or uploaded creative provisionally without creating or mutating a campaign before confirmation.
- [x] **DIAG-02**: User sees diagnosis content separated into observed facts, inferred assumptions, and uncertain or missing fields.
- [x] **DIAG-03**: User can accept or correct diagnosis assumptions and missing briefing fields inside the guided conversation.
- [x] **DIAG-04**: User correction invalidates stale dependent diagnosis, readiness, and action proposals without discarding unrelated confirmed facts.
- [x] **DIAG-05**: User reviews and approves a current diagnosis snapshot before receiving an improvement action proposal.

### Inline Resources

- [x] **ASSET-01**: User can select or upload the base creative and visual references without leaving the active guided turn.
- [x] **ASSET-02**: User can add, remove, or replace resources while successful items remain selected when another item fails.
- [x] **ASSET-03**: User cannot advance from the from-zero reference step until at least three valid, scoped references are ready.
- [x] **ASSET-04**: User can retry failed upload or analysis idempotently, while late results tied to stale revisions or replaced assets are rejected.

### Confirmed Actions

- [x] **ACT-01**: User sees action cards described by expected outcome, required writes, credit impact, and irreversible effects instead of internal action or job terminology.
- [x] **ACT-02**: User cannot confirm an action card after relevant journey state changes invalidate its source revision or reviewed snapshot digest.
- [x] **ACT-03**: User confirmation revalidates workspace/client scope, current inputs, readiness, credits, and action policy before execution.
- [x] **ACT-04**: User sees deterministic journey recovery after action success, cancellation, or failure without duplicate effects.

### Verification and Release Truth

- [x] **QA-01**: Operator can query safe telemetry for answer, edit, back, switch, restart, retry, conflict, proposal, confirmation, failure, and completion events.
- [ ] **QA-02**: User can complete both journeys with keyboard navigation, coherent focus, status announcements, mobile layout, and accessible error recovery.
- [ ] **QA-03**: Authenticated Playwright covers both journeys across happy path, correction, reload/resume, switch/restart, resource replacement, retry, conflict, stale card, and confirmation.
- [x] **QA-04**: Release evidence separately reports implementation, automated verification, real staging evidence, and operational sample sufficiency, keeping quality claims blocked when evidence is pending or insufficient.

## Future Requirements

### Adaptive Optimization

- **OPT-01**: User receives question ordering tuned from sufficient real repair and progression telemetry.
- **OPT-02**: User can reuse confirmed answers across threads with explicit provenance and consent.
- **OPT-03**: User can inspect richer provenance explaining why each suggestion or inferred field was proposed.

### Additional Modes

- **MODE-01**: User can start additional guided journey types beyond `Já tenho peça` and `Produzir do zero`.
- **MODE-02**: User can operate guided journeys by voice.
- **MODE-03**: Multiple users can collaborate concurrently on one guided journey.

## Out of Scope

| Feature | Reason |
|---------|--------|
| XState or another workflow runtime | Two bounded paths do not justify a second state runtime; typed deterministic transitions fit the existing stack. |
| LangChain, Vercel AI SDK, or another AI orchestration framework | Existing model adapter, SSE, tools, and action contracts already cover the required provider boundary. |
| Model-owned next-step selection | Journey control must remain deterministic, auditable, and safe to resume. |
| Autonomous execution | Campaign writes, credits, generation, memory writes, and exports still require explicit action confirmation. |
| Automatic learning from feedback | v13.8 records evidence but does not mutate prompts, policies, or ordering automatically. |
| New guided journey paths | Milestone improves the two existing paths before expanding breadth. |
| New operational dashboard | v13.7 already delivered funnel and evidence surfaces; v13.8 extends their event semantics only. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FLOW-01 | Phase 195 | Complete |
| FLOW-02 | Phase 195 | Complete |
| FLOW-03 | Phase 195 | Complete |
| FLOW-04 | Phase 195 | Complete |
| FLOW-05 | Phase 195 | Complete |
| FLOW-06 | Phase 195 | Complete |
| FLOW-07 | Phase 195 | Complete |
| ZERO-01 | Phase 196 | Complete |
| ZERO-02 | Phase 196 | Complete |
| ZERO-03 | Phase 196 | Complete |
| ZERO-04 | Phase 196 | Complete |
| ZERO-05 | Phase 196 | Complete |
| ZERO-06 | Phase 196 | Complete |
| DIAG-01 | Phase 197 | Complete |
| DIAG-02 | Phase 197 | Complete |
| DIAG-03 | Phase 197 | Complete |
| DIAG-04 | Phase 197 | Complete |
| DIAG-05 | Phase 197 | Complete |
| ASSET-01 | Phase 198 | Complete |
| ASSET-02 | Phase 198 | Complete |
| ASSET-03 | Phase 198 | Complete |
| ASSET-04 | Phase 198 | Complete |
| ACT-01 | Phase 199 | Complete |
| ACT-02 | Phase 199 | Complete |
| ACT-03 | Phase 199 | Complete |
| ACT-04 | Phase 199 | Complete |
| QA-01 | Phase 199 | Complete |
| QA-02 | Phase 199 | Partial |
| QA-03 | Phase 199 | Unsatisfied |
| QA-04 | Phase 200 | Complete |

**Coverage:**
- v13.8 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0
- Satisfied after gap closure: 28
- Partial: 2 (QA-02, QA-03)
- Unsatisfied implementation requirements: 0

---
*Requirements defined: 2026-06-26*
*Last updated: 2026-06-27 after v13.8 gap closure verification*
