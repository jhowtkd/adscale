# Requirements: ADScale

**Defined:** 2026-04-24
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## v1 Requirements

### Authentication

- [ ] **AUTH-01**: User can sign up with email and password via Better Auth
- [ ] **AUTH-02**: First signup automatically creates an initial workspace
- [ ] **AUTH-03**: User session persists across browser refresh
- [ ] **AUTH-04**: Dashboard, campaigns and settings require active session

### Workspace

- [ ] **WORK-01**: Workspace membership controls access to all data
- [ ] **WORK-02**: No workspace ID can access data from another workspace

### Campaigns

- [ ] **CAMP-01**: User can create a campaign with structured brief (name, client/product, objective, audience, platforms, tone, offer, constraints, notes)
- [ ] **CAMP-02**: User can list, view, update and delete campaigns
- [ ] **CAMP-03**: Campaign status lifecycle: `draft | active | generating | completed | failed`

### Upload & Assets

- [ ] **UPLOAD-01**: User can request a presigned URL and upload PNG/JPEG/WebP up to 20MB directly to R2
- [ ] **UPLOAD-02**: After upload, API confirms and saves asset with UUID key, type, size and dimensions
- [ ] **UPLOAD-03**: Asset is linked to a campaign and workspace

### AI Creative Plan

- [ ] **PLAN-01**: API builds prompt from brief + asset metadata and calls OpenAI text model
- [ ] **PLAN-02**: OpenAI returns structured JSON (strategy, angles, hooks, CTAs) validated by Zod before saving
- [ ] **PLAN-03**: User can view and approve/reject the generated plan

### Derivations

- [ ] **DERIV-01**: On plan approval, API creates N derivations with status `queued`, estimates/discounts credits, emits Inngest event per derivation
- [ ] **DERIV-02**: Inngest handler downloads input from R2, calls OpenAI image model, stores output back to R2, saves metadata in DB
- [ ] **DERIV-03**: Derivation status lifecycle: `queued | processing | completed | approved | rejected | failed`
- [ ] **DERIV-04**: UI polls via TanStack Query until derivation reaches final status
- [ ] **DERIV-05**: Failed derivations show clear error and allow retry

### Review

- [ ] **REVIEW-01**: User can approve or reject individual derivations
- [ ] **REVIEW-02**: User can regenerate a derivation with feedback linked to the previous one
- [ ] **REVIEW-03**: Derivations display in a gallery with preview and compare view

### Export

- [ ] **EXPORT-01**: User can export an individual derivation as PNG/JPEG/WebP via signed URL
- [ ] **EXPORT-02**: User can export all approved derivations as a ZIP generated with jszip
- [ ] **EXPORT-03**: Format conversion uses sharp when chosen format differs from stored format

### Dashboard

- [ ] **DASH-01**: Dashboard shows real campaign and usage metrics from API
- [ ] **DASH-02**: Loading/error/empty states replace simulated delays

### Security & Validation

- [ ] **SEC-01**: All API routes validate workspace membership before serving data
- [ ] **SEC-02**: Environment variables validated with Zod at startup
- [ ] **SEC-03**: API keys and secrets are server-side only

### Testing

- [ ] **TEST-01**: Unit tests for env validation, Zod schemas, repositories with mocks, prompt parser, R2 key sanitization
- [ ] **TEST-02**: Integration tests with mocks for signup→workspace, campaign CRUD, upload flow, plan generation, derivation job, review/export with auth
- [ ] **TEST-03**: `npm test`, `npm run lint`, `npm run build` and security scan pass

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Billing

- **BILL-01**: Real subscription billing with Stripe
- **BILL-02**: Credit purchase and usage tracking
- **BILL-03**: Plan limits and overage handling

### Integrations

- **INTG-01**: Direct Meta Ads export
- **INTG-02**: Direct TikTok Ads export
- **INTG-03**: Direct Google Ads export
- **INTG-04**: Slack notifications for job completion

### Admin

- **ADMN-01**: Admin panel for user management
- **ADMN-02**: API key management UI

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real billing/subscription processing | MVP uses simple usage/credits tracking only |
| Direct Meta/TikTok/Google Ads export | Stubbed for future milestone |
| Slack integration | Out of MVP |
| API key management UI | Out of MVP |
| OAuth login (Google/GitHub) | Email/password sufficient for v1 |
| Real-time notifications | Polling sufficient for MVP |
| Admin panel | Single workspace model for MVP |
| Mobile app | Web-first, mobile later |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |
| WORK-01 | Phase 1 | Pending |
| WORK-02 | Phase 1 | Pending |
| SEC-02 | Phase 1 | Pending |
| SEC-03 | Phase 1 | Pending |
| CAMP-01 | Phase 2 | Pending |
| CAMP-02 | Phase 2 | Pending |
| CAMP-03 | Phase 2 | Pending |
| UPLOAD-01 | Phase 2 | Pending |
| UPLOAD-02 | Phase 2 | Pending |
| UPLOAD-03 | Phase 2 | Pending |
| DASH-01 | Phase 2 | Pending |
| DASH-02 | Phase 2 | Pending |
| PLAN-01 | Phase 3 | Pending |
| PLAN-02 | Phase 3 | Pending |
| PLAN-03 | Phase 3 | Pending |
| DERIV-01 | Phase 3 | Pending |
| DERIV-02 | Phase 3 | Pending |
| DERIV-03 | Phase 3 | Pending |
| DERIV-04 | Phase 3 | Pending |
| DERIV-05 | Phase 3 | Pending |
| REVIEW-01 | Phase 4 | Pending |
| REVIEW-02 | Phase 4 | Pending |
| REVIEW-03 | Phase 4 | Pending |
| EXPORT-01 | Phase 4 | Pending |
| EXPORT-02 | Phase 4 | Pending |
| EXPORT-03 | Phase 4 | Pending |
| SEC-01 | Phase 5 | Pending |
| TEST-01 | Phase 5 | Pending |
| TEST-02 | Phase 5 | Pending |
| TEST-03 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-24*
*Last updated: 2026-04-24 after initial definition*
