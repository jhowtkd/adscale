# ImageGen stabilize — deliverables

## Isolation
- Worktree: `/Users/jhonatan/Repos/ADScale_2-worktrees/imagegen-stabilize`
- Branch: `codex/imagegen-stabilize-accelerate`
- Base commit: `aa8473e8` (`origin/main`)
- Original branch `fix/null-identity-analysis-prompt` at `/Users/jhonatan/Repos/ADScale_2` was **not** modified by this work

## What shipped

### Pipeline
- OpenAI provider: SDK `timeout: 120_000`, `maxRetries: 0` (no Promise.race)
- Route concurrency via `IMAGE_ROUTE_CONCURRENCY` + `p-limit` (web 1 / worker 2)
- One controlled full-retry round after total route failure; aggregate marked `retryable: false`
- **No** Creative Work job-level requeue; derivation Inngest `retries: 0` (cap ≤6 provider calls)
- Per-route generate → upload → drop buffer; selector prefers signed URL; winner re-fetched if needed
- Automatic refinement **removed**; `repairInstruction` optional / revise-only
- Aggregate latency uses wall-clock `performance.now()`, not `Math.max`
- Stage telemetry via `image_pipeline_stage` with workId/outputId/workspaceId/runId/attempt
- Heartbeat after claim, each candidate upload, selection, compose, quality

### Normalization
- Shared `normalizeImageForAi` (EXIF, max 2048, WebP/PNG, pixel limit)
- Applied on creative-work AI references, derivation refs/brand/restyling, source analyze (single normalized buffer), workspace-asset analyze, brand-training analyze
- Workspace asset upload max **10 MB**

### Selector
- Judgments A/B in parallel; C only on disagreement
- Deterministic fallback by lexicographic `routeId` (never presentation index 0)

### Stale / polling / billing
- Queued stale: 60m; processing stale: 10m (heartbeat via `updatedAt`)
- Shared compensatory refund key `creative-output:{outputId}:compensatory-refund` (stale / pregen / job / post_provider / low_quality)
- Total delivery failure refunds; failed refunds leave `*_refund_pending` and retry on next GET
- Late completion logs `late_completion_discarded`
- UI poll interval 5s; pauses when tab hidden; abortable fetch

### Worker / events
- `IMAGE_JOB_TARGET=web|worker` → emit v1 or `.v2` (never both)
- Web keeps heavy v1 handlers; worker app `adscale-image-worker` registers five v2 jobs
- Entrypoint: `src/server/jobs/image-worker.ts` via `inngest/connect`, `maxWorkerConcurrency: 2`
- Platform-owner pure helpers split from `requirePlatformOwner` (breaks `next/navigation` contamination)

### Render
- Web `NODE_OPTIONS=--max-old-space-size=384`; 4GB only on web buildCommand
- Worker build is `npm ci` only (no Next page-data collect)
- Worker env includes `PLATFORM_OWNER_EMAILS`, `MEM0_*`, `BETTER_AUTH_*`
- New Standard worker `adscale-image-worker` (2GB), concurrency 2, shutdown delay 300s

## New / changed env vars
| Var | Values | Default |
|-----|--------|---------|
| `IMAGE_JOB_TARGET` | `web` \| `worker` | `web` |
| `IMAGE_ROUTE_CONCURRENCY` | `1` \| `2` | `1` |

## Verification run (post blocker fix round 2)
- Focused tests: **144 passed** (generation, selector, credits, creative-work, GET route, execute, auto-retry integration, policies)
- `npm run typecheck`: **pass**
- `git diff --check`: **pass**
- Remaining rollout gates: Connect smoke with real worker envs + controlled prod test

### Round-3 blocker fixes
- `p-limit({ rejectOnClear: true })` + `clearQueue()` on lease loss; tasks check abort before provider
- `trackUsage` rethrows `23505` inside a transaction (no query on aborted tx → no `25P02`)
- Refund targets depleted grants via `getRefundableCreditGrants` / `pickRefundTargetGrant` (no false `refunded`)
- Generate-fallback only on provider failures; brand refs download+normalize capped at 4 sequentially
- Auto-retry passes `runId`/`attempt`; tests for lease abort, refund_pending, budget, drained grant

## Rollout
1. Deploy with `IMAGE_JOB_TARGET=web` (behavior stays on web v1)
2. Deploy worker service (v2 handlers connect; target still web) — set MEM0_* to match web
3. Confirm Inngest app `adscale-image-worker` + 5 functions connected
4. Flip `IMAGE_JOB_TARGET=worker` on web
5. One controlled output, then normal 3-output batch
6. After 24h without active v1 heavy runs, remove v1 heavy registration in a follow-up deploy

## Rollback
1. Set `IMAGE_JOB_TARGET=web` for new work
2. Keep/restore healthy worker deploy to drain in-flight v2
3. Do not auto-reemit v2 as v1
4. Rely on status CAS + refund idempotency

## Controlled prod test (operator)
- Max one normal batch, ≤15 app credits
- Criteria: ≤4m/output, ≤8m/batch, ≤6 image calls/output exceptional, 0 auto-refine, web <358MB, worker <1.4GB
- **Not executed in this session** (no production credentials / live OpenAI spend)

## Preexisting / out of scope
- Full 12×2 benchmark not run (per plan)
- Bare worktree production build page-data step needs DATABASE_URL and full secrets (worker no longer runs Next build)
- i18n / inspiration failures not touched
- Original open branch local MiniMax→OpenAI assistant edits preserved untouched
- P3 auth import churn not reverted (risk deferred)