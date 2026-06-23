---
phase: 162
slug: per-brand-voice-configuration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-23
---

# Phase 162 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | `app/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- --run src/server/ai/voices/ src/server/ai/olhar/generation-direction.test.ts` |
| **Full suite command** | `cd app && npm test -- --run` |
| **Estimated runtime** | ~30–90 seconds (quick), ~3–5 min (full) |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 162-01-01 | 01 | 1 | VOICE-01 | unit | migration apply + repository test | ❌ W0 | ⬜ pending |
| 162-01-02 | 01 | 1 | VOICE-03 | unit | Cenbrap parity snapshot test | ❌ W0 | ⬜ pending |
| 162-02-01 | 02 | 2 | VOICE-02, VOICE-04 | unit | `generation-direction.test.ts` | ✅ | ⬜ pending |
| 162-02-02 | 02 | 2 | VOICE-04 | unit | deprecated resolver not called | ❌ W0 | ⬜ pending |
| 162-03-01 | 03 | 3 | VOICE-05 | integration | admin voice route test | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/src/server/repositories/client-profile-olhar-config.test.ts` — CRUD + workspace isolation
- [ ] `app/src/server/ai/voices/voice-config-resolver.test.ts` — profile lookup + null when missing
- [ ] `app/src/app/api/admin/quality/brands/[clientProfileId]/voice/route.test.ts` — owner 200, non-owner 403
- [ ] Cenbrap parity golden test comparing prompt section strings

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Owner UI readability | VOICE-05 | UI optional in wave 3 | Platform owner opens brand voice page, sees sections without edit controls |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
