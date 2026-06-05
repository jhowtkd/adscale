---
phase: 60
slug: quality-fixtures-and-verification
status: complete
nyquist_compliant: true
created: 2026-06-05
---

# Phase 60 - Validation Strategy

> Per-phase validation contract for quality fixtures and regression coverage.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 + Next.js build |
| **Config file** | `app/config/vitest.config.ts` |
| **Estimated runtime** | ~30–90 seconds (fixture suite) |

---

## Per-Plan Focused Commands

### Plan 60-01 — Fixture catalog (FIX-01)

```bash
cd app && npm test -- tests/unit/ai/quality-fixtures.test.ts
```

### Plan 60-02 — Prompt regression (FIX-02)

```bash
cd app && npm test -- tests/unit/ai/quality-prompt-regression.test.ts src/server/ai/prompt-builder.test.ts
```

### Plan 60-03 — Pipeline regression (FIX-03)

```bash
cd app && npm test -- \
  tests/unit/ai/quality-fixture-pipeline.test.ts \
  tests/unit/ai/creative-quality-gate.test.ts \
  tests/unit/ai/regeneration-correction-brief.test.ts
```

---

## Wave-final command (all fixture + quality unit tests)

```bash
cd app && npm test -- \
  tests/unit/ai/quality-fixtures.test.ts \
  tests/unit/ai/quality-prompt-regression.test.ts \
  tests/unit/ai/quality-fixture-pipeline.test.ts \
  tests/unit/ai/creative-quality-gate.test.ts \
  tests/unit/ai/regeneration-correction-brief.test.ts \
  src/server/ai/prompt-builder.test.ts
```

---

## Final gate

```bash
cd app && npm run lint && npm run build
```

---

## Manual-only verification

Visual spot-check of a real derivation quality loop — see [60-HANDOFF.md](./60-HANDOFF.md). Documented, not blocking automation.

Residual model limits — see [60-LIMITATIONS.md](./60-LIMITATIONS.md).

---

## Validation Sign-Off

- [x] All tasks have automated verify or documented manual verification.
- [x] Six failure modes covered by `QUALITY_FIXTURES`.
- [x] Prompt, gate, and regeneration pipeline regression tests pass.
- [x] `npm run lint` and `npm run build` pass.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending human sign-off after manual loop spot-check
