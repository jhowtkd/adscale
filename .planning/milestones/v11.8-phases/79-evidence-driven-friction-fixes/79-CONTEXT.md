# Phase 79: Evidence-Driven Friction Fixes - Context

**Gathered:** 2026-06-07
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous)

<domain>
## Phase Boundary

Ship ≤5 surgical UX/copy/validation fixes ranked by session/event evidence; finalize v11.8 learning gate. No new AI models or cockpit modules.

Requirements: **FIX-01** through **FIX-05**, **LEARN-03**, **QA-03**.

</domain>

<decisions>
## Implementation Decisions

### Evidence source
- Locked: Rank friction from **`78-LEARNING-ANSWERS-DRAFT.md`** + instrumentation gaps + existing mission-credit-signals frustration patterns.
- Locked: Create **`79-FRICTION-BACKLOG.md`** with frequency/impact scores before implementing fixes.

### Fix cap and scope (FIX-02, FIX-03)
- Locked: Maximum **5 fixes** — copy, CTA, validation messages, credit display clarity only.
- Locked: Each fix cites event_key counts or session artifact IDs in commit message / backlog row.

### Likely fixes (from learning draft / instrumentation — implement if evidence supports)
1. Credit estimate line on preview gate when `estimateCredits` missing in UI copy
2. Mission resume CTA clarity when blocked on readiness (copy only)
3. Readiness panel blocking count surfaced before Derivar click
4. Beta session panel: copy session ID button for operator artifacts
5. Feedback form: pre-fill route when filing from cockpit frustration moment

If evidence thin, prefer **operator tooling + copy** fixes with regression tests over speculative product changes.

### Learning gate (LEARN-03)
- Locked: Finalize **`79-LEARNING-ANSWERS.md`** recommending v11.9 direction per `67-LEARNING-QUESTIONS.md` decision gate.

### QA-03
- Locked: Full `npm test`, `npm run lint`, `npm run build` in app must pass.

### Claude's Discretion
- Which 5 fixes ship based on backlog ranking.
- Test type per fix (unit vs component).

</decisions>

<deferred>
## Deferred Ideas

- Issues beyond cap → `79-V11.9-BACKLOG.md`

</deferred>

---

*Phase: 79-evidence-driven-friction-fixes*
