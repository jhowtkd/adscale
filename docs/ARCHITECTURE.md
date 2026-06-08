<!-- generated-by: gsd-doc-writer -->

# ADScale Architecture

ADScale is a multi-tenant SaaS for AI-assisted advertising creative production. Teams work inside **workspaces**, define **campaigns** with briefing and assets, and generate **derivations** (image variants) via OpenAI image models. Outputs land in **Cloudflare R2** (S3-compatible object storage); metadata and billing state live in **PostgreSQL** via **Drizzle**. Long-running work runs on **Inngest**; the UI is **Next.js 16** (App Router) with **React 19**, **TanStack Query**, and **Better Auth**.

---

## System overview

The application follows a classic **browser → Next.js API routes → repositories → Postgres/R2** shape, with **async workers** for derivation generation and brand-memory ingestion. **v11.10** adds a closed-loop **beta analytics** pipeline (cockpit events, mission funnels, credit signals) and **owner-facing feedback tooling** for beta sessions and CSV export.

| Concern | Implementation |
|--------|----------------|
| Web UI & HTTP API | `app/src/app/` (App Router), `app/src/components/`, `app/src/lib/hooks/` |
| Auth & tenancy | Better Auth + `requireWorkspaceAccess()` (`app/src/server/auth/workspace.ts`) |
| Persistence | Drizzle ORM, schema `adscale_app` (`app/src/server/db/schema.ts`) |
| Files | `objectStorage` abstraction → R2 (`app/src/server/storage/`) |
| AI | OpenAI SDK modules under `app/src/server/ai/` |
| Background jobs | Inngest functions registered in `app/src/app/api/inngest/route.ts` |
| Billing | Stripe + credit gates (`app/src/server/billing/`) |
| Mission progression | `app/src/server/progression/missions/` — ordered cockpit missions with evidence inference |
| Beta analytics | `app/src/server/beta-analytics/` — event ingest, sanitization, aggregation, CSV export |
| Feedback & beta ops | `app/src/server/feedback/`, `app/src/server/mission-insights/`, owner routes under `api/feedback/` |

**v11.10 cross-cutting concerns** (milestone focus):

1. **Cockpit event schema & ingest** — allowlisted `eventKey` values (`cockpit_stage_entered`, `cockpit_stage_completed`, `cockpit_stage_abandoned`, etc.) with sanitized `properties`, workspace-scoped persistence, and client (`POST /api/analytics/events`) plus server-side emitters (credits, preflight, export, share).
2. **Mission instrumentation** — ordered mission path (`setup` → `share`) with evidence inference, credit estimates, and `mission_completed` / cockpit stage events from the campaign workspace UI.
3. **Owner analytics** — platform-owner routes aggregate funnel summaries, credit surprises, and readiness overrides; CSV export bundles raw events plus summary sections.
4. **Beta sessions** — operator sessions (`beta_sessions`) group analytics for cohort review; session ID stored in browser `sessionStorage` and attached to client events.
5. **Delivery package multiformat** — approved parent derivations spawn `format_adaptation` children per requested format, with quality-gate guard and per-format credit metering.
6. **Creative contract & hard quality gate** (carried from v11.1) — typed generation contract, blocking hard failures vs advisory polish, approval blocked when `invalid`.

---

## Component diagram

```mermaid
graph TD
  subgraph Client
    UI[React components]
    Hooks[TanStack Query hooks]
    BetaHook[useRecordBetaEvent]
    Err[CampaignLoadError]
  end

  subgraph NextApp["Next.js app/src/app"]
    Pages[(dashboard) pages]
    API[api/* Route Handlers]
    AnalyticsAPI[api/analytics/events]
    FeedbackAPI[api/feedback/*]
    InngestRoute[api/inngest]
  end

  subgraph Server["app/src/server"]
    Auth[auth/workspace]
    Owner[auth/platform-owner]
    Repo[repositories/*]
    AI[ai/*]
    Jobs[jobs/*]
    Store[storage/objectStorage]
    Bill[billing/gates]
    Progress[progression/missions]
    BetaA[beta-analytics/*]
    MissionI[mission-insights]
  end

  subgraph External
    PG[(PostgreSQL)]
    R2[(R2 / S3)]
    OAI[OpenAI]
    ING[Inngest Cloud]
  end

  UI --> Hooks
  UI --> BetaHook
  Hooks --> API
  BetaHook --> AnalyticsAPI
  Hooks --> Err
  Pages --> UI
  API --> Auth
  FeedbackAPI --> Owner
  AnalyticsAPI --> Auth
  AnalyticsAPI --> BetaA
  FeedbackAPI --> BetaA
  API --> Repo
  API --> Bill
  API --> Progress
  API --> ING
  Bill --> BetaA
  InngestRoute --> Jobs
  Jobs --> Repo
  Jobs --> AI
  Jobs --> Store
  Repo --> PG
  Store --> R2
  AI --> OAI
  ING --> Jobs
  MissionI --> Repo
```

---

## Directory structure rationale

Application code lives under `app/` (npm package `adscale-app`). Source is rooted at `app/src/`:

| Path | Role |
|------|------|
| `app/src/app/` | App Router: UI routes `(dashboard)/`, public pages, and `api/*` Route Handlers |
| `app/src/components/` | Presentational and feature components (campaign workspace, feedback owner panels, UI primitives) |
| `app/src/lib/` | Client utilities: `api-client`, React Query hooks, `campaign-load-error`, `beta-analytics/constants`, formats, logger |
| `app/src/server/ai/` | OpenAI-backed creative pipeline: prompts, scoring, QA, quality gate, contract, readiness, preview gate |
| `app/src/server/auth/` | Better Auth config, session helpers, workspace access, platform-owner guard |
| `app/src/server/billing/` | Stripe, plans, credits, `spendCreditsOrApiError` gates; server-side `credit_spend` / `credit_blocked` analytics |
| `app/src/server/beta-analytics/` | Event types, sanitization, `recordBetaAnalyticsEvent`, aggregation, credit-signal summaries, CSV helpers |
| `app/src/server/beta-sessions/` | Beta session Zod types shared with repositories |
| `app/src/server/db/` | Drizzle client + `schema.ts` (all tables in `adscale_app` schema) |
| `app/src/server/feedback/` | Feedback validation, mission-credit-signal classification |
| `app/src/server/jobs/` | Inngest client, `derivationJob`, trial notifications, workspace asset analysis, brand memory |
| `app/src/server/memory/` | Zep brand-memory ingest, context assembly for prompts |
| `app/src/server/mission-insights/` | Sanitize and persist mission insight moments as `feedback_reports` |
| `app/src/server/progression/` | Workspace levels and ordered **missions** (definitions, evidence, status, credits) |
| `app/src/server/repositories/` | Data access layer; workspace-scoped CRUD including `beta-analytics` and `beta-sessions` |
| `app/src/server/services/` | Email, notifications, export, landing-page render |
| `app/src/server/storage/` | `objectStorage` interface; R2 and in-memory implementations |
| `app/src/server/validation/` | `env` (Zod-validated environment) |
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

1. `POST /api/campaigns/[id]/derivations` validates workspace, campaign, credits (`spendCreditsOrApiError`), and concurrency (no other `queued`/`processing` rows).
2. Creates derivation row(s) and sends Inngest event `derivation.generate` with `derivationId`, `campaignId`, `workspaceId`, locale, format, CTA, `generationMode`, optional `styleAssetId`.
3. **`derivationJob`** (`app/src/server/jobs/derivation.ts`) runs stepped workflow:
   - Idempotency check → `processing` → load campaign, plan, assets, brand kit, references, brand memory
   - Build **`CreativeContract`** + `buildDerivationPrompt({ contract, ... })`
   - Generate image (mode-specific: `art_variation`, `format_adaptation`, `restyling`), normalize with **sharp**, upload to R2
   - `mark-completed`, realtime status via Inngest channels, optional email notification
   - **`score-derivation`** — heuristic + visual analysis (`creative-score.ts`), persists `qualityScore` / `scoreIssues`
   - **`quality-gate`** — `runCompletedDerivationQualityGate` (see below)
   - **`track-usage`** for billing metering

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

### 5. Beta analytics ingest (v11.10)

**Client path:**

1. Campaign workspace components call `useRecordBetaEvent(campaignId).recordEvent(eventKey, properties)` — fire-and-forget `POST /api/analytics/events`.
2. Optional `sessionId` read from `sessionStorage` key `adscale_beta_session_id` (`BETA_SESSION_STORAGE_KEY`).
3. Route validates body via `createBetaEventBodySchema`, resolves workspace session, calls `recordBetaAnalyticsEvent`.

**Server path:**

- `recordBetaAnalyticsEvent` sanitizes properties (allowlisted keys, 32 KB cap), validates `eventKey` against `PHASE_76_BETA_EVENT_KEYS`, optionally validates `sessionId` / `campaignId` / `derivationId` ownership, inserts into `beta_analytics_events`.
- Emitters: `spendCredits` / credit-block paths in `billing/credits.ts`, preflight route, export route, share route, derivation review (`mission_completed`).

**Owner read path:**

1. `requirePlatformOwner` (email in `PLATFORM_OWNER_EMAILS` or dev-admin list).
2. `GET /api/feedback/analytics/funnel` → `buildAnalyticsFunnelSummary` (mission funnel, cockpit stage funnel, credit surprises, readiness overrides, etc.).
3. `GET /api/feedback/analytics/credit-signals` → `summarizeOwnerCreditSignals`.
4. `GET /api/feedback/analytics/export.csv` → combined CSV with `# funnel_summary`, `# mission_funnel`, `# cockpit_stage_funnel`, and raw event rows.

### 6. Mission progression & insights (v11.10)

1. `GET /api/workspace/missions` returns ordered mission statuses inferred from workspace evidence (`inferWorkspaceEvidence`, `inferMissionCompletions`).
2. Dashboard `MissionPathCard` surfaces active mission, credit estimates, and deep links into campaign cockpit tabs.
3. Client cockpit UI records `cockpit_stage_entered` / `cockpit_stage_completed` / `cockpit_stage_abandoned` with `stage` or `missionKey` in properties.
4. `POST /api/workspace/mission-insights` accepts sanitized mission insight payloads; `recordMissionInsight` persists structured diagnostic context on `feedback_reports` (category `mission`).
5. `GET /api/feedback/mission-credit-signals` (owner) classifies mission insights into healthy vs frustration signals for credit-consuming missions (`preview`, `batch`, `regeneration`).

---

## Beta analytics event schema (v11.10)

**Modules:** `app/src/server/beta-analytics/types.ts`, `sanitize.ts`, `record.ts`, `aggregate.ts`

### Allowed event keys

| Event key | Typical source | Purpose |
|-----------|----------------|---------|
| `cockpit_stage_entered` | Client | User entered a cockpit stage/mission |
| `cockpit_stage_completed` | Client | Stage completed (timeline + funnel) |
| `cockpit_stage_abandoned` | Client | User left mid-stage (abandon funnel, guided briefing steps) |
| `mission_completed` | Server (review route) | Mission evidence milestone reached |
| `readiness_blocked` | Server (preflight) | Creative readiness gate blocked action |
| `readiness_completed` | Server (preflight) | Readiness check passed |
| `credit_spend` | Server (billing) | Credits consumed; may include `estimateCredits` vs `actualCredits` |
| `credit_blocked` | Server (billing) | Insufficient credits or gate denial |
| `recipe_selected` | Client | Strategy recipe chosen |
| `recipe_tradeoff_viewed` | Client | User viewed recipe tradeoff UI |

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

**`resolveCtaSemantics(ctaText, mode)`** maps briefing CTA text to semantics: non-empty string → `explicit`; otherwise → `inherited` (base CTA preserved per mode). The resolver is used in the derivation job and QA route.

**Consumers:**

| Stage | How contract is used |
|-------|-------------------------|
| **Generation** | `buildDerivationPrompt` injects HARD RULES from `ctaSemantics` and `targetFormat` (`app/src/server/ai/prompt-builder.ts`) |
| **Scoring** | `analyzeDerivationCreative` / `scoreCompletedDerivation` receive optional `contract` for brief-aligned visual scoring |
| **QA** | `analyzeCreativeQa` receives `contract` so checklist evaluation matches generation promises |
| **Quality gate** | `classifyCreativeQualityGate` / `computeQualityGateFromAnalysis` use contract for CTA-drift and offer/brand rules |

**Restyling:** `styleAssetId` on the contract selects the style reference asset; restyling generation requires base + style assets in the campaign.

---

## Quality gate pipeline (v11.1)

**Module:** `app/src/server/ai/creative-quality-gate.ts`

After an image is generated and scored, the gate classifies QA output into **hard failures** (blocking) vs **polish suggestions** (advisory), then derives a **verdict**.

### Pipeline stages

```
analyzeCreativeQa (vision + contract)
        ↓
classifyCreativeQualityGate (checklist + scoreIssues + contract)
        ↓
deriveQualityVerdict (hardFailures, qualityScore, checklist warnings)
        ↓
persist: qualityVerdict, hardFailures, polishSuggestions, qualityGatedAt
```

| Verdict | Meaning |
|---------|---------|
| `invalid` | One or more hard failures — approval blocked |
| `improvable` | No hard failures, but score &lt; 70 and/or checklist warnings |
| `acceptable` | No hard failures, score ≥ 70, no checklist warnings |

**Hard failure codes** (non-exhaustive; see source for pattern matching on QA notes):

- `cta_drift`, `wrong_brand`, `unsupported_offer`
- `copied_style_reference_facts`, `cropped_critical_content`
- `unreadable_required_text`, `invalid_format_layout`

**Orchestration:**

- **Automatic:** Inngest step `quality-gate` after `score-derivation` calls `runCompletedDerivationQualityGate`. On analyzer failure, fallback persists `improvable` with empty failures (non-blocking for the job).
- **On-demand:** `POST /api/derivations/[id]/qa` runs the same analysis path for approved creatives (export-time QA).
- **Approval guard:** `assertDerivationApprovable` used by delivery-package and approve flows.

**Persistence** (`derivations` table, `app/src/server/db/schema.ts`):

- `quality_verdict`, `hard_failures` (jsonb), `polish_suggestions` (jsonb), `quality_gated_at`
- Related QA fields: `qa_status`, `qa_checklist`, `qa_issues`, `qa_suggestions`
- **Multiformat:** `parent_id` links delivery-package children to approved source derivations

**UI:** `DerivationCard` and `DerivationReviewModal` show verdict badges, list hard failures (invalid), and polish hints (improvable). Approve buttons disable when `qualityVerdict === "invalid"`. Display score may be capped via `scoreCappedForDisplay` in `app/src/lib/derivation-quality.ts`.

---

## CampaignLoadError taxonomy (v11.1)

**Module:** `app/src/lib/campaign-load-error.ts`

Typed error for campaign/derivation fetch failures in React Query hooks (`use-campaigns`, `use-derivations`).

| Kind | Typical trigger |
|------|-----------------|
| `session` | HTTP 401, `code: unauthorized`, or message `"Unauthorized"` |
| `workspace` | HTTP 403, `noWorkspace`, `forbidden` |
| `not_found` | HTTP 404, `campaignNotFound` |
| `timeout` | `AbortError`, `TimeoutError`, timeout message on `cause` |
| `server` | HTTP 500/503, `internalError`, `generationWorkerUnavailable` |
| `unknown` | Everything else |

**API surface:** `classifyLoadError`, `createLoadError`, `parseCampaignLoadError(res, body)`, `parseFetchFailure(error)`, `getLoadErrorKind`.

**UI:** `CampaignErrorState` maps `kind` to localized copy.

Hooks rethrow or attach `CampaignLoadError` so the workspace does not show a generic failure for known API codes.

---

## Workspace-scoped API

**Pattern:** Route handlers import `requireWorkspaceAccess` from `@/server/auth/workspace`. It:

1. Resolves the Better Auth session (from request headers or server context).
2. Loads the user's active workspace via `getWorkspaceForUser`.
3. Throws `WorkspaceAuthError` with codes `unauthorized`, `noWorkspace`, or `forbidden` (for `requireRole`).

Repositories take `workspaceId` as an explicit argument (e.g. `getCampaignById(id, workspace.id)`, `getDerivationById(id, workspace.id)`). Drizzle updates include `and(eq(table.workspaceId, workspaceId), …)` so cross-tenant access is rejected at the data layer.

**Platform-owner routes** use `requirePlatformOwner` (`app/src/server/auth/platform-owner.ts`) — email must appear in `PLATFORM_OWNER_EMAILS` or the dev-admin allowlist. Used for beta session CRUD, analytics funnel/credit-signals/export, and owner feedback panels (`app/(dashboard)/feedback/`).

**Representative API groups** under `app/src/app/api/`:

- `campaigns/`, `derivations/`, `workspace/` (assets, brand-kit, invites, **missions**, **mission-insights**, progression)
- `analytics/events` — workspace-scoped beta event ingest
- `feedback/` — reports, **beta-sessions**, **analytics/funnel**, **analytics/credit-signals**, **analytics/export.csv**, mission-credit-signals
- `billing/`, `dashboard/`, `export/`, `client-profiles/`
- `inngest/` (worker webhook, no end-user session — Inngest signing)
- `health/`, `share/` (token-based public read paths scope differently)

---

## Background jobs (Inngest)

**Client:** `app/src/server/jobs/client.ts` (`Inngest` id `adscale`).

**Registration:** `app/src/app/api/inngest/route.ts` serves:

| Function | Purpose |
|----------|---------|
| `derivationJob` | AI image generation, scoring, quality gate, usage tracking |
| `trialNotificationJob` | Trial lifecycle emails |
| `workspaceAssetAnalyzeJob` | Asset analysis (preflight / metadata) |
| `brandMemoryIngestJob` | Zep brand-memory ingestion |

**Derivation job highlights:**

- Event: `derivation.generate`
- Retries: 2; `onFailure` marks derivation `failed`, refreshes campaign status, notifies user
- Realtime: `derivationChannel` publishes status for live UI updates
- Idempotent skip if `outputKey` already set
- Delivery-package children reuse the same job with `generationMode: format_adaptation` and explicit `format`

Local dev: `npm run dev` runs Next + Inngest dev (`scripts/dev-with-inngest.mjs`); worker URL `http://localhost:3000/api/inngest`.

---

## AI layer

Modules under `app/src/server/ai/`:

| Module | Responsibility |
|--------|----------------|
| `prompt-builder.ts` | Composes derivation prompts; honors `CreativeContract` / CTA hard rules |
| `creative-contract.ts` | Contract types + `resolveCtaSemantics` |
| `creative-score.ts` | Heuristic + vision scoring, regeneration suggestions on hard failures |
| `creative-qa.ts` | Vision QA checklist (legibility, CTA/offer, brief match, format, risk, style fidelity) |
| `creative-quality-gate.ts` | Hard vs polish classification, verdict, post-completion orchestration |
| `creative-readiness.ts` | Preflight readiness analysis (pairs with `readiness_*` analytics events) |
| `preview-gate.ts` | Pure rules for strategy cockpit preview visibility |
| `guided-briefing.ts`, `strategy-recipes.ts` | Guided briefing and recipe selection flows |
| `creative-diagnosis.ts` | Campaign creative diagnosis normalization |
| `copy-generator.ts`, `landing-page.ts` | Copy and landing-page JSON generation |
| `campaign-deduction.ts`, `preflight-analysis.ts` | Briefing assistance, upload preflight |
| `competitor-analyzer.ts`, `persona-simulator.ts` | Competitor and persona flows |
| `smart-resize.ts`, `image-analysis.ts` | Resize preview and image utilities |
| `utils.ts` | Shared OpenAI client helpers |

OpenAI calls use `env.OPENAI_API_KEY` and model names from validated env (`app/src/server/validation/env.ts`). Image generation timeout in the derivation job is 5 minutes per attempt.

---

## Key abstractions

| Abstraction | Location | Role |
|-------------|----------|------|
| `CreativeContract` | `server/ai/creative-contract.ts` | Generation/scoring/QA contract |
| `classifyCreativeQualityGate` | `server/ai/creative-quality-gate.ts` | Hard failures vs polish |
| `deriveQualityVerdict` | same | `invalid` / `improvable` / `acceptable` |
| `assertDerivationApprovable` | same | Blocks invalid approvals and delivery packages |
| `recordBetaAnalyticsEvent` | `server/beta-analytics/record.ts` | Validated analytics ingest |
| `buildAnalyticsFunnelSummary` | `server/beta-analytics/aggregate.ts` | Owner funnel + cockpit aggregations |
| `summarizeOwnerCreditSignals` | `server/beta-analytics/credit-signals.ts` | Credit surprise rollup for owners |
| `getWorkspaceMissions` | `server/progression/missions/service.ts` | Mission path status for dashboard/cockpit |
| `recordMissionInsight` | `server/mission-insights/service.ts` | Mission moment → feedback report |
| `CampaignLoadError` | `lib/campaign-load-error.ts` | Client load error taxonomy |
| `requireWorkspaceAccess` | `server/auth/workspace.ts` | API tenancy guard |
| `requirePlatformOwner` | `server/auth/platform-owner.ts` | Owner-only analytics and beta ops |
| `objectStorage` | `server/storage/object-storage.ts` | R2 put/get/presign |
| `derivationJob` | `server/jobs/derivation.ts` | End-to-end async generation |
| Repository functions | `server/repositories/*` | Workspace-scoped CRUD |
| `spendCreditsOrApiError` | `server/billing/gates.ts` | Credit enforcement on API actions |

---

## Data layer

- **ORM:** Drizzle with `pg` pool (`app/src/server/db/index.ts`).
- **Schema:** PostgreSQL schema `adscale_app` — users/sessions (Better Auth), workspaces, campaigns, assets, derivations (quality gate + `parent_id` for delivery children), plans, billing, notifications, landing pages, templates, **`beta_sessions`**, **`beta_analytics_events`**, **`feedback_reports`**, workspace progression, etc.
- **Migrations:** `app/drizzle/*.sql`, managed via `drizzle-kit` (`npm run db:migrate`).

Derivation row carries generation state (`status`, `outputKey`), scoring (`qualityScore`, `scoreIssues`, `scoreBreakdown`), QA (`qaStatus`, `qaChecklist`, …), gate fields (`qualityVerdict`, `hardFailures`, `polishSuggestions`), and optional `parentId` for multiformat packages.

---

## Authentication and authorization

- **Better Auth** tables in Drizzle schema; config in `app/src/server/auth/config.ts`.
- Session resolution: `getSession` / `getSessionFromHeaders` (`server/auth/session.ts`).
- Workspace membership roles: `owner` | `admin` | `member` (`requireRole` for privileged actions).
- **Platform owners** — separate guard for internal beta analytics and session management; not workspace-role-based.

---

## Storage

Binary assets (campaign uploads, derivation outputs, brand kit logos) are stored under workspace-scoped keys in R2. The `objectStorage` abstraction supports presigned upload/download URLs for browser-direct transfers. Legacy imports from `@/server/storage/r2` delegate to the same implementation.

---

## Billing (summary)

Stripe webhooks and portal routes under `app/src/app/api/billing/`. Credit spending is enforced at API boundaries (`spendCreditsOrApiError`) for derivations, QA, delivery-package children, and other metered actions. Usage rows recorded from the derivation job's `track-usage` step. Successful and blocked spends emit `credit_spend` / `credit_blocked` analytics events for owner dashboards.

---

## Frontend architecture (summary)

- **Routing:** App Router with `(dashboard)` layout for authenticated app shell; `(dashboard)/feedback` for owner analytics UI.
- **Server state:** TanStack Query hooks in `app/src/lib/hooks/` (campaigns, derivations, billing, export, **missions**, **delivery-package**, **record-beta-event**, etc.).
- **Mission UX:** `MissionPathCard`, `MissionInsightProvider`, cockpit panels record stage events via `useRecordBetaEvent`.
- **Owner feedback UI:** `OwnerAnalyticsPanel`, `BetaSessionsPanel` consume platform-owner analytics APIs.
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
