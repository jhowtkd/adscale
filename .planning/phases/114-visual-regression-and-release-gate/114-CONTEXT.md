# Phase 114 Context

**Goal:** Close v12.2 with reproducible visual, responsive, accessibility, and automated release evidence.

**Requirements:** RESP-07, QA-15, QA-16, QA-17

## Deliverables

- `playwright.release.config.ts` — 7 layout variants + Axe and role gates
- `visual-release-gate.spec.ts` — 8 scenarios × 7 viewport/height variants
- `visual-a11y-gate.spec.ts` — axe on representative routes
- `feedback-role-matrix.spec.ts` — platform owner, workspace admin, and member
- `run-release-gate.mjs` / `check-release-gate.mjs` — orchestration + validation

## Manual acceptance

QA-17 also requires explicit evidence for assistive technology, real browser zoom at 200%, and degraded states. Automated text resize is not recorded as browser zoom.
