<!-- generated-by: gsd-doc-writer -->

# API Reference

Internal HTTP API for the ADScale Next.js application (`app/src/app/api`). Consumed by the web UI via same-origin `fetch` with session cookies (`credentials: "include"` in `apiFetch`). There is no public versioned external API.

| Property | Value |
|----------|--------|
| Base URL | Same origin as the deployed app (`APP_URL` / `BETTER_AUTH_URL`) |
| Format | JSON (except multipart uploads, CSV exports, and Stripe webhook raw body) |
| Auth (default) | Better Auth session cookie + workspace scoping |
| Max upload | 50 MB per file; images: `image/png`, `image/jpeg`, `image/webp` |

Route handlers live under `app/src/app/api/**/route.ts` (118 route files).

---

## Authentication

### Session (Better Auth)

- **Library:** [Better Auth](https://www.better-auth.com/) (`app/src/server/auth/index.ts`).
- **Routes:** `GET` and `POST` on `/api/auth/[...all]` — delegated via `toNextJsHandler(auth)` (`app/src/app/api/auth/[...all]/route.ts`).
- **Mechanisms:** Email/password (verification required in production), Google/GitHub OAuth when env keys are set, magic link plugin, password reset.
- **Client usage:** Browser sends cookies automatically. The frontend helper `apiFetch` (`app/src/lib/api-client.ts`) sets `credentials: "include"` and redirects to `/login` on `401`.

Session cookies recognized by middleware include `better-auth.session_token`, `__Secure-better-auth.session_token`, or legacy `session`.

### Workspace-scoped endpoints

Most business routes call `requireWorkspaceAccess(request)` (`app/src/server/auth/workspace.ts`), which:

1. Resolves the session from `request.headers` via `auth.api.getSession`.
2. Loads the user's workspace membership.
3. Returns `{ user, workspace }` or throws `WorkspaceAuthError`.

**Role-gated routes** additionally call `requireRole(workspaceId, userId, allowedRoles)` for `owner` / `admin` / `member` checks (workspace invites, members).

### Platform owner endpoints

Beta feedback console and analytics routes call `requirePlatformOwner(request)` (`app/src/server/auth/platform-owner.ts`):

1. Resolves the session from request headers.
2. Checks the user's email against `PLATFORM_OWNER_EMAILS` (comma-separated env) and `DEV_ADMIN_EMAILS`.

Returns `401 unauthorized` without a session; `403 forbidden` when the email is not an owner.

### Calibration access endpoints

Quality calibration and human-quality analytics routes call `requireCalibrationAccess(request, workspaceId?)` (`app/src/server/auth/calibration-access.ts`):

1. **Platform owners** — emails in `PLATFORM_OWNER_EMAILS` / `DEV_ADMIN_EMAILS` get full scope.
2. **Workspace admins** — session users with `owner` or `admin` role on the requested workspace (or their default workspace when `workspaceId` is omitted).

Returns `401 unauthorized` without a session; `403 forbidden` for members or when no workspace can be resolved.

Routes: `GET /api/feedback/quality-trend`, `quality-improvement`, `score-calibration`, `sample-coverage`, `learning-impact`; `PATCH /api/feedback/calibration-adjustments/:id/accept`.

### Session-only (no workspace)

These require a valid session but do not use `requireWorkspaceAccess`:

| Route | Notes |
|-------|--------|
| `POST /api/user/locale` | Updates user locale + `locale` cookie |
| `GET`, `POST /api/user/onboarding` | Onboarding completion flag (returns `{ error: "Unauthorized" }` on 401, not `apiError` shape) |
| `POST /api/user/onboarding/restart` | Clears onboarding |
| `POST /api/workspace/invites/accept` | Accept invite by token |
| `PATCH /api/workspace/invites` | Accept invite by token (duplicate entry point) |

### Unauthenticated / alternate auth

| Route | Auth |
|-------|------|
| `GET /api/health` | None |
| `GET /api/share/:token/asset/:derivationId` | Valid share token (no session) |
| `GET /api/dev/reset-token` | E2E only (`E2E_DISABLE_RATE_LIMIT`); otherwise 404 |
| `GET`, `POST`, `PUT /api/inngest` | Inngest request signing (platform SDK) |
| `POST /api/billing/webhook` | `Stripe-Signature` header + `STRIPE_WEBHOOK_SECRET` |
| `POST /api/notifications/webhook` | `x-webhook-secret` must equal `NOTIFICATION_WEBHOOK_SECRET` |
| `GET`, `POST /api/auth/[...all]` | Better Auth flows |
| `OPTIONS`, `POST /api/waitlist` | CORS marketing origins (`MARKETING_ALLOWED_ORIGINS`); rate-limited as `auth` |
| `GET /api/build-id` | None — deployment build identifier |

### Example authenticated request

```http
GET /api/campaigns HTTP/1.1
Host: <app-origin>
Cookie: better-auth.session_token=<token>
Accept: application/json
```

---

## Request and response formats

### Success responses

- **JSON APIs:** Handlers return `NextResponse.json(payload)` or `apiSuccess(data, status)` — the body is the resource object directly (no global `{ data: ... }` envelope).
- **Created:** Many `POST` handlers use status `201` with a resource key (e.g. `{ campaign }`, `{ invite }`, `{ event }`, `{ report }`).
- **Downloads:** Export and presign routes return time-limited URLs, e.g. `{ downloadUrl, expiresAt }` or presign fields from R2 helpers.
- **Redirects:** `GET /api/share/:token/asset/:derivationId` returns `302` to a signed R2 URL.
- **CSV:** `GET /api/feedback/analytics/export.csv` returns `text/csv` with `Content-Disposition: attachment`.

### Error responses

Standard shape from `apiError()` (`app/src/lib/api-response.ts`):

```json
{
  "error": "<localized human message>",
  "code": "<machineCode>",
  "details": { }
}
```

`details` is optional (Zod `flatten()`, `errorId`, domain-specific fields).

**Exceptions:**

- `GET|POST /api/user/onboarding` — `{ "error": "Unauthorized" }` with status `401` (plain message, no `code`).
- Owner analytics routes — `{ "error": "invalid_from" }` / `invalid_to` with status `400` (plain message, no `code`).
- `POST /api/billing/beta/redeem` on `BetaRedeemError` — `{ "error": "<message>", "code": "<code>" }` with status `400`.
- Middleware rate limit — see [Rate limits](#rate-limits).
- Some legacy paths may return ad hoc keys; prefer the shape above for new handlers.

### Validation

Request bodies are validated with **Zod** where noted below. Failures typically use `validation_error`, `invalidInput`, or `invalidRequestBody` with `details` from `safeParse().error.flatten()`.

### Multipart

- `POST /api/restyling`, `POST /api/quick-tools/restyling` — `multipart/form-data` (campaign + images).
- `POST /api/workspace/assets` — file upload fields.
- `POST /api/campaigns/:id/competitors/analyze` — screenshot files.

---

## Error codes

| HTTP | Code | When |
|------|------|------|
| 400 | `invalidRequestBody` | Malformed JSON or failed body parse |
| 400 | `invalidInput` | Zod / business validation |
| 400 | `validation_error` | Zod validation (feedback, analytics, beta sessions) |
| 400 | `fileTooLarge` | File over 50 MB |
| 400 | `invalidFileType` | Disallowed MIME / magic bytes |
| 400 | `missingBaseAsset` | Campaign has no base asset for restyling / derivations |
| 400 | `performanceCampaignPathMismatch` | Performance snapshot `campaignId` does not match URL |
| 400 | `importFileTooLarge` | Performance CSV import exceeds size limit |
| 400 | `sourceDerivationMissingOutput` | Delivery package source has no output |
| 400 | `stripeSignatureMissing` / `stripeSignatureInvalid` | Billing webhook |
| 401 | `unauthorized` | No session (`requireWorkspaceAccess` / webhooks) |
| 403 | `noWorkspace` | Session without workspace |
| 403 | `forbidden` | Insufficient workspace role or not platform owner |
| 403 | `derivationNotInShareLink` | Derivation not in share token scope |
| 403 | `inviteEmailMismatch` | Invite accept email mismatch |
| 404 | `campaignNotFound`, `derivationNotFound`, `assetNotFound`, `planNotFound`, `clientProfileNotFound`, `inviteNotFound`, `not_found`, `workspace_not_found`, `shareLinkNotFound`, `billingCustomerNotFound`, … | Resource missing or wrong workspace |
| 409 | `derivationsInProgress`, `derivationNotApproved`, `derivationHardFailures`, `sourceDerivationNotApproved`, `invalidApprovalPackageSelection`, … | Conflict / quality gate |
| 410 | `inviteExpired` | Invite token expired |
| 429 | `rateLimitExceeded` | Rate limit (handler or middleware) |
| 429 | `derivationsInProgress`, `diagnosisInProgress`, … | Domain concurrency limits |
| 500 | `internalError` | Unexpected error; `details.errorId` for support |
| 500 | `checkoutSessionFailed`, `portalSessionFailed`, `failedQueueDerivations`, … | Domain failures |
| 502 | `aiEmptyResponse`, `aiInvalidJson`, `aiValidationFailed` | AI plan generation |
| 503 | `internalError` | Database connection failures |

In development, `500` responses may include `details.devError` with stack info.

---

## Rate limits

### Edge proxy (`app/src/proxy.ts`)

Applies to **API mutations** (`POST`, `PUT`, `PATCH`, `DELETE`) under `/api/*`:

| Category | Paths (prefix match) | Default window | Max requests |
|----------|----------------------|----------------|--------------|
| `auth` | `/api/auth` | 60s | 10 |
| `ai` | `/api/campaigns`, `/api/derivations`, `/api/restyling`, `/api/quick-tools` | 60s | 5 |
| `general` | All other API mutations | 60s | 30 |

**429 response (middleware):**

```json
{
  "error": "rateLimitExceeded",
  "message": "Too many requests. Please try again later.",
  "retryAfter": 42
}
```

Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

Storage: Upstash Redis when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set; otherwise in-memory per instance (`app/src/lib/rate-limit.ts`).

### Per-route limits

`checkRateLimit()` / `rateLimitWorkspace()` on selected AI-heavy routes (auto-briefing, competitors analyze/strategy, preflight, etc.) — same JSON shape as middleware when exceeded.

`POST /api/share` applies an additional `rateLimit(request, "general")` before workspace auth.

---

## Endpoints overview

Dynamic segments use `:id` notation. Auth column: **none**, **session**, **session+workspace**, **platform-owner**, **calibration-access**, **better-auth**, **stripe-signature**, **x-webhook-secret**, **inngest-signing**, **share-token**.

| Method(s) | Path | Auth | Description |
|-----------|------|------|-------------|
| GET, POST | `/api/auth/[...all]` | better-auth | Sign-in, sign-up, OAuth, session, password reset |
| GET | `/api/health` | none | Liveness probe + static asset diagnostics |
| GET | `/api/build-id` | none | Git commit / build identifier |
| OPTIONS, POST | `/api/waitlist` | none (CORS) | Marketing-site waitlist signup |
| GET, POST, PUT | `/api/inngest` | inngest-signing | Inngest job handler (derivation, trial, assets, brand memory) |
| GET | `/api/admin/quality/learning/proposals` | platform-owner | List client learning proposals |
| POST | `/api/admin/quality/learning/proposals/generate` | platform-owner | Generate client learning proposals (AI) |
| POST | `/api/admin/quality/learning/proposals/:id/accept` | platform-owner | Accept learning proposal |
| POST | `/api/admin/quality/learning/proposals/:id/reject` | platform-owner | Reject learning proposal |
| GET | `/api/admin/quality/ingestion/status` | platform-owner | Quality ingestion pipeline status |
| POST | `/api/admin/quality/ingestion/backfill` | platform-owner | Backfill quality ingestion records |
| POST | `/api/billing/webhook` | stripe-signature | Stripe subscription events |
| POST | `/api/notifications/webhook` | x-webhook-secret | Internal notification email dispatcher |
| POST | `/api/analytics/events` | session+workspace | Record client beta analytics event |
| GET | `/api/feedback/analytics/funnel` | platform-owner | Beta funnel analytics summary |
| GET | `/api/feedback/analytics/credit-signals` | platform-owner | Owner credit-surprise signal summary |
| GET | `/api/feedback/analytics/export.csv` | platform-owner | CSV export of funnel + raw events |
| GET, POST | `/api/feedback/beta-sessions` | platform-owner | List / start beta operator sessions |
| GET, PATCH | `/api/feedback/beta-sessions/:id` | platform-owner | Get / end beta session |
| GET | `/api/feedback/beta-sessions/:id/summary` | platform-owner | Aggregated beta session summary |
| PATCH | `/api/feedback/beta-sessions/:id/notes` | platform-owner | Merge runbook stage operator notes |
| GET | `/api/feedback/mission-credit-signals` | platform-owner | Mission-level credit signal rollup |
| GET | `/api/feedback/quality-trend` | calibration-access | Human-quality trend report |
| GET | `/api/feedback/quality-improvement` | calibration-access | Quality improvement recommendations |
| GET | `/api/feedback/score-calibration` | calibration-access | Score calibration analysis |
| GET | `/api/feedback/sample-coverage` | calibration-access | Corpus sample coverage report |
| GET | `/api/feedback/learning-impact` | calibration-access | Learning impact metrics |
| GET | `/api/feedback/global-corpus-evidence` | platform-owner | Global corpus evidence summary |
| GET, POST | `/api/feedback/human-quality-corpus` | platform-owner | Human-quality corpus queue |
| GET | `/api/feedback/human-quality-corpus/candidates` | platform-owner | Corpus promotion candidates |
| POST | `/api/feedback/human-quality-corpus/candidates/:id/promote` | platform-owner | Promote candidate into corpus |
| POST | `/api/feedback/human-quality-corpus/:id/evaluation` | platform-owner | Submit corpus item evaluation |
| PATCH | `/api/feedback/calibration-adjustments/:id/accept` | calibration-access | Accept score calibration adjustment |
| GET, POST | `/api/feedback/reports` | platform-owner (GET) / session+workspace (POST) | List / submit user feedback |
| GET, PATCH | `/api/feedback/reports/:id` | platform-owner | Feedback detail + triage (`?workspaceId=`) |
| GET, POST | `/api/campaigns` | session+workspace | List / create campaigns |
| GET, PATCH, DELETE | `/api/campaigns/:id` | session+workspace | Get / update / delete campaign |
| GET, POST, PATCH | `/api/campaigns/:id/plan` | session+workspace | Creative plan (AI generate / read / update) |
| POST, PATCH | `/api/campaigns/:id/diagnosis` | session+workspace | Creative diagnosis |
| POST | `/api/campaigns/:id/diagnosis/regenerate` | session+workspace | Regenerate diagnosis |
| POST | `/api/campaigns/:id/analyze` | session+workspace | Analyze campaign asset |
| POST | `/api/campaigns/:id/auto-briefing` | session+workspace | Auto-brief from image |
| POST | `/api/campaigns/:id/pilot` | session+workspace | Pilot briefing flow |
| POST | `/api/campaigns/:id/suggest-ctas` | session+workspace | CTA suggestions (AI) |
| GET | `/api/campaigns/:id/smart-resize-preview` | session+workspace | Smart resize preview |
| GET, POST | `/api/campaigns/:id/restyle` | session+workspace | Queue restyling derivation (POST) / list derivations with image URLs (GET) |
| GET, POST | `/api/campaigns/:id/performance` | session+workspace | List / record performance snapshots |
| POST | `/api/campaigns/:id/performance/import/preview` | session+workspace | Preview CSV or manual performance import |
| POST | `/api/campaigns/:id/performance/import/confirm` | session+workspace | Confirm performance import batch |
| GET | `/api/campaigns/:id/performance/import/batches` | session+workspace | List performance import batches |
| GET | `/api/campaigns/:id/performance/import/batches/:batchId` | session+workspace | Get performance import batch detail |
| GET, POST | `/api/campaigns/:id/learnings` | session+workspace | List / recompute campaign learnings |
| GET, POST | `/api/campaigns/:id/hypotheses` | session+workspace | List / create experiment hypotheses |
| PATCH, DELETE | `/api/campaigns/:id/hypotheses/:hypothesisId` | session+workspace | Update / delete hypothesis |
| POST | `/api/campaigns/:id/hypotheses/:hypothesisId/compare` | session+workspace | Run hypothesis comparison |
| GET, POST | `/api/campaigns/:id/comparisons` | session+workspace | List / run observational comparisons |
| GET | `/api/campaigns/:id/recommendation` | session+workspace | Next experiment recommendation |
| GET | `/api/campaigns/:id/output-recommendation` | session+workspace | Output-level experiment recommendation |
| GET, POST | `/api/campaigns/:id/derivations` | session+workspace | List / queue derivations |
| GET, POST | `/api/campaigns/:id/approval-package` | session+workspace | Client approval package + share link |
| GET | `/api/campaigns/:id/assets` | session+workspace | List campaign assets |
| POST | `/api/campaigns/:id/assets/presign` | session+workspace | R2 presigned upload URL |
| POST | `/api/campaigns/:id/assets/upload` | session+workspace | Direct asset upload |
| POST | `/api/campaigns/:id/assets/complete` | session+workspace | Finalize presigned upload |
| POST | `/api/campaigns/:id/assets/link` | session+workspace | Link external asset URL |
| GET, POST, PATCH | `/api/campaigns/:id/assets/:assetId/preflight` | session+workspace | Asset preflight check |
| GET, POST | `/api/campaigns/:id/competitors` | session+workspace | List / add competitors |
| PATCH, DELETE | `/api/campaigns/:id/competitors/:competitorId` | session+workspace | Update / remove competitor |
| POST | `/api/campaigns/:id/competitors/analyze` | session+workspace | Analyze competitor screenshots |
| POST | `/api/campaigns/:id/competitors/strategy` | session+workspace | Competitor strategy (AI) |
| GET, POST | `/api/derivations/:id/copy-variants` | session+workspace | Generate / list copy variants |
| PATCH | `/api/derivations/:id/copy-variants/:variantId` | session+workspace | Select copy variant |
| PATCH | `/api/derivations/:id/review` | session+workspace | Approve / reject derivation |
| POST | `/api/derivations/:id/regenerate` | session+workspace | Regenerate derivation output |
| POST | `/api/derivations/:id/qa` | session+workspace | Run creative QA |
| POST | `/api/derivations/:id/delivery-package` | session+workspace | Queue format-adaptation children from approved root |
| POST | `/api/derivations/:id/landing-page` | session+workspace | Landing page match generation |
| POST | `/api/derivations/:id/save-reference` | session+workspace | Save derivation to client library |
| GET, POST | `/api/creatives/:id/persona-simulation` | session+workspace | Persona simulation |
| GET, POST | `/api/client-profiles` | session+workspace | List / create client profiles |
| GET | `/api/client-profiles/:id/memory` | session+workspace | Brand memory for profile |
| GET, POST | `/api/client-profiles/:id/learnings` | session+workspace | Client profile learnings |
| GET, POST | `/api/client-profiles/:id/output-learnings` | session+workspace | Output learnings for profile |
| GET, POST | `/api/client-profiles/:id/references` | session+workspace | Reference library |
| GET, POST | `/api/templates` | session+workspace | Campaign templates |
| PATCH | `/api/templates/:id` | session+workspace | Update template |
| GET | `/api/dashboard` | session+workspace | Dashboard summary |
| GET | `/api/dashboard/stats` | session+workspace | Dashboard statistics |
| GET, PATCH, DELETE | `/api/notifications` | session+workspace | List / mark all read / clear |
| PATCH | `/api/notifications/:id/read` | session+workspace | Mark one notification read |
| POST | `/api/exports` | session+workspace | Export derivation(s) download URL |
| POST | `/api/export/zip` | session+workspace | ZIP export |
| POST | `/api/share` | session+workspace | Create share link for derivations |
| GET | `/api/share/:token/asset/:derivationId` | share-token | Redirect to signed derivation asset |
| POST | `/api/restyling` | session+workspace | Standalone restyling (multipart) |
| POST | `/api/quick-tools/restyling` | session+workspace | Quick restyling tool |
| GET | `/api/billing/status` | session+workspace | Subscription / credits status |
| GET | `/api/billing/history` | session+workspace | Billing history |
| POST | `/api/billing/checkout` | session+workspace | Stripe Checkout session URL |
| POST | `/api/billing/portal` | session+workspace | Stripe Customer Portal URL |
| POST | `/api/billing/beta/redeem` | session+workspace | Redeem beta access code |
| POST | `/api/user/locale` | session | Update locale |
| GET | `/api/user/export` | session+workspace | Export user data |
| DELETE | `/api/user/account` | session+workspace | Delete account (confirmation required) |
| GET, POST | `/api/user/onboarding` | session | Onboarding status / complete |
| POST | `/api/user/onboarding/restart` | session | Reset onboarding |
| GET, POST, DELETE | `/api/workspace/brand-kit` | session+workspace | Brand kit CRUD |
| POST | `/api/workspace/brand-kit/logo` | session+workspace | Upload logo |
| POST | `/api/workspace/brand-kit/extract` | session+workspace | Extract brand from URL/assets |
| GET, POST | `/api/workspace/assets` | session+workspace | List / upload workspace assets |
| GET, PATCH, DELETE | `/api/workspace/assets/:id` | session+workspace | Workspace asset CRUD |
| GET, POST, PATCH, DELETE | `/api/workspace/invites` | session+workspace / session | Manage invites; `PATCH` accepts invite (session) |
| POST | `/api/workspace/invites/accept` | session | Accept invite by token |
| GET, DELETE | `/api/workspace/members` | session+workspace | List / remove members (admin+) |
| GET | `/api/workspace/missions` | session+workspace | Workspace mission progress |
| POST | `/api/workspace/mission-insights` | session+workspace | Record mission insight moment |
| GET | `/api/workspace/progression` | session+workspace | Workspace progression state |
| GET | `/api/dev/reset-token` | none (e2e) | E2E password-reset token helper |

---

## Public and webhook endpoints

### `GET /api/health`

```json
{
  "ok": true,
  "service": "adscale-app",
  "timestamp": "2026-06-02T12:00:00.000Z",
  "brandMemory": { "enabled": false },
  "staticAssets": {
    "cwd": "/app",
    "staticExists": true,
    "publicExists": true,
    "chunkCount": 42,
    "logoExists": true
  }
}
```

### `GET /api/build-id`

Returns the deployment build identifier (first non-empty of `RENDER_GIT_COMMIT`, `VERCEL_GIT_COMMIT_SHA`, `BUILD_ID`, or `"development"`).

```json
{ "buildId": "abc123def456" }
```

### `OPTIONS`, `POST /api/waitlist`

Public marketing waitlist endpoint with CORS for origins listed in `MARKETING_ALLOWED_ORIGINS`. Uses the `auth` rate-limit bucket (10 requests / 60s).

**`POST` body** — `waitlistSignupSchema`:

```json
{
  "name": "string (2–100)",
  "email": "user@example.com",
  "sector": "agency | ecommerce | saas | infoproduct | retail | other",
  "sectorOther": "string (required when sector is other)",
  "whatsapp": "string (8–30)",
  "consent": true,
  "locale": "pt-BR | en (default pt-BR)",
  "website": ""
}
```

`website` is a honeypot — non-empty values return `{ "status": "created" }` with `201` without persisting.

| Status | Body |
|--------|------|
| 201 | `{ "status": "created" }` |
| 409 | `{ "status": "already_registered", "message": "..." }` |
| 400 | `{ "error": "invalidInput", "details": ... }` or `{ "error": "invalidInput", "code": "invalidWhatsapp" }` |
| 429 | `{ "error": "rateLimitExceeded" }` |

### `GET /api/share/:token/asset/:derivationId`

- No session required; validates share token and that `derivationId` is in the link's `derivationIds`.
- Success: `302` redirect to signed R2 download URL.
- Errors: `shareLinkNotFound` (404), `derivationNotInShareLink` (403), `derivationNotFound` (404).

### `GET /api/dev/reset-token`

E2E-only helper guarded by `E2E_DISABLE_RATE_LIMIT`. Returns `404` in normal runs.

Query: `?email=<address>`

```json
{
  "found": true,
  "token": "<reset-token>",
  "url": "<better-auth reset url>",
  "resetPageUrl": "<app>/reset-password?token=..."
}
```

### `POST /api/billing/webhook`

- Header: `stripe-signature`
- Body: raw Stripe event payload (not JSON-parsed before verify)
- Success: `{ "received": true, "result": ... }`

### `POST /api/notifications/webhook`

Header: `x-webhook-secret: <NOTIFICATION_WEBHOOK_SECRET>`

Discriminated union body:

```json
{
  "type": "derivation_complete",
  "userId": "<uuid>",
  "payload": {
    "campaignName": "string",
    "derivationCount": 3
  }
}
```

Other `type` values: `plan_ready`, `low_credits`, `trial_expiring` (see `webhookSchema` in `app/src/app/api/notifications/webhook/route.ts`).

Response: `{ "sent": true, "type" }` or `{ "sent": false, "reason": "notificationsDisabled" }`.

---

## Domain reference (request bodies)

### Analytics and beta feedback

**`POST /api/analytics/events`** — `createBetaEventBodySchema`:

```json
{
  "eventKey": "mission_completed",
  "sessionId": "<uuid>?",
  "campaignId": "<uuid>?",
  "derivationId": "<uuid>?",
  "properties": {}
}
```

`eventKey` must be snake_case (max 64 chars). Known keys include `readiness_blocked`, `readiness_completed`, `credit_spend`, `credit_blocked`, `mission_completed`, `cockpit_stage_entered`, `cockpit_stage_completed`, `cockpit_stage_abandoned`, `recipe_selected`, `recipe_tradeoff_viewed`. `sessionId` falls back to `getBetaSessionIdFromRequest` when omitted.

Response: `{ "event": { ... } }` with status `201`.

**Owner analytics query** (`GET /api/feedback/analytics/funnel`, `credit-signals`, `export.csv`):

| Query param | Description |
|-------------|-------------|
| `workspaceId` | Filter by workspace UUID |
| `sessionId` | Filter by beta session UUID |
| `from` | ISO datetime lower bound |
| `to` | ISO datetime upper bound |

Funnel response includes `filters`, `totals`, `missionFunnel`, `cockpitStageFunnel`, `creditSurprisesByOperation`, `sessionStageTimeline`.

**`GET /api/feedback/beta-sessions`** query: `workspaceId`, `activeOnly=true`.

**`POST /api/feedback/beta-sessions`**:

```json
{
  "workspaceId": "<uuid>",
  "cohortLabel": "string?",
  "assistanceLevel": "hands_on | observe_only"
}
```

**`PATCH /api/feedback/beta-sessions/:id`** — optional `{ "endedAt": "<iso8601>" }` (defaults to now).

**`PATCH /api/feedback/beta-sessions/:id/notes`**:

```json
{
  "stages": {
    "setup": { "notes": "...", "tags": [], "completedAt": "...", "blockerIds": [], "feedbackReportId": "<uuid>?" }
  }
}
```

Stage keys: `setup`, `readiness`, `guided_briefing`, `strategy_recipe`, `preview`, `batch`, `review`, `export`, `share`.

**`POST /api/feedback/reports`**:

```json
{
  "type": "bug | suggestion | question | other",
  "severity": "low | medium | high | critical",
  "category": "ui | generation | billing | performance | mission | other",
  "message": "string (1–4000)",
  "followUpAllowed": false,
  "route": "string?",
  "contextKind": "global | campaign | derivation",
  "campaignId": "<uuid>?",
  "derivationId": "<uuid>?",
  "assetRefs": [{ "kind": "campaign_asset | workspace_asset | derivation_output", "id": "<uuid>", "key": "string?" }],
  "diagnosticContext": {},
  "sentryCorrelation": {},
  "contextCompleteness": {}
}
```

**`GET /api/feedback/reports`** (owner) query: `workspaceId`, `status`, `type`, `severity`, `category`, `route`, `campaignId`, `from`, `to`, `limit`, `offset`.

**`PATCH /api/feedback/reports/:id`** — requires `?workspaceId=`:

```json
{
  "status": "new | reviewing | resolved | archived",
  "internalNotes": "string?",
  "resolutionSummary": "string?"
}
```

### Workspace progression

**`GET /api/workspace/missions`** — returns mission progress payload from `getWorkspaceMissions` (missions array with completion state).

**`GET /api/workspace/progression`** — returns workspace progression snapshot from `getWorkspaceProgression`.

**`POST /api/workspace/mission-insights`**:

```json
{
  "moment": "string",
  "missionKey": "string",
  "sentiment": "positive | neutral | negative?",
  "reason": "clear_value | expected_more | confusing | too_slow | quality_issue | cost_concern | not_ready | wrong_timing | other?",
  "optionalText": "string (max 500)?",
  "action": "submitted | dismissed | skipped",
  "route": "string?",
  "campaignId": "<uuid>?",
  "derivationId": "<uuid>?",
  "diagnosticContext": {}
}
```

Response: `{ "report": { ... } }` with status `201`.

### Campaigns

**`POST /api/campaigns`** — `createCampaignSchema`:

```json
{
  "name": "string (1-255)",
  "client": "string (required)",
  "product": "string?",
  "objective": "string?",
  "audience": "string?",
  "constraints": "string?",
  "notes": "string?",
  "generationMode": "art_variation | format_adaptation | restyling",
  "ctaVariants": ["string"] (max 3),
  "targetFormats": ["string"] (max 5),
  "creativeLevel": "conservative | balanced | bold | extreme (default balanced)",
  "styleIntensity": "soft | medium | strong?"
}
```

`format_adaptation` on **PATCH** requires `targetFormats` length 1–3.

**`GET /api/campaigns`** query: `q`, `status`, `platform`, `sort`, `page`, `limit`.

**`POST /api/campaigns/:id/derivations`** — optional JSON:

```json
{
  "preview": false,
  "styleAssetId": "<uuid>?"
}
```

Queues Inngest derivation jobs from campaign config; may return `derivationsInProgress`, `noCtasProvided`, `missingBaseAsset`, `invalidTargetFormats`.

**`GET /api/campaigns/:id/approval-package`** — returns `campaignId`, `availableRoots`, `selectedRootIds`, `package` snapshot, optional `shareUrl` / `expiresAt`.

**`POST /api/campaigns/:id/approval-package`**:

```json
{
  "derivationIds": ["<uuid>"] (1–50),
  "notes": "string (max 5000)?"
}
```

Creates or updates share link (7-day TTL). May return `invalidApprovalPackageSelection` (409) if roots are not package-eligible.

**`POST /api/campaigns/:id/restyle`** — JSON body (`restyleSchema`):

```json
{
  "styleAssetIds": ["<uuid>"],
  "styleIntensity": "soft | medium | strong"
}
```

Both fields optional. Requires a factual base asset and a distinct `style_reference` asset (explicit `styleAssetIds[0]` or auto-selected). Spends 5 credits (`image_derivation`). Response `201`: `{ "derivations": [{ ... }] }`. Sets campaign `generationMode` to `restyling`. Errors: `missingBaseAsset` (400), `assetNotFound` (404), `derivationsInProgress` (429), `failedQueueDerivations` (500).

**`GET /api/campaigns/:id/restyle`** — returns `{ derivations: [...] }` with presigned `imageUrl` per derivation. Fails stale `queued`/`processing` derivations older than 10 minutes before listing.

### Performance and learnings

**`GET /api/campaigns/:id/performance`** — returns `{ snapshots: [...] }`.

**`POST /api/campaigns/:id/performance`** — body validated by `canonicalPerformanceSnapshotInputSchema`; `campaignId` in body must match URL path. Errors include `performanceCampaignPathMismatch` (400) and domain codes from `PerformanceDomainError`.

**`POST /api/campaigns/:id/performance/import/preview`** — accepts `multipart/form-data` (CSV `file` + `columnMapping`) or JSON manual preview payload. May return `importFileTooLarge` (400).

**`POST /api/campaigns/:id/performance/import/confirm`** — confirms a previewed import batch.

**`GET /api/campaigns/:id/performance/import/batches`** — lists import batches; **`GET .../batches/:batchId`** returns batch detail.

**`GET /api/campaigns/:id/learnings`** — query: `q`, `platform`. **`POST`** triggers `recomputeLearningsForCampaign`.

**`GET /api/campaigns/:id/hypotheses`** — returns `{ hypotheses: [...] }`. **`POST`** body: `createHypothesisSchema`.

**`POST /api/campaigns/:id/comparisons`** — body: `observationalComparisonSchema` for observational A/B analysis.

**`GET /api/campaigns/:id/recommendation`** — next experiment recommendation from performance history.

### Derivations

**`PATCH /api/derivations/:id/review`**

```json
{ "status": "approved" | "rejected" }
```

Approval runs `assertDerivationApprovable`; may return `derivationHardFailures` with `details.hardFailures`.

**`POST /api/derivations/:id/delivery-package`**

```json
{ "formats": ["1080x1080", "1080x1920"] }
```

Source derivation must be `approved` with output. Queues `format_adaptation` children (5 credits per new format). Response:

```json
{
  "source": { "id": "<uuid>", "format": "..." },
  "readyFormats": [],
  "queued": [{ "id": "<uuid>", "format": "..." }],
  "failed": [],
  "skipped": []
}
```

**`POST /api/exports`**

```json
{
  "type": "individual" | "batch",
  "derivationId": "<uuid>?",
  "campaignId": "<uuid>?",
  "format": "png" | "jpeg" | "webp"
}
```

Response: `{ "downloadUrl": "...", "expiresAt": "<iso8601>" }` (5-minute TTL).

### Billing (v12.0)

All billing routes except the webhook require **session+workspace**.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/billing/status` | Subscription, access kind, credits, past-due / canceled recovery hints |
| GET | `/api/billing/history` | Credit grants, transactions, spend summary |
| POST | `/api/billing/checkout` | Create Stripe Checkout session |
| POST | `/api/billing/portal` | Create Stripe Customer Portal session |
| POST | `/api/billing/beta/redeem` | Redeem beta access code (`BETA_ACCESS_CODES`) |
| POST | `/api/billing/webhook` | Stripe subscription events (`stripe-signature`) |

**`planKey` values:** `starter`, `growth`, `scale` (monthly credit grants: 30 / 120 / 360).

**`POST /api/billing/checkout`**

```json
{
  "planKey": "starter | growth | scale",
  "returnPath": "/settings/billing?"
}
```

`returnPath` is optional; must start with `/`. Response: `{ "url": "<stripe checkout url>" }`. Errors: `invalidRequestBody` (400), `checkoutSessionFailed` (500).

**`POST /api/billing/portal`**

No body. Response: `{ "url": "<stripe portal url>" }`. Errors: `billingCustomerNotFound` (404), `portalSessionFailed` (500).

**`GET /api/billing/status`**

Response envelope:

```json
{
  "billing": {
    "hasCustomer": true,
    "subscriptionStatus": "active | past_due | canceled | ...",
    "access": {
      "kind": "subscription | beta | trial | ...",
      "label": "string",
      "remainingAds": 0,
      "hasSpendAccess": true,
      "beta": { "totalAds": 10, "remainingAds": 5, "exhausted": false }
    },
    "pastDue": { "recoveryAction": "portal", "spendPolicy": "..." },
    "canceled": { "recoveryAction": "checkout" },
    "subscription": {
      "status": "active",
      "rawStatus": "active",
      "planKey": "growth",
      "currentPeriodEnd": "2026-07-01T00:00:00.000Z",
      "cancelAtPeriodEnd": false
    },
    "creditBalance": 42
  }
}
```

`pastDue`, `canceled`, `subscription`, and `access.beta` are `null` when not applicable.

**`GET /api/billing/history`**

Query: `from`, `to` (ISO datetimes), `campaignId` (UUID).

Response: `{ grants, transactions, summary, campaigns }` where `summary` includes `totalSpent`, `remainingCredits`, `averagePerCampaign`, `transactionCount`.

**`POST /api/billing/beta/redeem`**

```json
{ "code": "string" }
```

Success (`200`):

```json
{
  "success": true,
  "entitlementId": "<uuid>",
  "grantId": "<uuid>",
  "billing": {
    "access": { "kind": "...", "label": "...", "remainingAds": 0 },
    "creditBalance": 0
  }
}
```

Beta redeem error codes (`400`): `invalid_code`, `already_redeemed`, `beta_unavailable` — body `{ "error": "<message>", "code": "<code>" }`.

### Workspace

**`POST /api/workspace/invites`**

```json
{
  "email": "user@example.com",
  "role": "member" | "admin"
}
```

Admin invites require `owner` role.

**`POST /api/workspace/invites/accept`** and **`PATCH /api/workspace/invites`**

```json
{ "token": "<invite token>" }
```

### Share

**`POST /api/share`**

```json
{
  "campaignId": "<uuid>",
  "derivationIds": ["<uuid>"] 
}
```

`derivationIds`: 1–50 items. Response: `{ "shareUrl", "expiresAt" }`.

### User

**`POST /api/user/locale`**

```json
{ "locale": "en" | "pt-BR" }
```

### Assets (presign)

**`POST /api/campaigns/:id/assets/presign`**

```json
{
  "filename": "hero.png",
  "contentType": "image/png",
  "contentLength": 1234567
}
```

Returns presigned upload URL and pending asset metadata (`PRESIGN_TTL_SECONDS` = 300).

---

## Related configuration

Environment variables for auth, Stripe, webhooks, platform owner emails, and Redis rate limiting are documented in [CONFIGURATION.md](./CONFIGURATION.md).

Better Auth route catalog: <!-- VERIFY: confirm deployed Better Auth version and available /api/auth/* paths against https://www.better-auth.com/docs/concepts/api-routes -->
