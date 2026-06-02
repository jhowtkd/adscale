## 1️⃣ Document Metadata

| Field | Value |
|-------|--------|
| **Project** | ADScale_2 |
| **Run** | Production (`npm run build && npm run start` in `app/`) |
| **Date** | 2026-06-02 |
| **Server mode** | `production` (with `E2E_DISABLE_RATE_LIMIT=true`) |
| **Endpoint** | http://localhost:3000 |
| **Tests executed** | 30 (TC001–TC030) |
| **Login fixtures** | `dev-admin@adscale.local` (main), `empty@adscale.local` (TC030), `reset-user@adscale.local` (TC015) — all `DevAdmin123!` |
| **Seed data** | `testsprite_tests/testsprite-seed.json` (campaign, template, asset, share/invite tokens, empty + reset users, public fixture URLs) |
| **Raw report** | `testsprite_tests/tmp/raw_report.md` |
| **Dashboard** | https://www.testsprite.com/dashboard/mcp/tests/f6fa8963-e2cc-4eb8-9326-92e58843733e |
| **Billing re-run** | Targeted TC011 + TC013 after wiring real Stripe test keys — both ✅ ([TC011](https://www.testsprite.com/dashboard/mcp/tests/aa95bc52-71cc-4909-8890-cb1266625efe/79edbf22-5b8e-4d31-90ec-537385b0e821), [TC013](https://www.testsprite.com/dashboard/mcp/tests/aa95bc52-71cc-4909-8890-cb1266625efe/62f159fd-9b5c-4577-a4f8-31bd1cb11ac6)) |
| **Fixes re-run** | Targeted TC002 + TC015 + TC030 after fixes — all ✅ ([TC002](https://www.testsprite.com/dashboard/mcp/tests/f2c79cb6-78a4-4f70-82a0-e1dd93dfcaa4/6488db0e-3c9a-4986-8271-9df86b7c2bd1), [TC015](https://www.testsprite.com/dashboard/mcp/tests/f2c79cb6-78a4-4f70-82a0-e1dd93dfcaa4/2055e95b-a349-4e7f-884d-6be2322954aa), [TC030](https://www.testsprite.com/dashboard/mcp/tests/f2c79cb6-78a4-4f70-82a0-e1dd93dfcaa4/b515d092-bf05-4140-92d0-e8e5aa4b804b)) |
| **Local Playwright** | TC014 + TC019 executed with local Playwright (`app/tests/e2e/restyle.spec.ts`, `npm run test:e2e`) — both ✅, `2 passed (2.0m)`. Attaches real `base.png` + `style.png`, drives the full restyle → Inngest → OpenAI `gpt-image` pipeline to a `completed` derivation. |
| **Run history** | 10 → 23 → 25 → 28 → **30 passed** (28 TestSprite cloud + 2 local Playwright) |

---

## 2️⃣ Requirement Validation Summary

### User authentication

| Test | Status | Analysis |
|------|--------|----------|
| TC001 Sign in (email/password) | **PASSED** | Login → dashboard works (rate limit disabled for E2E). |
| TC003 Create account | **PASSED** | Signup flow completed. |
| TC004 Accept workspace invite | **PASSED** | Now passes via seeded invite token `/invite?token=testsprite-e2e-invite`. |
| TC007 Magic sign-in link | **PASSED** | Magic-link request flow works. |
| TC016 Request password reset | **PASSED** | Forgot-password flow works. |
| TC015 Reset password from token | **PASSED** | Dedicated `reset-user@adscale.local` + E2E-only dev endpoint `/api/dev/reset-token` hands the runner a valid Better Auth token → reset succeeds. |

### Campaign management

| Test | Status | Analysis |
|------|--------|----------|
| TC005 View list & open campaign | **PASSED** | Opens seeded `TestSprite E2E Campaign`. |
| TC006 Campaign detail → creative | **PASSED** | Continues from seeded campaign into creative tools. |
| TC009 Dashboard → campaigns | **PASSED** | No longer blocked (auth bypass). |
| TC002 Create campaign (wizard) | **PASSED** | Pilot image is optional — test advances via "Pular sugestões" to the actions view, no upload required. |

### Settings & billing

| Test | Status | Analysis |
|------|--------|----------|
| TC008 Access settings | **PASSED** | Settings reachable (auth bypass). |
| TC010 Update workspace settings | **PASSED** | Settings update works. |
| TC012 Settings + billing flow | **PASSED** | Combined navigation passed. |
| TC018 Switch settings sections | **PASSED** | Tab navigation works. |
| TC011 Billing checkout | **PASSED** | Real Stripe test keys wired → button redirects to `checkout.stripe.com`. |
| TC013 Customer portal | **PASSED** | Real Stripe customer + portal config → button opens `billing.stripe.com`. |

### Creative & restyling

| Test | Status | Analysis |
|------|--------|----------|
| TC017 Review restyled output | **PASSED** | Review path works. |
| TC014 Restyle → new variation | **PASSED** | Local Playwright (`restyle.spec.ts`) attaches base+style images, submits, and polls until the variation reaches `completed` via the real Inngest + OpenAI `gpt-image` pipeline (46s). |
| TC019 Restyle and review | **PASSED** | Local Playwright restyles, waits for `completed`, reloads the workspace, opens the preview dialog, and asserts the generated image renders (1.2m). |

### Library & templates

| Test | Status | Analysis |
|------|--------|----------|
| TC020 Browse asset library | **PASSED** | Seeded asset visible. |
| TC022 Use template as starting point | **PASSED** | Uses seeded template. |
| TC023 Browse template gallery | **PASSED** | Seeded template shows in gallery. |
| TC024 Open asset from library | **PASSED** | Opens seeded `TestSprite Seed Asset`. |
| TC026 Browse workspace library | **PASSED** | Seeded asset browsable. |
| TC027 Browse available templates | **PASSED** | Templates listed. |
| TC030 Empty library state | **PASSED** | Dedicated `empty@adscale.local` workspace (no seeded assets/campaigns) renders the true empty state without disturbing TC020/024/026. |

### Public share

| Test | Status | Analysis |
|------|--------|----------|
| TC021 Open public share page | **PASSED** | Seeded `/share/testsprite-e2e-share` resolves. |
| TC025 View shared derivation | **PASSED** | Shared derivation renders. |
| TC028 Shared title + preview | **PASSED** | Title + preview visible. |
| TC029 Shared derivation + metadata | **PASSED** | Metadata visible. |

---

## 3️⃣ Coverage & Matching Metrics

| Metric | This run | Prior run | First run |
|--------|----------|-----------|-----------|
| **Total tests** | 30 | 30 | 30 |
| **Passed** | **30 (100%)** | 28 (93.3%) | 10 (33.3%) |
| **Failed** | 0 (0%) | 0 (0%) | 8 (26.7%) |
| **Blocked** | 0 (0%) | 2 (6.7%) | 12 (40.0%) |

| Requirement area | Total | Passed | Failed | Blocked |
|------------------|-------|--------|--------|---------|
| User authentication | 6 | 6 | 0 | 0 |
| Campaign management | 4 | 4 | 0 | 0 |
| Settings & billing | 6 | 6 | 0 | 0 |
| Creative & restyling | 3 | 3 | 0 | 0 |
| Library & templates | 7 | 7 | 0 | 0 |
| Public share | 4 | 4 | 0 | 0 |

> **30/30 green.** The last two cases (TC014, TC019) were previously blocked only by the TestSprite cloud runner's inability to attach files; they now pass via local Playwright, which drives the same UI and the real restyle → Inngest → OpenAI `gpt-image` pipeline end-to-end. Every requirement area is 100% passing.

---

## 4️⃣ Key Gaps / Risks

1. **Stripe billing (TC011, TC013)** — ✅ Resolved. Real test-mode keys + Price IDs added to `app/.env.local`, and the dev workspace now points to a real Stripe test customer/subscription with an active portal configuration. Checkout → `checkout.stripe.com`, portal → `billing.stripe.com`. (`m.stripe.com` analytics-beacon warnings in TestSprite's sandbox are harmless.)

2. **Restyle upload tests (TC014, TC019)** — ✅ Resolved via local Playwright (`app/tests/e2e/restyle.spec.ts`, `npm run test:e2e`). The restyle UI gates submission on actual file inputs (base + style reference), which the TestSprite cloud agent cannot attach (no local fixture paths, no binary-buffer payloads). Local Playwright attaches `app/public/e2e/base.png` + `style.png` via `setInputFiles`, submits, and polls the derivations API until `completed` through the real Inngest `derivation.generate` → OpenAI `gpt-image` pipeline. While greening these, a latent app bug surfaced and was fixed: `failStaleActiveDerivations` compared the DB-written `updated_at` (`timestamp` without zone, `defaultNow()`) against a JS `new Date()` in UTC. With the Postgres session on `America/Sao_Paulo` (UTC−3), brand-new `queued` rows looked ~3h old and were instantly marked `failed`. The check now runs entirely on the DB clock (`updated_at < now() - interval`), so it is timezone-agnostic (`app/src/server/repositories/derivation.ts` + both campaign derivation/restyle routes).

3. **Campaign wizard upload (TC002)** — ✅ Resolved. The pilot image is optional; the test now advances with "Pular sugestões", so no upload is needed.

4. **Password-reset token (TC015)** — ✅ Resolved. Added an E2E-only dev endpoint `/api/dev/reset-token` (guarded by `E2E_DISABLE_RATE_LIMIT`) backed by an in-memory store that captures the Better Auth reset URL/token, plus a dedicated `reset-user@adscale.local` so the flow has no side effects on the main account.

5. **Empty-library test (TC030)** — ✅ Resolved. A dedicated `empty@adscale.local` workspace (no seeded assets/campaigns) renders the true empty state, so TC030 passes without breaking the seeded browse/open tests (TC020/024/026).

---

**Setup performed across runs:**
- TestSprite API key configured in Cursor MCP (`~/.cursor/mcp.json`).
- Local Postgres `adscale_db` + schema; `dev-admin@adscale.local` seeded (scale plan).
- Added E2E rate-limit bypass: middleware (`app/src/lib/rate-limit.ts`) and Better Auth (`app/src/server/auth/index.ts`) skip limits when `E2E_DISABLE_RATE_LIMIT=true`.
- Added idempotent seed `npm run seed:testsprite` (`app/scripts/seed-testsprite.ts`) → campaign, template, asset, share + invite tokens, valid PNG fixtures (`app/public/e2e/`), the dedicated `empty@adscale.local` + `reset-user@adscale.local` accounts, and `testsprite_tests/testsprite-seed.json`.
- Wired real Stripe test billing: `STRIPE_*` test keys + Price IDs in `app/.env.local`, plus `npm run seed:stripe` (`app/scripts/seed-stripe-real.ts`) → real test customer, payment method, subscription, and portal configuration for the dev workspace.
- Added E2E-only password-reset retrieval: in-memory store (`app/src/server/auth/e2e-reset-store.ts`) + dev endpoint (`app/src/app/api/dev/reset-token/route.ts`), both guarded by `E2E_DISABLE_RATE_LIMIT`.
- App served in production with `E2E_DISABLE_RATE_LIMIT=true`; Inngest dev server (`npm run inngest:dev`) running for the async restyle pipeline.
- Added local Playwright coverage for the upload-gated restyle flows: `app/playwright.config.ts` + `app/tests/e2e/restyle.spec.ts` (run via `npm run test:e2e`), with `tests/e2e/**` excluded from Vitest (`app/config/vitest.config.ts`).
- Fixed the timezone-sensitive staleness check (`failStaleActiveDerivations`) so freshly-queued derivations are no longer falsely failed; the comparison is now evaluated on the database clock.

**Result: a literal 30/30.** TC001–TC013, TC015–TC018, TC020–TC030 pass on the TestSprite cloud runner; TC014 + TC019 pass via local Playwright (`2 passed (2.0m)`), which can attach the PNG fixtures the cloud runner cannot.
