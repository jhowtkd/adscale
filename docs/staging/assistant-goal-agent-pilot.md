# Assistant Goal-Agent Pilot — Staging Runbook

This runbook guides a platform owner through deploying, verifying, and graduating the goal-oriented creative agent pilot. The pilot is gated to platform owners and tester-entitled workspaces; classic users are unaffected.

## 1. Pre-flight

- **Migration apply:** `npm run db:migrate` and confirm `0070_assistant_goal_agent.sql` created `assistant_goal_runs`, `assistant_artifact_annotations`, `client_corpus_consents`, and the `derivations.creative_level` column.
- **Migration rollback check:** confirm the migration is reversible — dropping the three new tables and the `creative_level` column restores the prior schema without data loss in shared tables.
- **Eligibility setup:** grant a tester entitlement to at least three staging workspaces (`grantTesterEntitlement`) and confirm the platform-owner email resolves to the agent experience by default.

## 2. Real objective runs

Run at least:

- **One from-zero objective:** pick a client, type a single objective, answer the three blocking questions (product/offer, audience, constraints). Confirm the agent asks one blocker at a time and materializes the draft campaign only after all three are answered.
- **One existing-piece objective:** attach an image in the start composer; confirm the agent infers the existing-piece path and the uploaded base becomes the campaign's base asset.

## 3. Credit ledger checks

Record the workspace credit balance before and after each paid action:

- **Triplet:** exactly **15 credits** deducted once before dispatch. No refund on a deliberate provider failure.
- **Annotation revision:** exactly **5 credits** deducted once. No refund.
- **Package:** exactly **15 credits** deducted once for the three additional formats. No refund.

Confirmation copy must state the non-refundable policy verbatim (`Cobrança definitiva: não há estorno, inclusive se uma geração falhar.`).

## 4. Deliberate provider failure

Force a generation failure (e.g. invalid model key) for one triplet slot:

- The failed slot shows a failed state; the other two remain usable.
- **No refund** is issued; the credit ledger confirms the charge stands.
- The failure UI is explicit, not a silent empty state.

## 5. Scope-isolation probes

- Open a thread for client A and attempt to select a candidate / read annotations / promote a version belonging to client B. Every attempt must be rejected (400/403/404).
- Confirm the goal projection never leaks output keys, prompts, provider payloads, or signed URLs (only ephemeral `previewUrl` per candidate).

## 6. Consent probes (corpus promotion)

For a completed derivation:

- **Consent absent:** platform-owner promotion returns `client_consent_required` and does not create a corpus item.
- **Consent granted:** via `POST /api/assistant/threads/{threadId}/goal/corpus-consent` `{action:"grant"}`, then promotion succeeds.
- **Consent revoked:** promotion fails closed again.

## 7. Browser notifications

With the user granting notification permission, transition a goal into `choosing_base`, `reviewing_package`, and `completed`. Confirm a native notification fires for each. No service worker or web push is involved.

## 8. Artifact reload

Close and reopen a thread mid-goal. Confirm the goal projection (stage, candidates, package items, annotations) restores exactly from durable state — the SSE `goal_state` event only signals a refetch; the projection is never persisted from the SSE DTO.

## 9. Mobile contract

On a mobile viewport: monitoring, comments, and approval are available; rectangle drawing is disabled with an explanatory label.

## 10. Graduation report

```bash
curl -H "Cookie: <session>" https://<staging>/api/feedback/analytics/goal-agent
```

The report must show `graduation.passed = true` only when:

- `startedObjectives >= 20`
- `distinctClients >= 3`
- `completionRate >= 0.60`
- `criticalCreditFailures === 0 && criticalScopeFailures === 0`

Snapshot the JSON output as rollout evidence before flipping the pilot to general availability.

## 11. Fifteen automated pilot scenarios

Run locally before staging walks:

```bash
cd app
npx tsx scripts/seed-dev-admin.ts --repair --create
npx tsx scripts/seed-goal-agent-e2e.ts
npm run goal-agent-release-gate
```

| # | Scenario | Playwright spec |
|---|----------|-----------------|
| 1 | Agent pilot + classic fallback | `assistant-goal-agent.spec.ts` |
| 2 | Mandatory client selection | same |
| 3 | From-zero brief blockers | same |
| 4 | Existing-piece path (attachment / baseAssetId) | same |
| 5 | Exact 15-credit non-refundable copy | same |
| 6 | Three neutral candidates after reload | same |
| 7 | Base selection | same |
| 8 | Two rectangle annotations | same |
| 9 | Annotation history on old version | same |
| 10 | Package 15-credit confirmation | same |
| 11 | Four formats approved individually | same |
| 12 | Final ZIP download | same |
| 13 | Stop before/after dispatch | same |
| 14 | Mobile monitor without rectangle draw | same |
| 15 | Cross-client isolation | same |

Record results in `.planning/phases/goal-agent-staging-pilot/GOAL-AGENT-EVIDENCE.json`.

## 12. Pilot bootstrap and graduation snapshot

Grant tester entitlement and seed the graduation sample (20 objectives, 3 clients, ≥60% completed):

```bash
cd app
npm run seed:goal-agent-pilot
npm run snapshot:goal-agent-graduation
```

On staging, prefer the live API snapshot:

```bash
curl -H "Cookie: <session>" https://<staging>/api/feedback/analytics/goal-agent \
  | tee goal-agent-graduation.json
```

Validate evidence:

```bash
node scripts/check-goal-agent-staging-evidence.mjs \
  --evidence ../.planning/phases/goal-agent-staging-pilot/GOAL-AGENT-EVIDENCE.json
```

## 13. Pilot execution order

**Validação automatizada (concluída 2026-07-04):** `npm run goal-agent-release-gate` — 15 cenários + tooling.

1. ~~Complete all 15 automated scenarios (`goal-agent-release-gate`).~~ **Done**
2. Grant tester entitlements to ≥3 staging workspaces (`POST /api/admin/testers`).
3. Run one from-zero and one existing-piece objective with real owners/beta testers; keep classic fallback visible via `assistant-classic-flow-toggle`.
4. Walk manual runbook sections 3–9 (credits, provider failure, scope, consent, notifications, reload).
5. Snapshot graduation report; gate must show `graduation.passed = true`.
6. Fix pilot frictions before evolving background notifications or per-client learning.

Evidência: `.planning/phases/goal-agent-staging-pilot/GOAL-AGENT-EVIDENCE.json` (`status: completed`).
