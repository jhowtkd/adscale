# Domain Pitfalls: v11.11 Aprendizado → Ação

**Domain:** Readiness tuning, post-preview stall UX, share-link analytics on instrumented beta app  
**Researched:** 2026-06-08  
**Overall confidence:** HIGH (extends v11.10 pitfall patterns)

---

## Critical Pitfalls

### Pitfall 1: Tuning Thresholds Before SESS-03 Data

**What goes wrong:** `BLOCKING_SCORE_THRESHOLD` lowered/raised without override dimension breakdown → false confidence, reintroduces false positives or over-permissive generation.

**Prevention:** D-1 gated on TS-3 data with ≥2 override events across ≥3 sessions. Document before/after in LEARNING-ANSWERS.

**Phase:** Threshold tuning phase (after SESS-03)

---

### Pitfall 2: Share Open Event Without Allowlist Extension

**What goes wrong:** `share_link_opened` fired from public page but rejected server-side — Q7/F-13 permanently unanswerable.

**Prevention:** Extend `PHASE_76_BETA_EVENT_KEYS` and `ALLOWED_PROPERTY_KEYS` before call site. Add sanitize test.

**Phase:** Wave 1 (schema foundation)

---

### Pitfall 3: Stall Analysis on Broken Preview Funnel

**What goes wrong:** If F-06 not deployed, `cockpit_stage_completed(preview)` missing → stall metrics nonsense.

**Prevention:** Verify Phase 85 deployed before TS-2. Smoke-check preview completion event in SESS-03 checklist.

**Phase:** Pre-requisite — v11.10 Phase 85

---

### Pitfall 4: Building D-2 Nudge Without TS-2 Evidence

**What goes wrong:** Campaign card nudge ships for a stall that only existed in one fixture session — UI noise without validated problem.

**Prevention:** TS-2 stall panel must show median > 15min across ≥2 real sessions before D-2.

**Phase:** D-2 after SESS-03

---

### Pitfall 5: Confounding Analytics with AI/Workflow Changes

**What goes wrong:** New cockpit stages or generation modes ship alongside analytics → cannot attribute stall or override changes.

**Prevention:** Anti-feature: freeze cockpit shape in v11.11. No new AI models.

**Phase:** All phases

---

## Moderate Pitfalls

| # | Risk | Prevention |
|---|------|------------|
| 6 | Share opens have no `sessionId` — wrong assistance correlation | Join via `campaignId` + session that created share link |
| 7 | `blockingDimensions` array exceeds allowlist size | Cap at 6 dimension ids; validate enum |
| 8 | Unauthenticated share analytics missing `workspaceId` | Always pass from `validateShareToken` result |
| 9 | Threshold change without i18n update to blocking copy | Run lint; update readiness messages if dimension labels change |
| 10 | LEARNING-ANSWERS still cite fixture UUIDs | Reviewer rejects `550e8400-…` citations |

---

## Minor Pitfalls

- **Double-counting share opens:** Debounce by `tokenId + 1h window` if operators refresh page
- **Stall threshold too aggressive:** Start at 15min; make configurable constant not magic number in aggregate
- **Campaign nudge on wrong derivation mode:** Filter `generationMode === 'preview'` only

---

*Researched: 2026-06-08 — v11.11 milestone*
