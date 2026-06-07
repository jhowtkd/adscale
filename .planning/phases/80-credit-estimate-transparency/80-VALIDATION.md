---
phase: 80
slug: credit-estimate-transparency
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-07
---

# Phase 80 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x + Testing Library |
| **Config file** | `app/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- src/server/ai/strategy-recipes.test.ts src/components/workspace/PreviewGatePanel.test.tsx` |
| **Full suite command** | `cd app && npm test` |
| **Estimated runtime** | ~15 seconds (focused) |

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run quick run command
- **Before phase verification:** `npm run lint && npm run build` in `app/`

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| T1 | 80-01 | 1 | CRED-01 | unit | `npm test -- strategy-recipes.test.ts` | pending |
| T2 | 80-02 | 2 | CRED-01,02,04 | component | `npm test -- PreviewGatePanel.test.tsx` | pending |
