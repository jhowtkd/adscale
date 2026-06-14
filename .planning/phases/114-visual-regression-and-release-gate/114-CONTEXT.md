# Phase 114 Context

**Goal:** Close v12.2 with reproducible visual, responsive, accessibility, and automated release evidence.

**Requirements:** RESP-07, QA-15, QA-16, QA-17

## Deliverables

- `playwright.release.config.ts` — 6 viewport layout matrix + axe gate
- `visual-release-gate.spec.ts` — 9 scenarios × 6 widths
- `visual-a11y-gate.spec.ts` — axe on representative routes
- `run-release-gate.mjs` / `check-release-gate.mjs` — orchestration + validation

## Deferred defects

- `DEFECT-CONTRAST` — color-contrast deferred in axe gate (owner 113)
