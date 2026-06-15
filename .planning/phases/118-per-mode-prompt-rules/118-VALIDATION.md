---
phase: 118
slug: per-mode-prompt-rules
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-15
---

# Phase 118 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.9 |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- src/server/ai/prompt-builder.test.ts tests/unit/ai/quality-prompt-regression.test.ts` |
| **Full suite command** | `cd app && npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm test -- src/server/ai/prompt-builder.test.ts tests/unit/ai/quality-prompt-regression.test.ts`
- **After every plan wave:** Run `cd app && npm test -- tests/unit/prompt-builder.test.ts tests/unit/ai/corpus-baseline.test.ts`
- **Before `$gsd-verify-work`:** Full suite must be green (`cd app && npm test && npm run lint && npm run build`)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 118-01-01 | 01 | 1 | MODE-01 | unit | `cd app && npm test -- src/server/ai/prompt-builder.test.ts -t "decorative-only"` | ❌ W0 | ⬜ pending |
| 118-01-02 | 01 | 1 | MODE-02 | unit | `cd app && npm test -- src/server/ai/prompt-builder.test.ts -t "three-zone"` | ❌ W0 | ⬜ pending |
| 118-02-01 | 02 | 2 | MODE-03 | unit | `cd app && npm test -- src/server/ai/prompt-builder.test.ts -t "restyling factual entities"` | ❌ W0 | ⬜ pending |
| 118-03-01 | 03 | 3 | MODE-04 | unit | `cd app && npm test -- src/server/ai/prompt-builder.test.ts -t "format firewall"` | ❌ W0 | ⬜ pending |
| 118-03-02 | 03 | 3 | MODE-05 | unit | `cd app && npm test -- src/server/ai/prompt-builder.test.ts -t "cross-format"` | ❌ W0 | ⬜ pending |
| 118-04-01 | 04 | 4 | MODE-01–05 | unit | `cd app && npm test -- tests/unit/ai/quality-prompt-regression.test.ts` | ✅ | ⬜ pending |
| 118-04-02 | 04 | 4 | Regression | unit | `cd app && npm test -- tests/unit/ai/corpus-baseline.test.ts -t "baseline gap"` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/src/server/ai/per-mode-prompt-rules.ts` — rule builders, constants, extractors
- [ ] Wire `buildPerModeRulesSection` in `prompt-builder.ts`; migrate inline MODE strings
- [ ] Format flexible-context firewall (plan hooks/angles, competitor omit)
- [ ] Tests: MODE-01 decorative-only + mechanism requirement
- [ ] Tests: MODE-02 three-zone budget
- [ ] Tests: MODE-03 restyling entity lock
- [ ] Tests: MODE-04 format firewall + identity lock
- [ ] Tests: MODE-05 `describe.each` over `1:1`, `4:5`, `9:16`
- [ ] Update `quality-prompt-regression.test.ts` inline snapshots

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live image decorative-only rejection | MODE-01 | Prompt tests only; gate in Phase 120 | Generate art_variation; confirm new mechanism not just recolor |
| Cross-format visual identity | MODE-05 | Live render validation Phase 122–123 | Export 1:1/4:5/9:16; same campaign narrative |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
