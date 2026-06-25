# In-App Copy Review Checklist (BRAND-04)

Human audit gate for authenticated product copy in `app/messages/en.json` and `app/messages/pt-BR.json`.

Derived from Phase 170 context, [`conceituacao.md`](./conceituacao.md) §4.2–4.4, and Phase 168/169 claim-gate constraints. `conceituacao.md` remains **reference-only** — production marketing copy stays frozen until founder approval.

## Criteria

Every in-app copy change in Phase 170 must pass all seven criteria:

1. Reflects **Curator > operator** at workflow decision points (onboarding, empty states, wizard intros, generation CTAs, review approve/reject guidance).
2. No overclaim of full automation ("AI decides alone", "magic", "one click does everything").
3. No performance lift, ROAS/CPA improvement, or speed-multiple claims unless backed by verified product data (none available — **withhold**).
4. No customer-real, agreement-rate, or quality-improvement proof implied.
5. No Cenbrap or brand-specific fixture presented as product proof.
6. No calibration, corpus, or Olhar jargon on general user surfaces (onboarding, empty states, campaign wizard).
7. Uses canonical vocabulary from conceituacao §4.1; avoids the forbidden list in §4.2.

## How to run

### Automated guard

```bash
cd app && npm test -- --run tests/unit/i18n/product-narrative-copy.test.ts
```

The Vitest suite checks:

- Locale key parity for narrative namespaces (`onboarding`, `dashboard.home`, `metadata`, `navigation`, `auth`, `campaign`, `steps`, `generation`, `library`, `template`, and top-level `review` guidance keys).
- Forbidden claim patterns (Cenbrap, calibration, corpus, agreement rate, sample sufficiency, Olhar on general surfaces, magic/revolutionary hype, performance lift phrases).
- Curator vocabulary in onboarding steps (enabled after Plan 02 copy rewrite).

### Manual spot-check

After automated tests pass:

- Open the dashboard onboarding tour — confirm curator framing at each step, no fixture/calibration jargon.
- Visit campaigns list and library empty states — confirm brief → batch → curate arc without performance promises.
- Walk one campaign wizard path (brief → generation → review) — approve/reject guidance stays human-in-the-loop, not autonomous.
- Compare EN and PT-BR for any keys you changed — both locales must ship together.

## Reference

- Canonical vocabulary and forbidden words: [`conceituacao.md`](./conceituacao.md) Part 4 (Identidade verbal).
- Claim honesty constraints: Phase 168/169 — fixture validates operation only; customer-real claims remain withheld.
- Phase 170 scope: authenticated app surfaces only; marketing site and email copy are out of scope.
