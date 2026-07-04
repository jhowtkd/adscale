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
