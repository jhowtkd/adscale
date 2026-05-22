# API Documentation

## Overview

The ADScale API is a Next.js App Router API built on standard HTTP route handlers. It is consumed by the Next.js frontend and does not expose a public, versioned HTTP API for external callers.

| Property         | Value                           |
|------------------|---------------------------------|
| Base URL         | Same as the deployed app origin |
| Versioning       | None (internal API)             |
| Data format      | JSON                            |
| Authentication   | Session cookie (Better Auth)    |
| File upload max  | 50 MB per file                  |
| Allowed image types | `image/png`, `image/jpeg`, `image/webp` |

---

## Authentication

All endpoints (except `GET /api/health`, `POST /api/billing/webhook`, and `GET|POST|PUT /api/inngest`) require an authenticated session.

### Mechanism

- **Better Auth** handles registration, login, OAuth, and session management via `POST /api/auth/[...all]`.
- Session state is stored in an HTTP-only secure cookie.
- Most authenticated endpoints call `requireWorkspaceAccess(request)`, which:
  1. Validates the session from request headers.
  2. Resolves the user's workspace.
  3. Returns `{ user, workspace }` or throws `Unauthorized` / `No workspace`.

### Authenticated request pattern

```http
GET /api/campaigns HTTP/1.1
Host: <app-origin>
Cookie: <session-cookie>
```

---

## Error Handling

All errors are returned as JSON with a consistent shape.

### Error response schema

```json
{
  "error": "Human-readable translated message",
  "code": "machineErrorCode",
  "details": { ... }
}
```

### Common error codes

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | `invalidRequestBody` | JSON body malformed or failed Zod validation. |
| 400 | `invalidInput` | Business validation failed (e.g. missing required field). |
| 400 | `fileTooLarge` | Uploaded file exceeds 50 MB. |
| 400 | `invalidFileType` | File is not PNG, JPEG, or WebP. |
| 401 | `unauthorized` | No valid session. |
| 403 | `noWorkspace` | Authenticated user has no workspace. |
| 404 | `campaignNotFound` | Campaign does not exist or does not belong to the workspace. |
| 404 | `derivationNotFound` | Derivation does not exist in the workspace. |
| 404 | `planNotFound` | Plan does not exist for the campaign. |
| 404 | `clientProfileNotFound` | Client profile not found in the workspace. |
| 404 | `billingCustomerNotFound` | No Stripe customer for this workspace. |
| 409 | `derivationNotApproved` | Action requires an approved derivation. |
| 429 | `derivationsInProgress` | Campaign already has queued/processing derivations. |
| 429 | `diagnosisInProgress` | Creative diagnosis is already running. |
| 429 | `landingPageGenerationInProgress` | Landing page already queued. |
| 502 | `briefingDoctorFailed` | AI assistant returned empty or invalid response. |
| 503 | `generationWorkerUnavailable` | Inngest event could not be sent. |
| 500 | `internalError` | Unexpected server error (includes `errorId` for support). |

### Internal errors (500)

In production, internal errors expose only:

```json
{
  "error": "Internal server error",
  "code": "internalError",
  "details": { "errorId": "<uuid>" }
}
```

In development, `details.devError` includes the serialized stack trace.

---

## Endpoints

### Health

#### `GET /api/health`

Public health check.

**Response**

```json
{
  "ok": true,
  "service": "adscale-app",
  "timestamp": "2026-05-22T14:13:06.215Z"
}
```

---

### Auth

#### `GET|POST /api/auth/[...all]`

Proxied to Better Auth. Handles registration, login, OAuth callbacks, session refresh, password reset, etc.

See [Better Auth API routes](https://www.better-auth.com/docs/concepts/api-routes) for the full set of available paths.

---

### User

#### `POST /api/user/locale`

Updates the authenticated user's locale preference and sets the `locale` cookie.

**Request body**

```json
{
  "locale": "pt-BR"
}
```

**Response**

```json
{
  "success": true,
  "locale": "pt-BR"
}
```

---

### Dashboard

#### `GET /api/dashboard`

Returns workspace-level dashboard metrics.

**Response**

```json
{
  "campaignCount": 12,
  "recentActivity": [
    {
      "id": "<uuid>",
      "type": "campaign",
      "message": "Campaign \"Summer Sale\" created",
      "timestamp": "2026-05-22T14:00:00.000Z"
    }
  ]
}
```

---

### Campaigns

#### `GET /api/campaigns`

List campaigns with filtering, sorting, and pagination.

**Query parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | — | Search by name |
| `status` | `all\|draft\|active\|generating\|completed\|failed` | `all` | Status filter |
| `platform` | `all\|Meta\|TikTok\|Google` | `all` | Platform filter |
| `sort` | `newest\|oldest\|name-asc\|name-desc\|variations` | `newest` | Sort order |
| `page` | integer | `1` | Page number |
| `limit` | integer | `10` | Items per page |

**Response**

Paginated campaign list (shape depends on repository implementation).

---

#### `POST /api/campaigns`

Create a new campaign.

**Request body**

```json
{
  "name": "Summer Sale",
  "client": "Acme",
  "product": "Sneakers",
  "objective": "Increase conversions",
  "audience": "18-34 urban",
  "platforms": ["Meta"],
  "tone": "Playful",
  "offer": "20% off",
  "constraints": "No neon colors",
  "notes": "Hero image on beach",
  "generationMode": "art_variation",
  "creativeLevel": "balanced",
  "ctaVariants": ["Shop Now", "Get 20% Off"],
  "targetFormats": ["1:1"],
  "styleIntensity": "medium",
  "clientProfileId": null,
  "selectedReferenceIds": []
}
```

> **Validation rule:** `format_adaptation` mode requires exactly one `targetFormats` entry.

**Response**

```json
{
  "campaign": { "id": "<uuid>", ... }
}
```

Status: `201 Created`

---

#### `GET /api/campaigns/:id`

Get a single campaign.

**Response**

```json
{
  "campaign": { "id": "<uuid>", ... }
}
```

---

#### `PATCH /api/campaigns/:id`

Update campaign fields. Same body schema as creation (all fields optional).

**Response**

```json
{
  "campaign": { "id": "<uuid>", ... }
}
```

---

#### `DELETE /api/campaigns/:id`

Delete a campaign and best-effort cleanup of associated R2 assets and derivation outputs.

**Response**

```json
{
  "success": true
}
```

---

#### `GET /api/campaigns/:id/plan`

Get the creative plan for a campaign.

**Response**

```json
{
  "plan": {
    "id": "<uuid>",
    "strategy": "...",
    "angles": ["..."],
    "hooks": ["..."],
    "ctas": ["..."]
  }
}
```

---

#### `POST /api/campaigns/:id/plan`

Generate a creative plan via OpenAI. If a plan already exists, returns the cached copy.

**Response**

```json
{
  "plan": { "id": "<uuid>", ... }
}
```

Status: `201 Created` (or `200` with `cached: true` when cached).

---

#### `PATCH /api/campaigns/:id/plan`

Approve or reject the plan.

**Request body**

```json
{
  "status": "approved"
}
```

Allowed values: `approved`, `rejected`.

---

#### `GET /api/campaigns/:id/derivations`

List derivations for a campaign. Automatically marks stale active derivations (older than 10 minutes) as failed and refreshes campaign status.

**Response**

```json
{
  "derivations": [
    {
      "id": "<uuid>",
      "status": "completed",
      "outputKey": "campaigns/...",
      "imageUrl": "<presigned-url>",
      ...
    }
  ]
}
```

---

#### `POST /api/campaigns/:id/derivations`

Queue derivations for generation.

**Request body (optional)**

```json
{
  "preview": true
}
```

When `preview: true`, only one derivation is created and existing preview derivations are replaced.

**Validation / Rate limiting**
- Returns `429` if queued/processing derivations already exist for this campaign.
- `art_variation` mode requires at least one non-empty CTA variant and a base asset.
- `format_adaptation` mode requires exactly one `targetFormat`.

**Response**

```json
{
  "derivations": [
    { "id": "<uuid>", "status": "queued", ... }
  ]
}
```

Status: `201 Created`

---

#### `GET /api/campaigns/:id/assets`

List campaign assets with presigned download URLs.

**Response**

```json
{
  "assets": [
    {
      "id": "<uuid>",
      "key": "campaigns/<uuid>/...",
      "type": "image/png",
      "size": 123456,
      "url": "<presigned-url>"
    }
  ]
}
```

---

#### `POST /api/campaigns/:id/assets/presign`

Request a presigned upload URL for direct-to-R2 upload.

**Request body**

```json
{
  "filename": "hero.png",
  "contentType": "image/png",
  "contentLength": 123456
}
```

**Response**

```json
{
  "url": "<presigned-upload-url>",
  "key": "campaigns/<uuid>/<uuid>-hero.png",
  "expiresAt": "2026-05-22T14:18:00.000Z"
}
```

---

#### `POST /api/campaigns/:id/assets/upload`

Server-side asset upload via multipart/form-data.

**Form fields**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | Image file |
| `width` | number | No | Image width in pixels |
| `height` | number | No | Image height in pixels |

**Response**

```json
{
  "asset": { "id": "<uuid>", "key": "...", ... }
}
```

Status: `201 Created`

---

#### `POST /api/campaigns/:id/assets/complete`

Complete a presigned upload by registering the asset in the database after verifying it exists in R2.

**Request body**

```json
{
  "key": "campaigns/<uuid>/<uuid>-hero.png",
  "type": "image/png",
  "size": 123456,
  "width": 1024,
  "height": 1024
}
```

**Response**

```json
{
  "asset": { "id": "<uuid>", ... }
}
```

Status: `201 Created`

---

#### `POST /api/campaigns/:id/diagnosis`

Run or retrieve cached AI creative diagnosis for the campaign's base asset.

- Only available for `art_variation` campaigns.
- Returns cached result if `creativeDiagnosisStatus` is `ready`.
- Returns `429` if diagnosis is already in progress.

**Response**

```json
{
  "diagnosis": {
    "detectedConcept": "...",
    "elementsToPreserve": ["..."],
    "variationOpportunities": ["..."]
  },
  "source": "ai"
}
```

---

#### `PATCH /api/campaigns/:id/diagnosis`

Manually update the creative diagnosis.

**Request body**

```json
{
  "diagnosis": {
    "detectedConcept": "...",
    "elementsToPreserve": ["..."],
    "variationOpportunities": ["..."]
  }
}
```

---

#### `POST /api/campaigns/:id/diagnosis/regenerate`

Force regeneration of the creative diagnosis (bypasses cache).

**Response**: same as `POST /api/campaigns/:id/diagnosis`.

---

### Derivations

#### `PATCH /api/derivations/:id/review`

Approve or reject a derivation.

**Request body**

```json
{
  "status": "approved"
}
```

**Response**

```json
{
  "derivation": { "id": "<uuid>", "status": "approved", ... }
}
```

---

#### `POST /api/derivations/:id/regenerate`

Create a child derivation with optional feedback for regeneration.

**Request body**

```json
{
  "feedback": "Make the background darker"
}
```

**Validation**
- Returns `429` if the derivation already has active child regenerations.

**Response**

```json
{
  "derivation": { "id": "<uuid>", "status": "queued", ... }
}
```

Status: `201 Created`

---

#### `POST /api/derivations/:id/delivery-package`

Generate format-adapted child derivations (delivery package) from an approved derivation.

**Request body**

```json
{
  "formats": ["1:1", "4:5", "9:16"]
}
```

**Validation**
- Source derivation must be approved and have an `outputKey`.
- Already active children for the requested formats are skipped.

**Response**

```json
{
  "source": { "id": "<uuid>", "format": "1:1" },
  "readyFormats": ["1:1"],
  "queued": [{ "id": "<uuid>", "format": "4:5" }],
  "failed": [],
  "skipped": ["9:16"]
}
```

---

#### `POST /api/derivations/:id/qa`

Run creative QA analysis on an approved derivation. Returns cached result if already analyzed.

**Response**

```json
{
  "qa": {
    "status": "pass",
    "checklist": [...],
    "issues": [],
    "suggestions": []
  },
  "derivation": { ... }
}
```

---

#### `POST /api/derivations/:id/landing-page`

Generate a landing page HTML from an approved derivation.

- Returns cached completed page if available.
- Returns `429` if generation is already in progress.

**Response**

```json
{
  "landingPage": {
    "id": "<uuid>",
    "status": "completed",
    "title": "...",
    "htmlKey": "landing-pages/..."
  },
  "downloadUrl": "<presigned-url>",
  "expiresAt": "2026-05-22T14:18:00.000Z"
}
```

---

#### `POST /api/derivations/:id/save-reference`

Save an approved derivation's output as a client profile reference asset.

**Request body**

```json
{
  "clientProfileId": "<uuid>",
  "label": "Approved hero style",
  "kind": "style",
  "notes": "Used in summer campaign"
}
```

Allowed `kind` values: `style`, `product`, `layout`, `logo`, `negative`, `other`.

**Response**

```json
{
  "reference": { "id": "<uuid>", ... }
}
```

Status: `201 Created`

---

### Client Profiles

#### `GET /api/client-profiles`

List client profiles for the workspace.

**Response**

```json
{
  "profiles": [
    { "id": "<uuid>", "name": "Acme", ... }
  ]
}
```

---

#### `POST /api/client-profiles`

Create a client profile.

**Request body**

```json
{
  "name": "Acme",
  "description": "Enterprise SaaS client",
  "visualNotes": "Clean, minimal",
  "toneNotes": "Professional",
  "constraints": "No stock photography"
}
```

**Response**

```json
{
  "profile": { "id": "<uuid>", ... }
}
```

Status: `201 Created`

---

#### `GET /api/client-profiles/:id/references`

List reference assets for a client profile.

**Response**

```json
{
  "references": [
    { "id": "<uuid>", "label": "Logo", "kind": "logo", ... }
  ]
}
```

---

#### `POST /api/client-profiles/:id/references`

Add a reference asset to a client profile.

**Request body**

```json
{
  "assetKey": "campaigns/<uuid>/...",
  "label": "Hero reference",
  "kind": "style",
  "notes": "Beach theme"
}
```

**Validation**
- The `assetKey` must belong to the current workspace.

**Response**

```json
{
  "reference": { "id": "<uuid>", ... }
}
```

Status: `201 Created`

---

### Templates

#### `GET /api/templates`

List templates for the workspace.

**Response**

```json
{
  "templates": [
    { "id": "<uuid>", "name": "Summer Sale", ... }
  ]
}
```

---

#### `POST /api/templates`

Create a template from a campaign.

**Request body**

```json
{
  "campaignId": "<uuid>",
  "name": "Summer Sale Template",
  "description": "Reusable summer layout"
}
```

**Response**

```json
{
  "template": { "id": "<uuid>", ... }
}
```

Status: `201 Created`

---

#### `GET /api/templates/:id`

Get a single template.

**Response**

```json
{
  "template": { "id": "<uuid>", ... }
}
```

---

#### `DELETE /api/templates/:id`

Delete a template.

**Response**

```json
{
  "success": true
}
```

---

### Restyling

#### `POST /api/restyling`

Standalone restyling endpoint. Creates a campaign, uploads base and style images, and queues a single restyling derivation.

**Request body** (`multipart/form-data`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Campaign name |
| `client` | string | No | Client name |
| `offer` | string | No | Offer text |
| `ctaText` | string | No | CTA text |
| `styleIntensity` | string | Yes | `soft`, `medium`, or `strong` |
| `baseImage` | File | Yes | Base image |
| `styleImage` | File | Yes | Style reference image |

**Response**

```json
{
  "campaignId": "<uuid>",
  "derivationId": "<uuid>",
  "redirectUrl": "/campaigns/<uuid>"
}
```

Status: `201 Created`

---

### Quick Tools

#### `POST /api/quick-tools/restyling`

Identical to `POST /api/restyling`. Provides a restyling shortcut under the quick-tools namespace.

---

### Briefing Doctor

#### `POST /api/briefing-doctor/analyze`

Analyze a campaign briefing using OpenAI and return structured feedback.

**Request body**

```json
{
  "briefing": {
    "name": "Summer Sale",
    "client": "Acme",
    "objective": "Boost Q3 revenue",
    "audience": "18-34 urban",
    "platforms": ["Meta", "TikTok"],
    "tone": "Playful",
    "offer": "20% off",
    "constraints": "No neon colors",
    "notes": "Beach setting",
    "generationMode": "art_variation",
    "creativeLevel": "balanced",
    "targetFormat": "1:1",
    "ctaVariants": ["Shop Now"]
  }
}
```

**Response**

```json
{
  "analysis": {
    "overallScore": 85,
    "readiness": "ready",
    "issues": [],
    "suggestions": [],
    "improvedBrief": {},
    "fieldPatches": []
  }
}
```

---

### Exports

#### `POST /api/exports`

Export approved derivations as images.

**Request body**

```json
{
  "type": "individual",
  "derivationId": "<uuid>",
  "campaignId": "<uuid>",
  "format": "png"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `individual` \| `batch` | Yes | Export mode |
| `derivationId` | string | If `individual` | Derivation to export |
| `campaignId` | string | If `batch` | Campaign to export all approved derivations |
| `format` | `png` \| `jpeg` \| `webp` | Yes | Output image format |

**Response**

```json
{
  "downloadUrl": "<presigned-url>",
  "expiresAt": "2026-05-22T14:18:00.000Z"
}
```

The download URL expires in **5 minutes**.

---

### Billing

#### `GET /api/billing/status`

Get billing status for the workspace.

**Response**

```json
{
  "billing": {
    "hasCustomer": true,
    "subscription": {
      "status": "active",
      "planKey": "pro",
      "currentPeriodEnd": "2026-06-22T00:00:00.000Z",
      "cancelAtPeriodEnd": false
    },
    "creditBalance": 150
  }
}
```

---

#### `POST /api/billing/checkout`

Create a Stripe Checkout session for a plan upgrade.

**Request body**

```json
{
  "planKey": "pro"
}
```

**Response**

```json
{
  "url": "https://checkout.stripe.com/..."
}
```

---

#### `POST /api/billing/portal`

Create a Stripe Customer Portal session.

**Response**

```json
{
  "url": "https://billing.stripe.com/..."
}
```

---

#### `POST /api/billing/webhook`

Stripe webhook receiver. Public endpoint.

**Headers**

| Header | Value |
|--------|-------|
| `Stripe-Signature` | Stripe event signature |

**Body**: Raw Stripe event payload (do not parse as JSON before verification).

**Response**

```json
{
  "received": true,
  "result": "..."
}
```

**Security**
- Signature is verified using `STRIPE_WEBHOOK_SECRET`.
- Invalid or missing signatures return `400`.

---

### Inngest

#### `GET|POST|PUT /api/inngest`

Inngest event receiver and sync endpoint. Public endpoint used by the Inngest platform.

**Response**

Inngest SDK-formatted handshake / event acknowledgment.

---

## Rate Limiting

The API implements domain-specific concurrency limits rather than global rate limits:

| Endpoint | Limit | Behavior |
|----------|-------|----------|
| `POST /api/campaigns/:id/derivations` | 1 concurrent batch | Returns `429` if queued/processing derivations exist. |
| `POST /api/campaigns/:id/diagnosis` | 1 concurrent analysis | Returns `429` if `creativeDiagnosisStatus === "analyzing"`. |
| `POST /api/campaigns/:id/diagnosis/regenerate` | Same as above | Same behavior. |
| `POST /api/derivations/:id/landing-page` | 1 concurrent generation | Returns `429` if a landing page is already queued. |
| `POST /api/derivations/:id/regenerate` | 1 concurrent regeneration | Returns `429` if active child derivations exist. |

---

## Webhooks

### Stripe (`POST /api/billing/webhook`)

Receives Stripe events (`checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, etc.). Events are verified, then passed to `processStripeEvent` for subscription and credit grant reconciliation.

### Inngest (`GET|POST|PUT /api/inngest`)

Receives event triggers from the Inngest platform and serves the function registration handshake. The `derivation.generate` event is handled by `derivationJob` to process image generation jobs asynchronously.

---

## Request / Response Patterns

### JSON POST/PATCH

1. Parse and validate body with Zod.
2. On validation failure, return `400` with `code: "invalidRequestBody"` and `details` containing field errors.
3. On success, return the resource with `201` for creation or `200` for updates.

### File Upload

- Direct server upload: `multipart/form-data` to `POST .../assets/upload`.
- Presigned upload: request a presigned URL via `POST .../assets/presign`, upload directly to R2, then confirm via `POST .../assets/complete`.
- Max file size: **50 MB**.
- Allowed types: **PNG, JPEG, WebP**.

### Credit Spending

Most generative endpoints (`plan`, `derivations`, `restyling`, `regeneration`, `delivery-package`, `landing-page`) call `spendCreditsOrApiError` before proceeding. If the workspace has insufficient credits, an error response is returned immediately.
