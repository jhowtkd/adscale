<!-- generated-by: gsd-doc-writer -->

# ADScale Architecture

ADScale is a multi-tenant SaaS for AI-assisted advertising creative production. Teams work inside **workspaces**, define **campaigns** with briefing and assets, and generate **derivations** (image variants) via OpenAI image models. Outputs land in **Cloudflare R2** (S3-compatible object storage); metadata and billing state live in **PostgreSQL** via **Drizzle**. Long-running work runs on **Inngest**; the UI is **Next.js 16** (App Router) with **React 19**, **TanStack Query**, and **Better Auth**.

---

## System overview

The application follows a classic **browser → Next.js API routes → repositories → Postgres/R2** shape, with **async workers** for derivation generation and brand-memory ingestion.

| Concern | Implementation |
|--------|----------------|
| Web UI & HTTP API | `app/src/app/` (App Router), `app/src/components/`, `app/src/lib/hooks/` |
| Auth & tenancy | Better Auth + `requireWorkspaceAccess()` (`app/src/server/auth/workspace.ts`) |
| Persistence | Drizzle ORM, schema `adscale_app` (`app/src/server/db/schema.ts`) |
| Files | `objectStorage` abstraction → R2 (`app/src/server/storage/`) |
| AI | OpenAI SDK modules under `app/src/server/ai/` |
| Background jobs | Inngest functions registered in `app/src/app/api/inngest/route.ts` |
| Billing | Stripe + credit gates (`app/src/server/billing/`) |

**v11.1 cross-cutting concerns** (milestone focus):

1. **Creative contract** — typed generation/scoring/QA inputs (`CreativeContract`, `CtaSemantics`) shared across prompt building, scoring, and quality gate.
2. **Hard quality gate** — separates blocking **hard failures** from advisory **polish suggestions**, derives `qualityVerdict`, and blocks approval when invalid.
3. **CampaignLoadError** — client-side taxonomy mapping API `code` + HTTP status to localized error UI.
4. **Workspace-scoped API** — every mutating/read path resolves the caller’s workspace and scopes queries by `workspace.id`.
5. **Derivation verdict UI** — cards and review modal surface `qualityVerdict`, `hardFailures`, and polish hints.

---

## Component diagram

```mermaid
graph TD
  subgraph Client
    UI[React components]
    Hooks[TanStack Query hooks]
    Err[CampaignLoadError]
  end

  subgraph NextApp["Next.js app/src/app"]
    Pages[(dashboard) pages]
    API[api/* Route Handlers]
    InngestRoute[api/inngest]
  end

  subgraph Server["app/src/server"]
    Auth[auth/workspace]
    Repo[repositories/*]
    AI[ai/*]
    Jobs[jobs/*]
    Store[storage/objectStorage]
    Bill[billing/gates]
  end

  subgraph External
    PG[(PostgreSQL)]
    R2[(R2 / S3)]
    OAI[OpenAI]
    ING[Inngest Cloud]
  end

  UI --> Hooks
  Hooks --> API
  Hooks --> Err
  Pages --> UI
  API --> Auth
  API --> Repo
  API --> Bill
  API --> ING
  InngestRoute --> Jobs
  Jobs --> Repo
  Jobs --> AI
  Jobs --> Store
  Repo --> PG
  Store --> R2
  AI --> OAI
  ING --> Jobs
```

---

## Directory structure rationale

Application code lives under `app/` (npm package `adscale-app`). Source is rooted at `app/src/`:

| Path | Role |
|------|------|
| `app/src/app/` | App Router: UI routes `(dashboard)/`, public pages, and `api/*` Route Handlers |
| `app/src/components/` | Presentational and feature components (campaign workspace, settings, UI primitives) |
| `app/src/lib/` | Client utilities: `api-client`, React Query hooks, `campaign-load-error`, formats, logger |
| `app/src/server/ai/` | OpenAI-backed creative pipeline: prompts, scoring, QA, quality gate, contract |
| `app/src/server/auth/` | Better Auth config, session helpers, workspace access |
| `app/src/server/billing/` | Stripe, plans, credits, `spendCreditsOrApiError` gates |
| `app/src/server/db/` | Drizzle client + `schema.ts` (all tables in `adscale_app` schema) |
| `app/src/server/jobs/` | Inngest client, `derivationJob`, trial notifications, workspace asset analysis, brand memory |
| `app/src/server/memory/` | Zep brand-memory ingest, context assembly for prompts |
| `app/src/server/repositories/` | Data access layer; all campaign/derivation queries accept `workspaceId` |
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
2. Loads the user’s active workspace via `getWorkspaceForUser`.
3. Throws `WorkspaceAuthError` with codes `unauthorized`, `noWorkspace`, or `forbidden` (for `requireRole`).

Repositories take `workspaceId` as an explicit argument (e.g. `getCampaignById(id, workspace.id)`, `getDerivationById(id, workspace.id)`). Drizzle updates include `and(eq(table.workspaceId, workspaceId), …)` so cross-tenant access is rejected at the data layer.

**Representative API groups** under `app/src/app/api/`:

- `campaigns/`, `derivations/`, `workspace/` (assets, brand-kit, invites)
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
| `assertDerivationApprovable` | same | Blocks invalid approvals |
| `CampaignLoadError` | `lib/campaign-load-error.ts` | Client load error taxonomy |
| `requireWorkspaceAccess` | `server/auth/workspace.ts` | API tenancy guard |
| `objectStorage` | `server/storage/object-storage.ts` | R2 put/get/presign |
| `derivationJob` | `server/jobs/derivation.ts` | End-to-end async generation |
| Repository functions | `server/repositories/*` | Workspace-scoped CRUD |
| `spendCreditsOrApiError` | `server/billing/gates.ts` | Credit enforcement on API actions |

---

## Data layer

- **ORM:** Drizzle with `pg` pool (`app/src/server/db/index.ts`).
- **Schema:** PostgreSQL schema `adscale_app` — users/sessions (Better Auth), workspaces, campaigns, assets, derivations (including quality gate columns), plans, billing, notifications, landing pages, templates, etc.
- **Migrations:** `app/drizzle/*.sql`, managed via `drizzle-kit` (`npm run db:migrate`).

Derivation row carries generation state (`status`, `outputKey`), scoring (`qualityScore`, `scoreIssues`, `scoreBreakdown`), QA (`qaStatus`, `qaChecklist`, …), and gate fields (`qualityVerdict`, `hardFailures`, `polishSuggestions`).

---

## Authentication and authorization

- **Better Auth** tables in Drizzle schema; config in `app/src/server/auth/config.ts`.
- Session resolution: `getSession` / `getSessionFromHeaders` (`server/auth/session.ts`).
- Workspace membership roles: `owner` | `admin` | `member` (`requireRole` for privileged actions).

---

## Storage

Binary assets (campaign uploads, derivation outputs, brand kit logos) are stored under workspace-scoped keys in R2. The `objectStorage` abstraction supports presigned upload/download URLs for browser-direct transfers. Legacy imports from `@/server/storage/r2` delegate to the same implementation.

---

## Billing (summary)

Stripe webhooks and portal routes under `app/src/app/api/billing/`. Credit spending is enforced at API boundaries (`spendCreditsOrApiError`) for derivations, QA, and other metered actions. Usage rows recorded from the derivation job’s `track-usage` step.

---

## Frontend architecture (summary)

- **Routing:** App Router with `(dashboard)` layout for authenticated app shell.
- **Server state:** TanStack Query hooks in `app/src/lib/hooks/` (campaigns, derivations, billing, export, etc.).
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
