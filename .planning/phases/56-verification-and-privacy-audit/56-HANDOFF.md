# v11.4 Beta Feedback — Verification & Handoff

**Date:** 2026-06-05

## What was captured

| Field | Source | Notes |
|-------|--------|-------|
| Route + query | Client diagnostic collector | From pathname/searchParams |
| Locale | `next-intl` | User locale |
| Browser basics | `navigator` | UA, language, viewport, online |
| App build | `NEXT_PUBLIC_APP_VERSION` | Falls back to `unknown` |
| Workspace / user | Server session | On create API |
| Campaign / derivation IDs | Contextual triggers | Validated server-side |
| Asset refs | Derivation review, future expansion | Signed URLs for owner only |
| Breadcrumbs | In-memory ring buffer (20) | Navigation events |
| Sentry trace | `getPropagationContext().traceId` | When DSN configured |

## Intentionally excluded

- Auth tokens, cookies, passwords, API keys, full prompts
- Raw request bodies and unconstrained console/network dumps
- Screenshots and session replay (disabled; noted in modal copy)
- Copying binary assets into feedback storage (references + signed links only)
- Beta users browsing their submitted reports (owner-only triage)

## How to analyze a beta report

1. Open `/feedback` as a platform owner (`PLATFORM_OWNER_EMAILS` or `DEV_ADMIN_EMAIL`).
2. Filter by status/severity; open a report.
3. Check completeness chips (page, logs, campaign, derivation, assets, sentry).
4. Follow signed asset links and note `campaignId` / `derivationId`.
5. Use `traceId` from `sentryCorrelation` to find related Sentry events.
6. Update status + internal notes; keep resolution summary for future reference.

## Automated coverage

- Sanitization unit tests (`sanitize.test.ts`)
- Repository unit tests (`feedback.test.ts`)
- Create API route tests (`route.test.ts`)
- Build passes (`npm run build`)

## Residual risks

- Breadcrumbs reset on full page reload (in-memory only)
- Platform owner list is global across workspaces; filter by `workspaceId` query param when needed
- No email/Slack notifications on new reports (deferred)
