# Beta Runbook — Creative Strategy Cockpit (v11.6)

**Audience:** Beta operator running first client sessions  
**Date:** 2026-06-05  
**Prerequisite:** Phase 66 smoke sign-off on deployed build

## Before the session

1. Confirm deploy SHA matches `66-RELEASE-EVIDENCE.md` (includes SHIP-03 review fixes).
2. Verify migration `0027_fine_morlun.sql` applied (`npm run db:migrate` in Render if needed).
3. Ensure beta workspace has sufficient credits (`creative_qa`, `image_derivation`).
4. Open smoke checklist: `.planning/phases/65-verification-analytics-and-handoff/65-SMOKE-EVIDENCE.md`.

## Session setup (5 min)

| Step | Action |
|------|--------|
| 1 | Log in → open or create **draft** campaign |
| 2 | Upload **one base creative** (PNG/JPG) |
| 3 | Fill minimum brief fields (product, audience, CTA) |
| 4 | Note workspace credit balance in settings/billing |

## Cockpit path (happy path)

Follow the workspace modals in order:

1. **Creative Readiness** — run analysis; fix blocking issues before Derivar.
2. **Guided Briefing** — if brief is weak, answer one question at a time; accept/edit/skip.
3. **Derivar → Strategy Recipe** — pick Safe Iteration / Performance Push / Visual Differentiation; read tradeoffs; override if needed.
4. **Preview Gate** — generate one preview; confirm credit line; approve or revise recipe.
5. **Batch** — queue full batch after preview approval.
6. **Approve derivations** — mark winners in workspace.
7. **Client Approval Package** — create package + share link; open public `/share/[token]` in incognito.

## Credit expectations

| Action | Credits |
|--------|---------|
| New readiness POST analysis | 1× `creative_qa` |
| Cached readiness / GET | 0 |
| Guided briefing | 0 |
| Preview derivation | 1× `image_derivation` |
| Full batch | per `estimateCreditCost` in UI |
| Approval package | 0 |

Forced readiness rerun debits again (fresh idempotency key).

## Privacy boundaries

- Share links expose **only** token-scoped signed asset URLs — no workspace auth required.
- Feedback from beta users goes to `/feedback` (platform owners only).
- Do not paste API keys, full prompts, or raw model output in client-facing notes.

## Fallbacks

| Problem | Fallback |
|---------|----------|
| Readiness blocks generation | Fix brief/asset; rerun readiness |
| Preview quality gate fails | Revise recipe settings; do not expect preview credit refund |
| Insufficient credits | Top up or reduce batch (formats/CTA variants) |
| Stale approval package | Refresh package after derivation changes |
| Recipe panel wrong default | Close and reopen Derivar (session resets selection) |

## Collecting feedback (BETA-02)

Map notes to cockpit stage:

| Stage | Tags / signals |
|-------|----------------|
| Readiness | scores wrong, blocking false positive, slow analysis |
| Guided briefing | bad suggestions, skip flow confusing, language |
| Strategy recipe | wrong default, tradeoff copy unclear, overrides lost |
| Preview gate | credit surprise, preview ≠ batch quality |
| Approval package | share broken, stale badge, missing assets |

File via `/feedback` with campaign ID and step name.

## After session

1. Mark smoke checklist pass/fail in `65-SMOKE-EVIDENCE.md`.
2. Note credit usage vs estimate.
3. Capture 2–3 learning questions for product (see `67-LEARNING-QUESTIONS.md`).

## Escalation

- Production down → Render logs + health endpoint.
- Billing mismatch → check `preflight` idempotency and `CREDIT_COSTS` sync.
- Data issues → workspace-scoped DB; no cross-tenant access.
