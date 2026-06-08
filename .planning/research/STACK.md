# Technology Stack: v11.11 Aprendizado → Ação

**Project:** ADScale v11.11  
**Researched:** 2026-06-08  
**Scope:** Stack additions for readiness tuning, post-preview stall analytics, share-link tracking.  
**Baseline:** Next.js 16 App Router, React 19, Drizzle+Neon, first-party beta analytics (v11.8–v11.10).

---

## Verdict: Zero new npm dependencies

All v11.11 capabilities extend the existing analytics + cockpit layer. No new libraries, no third-party SDKs.

**Possible optional migration:** None required for JSONB event properties. If share-open volume grows, consider index on `(event_key, campaign_id)` — not needed at beta scale.

---

## Core Technologies (unchanged)

| Technology | Version | Role in v11.11 |
|------------|---------|----------------|
| Next.js App Router | 16.x | Share page server component fires `share_link_opened` |
| React 19 | 19.x | Campaign card nudge (D-2) |
| Drizzle + Neon | 0.45 | `beta_analytics_events` JSONB — new keys via allowlist only |
| TanStack Query | 5.x | Owner dashboard new panels |
| Zod | 3.x | Ingest boundary (unchanged strict allowlist) |
| next-intl | existing | PT-BR/EN for new dashboard labels |

---

## In-Repo Changes Required

| Area | Change | Feature |
|------|--------|---------|
| `beta-analytics/types.ts` | +`share_link_opened`, +`approval_package_refreshed` (if Q9); +`blockingDimensions`, `tokenId` property keys | TS-1, TS-3, TS-4 |
| `beta-analytics/aggregate.ts` | +`PostPreviewStallSignal`, extend `ReadinessOverrideSignal`, +share engagement by assistance level | TS-2, TS-3, D-3, D-4 |
| `share/[token]/page.tsx` | Server-side `recordBetaAnalyticsEvent` on valid token | TS-1 |
| `preflight/route.ts` | Include `blockingDimensions[]` on override event | TS-3 |
| `creative-readiness.ts` | Constant threshold adjustment (evidence-gated) | D-1 |
| `OwnerAnalyticsPanel.tsx` | Stall panel, dimension breakdown, draft→share median | TS-2, D-4 |
| Campaign list/card | `preview_done_pending_batch` chip | D-2 |

---

## What NOT to Add

| Avoid | Reason |
|-------|--------|
| Mixpanel/PostHog/Amplitude | PII risk; first-party sufficient |
| Email/push for stall nudges | Resend not wired to product flows |
| ML auto-tuning | N < 50 sessions |
| New chart library | `FunnelTable` pattern exists |

---

## Integration Points

- **Unauthenticated analytics:** `share/[token]/page.tsx` — `workspaceId` from token validation; `userId`/`sessionId` null
- **Override dimensions:** `preflight/route.ts` already has `CreativeReadinessResult` at override time
- **Stall timing:** Join `cockpit_stage_completed(preview)` with `credit_spend(batch)` or derivation status per session
- **Assistance level:** Beta session metadata from Phase 76/77 — join via `campaignId`

---

*Researched: 2026-06-08 — v11.11 milestone*
