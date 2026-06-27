# Phase 201 Verification

**Status:** passed_with_tech_debt (automated coverage expanded; browser execution blocked on auth)

## Delivered

- Shared retry login helper: `app/tests/e2e/support/guided-auth.ts`
- Playwright scenario matrix: `app/tests/e2e/guided-assistant-scenarios.spec.ts` (reload/resume, correction, switch/restart, conflict, retry, stale card, references, diagnosis, keyboard)
- Guided E2E runner: `app/scripts/run-guided-e2e.mjs` + `playwright.guided.config.ts`
- Accessibility component tests: `GuidedFlowControls.test.tsx`, `FromZeroProgressiveBriefPanel.test.tsx`, expanded `GuidedFlowResumeBanner.test.tsx`
- Component tests: **11/11 pass**

## Browser execution

Local Playwright runs hit `POST /api/auth/sign-in/email 400` for `dev-admin@adscale.local` — existing account password mismatch. Repair requires:

```bash
cd app
DEV_ADMIN_EMAIL=dev-admin@adscale.local BETTER_AUTH_URL=http://localhost:3000 \
  npx tsx scripts/seed-dev-admin.ts --repair --create \
  --email=dev-admin@adscale.local --password='DevAdmin123!'
npm run test:guided-e2e
```

## QA mapping

| Requirement | Status | Evidence |
|-------------|--------|----------|
| QA-02 | Partial → near-complete | Component a11y tests; keyboard/focus/alert roles verified in RTL |
| QA-03 | Partial | Scenario spec covers full matrix (mocked API); browser run pending auth fix |
