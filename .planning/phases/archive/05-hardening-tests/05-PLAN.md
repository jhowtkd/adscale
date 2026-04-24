# Plan: Phase 5 — Hardening, Security & Tests

## Overview
Lock down security, fill test coverage, and ensure the MVP passes all quality gates.

## Requirements Covered
SEC-01, TEST-01, TEST-02, TEST-03

## Tasks

### T1: Workspace Auth Enforcement
- Audit all API routes
- Ensure workspace membership validated before any DB query
- Add `verifyMembership` middleware to all protected routes

### T2: Test Configuration
- Create `app/config/vitest.config.ts`
- Setup test environment with jsdom

### T3: Unit Tests
Create tests in `app/tests/unit/`:
- `env-validation.test.ts`
- `schemas.test.ts`
- `repositories/campaign.test.ts` (mocked db)
- `repositories/asset.test.ts`
- `prompt-parser.test.ts`
- `r2-key-sanitization.test.ts`

### T4: Integration Tests
Create tests in `app/tests/integration/`:
- `signup-workspace.test.ts`
- `campaign-crud.test.ts`
- `upload-flow.test.ts`
- `plan-generation.test.ts`
- `derivation-job.test.ts`
- `review-export.test.ts`
- Mock R2, OpenAI, Inngest

### T5: Quality Gates
- Ensure `npm test` passes
- Ensure `npm run lint` passes
- Ensure `npm run build` passes
- Run `npx @Codex-flow/cli@latest security scan`

### T6: Security Review
- Check for hardcoded secrets
- Verify env vars are server-side only
- Review input validation

## Verification
- [ ] All API routes validate workspace membership
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] `npm test` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] Security scan passes
