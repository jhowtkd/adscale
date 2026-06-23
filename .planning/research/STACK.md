# Stack Research

**Domain:** Multi-brand taste calibration (v13.2 Calibração Multi-Marca)  
**Researched:** 2026-06-23  
**Confidence:** HIGH

## Executive Recommendation

**Do not add new npm dependencies for v13.2.** The milestone productizes capabilities already built on the locked ADScale stack (Next.js App Router, Drizzle/Neon Postgres, Inngest, Zod, TanStack Query, existing `brand-taste` and `human-quality/learning` modules). New work is **schema + service wiring + owner-only admin surfaces**, not a parallel learning stack.

The only material stack *change* is replacing the Cenbrap hardcode path (`REGISTERED_VOICES` + campaign-name fuzzy match in `resolveClientVoice()`) with **per-`clientProfile` persisted Olhar/voice configuration** loaded at generation time by `clientProfileId`.

---

## Recommended Stack

### Core Technologies (unchanged — extend in place)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js (App Router) | 16.2.6 | Owner admin routes, API route handlers | Already hosts `/api/admin/quality/*`, `(admin)` shell pattern, and `derivationJob` prompt assembly. v13.2 adds brand-scoped views, not a new runtime. |
| Drizzle ORM + drizzle-kit | 0.45.2 / 0.31.10 | Voice config persistence, rule/profile queries | Canonical data layer for `calibration_rules`, `client_learning_proposals`, `client_profiles`. JSONB columns are first-class (`jsonb<T>()` with `.$type<>()` — Drizzle docs, HIGH confidence). |
| Neon PostgreSQL (`@neondatabase/serverless`) | 1.1.0 | Source of truth for voice config, rules, corpus proposals | Profiles and rules are relational + JSONB; no document store needed. Existing migrations through `0052_client_learning_proposals`. |
| Inngest | 4.4.0 | Daily `learning-proposal-aggregator` cron + backfill jobs | Corpus→proposal loop already scheduled (`0 6 * * *`). Extend step payloads, not the job framework. |
| Zod | ^3.0.0 | Boundary validation for voice JSONB and admin API bodies | Matches existing env/schema validation pattern. Validate `ClientVoice`-shaped config at write boundary; Drizzle `.$type<>()` is compile-time only. |
| TanStack Query | 5.100.1 | Owner UI for per-brand profile, rules, proposals | `LearningProposalsTab` and corpus panels already use this pattern. New brand-taste owner views should follow the same fetch/cache model. |
| OpenAI SDK | 6.34.0 | Image/plan generation (unchanged) | Prompt impact is **string sections** injected by `prompt-builder` / `generation-direction` — no model or SDK change. |
| Vitest + Playwright | 4.1.5 / 1.60.0 | Regression for voice resolution, prompt injection, claims gate | Existing brand-taste and human-quality unit tests are the template for v13.2 gates. |

### New Schema Layer (not new packages)

| Addition | Type | Purpose | Why This Shape |
|----------|------|---------|----------------|
| `client_profile_olhar_config` (recommended) **or** `client_profiles.olhar_voice_config` JSONB | Drizzle migration `0053+` | Persist `ClientVoice` fields + `reviewStatus` per `clientProfileId` | Decouples voice from campaign-name heuristics. Dedicated table preferred: 1:1 with `client_profiles`, versionable, owner-auditable, avoids bloating workspace brand kit columns. |
| Cenbrap bootstrap row | Seed migration / one-shot script | Preserve current `CENBRAP_VOICE` content as first DB row | Migration path: import hardcoded `cenbrap.ts` into DB; `resolveClientVoice` reads by `clientProfileId` instead of `matchTerms` on campaign name. |
| Wire `getApprovedRuleConstraints` in `derivationJob` | Code integration (no migration) | Apply non-`corpus_quality` approved `calibration_rules` in prompt | **Gap today:** job loads only `corpus_quality` rules (`listApprovedCalibrationRulesByCategories`); brand-taste rules from calibration signals are not injected. v13.2 must close this. |

**Recommended `client_profile_olhar_config` columns:**

| Column | Type | Notes |
|--------|------|-------|
| `client_profile_id` | uuid PK/FK | Cascade with `client_profiles` |
| `workspace_id` | uuid FK | Workspace isolation (existing pattern) |
| `voice_id` | text | Stable slug, e.g. `cenbrap` |
| `display_name` | text | UI label |
| `config` | jsonb | `principles`, `positiveSignals`, `negativeSignals`, `authorityAndClaims`, `inviteRhythm`, `correctButSoulless` — mirrors `ClientVoice` interface |
| `review_status` | text | `pending_review` \| `approved` \| `changes_requested` — replaces `CENBRAP_VOICE_REVIEW_STATUS` constant |
| `source` | text | `seeded` \| `imported` \| `operator_edited` (v13.2: seed/import only; no freeform editor) |
| `approved_at`, `approved_by` | timestamp, text | Owner sign-off audit |
| `created_at`, `updated_at` | timestamp | Standard |

### Supporting Libraries (already installed — when to use)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `date-fns` | 4.1.0 | Cooldown / evidence timestamps in owner UI | Proposal reject cooldown (`cooldownUntil`), profile `generatedAt` display |
| `recharts` | 3.8.1 | Evidence charts on owner dashboards | Optional per-brand sample composition bars; reuse global evidence patterns |
| `class-variance-authority` + `tailwind-merge` | 0.7.1 / 3.5.0 | Admin UI status badges | Rule status, evidence level, review_status chips |
| `sonner` | 2.0.7 | Owner action toasts | Accept/reject proposal, approve voice config |
| `sharp` | 0.33.0 | Unchanged | Not in v13.2 scope |

### Development Tools (unchanged)

| Tool | Purpose | Notes |
|------|---------|-------|
| `drizzle-kit generate` + `npm run db:migrate` | Voice config migration | Follow `0052` journal pattern; apply on Render before relying on new columns |
| `tsx` scripts | Cenbrap voice seed, corpus bootstrap | Extend `record-cenbrap-calibration-decisions.ts` / seed scripts — not new CLI deps |
| `npm run release-gate` / evidence CLIs | Claims gate regression | Extend existing olhar / operational evidence scripts for per-brand scope |

---

## Integration Points (where stack meets product)

```
clientProfileId (campaign)
       │
       ├─► load client_profile_olhar_config ──► buildClientVoicePromptSection()
       │         (replaces resolveClientVoice name matching)
       │
       ├─► listApprovedCalibrationRules (brand_nuance, figure, voice, …)
       │         └──► buildBrandTastePromptSection()  [wire in derivationJob]
       │
       └─► listApprovedCalibrationRules (corpus_quality)
                 └──► buildCorpusQualityPromptSection()  [already wired]

corpus evaluation ──► client_learning_proposals ──► accept ──► calibration_rules
       │                    ▲
       │                    └── Inngest learning-proposal-aggregator (daily)
       └──► (v13.2) optionally emit calibration_signals for profile bootstrap
```

| Surface | Existing module | v13.2 change |
|---------|-----------------|--------------|
| `generation-direction.ts` | `resolveClientVoice({ name, client, product })` | Accept `clientProfileId`; load voice from DB; gate via `review_status` not Cenbrap-only constant |
| `derivationJob` | `corpusQualitySection` only | Add `brandTasteConstraints` from approved non-corpus rules; pass `clientProfileId` to voice loader |
| `prompt-builder.ts` | `brandTasteConstraints`, `corpusQualitySection` slots | Order preserved: Olhar → client voice → brand-taste → corpus_quality (per corpus-learning-loop design) |
| `brand-taste/taste-profile.ts` | Built from `calibration_signals` | Extend input to include corpus-sourced signals per `clientProfileId` (aggregate, not new store) |
| `/api/admin/quality/learning/*` | Proposals CRUD + accept | Already shipped; connect owner brand view to same APIs |
| Owner UI | `LearningProposalsTab`, `HumanQualityCorpusPanel` | New route e.g. `/admin/quality/brands/[clientProfileId]` — read-only profile + rules inspector |

---

## Installation

```bash
# No new packages required for v13.2

# Schema (after implementation)
cd app && npm run db:generate && npm run db:migrate

# Verify existing regression baseline
cd app && npm test && npm run lint && npm run build
```

If a future phase adds structured admin forms beyond read-only inspect + approve actions, **still prefer Zod + server actions** over adding react-hook-form unless form complexity justifies it (not required for v13.2 scope: no freeform voice editor).

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| JSONB on `client_profiles` | Separate `client_profile_olhar_config` table | JSONB column is acceptable if team wants zero joins; table is better for audit/versioning and owner API clarity |
| DB-backed voice per `clientProfileId` | Keep `REGISTERED_VOICES` TS registry | Never for v13.2 — contradicts milestone goal |
| Extend `brand-taste` + `human-quality/learning` | New `quality_learning_proposals` module | Rejected in corpus-learning-loop design — duplicates propose/accept lifecycle |
| Prompt constraints only | Fine-tune image model per brand | Out of scope — design explicitly excludes fine-tuning |
| Inngest cron aggregator | Real-time proposal on each evaluation | Defer — daily + on-demand `generate` API is sufficient; avoids hot-path DB load |
| Owner-only admin pages | Workspace-scoped brand settings UI | Out of v13.2 scope per STATE.md |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **LangChain / LlamaIndex / Vercel AI SDK** | v13.2 is deterministic prompt assembly + approved rules, not agent orchestration | Existing `prompt-builder` + `buildBrandTastePromptSection` |
| **Vector DB (Pinecone, pgvector) for taste** | Taste is rule-based with evidence gates; Mem0 is already scoped to performance memory | `calibration_rules` + `calibration_signals` in Postgres |
| **Third-party eval platforms (Braintrust, LangSmith)** | Product has corpus, claims gate, evidence CLIs | Extend `human-quality` + release-gate scripts |
| **OpenAI fine-tuning / custom models** | Explicitly out of corpus-learning-loop v1 | Prompt constraints + owner-approved rules |
| **Headless CMS (Sanity, Contentful) for voice** | Adds sync complexity; voice is generation-critical server config | Postgres JSONB + owner seed scripts |
| **tRPC / GraphQL layer** | Stack locked on Next.js route handlers + TanStack Query | `/api/admin/quality/*` pattern |
| **Campaign-name fuzzy matching** (`matchTerms`) | Fragile, Cenbrap-specific, breaks multi-brand | `clientProfileId` FK lookup |
| **Auto-approve proposals or rules** | Violates human authority + claims gate | Existing accept flows with evidence thresholds |
| **Runtime rubric mutation without deploy** | Phase 132 pattern is evidence-bound code edits | `rubric_calibration_adjustments` accept → manual apply plan |

---

## Stack Patterns by Variant

**If brand has no `client_profile_olhar_config` row:**  
- Omit client voice section; Olhar ADScale constitution still applies globally.  
- Do not fall back to campaign-name Cenbrap detection (removes hidden hardcode path).

**If `review_status !== 'approved'`:**  
- Mirror `isClientVoiceInjectionAllowed()` — block voice injection unless owner `forceApproved` in calibration fixtures only.

**If brand has zero approved rules:**  
- `brandTasteConstraints` and `corpusQualitySection` empty arrays; generation unchanged except global Olhar.

**If corpus slice is 100% `synthetic_fixture`:**  
- Proposals may surface with fixture flag; evidence gate blocks customer-real claims (existing `evaluateClaimsMatrix`).

**If operator accepts `corpus_quality` proposal:**  
- Materialize `calibration_rule` (existing `acceptClientLearningProposal`); next derivation picks it up via `load-corpus-quality-rules` step.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `drizzle-orm@0.45.2` | `drizzle-kit@0.31.10` | Already pinned in `app/package.json`; new migration follows journal idx 52+ |
| `drizzle-orm@0.45.2` | `zod@^3` | Validate JSONB at API boundary; use `jsonb<ClientVoiceConfig>()` for TS inference only |
| `inngest@4.4.0` | `next@16.2.6` | `/api/inngest` route already registers `learningProposalAggregatorJob` |
| `@tanstack/react-query@5.100.1` | `react@19.2.4` | Admin panels already on React 19 |
| `next-intl@4.9.1` | Owner admin (EN/PT) | New brand views should use existing i18n keys pattern; copy is operational not customer-facing |

No version bumps required to ship v13.2 unless security patches mandate it during implementation.

---

## Gap Summary (drives implementation, not new deps)

| Capability | Stack status | v13.2 action |
|------------|--------------|--------------|
| Per-brand Olhar/voice config | **Missing** — hardcoded `CENBRAP_VOICE` | Migration + repository + resolver by `clientProfileId` |
| Corpus → `corpus_quality` rules | **Shipped** — migration 0052, accept API, prompt section | Generalize to all brands (already keyed by `clientProfileId`) |
| Brand-taste rules in generation | **Partial** — module exists, job not wired | Call `getApprovedRuleConstraints` / `listApprovedCalibrationRules` in `derivationJob` |
| Owner profile/rules surface | **Partial** — learning proposals tab exists | Per-brand inspector route; link from global evidence scopes |
| Corpus → calibration_signals bootstrap | **Missing bridge** | Service function aggregating evaluations into signals (reuse `recordCalibrationSignal`) |
| Cenbrap hardcode removal | **Tech debt** | Delete `REGISTERED_VOICES` path after DB seed |

---

## Sources

- `/Users/jhonatan/Repos/ADScale_2/app/package.json` — pinned dependency versions (HIGH)
- `/drizzle-team/drizzle-orm-docs` via Context7 — `jsonb<T>()` column definition (HIGH)
- `docs/superpowers/specs/2026-06-21-corpus-learning-loop-design.md` — extend brand-taste decision, no parallel module (HIGH)
- `app/src/server/ai/voices/client-voice.ts` — current Cenbrap hardcode (HIGH)
- `app/src/server/jobs/derivation.ts` — `corpus_quality` wired; brand-taste not wired (HIGH)
- `app/src/server/brand-taste/` — calibration rules, taste profiles, prompt sections (HIGH)
- `.planning/STATE.md` — v13.2 scope: owner-only, no freeform editor (HIGH)

---
*Stack research for: v13.2 Calibração Multi-Marca — multi-brand taste calibration productization*  
*Researched: 2026-06-23*
