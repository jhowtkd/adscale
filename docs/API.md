<!-- generated-by: gsd-doc-writer -->

# API Reference

Internal HTTP API for the ADScale Next.js application (`app/src/app/api`). Consumed by the web UI via same-origin `fetch` with session cookies (`credentials: "include"` in `apiFetch`). There is no public versioned external API.

| Property | Value |
|----------|--------|
| Base URL | Same origin as the deployed app (`APP_URL` / `BETTER_AUTH_URL`) |
| Format | JSON (except multipart uploads and Stripe webhook raw body) |
| Auth (default) | Better Auth session cookie + workspace scoping |
| Max upload | 50 MB per file; images: `image/png`, `image/jpeg`, `image/webp` |

Route handlers live under `app/src/app/api/**/route.ts` (67 route files).

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
| `GET`, `POST`, `PUT /api/inngest` | Inngest request signing (platform SDK) |
| `POST /api/billing/webhook` | `Stripe-Signature` header + `STRIPE_WEBHOOK_SECRET` |
| `POST /api/notifications/webhook` | `x-webhook-secret` must equal `NOTIFICATION_WEBHOOK_SECRET` |
| `GET`, `POST /api/auth/[...all]` | Better Auth flows |

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
- **Created:** Many `POST` handlers use status `201` with a resource key (e.g. `{ campaign }`, `{ invite }`).
- **Downloads:** Export and presign routes return time-limited URLs, e.g. `{ downloadUrl, expiresAt }` or presign fields from R2 helpers.

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
- Middleware rate limit — see [Rate limits](#rate-limits).
- Some legacy paths may return ad hoc keys; prefer the shape above for new handlers.

### Validation

Request bodies are validated with **Zod** where noted below. Failures typically use `invalidInput` or `invalidRequestBody` with `details` from `safeParse().error.flatten()`.

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
| 400 | `fileTooLarge` | File over 50 MB |
| 400 | `invalidFileType` | Disallowed MIME / magic bytes |
| 400 | `stripeSignatureMissing` / `stripeSignatureInvalid` | Billing webhook |
| 401 | `unauthorized` | No session (`requireWorkspaceAccess` / webhooks) |
| 403 | `noWorkspace` | Session without workspace |
| 403 | `forbidden` | Insufficient workspace role |
| 403 | `inviteEmailMismatch` | Invite accept email mismatch |
| 404 | `campaignNotFound`, `derivationNotFound`, `assetNotFound`, `planNotFound`, `clientProfileNotFound`, `inviteNotFound`, … | Resource missing or wrong workspace |
| 409 | `derivationsInProgress`, `derivationNotApproved`, `derivationHardFailures`, `sourceDerivationNotApproved`, … | Conflict / quality gate |
| 410 | `inviteExpired` | Invite token expired |
| 429 | `rateLimitExceeded` | Rate limit (handler or middleware) |
| 429 | `derivationsInProgress`, `diagnosisInProgress`, … | Domain concurrency limits |
| 500 | `internalError` | Unexpected error; `details.errorId` for support |
| 500 | `checkoutSessionFailed`, `failedQueueDerivations`, … | Domain failures |
| 502 | `aiEmptyResponse`, `aiInvalidJson`, `aiValidationFailed` | AI plan generation |
| 503 | `internalError` | Database connection failures |

In development, `500` responses may include `details.devError` with stack info.

---

## Rate limits

### Edge middleware (`app/middleware.ts`)

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

Dynamic segments use `:id` notation. Auth column: **none**, **session**, **session+workspace**, **better-auth**, **stripe-signature**, **x-webhook-secret**, **inngest-signing**.

| Method(s) | Path | Auth | Description |
|-----------|------|------|-------------|
| GET, POST | `/api/auth/[...all]` | better-auth | Sign-in, sign-up, OAuth, session, password reset |
| GET | `/api/health` | none | Liveness probe |
| GET, POST, PUT | `/api/inngest` | inngest-signing | Inngest job handler (derivation, trial, assets, brand memory) |
| POST | `/api/billing/webhook` | stripe-signature | Stripe subscription events |
| POST | `/api/notifications/webhook` | x-webhook-secret | Internal notification email dispatcher |
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
| GET, POST | `/api/campaigns/:id/restyle` | session+workspace | Campaign restyle job |
| GET, POST | `/api/campaigns/:id/derivations` | session+workspace | List / queue derivations |
| GET | `/api/campaigns/:id/assets` | session+workspace | List campaign assets |
| POST | `/api/campaigns/:id/assets/presign` | session+workspace | R2 presigned upload URL |
| POST | `/api/campaigns/:id/assets/upload` | session+workspace | Direct asset upload |
| POST | `/api/campaigns/:id/assets/complete` | session+workspace | Finalize presigned upload |
| POST | `/api/campaigns/:id/assets/link` | session+workspace | Link external asset URL |
| GET, POST | `/api/campaigns/:id/assets/:assetId/preflight` | session+workspace | Asset preflight check |
| GET, POST | `/api/campaigns/:id/competitors` | session+workspace | List / add competitors |
| PATCH, DELETE | `/api/campaigns/:id/competitors/:competitorId` | session+workspace | Update / remove competitor |
| POST | `/api/campaigns/:id/competitors/analyze` | session+workspace | Analyze competitor screenshots |
| POST | `/api/campaigns/:id/competitors/strategy` | session+workspace | Competitor strategy (AI) |
| GET, POST | `/api/derivations/:id/copy-variants` | session+workspace | Generate / list copy variants |
| PATCH | `/api/derivations/:id/copy-variants/:variantId` | session+workspace | Select copy variant |
| PATCH | `/api/derivations/:id/review` | session+workspace | Approve / reject derivation |
| POST | `/api/derivations/:id/regenerate` | session+workspace | Regenerate derivation output |
| POST | `/api/derivations/:id/qa` | session+workspace | Run creative QA |
| POST | `/api/derivations/:id/delivery-package` | session+workspace | Build delivery package |
| POST | `/api/derivations/:id/landing-page` | session+workspace | Landing page match generation |
| POST | `/api/derivations/:id/save-reference` | session+workspace | Save derivation to client library |
| GET, POST | `/api/creatives/:id/persona-simulation` | session+workspace | Persona simulation |
| GET, POST | `/api/client-profiles` | session+workspace | List / create client profiles |
| GET | `/api/client-profiles/:id/memory` | session+workspace | Brand memory for profile |
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
| POST | `/api/restyling` | session+workspace | Standalone restyling (multipart) |
| POST | `/api/quick-tools/restyling` | session+workspace | Quick restyling tool |
| GET | `/api/billing/status` | session+workspace | Subscription / credits status |
| GET | `/api/billing/history` | session+workspace | Billing history |
| POST | `/api/billing/checkout` | session+workspace | Stripe Checkout session URL |
| POST | `/api/billing/portal` | session+workspace | Stripe Customer Portal URL |
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

---

## Public and webhook endpoints

### `GET /api/health`

```json
{
  "ok": true,
  "service": "adscale-app",
  "timestamp": "2026-06-02T12:00:00.000Z"
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

### Derivations

**`PATCH /api/derivations/:id/review`**

```json
{ "status": "approved" | "rejected" }
```

Approval runs `assertDerivationApprovable`; may return `derivationHardFailures` with `details.hardFailures`.

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

### Billing

**`POST /api/billing/checkout`**

```json
{ "planKey": "<billingPlanKeys enum>" }
```

Response: `{ "url": "<stripe checkout url>" }`.

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

Environment variables for auth, Stripe, webhooks, and Redis rate limiting are documented in [CONFIGURATION.md](./CONFIGURATION.md).

Better Auth route catalog: <!-- VERIFY: confirm deployed Better Auth version and available /api/auth/* paths against https://www.better-auth.com/docs/concepts/api-routes -->
