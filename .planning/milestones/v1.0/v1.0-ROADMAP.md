# Roadmap: ADScale

**Milestone:** v1.0 — Sair Do Mock → MVP Real
**Defined:** 2026-04-24
**Phases:** 5
**Requirements:** 32 mapped

---

## Phase 1: Foundation — Server Layer, Auth & Infra

**Goal:** Establish the real server layer: database schema, auth system, R2 storage, Inngest queue, and env validation. Strip business data from Zustand.

**Requirements:** AUTH-01, AUTH-02, AUTH-03, AUTH-04, WORK-01, WORK-02, SEC-02, SEC-03

**Success Criteria:**
1. `npm run build` passes with new server layer and no mock imports in runtime code
2. Better Auth signup/login/logout works end-to-end and creates a workspace on first signup
3. Drizzle schema is defined and migrations can run against Neon
4. R2 client can generate presigned URLs and upload/download objects
5. Inngest client is configured and can receive local events
6. Env validation throws clear errors if any required variable is missing or invalid
7. `useAppStore` contains only UI state (sidebar, title, toasts); no campaign/derivation data

---

## Phase 2: Campaigns, Upload & Dashboard

**Goal:** Build campaign CRUD, presigned upload flow, asset linking, and connect dashboard to real APIs.

**Requirements:** CAMP-01, CAMP-02, CAMP-03, UPLOAD-01, UPLOAD-02, UPLOAD-03, DASH-01, DASH-02

**Success Criteria:**
1. User can create a campaign with full brief and see it in the list
2. User can edit and delete campaigns; deletions cascade assets
3. User can upload an image via presigned URL; asset appears in campaign with correct metadata
4. Upload rejects wrong file types and files over 20MB with clear messages
5. Dashboard shows real campaign count and recent activity from API
6. All loading, error and empty states are real (no simulated delays)
7. All routes enforce workspace membership

---

## Phase 3: AI Plan & Derivation Jobs

**Goal:** Integrate OpenAI for creative plan generation and image derivation via Inngest jobs.

**Requirements:** PLAN-01, PLAN-02, PLAN-03, DERIV-01, DERIV-02, DERIV-03, DERIV-04, DERIV-05

**Success Criteria:**
1. Plan generation API returns valid structured JSON saved to DB; invalid JSON shows error
2. User can approve a plan; approval triggers derivation job creation
3. Derivation jobs emit Inngest events and progress through `queued → processing → completed`
4. Inngest handler downloads input from R2, calls OpenAI image model, stores output back to R2
5. UI polls and updates derivation status in real time
6. Failed derivations show clear error message and allow retry
7. Usage/credits are estimated and tracked (simple MVP tracking, no billing)

---

## Phase 4: Review, Regeneration & Export

**Goal:** Complete the creative workflow with review gallery, regeneration with feedback, and export pipeline.

**Requirements:** REVIEW-01, REVIEW-02, REVIEW-03, EXPORT-01, EXPORT-02, EXPORT-03

**Success Criteria:**
1. User can approve or reject derivations from the gallery; status persists
2. User can regenerate a derivation with feedback text linked to the previous one
3. Gallery shows preview and compare view for derivations
4. Individual export downloads the file in chosen format via signed URL
5. Export-all-approved generates a ZIP with correct filenames
6. Format conversion works when output format differs from stored format
7. Export respects workspace boundaries

---

## Phase 5: Hardening, Security & Tests

**Goal:** Lock down security, fill test coverage, and ensure the MVP passes all quality gates.

**Requirements:** SEC-01, TEST-01, TEST-02, TEST-03

**Success Criteria:**
1. Every API route validates workspace membership before any DB query
2. Unit tests cover env validation, Zod schemas, repositories (mocked), prompt parser, R2 key sanitization
3. Integration tests cover signup→workspace, campaign CRUD, upload flow, plan generation, derivation job, review/export with auth
4. `npm test` passes
5. `npm run lint` passes
6. `npm run build` passes
7. `npx @Codex-flow/cli@latest security scan` passes with no critical issues

---

## Summary

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 1 | Foundation | Server layer, auth, DB, R2, Inngest | 8 | 7 |
| 2 | Campaigns & Upload | CRUD, upload, dashboard | 8 | 7 |
| 3 | AI Plan & Derivation | OpenAI plan + image jobs | 8 | 7 |
| 4 | Review & Export | Gallery, regeneration, export | 7 | 7 |
| 5 | Hardening & Tests | Security, tests, quality gates | 3 | 7 |

**Total:** 5 phases | 32 requirements | All covered ✓

---
*Roadmap created: 2026-04-24*
*Last updated: 2026-04-24 after initial creation*
