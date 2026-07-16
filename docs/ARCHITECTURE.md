<!-- generated-by: gsd-doc-writer -->

# ADScale Architecture

ADScale is a multi-tenant SaaS for AI-assisted advertising creative production. Teams work inside **workspaces**, define **campaigns** with briefing and assets, and generate **derivations** (image variants) via OpenAI image models. A conversational **Assistant** (threaded chat with tool-calling, guided flows, and artifact versioning, backed by MiniMax) drives end-to-end creative journeys. Outputs land in **Cloudflare R2** (S3-compatible object storage); metadata and billing state live in **PostgreSQL** via **Drizzle**. Long-running work runs on **Inngest**; the UI is **Next.js 16** (App Router) with **React 19**, **TanStack Query**, and **Better Auth**.

For a ludic map of the creative cognition loop (Cortex, Hands, Gaze/Olhar, Skin, Nerve, Taste, Memory, Marrow, Energy), see [`COGNITIVE-ATLAS.md`](./COGNITIVE-ATLAS.md).

---

## System overview

The application follows a classic **browser → Next.js API routes → repositories → Postgres/R2** shape, with **async workers** for derivation generation and brand-memory ingestion. **v12.0** adds real monetization: **Stripe subscriptions**, **credit grants** with FIFO spend, **workspace entitlements** (beta access), and **conversion gates** that return structured 402 payloads when spend is blocked. **v11.10–11.11** carry a closed-loop **beta analytics** pipeline (cockpit events, mission funnels, credit signals) and **owner-facing feedback tooling**. Later phases add a **human-quality corpus** (owner evaluation → learning proposals) and **output learning** projections into brand memory. A dedicated **Assistant** subsystem layers a conversational AI on top of the creative pipeline: threaded chat streams MiniMax completions over SSE, executes registered tools, and runs guided flows (from-zero briefing, existing-creative iteration) with artifact versioning.

| Concern | Implementation |
|--------|----------------|
| Web UI & HTTP API | `app/src/app/` (App Router), `app/src/components/`, `app/src/lib/hooks/` |
| Conversational Assistant | `app/src/server/assistant/` (threads, orchestrator, guided flows, tools, artifact versions); chat streamed via SSE (`api/assistant/threads/[id]/chat`) |
| Auth & tenancy | Better Auth + `requireWorkspaceAccess()` (`app/src/server/auth/workspace.ts`) |
| Persistence | Drizzle ORM, schema `adscale_app` (`app/src/server/db/schema.ts`) |
| Files | `objectStorage` abstraction → R2 (`app/src/server/storage/`) |
| AI (creative) | OpenAI SDK modules under `app/src/server/ai/` (including **Olhar** art-direction verdicts) |
| AI (assistant) | MiniMax LLM via OpenAI-compatible adapter (`app/src/server/assistant/model/`) |
| Background jobs | Inngest functions registered in `app/src/app/api/inngest/route.ts` |
| Billing & credits | Stripe webhooks, plans, grants, gates (`app/src/server/billing/`) |
| Entitlements | Beta tester access (`app/src/server/repositories/entitlements.ts`) |
| Mission progression | `app/src/server/progression/missions/` — ordered cockpit missions with evidence inference |
| Beta analytics | `app/src/server/beta-analytics/` — event ingest, sanitization, aggregation, CSV export |
| Feedback & beta ops | `app/src/server/feedback/`, `app/src/server/mission-insights/`, owner routes under `api/feedback/` |
| Human quality loop | `app/src/server/human-quality/` — corpus queue, evaluations, calibration, learning proposals |
| Output learning | `app/src/server/output-learning/` — decision events → client output learnings → Mem0 projection |
| Brand taste & Olhar calibration | `app/src/server/brand-taste/`, `app/src/server/olhar-calibration/` |
| Admin quality ops | Platform-owner routes under `api/admin/quality/` |

**v12.0 cross-cutting concerns** (monetization):

1. **Subscription lifecycle** — Checkout Sessions (14-day trial) create Stripe customers and local subscription rows; webhook handlers sync status, grant monthly credits on `invoice.paid`, and mark `past_due` on payment failure.
2. **Credit entitlements** — Spendable balance is the sum of non-expired `credit_grants.remaining`; debits are FIFO across grants inside a transaction. Plans (`starter` / `growth` / `scale`) map to monthly grants of 30 / 120 / 360 credits.
3. **Access resolution** — `getWorkspaceBillingAccess()` classifies each workspace as `paid`, `beta`, or `none`, combining active subscription, beta entitlement, and remaining credits (including past-due spend policy).
4. **Spend gates** — API routes call `spendOrApiError()` before metered work; blocked spends return HTTP 402 with a `ConversionErrorPayload` (reason, recommended action, suggested plan).
5. **Beta redemption** — One-time code redemption creates a `beta_tester` entitlement plus a 50-credit grant (10 ads × 5 credits); codes come from `BETA_ACCESS_CODES` env.
6. **Billing history** — `credit_transactions` and grant history exposed via `GET /api/billing/history` for the settings UI and dashboard charts.

**v11.10 cross-cutting concerns** (analytics & cockpit):

1. **Cockpit event schema & ingest** — allowlisted `eventKey` values with sanitized `properties`, workspace-scoped persistence, client (`POST /api/analytics/events`) plus server emitters (credits, preflight, export, share).
2. **Mission instrumentation** — ordered mission path (`setup` → `share`) with evidence inference, credit estimates, and `mission_completed` / cockpit stage events.
3. **Owner analytics** — platform-owner routes aggregate funnel summaries, credit surprises, and readiness overrides; CSV export bundles raw events plus summary sections.
4. **Delivery package multiformat** — approved parent derivations spawn `format_adaptation` children per requested format, with quality-gate guard and per-format credit metering.

**Human-quality & learning loop** (post-v12):

1. **Corpus capture** — derivations that fail quality gates or meet sampling rules become `human_quality_corpus_items` (and optional `human_quality_corpus_candidates`).
2. **Owner evaluation** — platform owners score corpus items via `api/feedback/human-quality-corpus/*`; evaluations persist rubric scores and failure reasons.
3. **Learning proposals** — nightly `learningProposalAggregatorJob` (and on-demand `POST /api/admin/quality/learning/proposals/generate`) aggregates evaluations into `client_learning_proposals`; cross-client patterns become global proposals.
4. **Calibration** — accepted proposals and corpus trends feed `calibration_rules`, `rubric_calibration_adjustments`, and Olhar release evidence for prompt/score tuning.

---

## Component diagram

```mermaid
graph TD
  subgraph Client
    UI[React components]
    Hooks[TanStack Query hooks]
    AsstChat[Assistant chat / SSE client]
    BetaHook[useRecordBetaEvent]
    ConvGate[conversion-gate client]
    Err[CampaignLoadError]
  end

  subgraph NextApp["Next.js app/src/app"]
    Pages[(dashboard) pages]
    API[api/* Route Handlers]
    AsstAPI[api/assistant/threads/*]
    BillingAPI[api/billing/*]
    AnalyticsAPI[api/analytics/events]
    FeedbackAPI[api/feedback/*]
    AdminAPI[api/admin/quality/*]
    InngestRoute[api/inngest]
  end

  subgraph Server["app/src/server"]
    Auth[auth/workspace]
    Owner[auth/platform-owner]
    Asst[assistant/* orchestrator]
    AsstModel[assistant/model MiniMax]
    Repo[repositories/*]
    AI[ai/*]
    Jobs[jobs/*]
    Store[storage/objectStorage]
    BillAccess[billing/access]
    BillCredits[billing/credits]
    BillEvents[billing/events]
    BillSessions[billing/sessions]
    Entitlements[repositories/entitlements]
    Progress[progression/missions]
    BetaA[beta-analytics/*]
    MissionI[mission-insights]
    HQ[human-quality/*]
    OutLearn[output-learning/*]
    Memory[memory/*]
  end

  subgraph External
    PG[(PostgreSQL)]
    R2[(R2 / S3)]
    OAI[OpenAI]
    MMX[MiniMax]
    ING[Inngest Cloud]
    STR[Stripe]
    MEM[Mem0]
  end

  UI --> Hooks
  UI --> AsstChat
  UI --> BetaHook
  UI --> ConvGate
  Hooks --> API
  Hooks --> BillingAPI
  AsstChat --> AsstAPI
  BetaHook --> AnalyticsAPI
  Hooks --> Err
  ConvGate --> BillingAPI
  Pages --> UI
  API --> Auth
  AsstAPI --> Auth
  AsstAPI --> Asst
  Asst --> AsstModel
  Asst --> Repo
  Asst --> AI
  BillingAPI --> Auth
  BillingAPI --> BillSessions
  BillingAPI --> BillAccess
  BillingAPI --> BillEvents
  FeedbackAPI --> Owner
  AdminAPI --> Owner
  AnalyticsAPI --> Auth
  AnalyticsAPI --> BetaA
  FeedbackAPI --> BetaA
  FeedbackAPI --> HQ
  AdminAPI --> HQ
  API --> Repo
  API --> BillCredits
  API --> Progress
  API --> Perf
  API --> OutLearn
  API --> ING
  BillCredits --> BillAccess
  BillCredits --> Entitlements
  BillCredits --> BetaA
  BillEvents --> Repo
  BillEvents --> STR
  BillSessions --> STR
  InngestRoute --> Jobs
  Jobs --> Repo
  Jobs --> AI
  Jobs --> Store
  Jobs --> BillCredits
  Jobs --> HQ
  Repo --> PG
  Entitlements --> PG
  Store --> R2
  AI --> OAI
  AsstModel --> MMX
  ING --> Jobs
  STR --> BillingAPI
  MissionI --> Repo
  HQ --> Repo
  Perf --> Repo
  Perf --> Memory
  OutLearn --> Repo
  OutLearn --> Memory
  Memory --> MEM
```

---

## Directory structure rationale

Application code lives under `app/` (npm package `adscale-app`). Source is rooted at `app/src/`:

| Path | Role |
|------|------|
| `app/src/app/` | App Router: UI routes `(dashboard)/`, public pages, and `api/*` Route Handlers (23 groups) |
| `app/src/components/` | Presentational and feature components (assistant chat/shell, campaign workspace, billing settings, feedback owner panels, UI primitives) |
| `app/src/lib/` | Client utilities: `api-client`, React Query hooks, `billing/conversion-gate`, `campaign-load-error`, `beta-analytics/constants`, formats, logger |
| `app/src/server/ai/` | OpenAI-backed creative pipeline: prompts, scoring, QA, quality gate, contract, readiness, preview gate, **Olhar** art-direction verdicts |
| `app/src/server/assistant/` | Conversational AI: orchestrator, guided flows, action contracts, tool registry/policy, context builder, artifact versioning, MiniMax model adapter, SSE stream encoding |
| `app/src/server/auth/` | Better Auth config, session helpers, workspace access, platform-owner guard, dev-admin bypass |
| `app/src/server/billing/` | Stripe client, plans, checkout/portal sessions, webhook event processor, access resolution, credit spend/gates, beta redemption, conversion payloads |
| `app/src/server/beta-analytics/` | Event types, sanitization, `recordBetaAnalyticsEvent`, aggregation, credit-signal summaries, CSV helpers |
| `app/src/server/beta-sessions/` | Beta session Zod types shared with repositories |
| `app/src/server/brand-taste/` | Taste profiles, calibration signal recording, calibration rules |
| `app/src/server/config.ts` | Shared app constants (e.g. invite expiration) |
| `app/src/server/db/` | Drizzle client (`pg` pool) + `schema.ts` (all tables in `adscale_app` schema) |
| `app/src/server/feedback/` | Feedback validation, mission-credit-signal classification |
| `app/src/server/human-quality/` | Corpus queue, evaluations, sampling, calibration, learning proposal generation, trend/impact reports |
| `app/src/server/jobs/` | Inngest client, `derivationJob`, trial notifications, workspace asset analysis, brand memory, **learning proposal aggregator** |
| `app/src/server/memory/` | Mem0 brand-memory ingest, context assembly, and output-learning projections |
| `app/src/server/mission-insights/` | Sanitize and persist mission insight moments as `feedback_reports` |
| `app/src/server/olhar-calibration/` | Olhar release evidence and calibration services |
| `app/src/server/output-learning/` | Output decision recording, aggregation, recommendations |
| `app/src/server/progression/` | Workspace levels and ordered **missions** (definitions, evidence, status, credits) |
| `app/src/server/repositories/` | Data access layer; includes assistant threads/messages/actions, billing, entitlements, human-quality corpus, brand kit, and output decisions |
| `app/src/server/services/` | Email, notifications (low-credits alerts), export, landing-page render, Resend contacts |
| `app/src/server/storage/` | `ObjectStorage` interface; `R2ObjectStorage` (`r2-object-storage.ts`), presign helpers (`storage-helpers.ts`), in-memory test impl |
| `app/src/server/validation/` | `env` (Zod-validated environment) |
| `app/src/server/waitlist/` | Waitlist signup schema and normalization |
| `app/src/i18n/` | `next-intl` message catalogs |

Tests: `app/tests/` (integration) and co-located `*.test.ts` beside modules. SQL migrations: `app/drizzle/`.

---

## Data flow

### 1. Campaign workspace (read path)

1. User opens a campaign page; hooks call `GET /api/campaigns/[id]` (and related list endpoints).
2. Route handler calls `requireWorkspaceAccess(request)` → `{ user, workspace }`.
3. Repository loads campaign with `getCampaignById(campaignId, workspace.id)`.
4. On failure, `parseCampaignLoadError` / `parseFetchFailure` in hooks produce `CampaignLoadError` with a **kind** for `CampaignErrorState`.

### 2. Derivation generation (write + async path)

1. `POST /api/campaigns/[id]/derivations` validates workspace, campaign, credits (`spendOrApiError`), and concurrency (no other `queued`/`processing` rows).
2. Creates derivation row(s) and sends Inngest event `derivation.generate` with `derivationId`, `campaignId`, `workspaceId`, locale, format, CTA, `generationMode`, optional `styleAssetId`.
3. **`derivationJob`** (`app/src/server/jobs/derivation.ts`) runs stepped workflow:
   - Idempotency check → `processing` → load campaign, plan, assets, brand kit, references, brand memory
   - Build **`CreativeContract`** + `buildDerivationPrompt({ contract, ... })`
   - Generate image (mode-specific: `art_variation`, `format_adaptation`, `restyling`), normalize with **sharp**, upload to R2
   - `mark-completed`, realtime status via Inngest channels, optional email notification
   - **`score-derivation`** — heuristic + visual analysis (`creative-score.ts`), persists `qualityScore` / `scoreIssues`
   - **`quality-gate`** — `runCompletedDerivationQualityGate` (see below)
   - **`track-usage`** for billing metering (idempotent; credits already debited at API boundary for most flows)

### 2b. Campaign restyling (dedicated entry)

1. `POST /api/campaigns/[id]/restyle` accepts optional `{ styleAssetIds, styleIntensity }`.
2. Validates base asset and a distinct `style_reference` asset; blocks when other derivations are `queued`/`processing`.
3. Updates campaign `generationMode: restyling` and optional `styleIntensity`.
4. Charges credits (`image_derivation`, idempotency key scoped to campaign + base asset).
5. Creates a single `restyling` derivation with `styleAssetId` and queues `derivation.generate`.
6. Job resolves base/style assets in `derivationJob` before prompt build (separate from standard art-variation asset selection).

### 3. Review, QA, and export

- User reviews derivations in workspace UI (`DerivationCard`, `DerivationReviewModal`).
- Approve actions call APIs that use `assertDerivationApprovable` — **invalid** verdict or non-empty `hardFailures` blocks approval.
- Optional `POST /api/derivations/[id]/qa` on **approved** derivations re-runs QA + gate (credits charged); results cached on the row.
- Export/delivery-package routes also consult the quality gate before packaging.

### 4. Delivery package multiformat (v11.10)

1. `POST /api/derivations/[id]/delivery-package` accepts `{ formats: string[] }` for an **approved** source derivation with output.
2. `assertDerivationApprovable` blocks sources with hard quality failures.
3. Formats matching the source's existing `format` are returned as **ready** immediately.
4. Remaining formats create child derivations (`parentId` → source, `generationMode: format_adaptation`) unless an active child already exists for that format.
5. Credits charged per new format (`delivery_package_child`, 5 credits each); Inngest `derivation.generate` queued per child.
6. Response includes `readyFormats`, `queued`, `failed`, and `skipped` (already-active children).
7. Brand-memory event `delivery_prepared` records the package metadata.

### 5. Subscription checkout and lifecycle (v12.0)

**Checkout path:**

1. Client calls `POST /api/billing/checkout` with `{ planKey, returnPath? }` (`starter` | `growth` | `scale`).
2. `createCheckoutSession` ensures a Stripe customer exists (`billing_customers`), then creates a subscription Checkout Session with 14-day trial and workspace/plan metadata.
3. User completes payment on Stripe; redirect returns via `STRIPE_SUCCESS_URL`.

**Webhook path** (`POST /api/billing/webhook`, signature-verified):

| Stripe event | Handler effect |
|--------------|----------------|
| `checkout.session.completed` | `saveBillingCustomer` + `upsertSubscription` (status `checkout_completed`) |
| `customer.subscription.created/updated/deleted` | `syncSubscription` — status, plan, price, period bounds, `cancelAtPeriodEnd` |
| `invoice.paid` | Idempotent `createCreditGrant` (`source: stripe_invoice`) for plan monthly amount; skipped if subscription not `active`/`trialing` |
| `invoice.payment_failed` | Marks subscription `past_due` when previously active/trialing |

Events are deduplicated via `processed_stripe_events`. Unsupported types are skipped without error.

**Portal path:**

1. `POST /api/billing/portal` creates a Stripe Billing Portal session for the workspace customer (manage payment method, cancel, etc.).

**Status read path:**

1. `GET /api/billing/status` returns `getWorkspaceBillingAccess()` snapshot: access kind, credit balance, subscription status, past-due recovery hints, beta allowance summary.

### 6. Credit spend and conversion gates (v12.0)

1. Metered API routes call `spendOrApiError({ workspaceId, action, idempotencyKey, userId, ... })`.
2. `recordUsage` checks idempotency (`usage_events` table), then `canSpend` via `getWorkspaceBillingAccess` + available grant balance.
3. On allow: FIFO debit across `credit_grants.remaining` in a transaction, `trackUsage`, optional `credit_transactions` row, `credit_spend` analytics event, low-credits email if balance &lt; 10.
4. On block: HTTP **402** with `ConversionErrorPayload` from `buildConversionErrorPayloadForWorkspace` — reasons include `insufficient_credits`, `beta_exhausted`, `subscription_required`, `past_due_recovery`; `recommendedAction` is `checkout`, `portal`, or `billing`.
5. Client `lib/billing/conversion-gate.ts` parses 402 payloads and routes users to checkout, portal, or billing settings.

**Credit costs** (`CREDIT_COSTS` in `billing/credits.ts`):

| Action | Credits |
|--------|---------|
| `creative_plan` | 1 |
| `image_derivation` / `regeneration` / `restyling` / `delivery_package_child` | 5 |
| `copy_generation` | 2 |
| `creative_qa` | 1 |
| `landing_page` | 10 |

### 7. Beta access redemption (v12.0)

1. `POST /api/billing/beta/redeem` with `{ code }` validates against `BETA_ACCESS_CODES` (comma-separated env).
2. Single redemption per workspace: creates `workspace_entitlements` (`kind: beta_tester`), `beta_access_redemptions` audit row, and `credit_grants` (50 credits, `source: beta_tester`).
3. Beta workspaces get `hasSpendAccess` via entitlement even without a paid subscription; exhausted beta credits trigger `beta_exhausted` conversion on next spend attempt.

### 8. Beta analytics ingest (v11.10)

**Client path:**

1. Campaign workspace components call `useRecordBetaEvent(campaignId).recordEvent(eventKey, properties)` — fire-and-forget `POST /api/analytics/events`.
2. Optional `sessionId` read from `sessionStorage` key `adscale_beta_session_id` (`BETA_SESSION_STORAGE_KEY`).
3. Route validates body via `createBetaEventBodySchema`, resolves workspace session, calls `recordBetaAnalyticsEvent`.

**Server path:**

- `recordBetaAnalyticsEvent` sanitizes properties (allowlisted keys, 32 KB cap), validates `eventKey` against `PHASE_76_BETA_EVENT_KEYS`, optionally validates `sessionId` / `campaignId` / `derivationId` ownership, inserts into `beta_analytics_events`.
- Emitters: `spendCredits` / credit-block paths in `billing/credits.ts`, preflight route, export route, share route, derivation review (`mission_completed`).

**Owner read path:**

1. `requirePlatformOwner` (email in `PLATFORM_OWNER_EMAILS` or dev-admin list).
2. `GET /api/feedback/analytics/funnel` → `buildAnalyticsFunnelSummary`.
3. `GET /api/feedback/analytics/credit-signals` → `summarizeOwnerCreditSignals`.
4. `GET /api/feedback/analytics/export.csv` → combined CSV with funnel sections and raw event rows.

### 9. Mission progression & insights (v11.10)

1. `GET /api/workspace/missions` returns ordered mission statuses inferred from workspace evidence (`inferWorkspaceEvidence`, `inferMissionCompletions`).
2. Dashboard `MissionPathCard` surfaces active mission, credit estimates, and deep links into campaign cockpit tabs.
3. Client cockpit UI records `cockpit_stage_entered` / `cockpit_stage_completed` / `cockpit_stage_abandoned`.
4. `POST /api/workspace/mission-insights` persists structured diagnostic context on `feedback_reports`.
5. `GET /api/feedback/mission-credit-signals` (owner) classifies mission insights into healthy vs frustration signals.

### 10. Human quality corpus & learning (post-v12)

1. Failed or sampled derivations enter the corpus via `human-quality/candidate-capture` and repository inserts (`human_quality_corpus_items`, optional `human_quality_corpus_candidates`).
2. Owners list and evaluate via `GET/POST /api/feedback/human-quality-corpus/*`; evaluations stored in `human_quality_evaluations` with linked `human_quality_feedback_artifacts`.
3. `learningProposalAggregatorJob` runs daily (cron `0 6 * * *`): `generateAndPersistClientLearningProposals` then `detectAndPersistCrossClientGlobalProposals`.
4. Owners accept/reject proposals via `POST /api/admin/quality/learning/proposals/[id]/accept|reject`; manual trigger via `POST /api/admin/quality/learning/proposals/generate`.
5. Ingestion backfill/status: `POST /api/admin/quality/ingestion/backfill`, `GET /api/admin/quality/ingestion/status`.
6. Trend and calibration surfaces: `GET /api/feedback/quality-trend`, `score-calibration`, `calibration-adjustments/[id]/accept`.

### 11. Output decision learning

1. Approval, export, and review flows record `output_decision_events` (via `output-learning/output-decision-recorder`).
2. `recomputeClientOutputLearnings` aggregates events into `client_output_learnings` and projects to brand memory (`output-learning-projection`).
3. `GET /api/client-profiles/[id]/output-learnings` exposes learnings for strategy surfaces.

### 13. Assistant turn (conversational AI)

1. Client sends a message via `useAssistantChat` → `POST /api/assistant/threads/[threadId]/chat` (workspace-scoped thread bound to a `clientProfileId`).
2. Route handler resolves `requireWorkspaceAccess`, loads the thread, then opens a `ReadableStream` and iterates `runAssistantTurn({ workspaceId, clientProfileId, threadId, userId, userMessage, attachments })` — an `AsyncGenerator<AssistantTurnEvent>`.
3. **Orchestrator** (`server/assistant/orchestrator.ts`) builds context (`context/context-builder.ts`, sanitized against a key allowlist), classifies the user intent and guided path (`from-zero` vs `existing-creative`), and streams completions from the **MiniMax** model adapter (`model/minimax-adapter.ts`, OpenAI-compatible client).
4. The model may emit **tool calls**; `evaluateToolCall` (`tools/policy.ts`) enforces per-tool policy before execution, and `listToolsForProvider` (`tools/registry.ts`) resolves the available toolset. Tool execution surfaces `tool_summary` and `action_card` events.
5. Each `AssistantTurnEvent` (`text_delta` | `tool_summary` | `action_card` | `done` | `error`) is encoded by `encodeAssistantSseEvent` (`stream/sse.ts`) and written to the response with `Content-Type: text/event-stream`.
6. The assistant message is persisted on completion; **action contracts** (`action-contracts/`) bind structured actions (e.g. create campaign, run derivation) that the user confirms via `POST /api/assistant/actions/[actionId]/confirm`.
7. **Artifact versioning** — creative outputs produced in a thread are versioned (`artifact-version/service.ts`), comparable (`compare`, `comparison-acknowledgements`), and promotable (`promote`).
8. **Guided flows** (`guided-flow/` routes) drive from-zero briefing and existing-creative iteration with staged state transitions and telemetry; plan revisions (`plan-iteration/`) and creative revisions (`creative-iteration/`) are handled as dedicated turn kinds.

---

## Billing domain (v12.0)

**Modules:** `app/src/server/billing/` + `app/src/server/repositories/billing.ts`, `entitlements.ts`, `credit-transactions.ts`

### Access model

`getWorkspaceBillingAccess(workspaceId)` resolves a `WorkspaceBillingAccess` snapshot:

| `kind` | Condition | `hasSpendAccess` |
|--------|-----------|------------------|
| `paid` | Active/trialing subscription **or** dev-admin owner **or** past-due with credits &gt; 0 | `true` (past-due only if credits remain) |
| `beta` | Active `beta_tester` entitlement, no active subscription | `true` |
| `none` | No subscription, no beta, no spendable credits | `false` |

`normalizeSubscriptionStatus` maps Stripe statuses; `checkout_completed` is treated as `trialing`. **Past-due policy** (`PAST_DUE_SPEND_POLICY`): existing grant balance remains spendable; new monthly grants from `invoice.paid` are suspended until status recovers to `active`/`trialing`.

### Plans and credit grants

| Plan key | Monthly credits (`planCreditGrants`) | Stripe price env |
|----------|--------------------------------------|------------------|
| `starter` | 30 | `STRIPE_STARTER_PRICE_ID` |
| `growth` | 120 | `STRIPE_GROWTH_PRICE_ID` |
| `scale` | 360 | `STRIPE_SCALE_PRICE_ID` |

Grants expire at `currentPeriodEnd` for invoice-sourced grants; beta grants have `expiresAt: null`.

### Persistence tables

| Table | Purpose |
|-------|---------|
| `billing_customers` | Workspace ↔ Stripe customer ID (1:1) |
| `subscriptions` | Stripe subscription mirror: status, plan, periods, cancel-at-period-end |
| `credit_grants` | Grant buckets with `amount`, `remaining`, `source`, optional `expiresAt` |
| `workspace_entitlements` | Non-Stripe access (e.g. `beta_tester`) |
| `beta_access_redemptions` | One redemption record per workspace |
| `processed_stripe_events` | Webhook idempotency |
| `credit_transactions` | Spend audit trail linked to user/campaign/derivation |
| `usage_events` | Idempotent operation log (action + idempotency key per workspace) |

### HTTP surface (`app/src/app/api/billing/`)

| Route | Auth | Purpose |
|-------|------|---------|
| `POST checkout` | Workspace | Create Stripe Checkout Session |
| `POST portal` | Workspace | Create Billing Portal session |
| `GET status` | Workspace | Access snapshot, subscription, past-due/canceled hints |
| `GET history` | Workspace | Grants, transactions, summary, per-campaign spend |
| `POST beta/redeem` | Workspace | Redeem beta access code |
| `POST webhook` | Stripe signature | Process subscription/invoice events |

---

## Beta analytics event schema (v11.10)

**Modules:** `app/src/server/beta-analytics/types.ts`, `sanitize.ts`, `record.ts`, `aggregate.ts`

### Allowed event keys

| Event key | Typical source | Purpose |
|-----------|----------------|---------|
| `cockpit_stage_entered` | Client | User entered a cockpit stage/mission |
| `cockpit_stage_completed` | Client | Stage completed (timeline + funnel) |
| `cockpit_stage_abandoned` | Client | User left mid-stage |
| `mission_completed` | Server (review route) | Mission evidence milestone reached |
| `readiness_blocked` / `readiness_completed` | Server (preflight) | Creative readiness gate |
| `credit_spend` / `credit_blocked` | Server (billing) | Credits consumed or denied |
| `recipe_selected` / `recipe_tradeoff_viewed` | Client | Strategy recipe UI |

### Property allowlist

Only these keys survive sanitization: `stage`, `missionKey`, `source`, `blockingCount`, `estimateCredits`, `actualCredits`, `action`, `operation`, `operation_key`, `creditDelta`, `format`, `isPreview`, `readinessStatus`, `durationMs`, `reasonCode`, `recipeId`, `stepId`.

### Persistence

- **`beta_sessions`** — operator session metadata (`cohortLabel`, `assistanceLevel`, `operatorNotes` jsonb).
- **`beta_analytics_events`** — `workspaceId`, `userId`, optional `sessionId`, `eventKey`, `properties`, `source` (`client` \| `server`), optional `campaignId` / `derivationId`, `createdAt`.

---

## Mission progression (v11.10)

**Module:** `app/src/server/progression/missions/`

Ordered missions (`MISSION_ORDER`): `setup` → `upload` → `readiness` → `guided_briefing` → `strategy_recipe` → `preview` → `batch` → `review` → `regeneration` → `export` → `share`.

Each mission has prerequisites (`MISSION_DEFINITIONS`), optional alignment to progression evidence keys, and credit estimates for consuming missions (`preview`, `batch`, `regeneration`). `getWorkspaceMissions` composes status (`locked` \| `available` \| `completed`), progress percent, active mission key, and credit context for the dashboard and cockpit deep links (`progression/missions/hrefs.ts`).

---

## Assistant subsystem

**Module:** `app/src/server/assistant/`

ADScale's conversational AI layer drives the creative journey through threaded chat. Each thread belongs to a workspace and a client profile; the UI lives in `app/src/components/assistant/` (`AssistantShell`, `AssistantChatCore`, `AssistantMessageList`, `AssistantTreeSidebar`, plus guided-flow and version panels) and the React Query hooks in `app/src/lib/hooks/` (`use-assistant-chat`, `use-assistant-threads`, `use-assistant-actions`, `use-assistant-artifact-versions`).

| Submodule | Responsibility |
|-----------|----------------|
| `orchestrator.ts` | `runAssistantTurn` async generator — context build, intent/guided-path classification, model streaming, tool dispatch, message persistence |
| `context/` | `context-builder.ts` (assembles model request), `allowlist.ts` + `sanitize.ts` (key filtering / PII guard) |
| `model/` | MiniMax LLM via OpenAI-compatible client (`minimax-client.ts`, `minimax-adapter.ts`), reasoning sanitizer (`stripThinkBlocks`) |
| `action-contracts/` | Intent classifier, structured action contracts, guided binding, risk-copy validation |
| `tools/` | Tool registry (`registry.ts`), execution policy (`policy.ts`) — model tool calls are gated before execution |
| `guided-paths/` | `from-zero` and `existing-creative` prompt augments and action integration |
| `guided-conversation/` | Staged state machine (`state` → `transition` → `presenter`) for guided flows |
| `creative-iteration/`, `plan-iteration/` | Dedicated turn handlers for creative revisions and plan revisions |
| `artifact-version/` | Version snapshots, comparison, and promotion of thread-produced artifacts |
| `stream/sse.ts` | `encodeAssistantSseEvent` — serializes `AssistantTurnEvent` to SSE frames |

**Streaming contract:**

```typescript
type AssistantTurnEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_summary"; toolName: string; summary: string }
  | { type: "action_card"; actionRecordId: string; status: "pending" }
  | { type: "done"; assistantMessageId: string }
  | { type: "error"; message: string };
```

**HTTP surface** (`app/src/app/api/assistant/`): thread CRUD (`threads/`), streaming chat (`threads/[id]/chat`), actions (`actions/[id]/confirm|cancel`), artifact proposals (`artifact-proposals/[id]/cancel`), and per-thread guided-flow / plan-revision / creative-revision / artifact-version sub-routes.

---

## Creative contract (v11.1)

**Module:** `app/src/server/ai/creative-contract.ts`

The contract is the single structured description of what a derivation job promised to produce. It is built when a derivation starts (Inngest job) and rebuilt for on-demand QA.

```typescript
interface CreativeContract {
  generationMode: "art_variation" | "format_adaptation" | "restyling";
  targetFormat: string;
  ctaSemantics: CtaSemantics;
  baseAssetId: string | null;
  styleAssetId: string | null;
  client: string | null;
  product: string | null;
  offer: string | null;
  constraints: string | null;
}

type CtaSemantics =
  | { kind: "explicit"; text: string }
  | { kind: "inherited" }
  | { kind: "absent" };
```

**Consumers:** generation (`buildDerivationPrompt`), scoring (`creative-score.ts`), QA (`creative-qa.ts`), quality gate (`creative-quality-gate.ts`).

---

## Quality gate pipeline (v11.1)

**Module:** `app/src/server/ai/creative-quality-gate.ts`

After an image is generated and scored, the gate classifies QA output into **hard failures** (blocking) vs **polish suggestions** (advisory), then derives a **verdict**.

| Verdict | Meaning |
|---------|---------|
| `invalid` | One or more hard failures — approval blocked |
| `improvable` | No hard failures, but score &lt; 70 and/or checklist warnings |
| `acceptable` | No hard failures, score ≥ 70, no checklist warnings |

**Orchestration:** Inngest step `quality-gate` after scoring; on-demand `POST /api/derivations/[id]/qa`; `assertDerivationApprovable` on approve and delivery-package flows. **Olhar** art-direction verdicts (`server/ai/olhar/`) complement export/factual hard-failure classification.

---

## CampaignLoadError taxonomy (v11.1)

**Module:** `app/src/lib/campaign-load-error.ts`

Typed error for campaign/derivation fetch failures in React Query hooks. Kinds: `session`, `workspace`, `not_found`, `timeout`, `server`, `unknown`. UI: `CampaignErrorState` maps `kind` to localized copy.

---

## Workspace-scoped API

**Pattern:** Route handlers import `requireWorkspaceAccess` from `@/server/auth/workspace`. It resolves Better Auth session, loads active workspace, and optionally enforces role via `requireRole`.

Repositories take `workspaceId` as an explicit argument. Drizzle updates include `and(eq(table.workspaceId, workspaceId), …)` so cross-tenant access is rejected at the data layer.

**Platform-owner routes** use `requirePlatformOwner` — email in `PLATFORM_OWNER_EMAILS` or dev-admin allowlist.

**Representative API groups** under `app/src/app/api/` (23 groups, 150 `route.ts` handlers):

- `campaigns/`, `derivations/`, `workspace/` (assets, brand-kit, invites, **missions**, **mission-insights**, progression)
- `campaigns/[id]/restyle`, `competitors/`, `approval-package/`
- `assistant/` — threads, streaming chat, actions, artifact versions, guided flows (workspace-scoped)
- `billing/` — **checkout**, **portal**, **status**, **history**, **beta/redeem**, **webhook**
- `analytics/events` — workspace-scoped beta event ingest
- `feedback/` — reports, beta-sessions, human-quality corpus, analytics funnel/credit-signals/export, mission-credit-signals, quality-trend, calibration
- `admin/quality/` — learning proposal accept/reject/generate, ingestion backfill/status (platform owner)
- `client-profiles/` — references, memory, output-learnings
- `creatives/`, `dashboard/`, `export/`, `templates/`, `user/`, `notifications/`
- `inngest/` (worker webhook — Inngest signing, no end-user session)
- `health/`, `share/` (token-based public read paths scope differently)
- `waitlist/`, `auth/`, `dev/`, `build-id/` (public or system)

---

## Background jobs (Inngest)

**Client:** `app/src/server/jobs/client.ts` (`Inngest` id `adscale`).

**Registration:** `app/src/app/api/inngest/route.ts` serves:

| Function | Purpose |
|----------|---------|
| `derivationJob` | AI image generation, scoring, quality gate, usage tracking |
| `trialNotificationJob` | Trial lifecycle emails |
| `workspaceAssetAnalyzeJob` | Asset analysis (preflight / metadata) |
| `brandMemoryIngestJob` | Mem0 brand-memory ingestion |
| `learningProposalAggregatorJob` | Daily cron — client + cross-client learning proposals from human-quality corpus |

**Derivation job highlights:** Event `derivation.generate`; retries 2; realtime `derivationChannel`; idempotent skip if `outputKey` already set; dedicated base/style asset resolution for `restyling` mode.

Local dev: `npm run dev` runs Next + Inngest dev (`scripts/dev-with-inngest.mjs`); worker URL `http://localhost:3000/api/inngest`. <!-- VERIFY: Inngest Cloud serving production workers (region, event key) -->

---

## AI layer

Modules under `app/src/server/ai/` (creative generation):

| Module | Responsibility |
|--------|----------------|
| `prompt-builder.ts` | Composes derivation prompts; honors `CreativeContract` / CTA hard rules |
| `creative-contract.ts` | Contract types + `resolveCtaSemantics` |
| `creative-score.ts` | Heuristic + vision scoring |
| `creative-qa.ts` | Vision QA checklist |
| `creative-quality-gate.ts` | Hard vs polish classification, verdict |
| `creative-readiness.ts` | Preflight readiness analysis |
| `preview-gate.ts` | Strategy cockpit preview visibility rules |
| `guided-briefing.ts`, `strategy-recipes.ts` | Guided briefing and recipe flows |
| `copy-generator.ts`, `landing-page.ts` | Copy and landing-page generation |
| `campaign-deduction.ts`, `preflight-analysis.ts` | Briefing assistance, upload preflight |
| `competitor-analyzer.ts`, `persona-simulator.ts` | Competitor and persona flows |
| `creative-diagnosis.ts` | Campaign creative diagnosis |
| `derivation-auto-retry.ts` | Auto-retry policy for failed generations |
| `derivation-pipeline.ts` | End-to-end derivation pipeline orchestration |
| `export-validation.ts` | Export CTA/format validation (hard-failure classification) |
| `olhar/*` | Art-direction verdicts, dual-verdict constitution, base reading |
| `smart-resize.ts`, `image-analysis.ts` | Resize preview and image utilities |
| `voices/client-voice.ts` | Client voice extraction and review gate |

Image generation uses the OpenAI SDK with `env.OPENAI_API_KEY` and model names from validated env; the **Assistant** conversational layer instead streams MiniMax completions (see [Assistant subsystem](#assistant-subsystem)). Image generation timeout in the derivation job is 5 minutes per attempt.

---

## Key abstractions

| Abstraction | Location | Role |
|-------------|----------|------|
| `runAssistantTurn` | `server/assistant/orchestrator.ts` | Streams an assistant turn (context → model → tools → SSE events) |
| `AssistantTurnEvent` | `server/assistant/orchestrator.ts` | SSE event union for streamed assistant chat |
| `evaluateToolCall` | `server/assistant/tools/policy.ts` | Gates model tool calls before execution |
| `getWorkspaceBillingAccess` | `server/billing/access.ts` | Resolves paid/beta/none access + spend eligibility |
| `processStripeEvent` | `server/billing/events.ts` | Idempotent webhook → subscription sync + credit grants |
| `recordUsage` / `canSpend` | `server/billing/credits.ts` | Credit check, FIFO debit, analytics, low-credits email |
| `spendOrApiError` | `server/billing/paywall.ts` | API-boundary spend gate → 402 conversion payload |
| `buildConversionErrorPayload` | `lib/billing/conversion-gate.ts` | Maps blocked spend to checkout/portal/billing CTA |
| `redeemBetaAccess` | `server/billing/beta.ts` | Beta code → entitlement + grant |
| `CreativeContract` | `server/ai/creative-contract.ts` | Generation/scoring/QA contract |
| `assertDerivationApprovable` | `server/ai/creative-quality-gate.ts` | Blocks invalid approvals |
| `recordBetaAnalyticsEvent` | `server/beta-analytics/record.ts` | Validated analytics ingest |
| `buildAnalyticsFunnelSummary` | `server/beta-analytics/aggregate.ts` | Owner funnel aggregations |
| `getWorkspaceMissions` | `server/progression/missions/service.ts` | Mission path status |
| `generateAndPersistClientLearningProposals` | `server/human-quality/learning/generate.ts` | Corpus → client learning proposals |
| `learningProposalAggregatorJob` | `server/jobs/learning-proposal-aggregator.ts` | Scheduled proposal generation |
| `recomputeClientOutputLearnings` | `server/output-learning/service.ts` | Output decisions → client output learnings |
| `CampaignLoadError` | `lib/campaign-load-error.ts` | Client load error taxonomy |
| `requireWorkspaceAccess` | `server/auth/workspace.ts` | API tenancy guard |
| `requirePlatformOwner` | `server/auth/platform-owner.ts` | Owner-only analytics and beta ops |
| `objectStorage` | `server/storage/index.ts` | R2 put/get/presign via `R2ObjectStorage` |
| `derivationJob` | `server/jobs/derivation.ts` | End-to-end async generation |
| Repository functions | `server/repositories/*` | Workspace-scoped CRUD |

---

## Data layer

- **ORM:** Drizzle with `pg` pool (`app/src/server/db/index.ts`); `@neondatabase/serverless` available for serverless compute.
- **Schema:** PostgreSQL schema `adscale_app` — users/sessions (Better Auth), workspaces, campaigns, assets, derivations (quality gate + `parent_id`), **assistant threads/messages/actions/artifact-versions**, billing tables, notifications, landing pages, beta analytics, feedback, progression, **client_output_learnings**, **output_decision_events**, **human_quality_corpus_***, **client_learning_proposals**, **calibration_signals/rules**, **rubric_calibration_adjustments**, waitlist signups, etc.
- **Migrations:** `app/drizzle/*.sql`, managed via `drizzle-kit` (`npm run db:migrate`).

---

## Authentication and authorization

- **Better Auth** tables in Drizzle schema; config in `app/src/server/auth/config.ts`; catch-all route at `app/src/app/api/auth/[...all]/route.ts`.
- Session resolution: `getSession` / `getSessionFromHeaders` (`server/auth/session.ts`).
- Workspace membership roles: `owner` | `admin` | `member` (`requireRole` for privileged actions).
- **Platform owners** — separate guard for internal beta analytics, human-quality corpus, and admin quality routes.
- **Dev-admin owners** — bypass credit debits with synthetic balance (`server/auth/dev-admin.ts`).

---

## Storage

Binary assets (campaign uploads, derivation outputs, brand kit logos) are stored under workspace-scoped keys in R2. The `ObjectStorage` interface (`object-storage.ts`) is implemented by `R2ObjectStorage` (`r2-object-storage.ts`), exported as `objectStorage` from `storage/index.ts`. Presigned upload/download URLs use env `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and `R2_PUBLIC_BASE_URL` for browser-direct transfers. An in-memory implementation exists for tests.

---

## Frontend architecture (summary)

- **Routing:** App Router with `(dashboard)` layout; `(dashboard)/feedback` for owner analytics and human-quality corpus; `(dashboard)/assistant` for the conversational assistant; settings billing tab.
- **Server state:** TanStack Query hooks in `app/src/lib/hooks/` (campaigns, derivations, **assistant** chat/threads/actions/versions, **billing**, export, missions, delivery-package, output learning, record-beta-event).
- **Assistant UX:** `AssistantShell` / `AssistantChatCore` consume the SSE stream; `AssistantTreeSidebar`, `VersionHistory`, `VersionComparisonDialog`, `GuidedFlowControls`, and `CreditConfirmModal` support guided flows, versioning, and gated actions.
- **Billing UX:** `BillingTab`, `CreditPanel`, `CreditChart` consume `/api/billing/status` and `/api/billing/history`; 402 responses handled via `conversion-gate` client helpers.
- **Mission UX:** `MissionPathCard`, `MissionInsightProvider`, cockpit stage events via `useRecordBetaEvent`.
- **Owner feedback UI:** `OwnerAnalyticsPanel`, `BetaSessionsPanel`, `HumanQualityCorpusPanel` consume platform-owner analytics and corpus APIs.
- **UI state:** Zustand where needed (`app/src/lib/store.ts`).
- **i18n:** `next-intl` (`app/src/i18n.ts`, message files under `app/src/i18n/`).
- **Observability:** Sentry (`@sentry/nextjs`), structured logging via `app/src/lib/logger.ts`.

---

## Related documentation

- [GETTING-STARTED.md](./GETTING-STARTED.md) — local setup and first run
- [DEVELOPMENT.md](./DEVELOPMENT.md) — scripts and workflow
- [CONFIGURATION.md](./CONFIGURATION.md) — environment variables
- [API.md](./API.md) — HTTP API reference
- [DEPLOYMENT.md](./DEPLOYMENT.md) — deploy targets and Inngest in production
- [TESTING.md](./TESTING.md) — Vitest and CI
