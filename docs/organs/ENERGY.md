# Energy — Organ Deep Dive

> Character-level map of ADScale fuel: credits, access, Stripe.  
> Parent atlas: [`../COGNITIVE-ATLAS.md`](../COGNITIVE-ATLAS.md) · ADR: [`../adr/0012-cognitive-atlas.md`](../adr/0012-cognitive-atlas.md)  
> Downstream motors: [`CORTEX.md`](./CORTEX.md) · [`HANDS.md`](./HANDS.md)  
> Code home: `app/src/server/billing/` · Atlas name: **Energy**  
> Version: **v0.1** · 2026-07-10

---

## 1. What Energy is

Energy decides **whether a metered gesture may run** — credit balance, access kind, Stripe lifecycle. It does **not** think creatively. Cortex declares credit impact on action cards; APIs call `spendOrApiError` **before** Hands wake.

| Layer | Path |
|-------|------|
| Access resolution | `access.ts` |
| Costs + FIFO spend / refund | `credits.ts` |
| HTTP gate (402) | `paywall.ts` |
| Plans | `plans.ts` |
| Checkout / portal | `sessions.ts` |
| Stripe webhook processor | `events.ts` |
| Stripe client | `stripe.ts` |
| Beta redeem | `beta.ts`, `entitlements.ts` |
| Unlimited / tester / dev | `unlimited-access.ts` |
| Idempotency keys | `credit-operation-key.ts` |
| HTTP | `app/src/app/api/billing/*` |
| Client conversion | `app/src/lib/billing/conversion-gate.ts` |

---

## 2. Thesis

> Without Energy, Hands and many Cortex actions do not start.  
> Energy does not judge art.  
> Spend at the **API / confirm boundary**; Inngest jobs assume fuel was already taken (refunds are the exception path).

---

## 3. Access kinds (`getWorkspaceBillingAccess`)

Priority order (simplified):

```text
dev admin owner     → kind paid, unlimited-ish balance, hasSpendAccess
tester entitlement  → kind tester, UNLIMITED_CREDIT_BALANCE, hasSpendAccess
active subscription → kind paid, real grant sum, hasSpendAccess
beta entitlement    → kind beta, grant sum, hasSpendAccess
past_due + credits  → kind paid|none, spend only if balance > 0
else                → kind none, hasSpendAccess false
```

| Kind | Meaning |
|------|---------|
| `paid` | Active subscription (or past_due with remaining credits / dev admin) |
| `beta` | Beta entitlement + grant |
| `tester` | Tester entitlement (unlimited balance for spend checks) |
| `none` | No spend access |

**Past-due policy:** existing credits remain spendable; new monthly grants stay suspended until payment recovers (`PAST_DUE_SPEND_POLICY`).

Subscription statuses normalized: `trialing` | `active` | `past_due` | `canceled` | `none`.

---

## 4. Costs (`CREDIT_COSTS`)

| Action | Credits |
|--------|---------|:--------|
| `creative_plan` | 1 |
| `image_derivation` | 5 |
| `regeneration` | 5 |
| `restyling` | 5 |
| `delivery_package_child` | 5 |
| `creative_qa` | 1 |
| `copy_generation` | 2 |
| `personaSimulation` | 3 |
| `landing_page` | 10 |

Cortex action contracts reference these via `creditImpact` (`fixed` or `creditAction`).

---

## 5. Plans & grants

| Plan | Monthly grant |
|------|---------------|
| `starter` | 30 |
| `growth` | 120 |
| `scale` | 360 |

Mapped to Stripe price IDs via env.  
Beta: `BETA_CREDIT_GRANT_AMOUNT` = 5 × 10 ads = **50** credits (`entitlements.ts`), source `beta_tester`.

Spendable balance = sum of non-expired `credit_grants.remaining`. Debits are **FIFO** across grants inside a transaction (`recordUsage` / spend path in `credits.ts`).

---

## 6. Spend gate

### `spend` / `spendOrApiError` (`paywall.ts`)

```text
spendOrApiError(params)
  → recordUsage / canSpend
  → ok: creditsSpent (idempotent duplicate possible)
  → blocked: HTTP 402 + ConversionErrorPayload
       (reason, recommended action, suggested plan, returnPath…)
```

Call sites: campaign derivations, restyle, regenerate, delivery children, QA, landing page, auto-briefing, brand-kit extract, Cortex handlers (`revise_creative`, annotations, goal package, …).

### Idempotency

`idempotencyKey` + `resolveCreditOperationKey(action, metadata)` prevent double-charge on retries. Duplicate usage → success without re-debit.

### Analytics

Blocked spends emit `credit_blocked` beta analytics (non-blocking).

### Low credits

Recipients may get low-credits email after spend paths (notification helpers in `credits.ts`).

---

## 7. Refunds

`refundCredits` — used when Hands/Cortex policy allows (e.g. failed creative_revision).  
Goal-agent paths often set `refundPolicy: "none"` — charge is definitive ([`HANDS.md`](./HANDS.md)).

Refunds restore grant remaining / write credit transactions; they do not “think,” only reverse fuel.

---

## 8. Stripe lifecycle

| Piece | Job |
|-------|-----|
| `sessions.ts` | Checkout (14-day trial) + Customer Portal |
| `events.ts` | Webhook: sync subscription, grant on `invoice.paid`, mark `past_due` on failure |
| `api/billing/webhook` | Signature-verified entry |
| `api/billing/checkout` · `portal` · `status` · `history` | User-facing |

History: `credit_transactions` + grants for settings UI.

---

## 9. Beta redeem

`redeemBetaAccess`:

1. Validate code against `BETA_ACCESS_CODES`  
2. Reject if already redeemed / entitlement exists  
3. Create `beta_tester` entitlement + 50-credit grant  

API: `POST /api/billing/beta/redeem`.

---

## 10. Relation to Cortex Agent pilot

Tester / platform-owner eligibility for goal-agent (`goal/pilot.ts`) is **entitlement-adjacent** to Energy. Unlimited tester balance and agent pilot both gate on tester/owner — Energy fuels; pilot chooses consciousness mode. Do not conflate: a paid user without tester entitlement stays on classic Cortex.

---

## 11. Nerves

| Direction | Organ | How |
|-----------|-------|-----|
| In ← Human | checkout, portal, beta code | billing APIs |
| In ← Stripe | webhooks | events.ts |
| Out → Hands / Cortex / other motors | allow or 402 before work | spendOrApiError |
| Out ← Hands | refunds on eligible failure | refundCredits |
| Out → UI | status, history, conversion gate | billing hooks / conversion-gate |
| Peer Cortex | creditImpact on action cards | contracts declare; Energy spends |

---

## 12. Safety invariants

1. **Spend before enqueue** — do not start Inngest generation then discover no credits.  
2. **Idempotent usage keys** — retries must not double-charge.  
3. **402 is structured** — conversion payload, not a bare string.  
4. **FIFO grants** — fair expiry / remaining accounting.  
5. **Past-due: spend existing only** — no silent new monthly grant.  
6. **Unlimited paths are explicit** — tester / dev admin, not accidental.  
7. **Never put secrets in client** — Stripe secret server-only; price IDs from env.  
8. Energy does not override Gaze/Skin approval doors.

---

## 13. What Energy is not

- Not Gaze / Skin / Marrow  
- Not the action vocabulary (Cortex owns contracts)  
- Not progression missions (though missions may *display* credit estimates)  
- Not Mem0 / Taste  
- Not a creative quality signal

---

## 14. File cheat sheet (start here)

| Priority | File | Why |
|----------|------|-----|
| 1 | `paywall.ts` | `spendOrApiError` — the door |
| 2 | `credits.ts` | Costs, canSpend, recordUsage, refund |
| 3 | `access.ts` | Who may spend |
| 4 | `plans.ts` | Plan → grant amounts |
| 5 | `events.ts` | Stripe → local state |
| 6 | `sessions.ts` | Checkout / portal |
| 7 | `beta.ts` | Code redeem |
| 8 | `lib/billing/conversion-gate.ts` | Client 402 UX |

---

## 15. Maintenance

1. New metered action → add `CREDIT_COSTS` key + call `spendOrApiError` at boundary + Cortex contract `creditImpact` if assistant-facing.  
2. New plan → `plans.ts` + Stripe price env + grant amount.  
3. Changing past-due policy → update `access.ts` + docs/ARCHITECTURE monetization section.  
4. Keep refund policy explicit on goal/agent events (`refundPolicy`).  
5. Update atlas Energy card when public billing contract changes.
