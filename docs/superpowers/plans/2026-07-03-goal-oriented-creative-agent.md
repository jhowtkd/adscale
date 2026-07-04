# Goal-Oriented Creative Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pilot assistant's form-like guided journey with a durable, MiniMax-M3 goal agent that takes one client-scoped creative objective from an inferred brief through three controlled creative variants, spatial revision, four approved formats, and a downloadable package.

**Architecture:** Keep the shipped v13.9 action, artifact-version, Inngest generation, quality-gate, notification, learning, and export foundations. Add one pilot-only goal-run state machine per thread, one version-scoped annotation table, and consent-gated corpus promotion. The MiniMax-M3 chat loop may read context, update a free draft plan, and propose typed paid actions; deterministic server services remain responsible for scope, billing, generation batches, approval, and completion.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, TanStack Query, Drizzle/PostgreSQL, Inngest, MiniMax-M3 through the existing OpenAI-compatible adapter, existing image-generation pipeline, Sharp, JSZip, Vitest, Testing Library, Playwright.

---

## Locked Product Contract

- One thread owns one creative objective.
- A client is mandatory; the agent creates a draft campaign automatically after the minimum facts are known.
- Minimum blocking facts are product/offer, primary audience, and mandatory constraints. Everything else is an editable assumption.
- References are optional. The agent explains their value and uses existing client references when available.
- The agent displays a compact live plan and runs durably in the background.
- The first paid action creates exactly three `1:1` candidates from one plan and one asset/reference set. Only `creativeLevel` changes: `conservative`, `balanced`, `bold`.
- The three candidates are presented neutrally, side by side. The user selects one base.
- Revision uses rectangle + comment annotations. Multiple annotations are submitted as one paid revision batch and remain attached to the source version.
- Paid actions are charged before dispatch. The new goal-agent actions never refund credits, including technical failure. Confirmation copy must say this explicitly.
- The existing one-time quality auto-retry remains free. After it, a failed candidate occupies its slot as failed.
- Approving the base proposes one paid package action for the three missing formats. Final set is always `1:1`, `4:5`, `9:16`, `16:9`.
- Derived formats preserve copy, offer, CTA, identity, and approved source. A content change creates a new base version and invalidates derived formats.
- Each format is approved individually. Completion means all four are approved.
- Delivery provides individual files plus one ZIP with stable names and a manifest.
- Learning is client-scoped first. Global corpus promotion requires active client consent and explicit platform-owner review.
- MiniMax-M3 remains the exact agent model. Image-generation configuration is unchanged.
- Desktop is the quality target. Mobile supports monitoring, comments, and approval, but not rectangle drawing in this pilot.
- Pilot access is limited to platform owners and existing tester-entitled workspaces, with a legacy-flow fallback.
- Graduation gate: at least 20 real objectives across 3 clients, at least 60% completed packages, and zero critical credit or scope-isolation failures.
- Out of scope: ad publication, manual visual editing/freehand drawing, full mobile annotation, model/provider replacement, and automatic global corpus promotion.

## Current-Code Findings That Drive the Plan

1. `runAssistantTurn()` is a single provider pass. Tool results are not appended back to MiniMax, so it is not yet an agent loop.
2. The provider receives only two tools: `get_thread_context` and `propose_action`.
3. `buildSystemPrompt()` is one generic sentence plus JSON; it does not encode the product behavior above.
4. `assistant_guided_flows` is coupled to the legacy fixed-step UI. A separate `assistant_goal_runs` record is the smallest safe way to run a pilot and retain fallback.
5. `assistant_action_records.job_refs` already supports multiple jobs, but execution and job sync currently assume one job completes the whole action.
6. Creative level currently lives on `campaigns`; concurrent controlled variants need a per-derivation `creative_level` override.
7. Artifact versions, promotion, comparison, and approved canonical writes already exist and must be reused.
8. `DerivationReviewSheet` accepts text but has no spatial editor. `mock-data.ts` contains unused annotation shapes; do not build the unused full drawing toolkit.
9. `derivationJob` already runs the quality gate and one free auto-retry, but it announces completion before the final retry result. Goal callbacks must run only after the final output is settled.
10. `creative_revision` failures currently call `refundCredits()`. New goal-agent actions require an explicit non-refundable event policy without changing legacy behavior.
11. Non-preview outputs currently call `captureAndAutoPromote()`. That conflicts with consent + owner-review and must become capture-only.
12. Delivery-package creation, approved-output export, in-app notifications, tester entitlements, client learning, and ZIP support already exist.

## File Map

### New files

- `app/drizzle/0070_assistant_goal_agent.sql` — goal-run state, spatial annotations, client corpus consent, per-derivation creative level.
- `app/src/lib/assistant/goal.ts` — shared Zod schemas and safe client DTOs.
- `app/src/server/repositories/assistant-goal.ts` — scoped goal/annotation persistence with revision CAS.
- `app/src/server/assistant/goal/service.ts` — stage transitions, brief readiness, campaign materialization, selection, completion.
- `app/src/server/assistant/goal/projection.ts` — allowlisted thread workspace projection with ephemeral preview URLs.
- `app/src/server/assistant/goal/pilot.ts` — owner/tester eligibility and legacy fallback decision.
- `app/src/server/assistant/goal/system-prompt.ts` — MiniMax-M3 agent instructions.
- `app/src/server/assistant/goal/annotation-overlay.ts` — Sharp/SVG rectangle overlay for image revision.
- `app/src/server/assistant/tools/update-goal-plan.ts` — free deterministic goal-plan tool.
- `app/src/server/assistant/action-contracts/contracts/generate-creative-triplet.ts` — 15-credit initial batch contract.
- `app/src/server/assistant/action-contracts/contracts/revise-creative-annotations.ts` — 5-credit annotation batch contract.
- `app/src/server/assistant/action-contracts/contracts/generate-goal-package.ts` — 15-credit format batch contract.
- `app/src/server/assistant/action-execution/handlers/generate-creative-triplet.ts` — creates and dispatches the controlled triplet.
- `app/src/server/assistant/action-execution/handlers/revise-creative-annotations.ts` — consumes one submitted annotation batch.
- `app/src/server/assistant/action-execution/handlers/generate-goal-package.ts` — reuses package-child creation for the three missing formats.
- `app/src/app/api/assistant/threads/[threadId]/goal/route.ts` — stop/resume/abandon operations.
- `app/src/app/api/assistant/threads/[threadId]/goal/select-base/route.ts` — scoped candidate selection.
- `app/src/app/api/assistant/threads/[threadId]/goal/annotations/route.ts` — rectangle annotation draft CRUD.
- `app/src/app/api/assistant/threads/[threadId]/goal/annotations/submit/route.ts` — freezes a batch and proposes revision.
- `app/src/app/api/assistant/threads/[threadId]/goal/corpus-consent/route.ts` — client consent grant/revoke.
- `app/src/lib/hooks/use-assistant-goal.ts` — mutations and query invalidation.
- `app/src/components/assistant/AssistantGoalPlan.tsx` — compact live plan and stop/resume controls.
- `app/src/components/assistant/AssistantGoalWorkspace.tsx` — stage-aware workspace host.
- `app/src/components/assistant/CreativeTripletGrid.tsx` — equal-weight candidate comparison and base selection.
- `app/src/components/assistant/CreativeAnnotationEditor.tsx` — desktop rectangle/comment editor.
- `app/src/components/assistant/GoalPackageReview.tsx` — four-format progress, approval, and download.
- `app/src/server/assistant/goal/analytics.ts` — bounded events and graduation report.
- `app/src/app/api/feedback/analytics/goal-agent/route.ts` — platform-owner pilot report.
- `app/scripts/run-goal-agent-release-gate.mjs` — focused verification gate.
- `app/e2e/assistant-goal-agent.spec.ts` — authenticated pilot flow.

### Existing files to modify

- `app/src/server/db/schema.ts`
- `app/src/server/assistant/model/client.ts`
- `app/src/server/assistant/model/minimax-adapter.ts`
- `app/src/server/assistant/orchestrator.ts`
- `app/src/server/assistant/context/context-builder.ts`
- `app/src/server/assistant/tools/registry.ts`
- `app/src/server/assistant/action-contracts/types.ts`
- `app/src/server/assistant/action-contracts/risk-copy.ts`
- `app/src/server/assistant/action-contracts/validate.ts`
- `app/src/server/assistant/action-contracts/contracts/index.ts`
- `app/src/server/assistant/action-execution/types.ts`
- `app/src/server/assistant/action-execution/execute.ts`
- `app/src/server/repositories/assistant-action.ts`
- `app/src/server/repositories/assistant-message.ts`
- `app/src/server/repositories/assistant-job-sync.ts`
- `app/src/server/repositories/derivation.ts`
- `app/src/server/jobs/derivation.ts`
- `app/src/server/ai/derivation-pipeline.ts`
- `app/src/server/ai/derivation-auto-retry-policy.ts`
- `app/src/lib/assistant/artifact-version.ts`
- `app/src/server/assistant/artifact-version/snapshots.ts`
- `app/src/server/assistant/artifact-version/promotion.ts`
- `app/src/server/output-learning/output-decision-events.ts`
- `app/src/server/output-learning/types.ts`
- `app/src/server/output-learning/variable-value.ts`
- `app/src/server/human-quality/auto-promote.ts`
- `app/src/server/human-quality/candidate-promotion.ts`
- `app/src/app/api/feedback/human-quality-corpus/candidates/[id]/promote/route.ts`
- `app/src/app/api/assistant/threads/route.ts`
- `app/src/app/api/assistant/threads/[threadId]/route.ts`
- `app/src/app/api/assistant/threads/[threadId]/chat/route.ts`
- `app/src/app/api/assistant/threads/[threadId]/artifact-versions/promote/route.ts`
- `app/src/app/api/export/zip/route.ts`
- `app/src/lib/hooks/use-assistant-threads.ts`
- `app/src/lib/hooks/use-assistant-chat.ts`
- `app/src/components/assistant/AssistantStartComposer.tsx`
- `app/src/components/assistant/AssistantSurfaceContext.tsx`
- `app/src/components/assistant/AssistantChatCore.tsx`
- `app/src/components/assistant/AssistantMessageList.tsx`
- `app/src/components/assistant/AssistantChatInput.tsx`
- `app/src/components/assistant/AssistantShell.tsx`
- `app/src/components/assistant/AssistantContextPanel.tsx`
- `app/messages/en.json`
- `app/messages/pt-BR.json`
- `app/package.json`

---

## Phase 1 — Durable goal domain and pilot boundary

### Task 1: Add goal, annotation, consent, and per-output intensity persistence

**Files:**
- Create: `app/drizzle/0070_assistant_goal_agent.sql`
- Modify: `app/src/server/db/schema.ts`
- Create: `app/src/lib/assistant/goal.ts`
- Create: `app/src/server/repositories/assistant-goal.ts`
- Test: `app/src/server/repositories/assistant-goal.test.ts`

- [ ] **Step 1: Write failing repository tests**

Cover these exact invariants:

```ts
it("creates one goal run per thread and returns the winner on replay");
it("rejects cross-workspace and cross-client goal reads");
it("updates stage only when expectedRevision matches");
it("persists normalized rectangle coordinates between 0 and 1");
it("rejects annotations for a version outside the goal thread");
it("submits all draft annotations with one actionRecordId atomically");
it("marks submitted annotations addressed by the produced version");
it("grants and revokes consent with reviewer identity and timestamps");
```

- [ ] **Step 2: Run the test and verify the missing repository failure**

Run from `app/`:

```bash
npx vitest run src/server/repositories/assistant-goal.test.ts
```

Expected: FAIL because `assistant-goal.ts` and the new schema exports do not exist.

- [ ] **Step 3: Add migration 0070**

Create the migration with these exact columns and constraints:

```sql
ALTER TABLE "adscale_app"."derivations"
  ADD COLUMN IF NOT EXISTS "creative_level" text;

CREATE TABLE IF NOT EXISTS "adscale_app"."assistant_goal_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "adscale_app"."workspaces"("id") ON DELETE CASCADE,
  "client_profile_id" uuid NOT NULL REFERENCES "adscale_app"."client_profiles"("id") ON DELETE CASCADE,
  "thread_id" uuid NOT NULL REFERENCES "adscale_app"."assistant_threads"("id") ON DELETE CASCADE,
  "campaign_id" uuid REFERENCES "adscale_app"."campaigns"("id") ON DELETE SET NULL,
  "objective" text NOT NULL DEFAULT '',
  "stage" text NOT NULL DEFAULT 'intake',
  "brief" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "plan" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "assumptions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "blockers" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "queued_instruction" text,
  "selected_base_version_id" uuid REFERENCES "adscale_app"."assistant_artifact_versions"("id") ON DELETE SET NULL,
  "revision" integer NOT NULL DEFAULT 0,
  "started_by_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "completed_at" timestamp,
  "stopped_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "assistant_goal_runs_thread_uq" UNIQUE("thread_id"),
  CONSTRAINT "assistant_goal_runs_stage_check" CHECK ("stage" in (
    'intake','planning','awaiting_generation','generating_variants',
    'choosing_base','reviewing_base','awaiting_package','generating_package',
    'reviewing_package','completed','stopped','failed'
  ))
);

CREATE INDEX IF NOT EXISTS "assistant_goal_runs_scope_idx"
  ON "adscale_app"."assistant_goal_runs" ("workspace_id", "client_profile_id", "thread_id");
CREATE INDEX IF NOT EXISTS "assistant_goal_runs_stage_updated_idx"
  ON "adscale_app"."assistant_goal_runs" ("stage", "updated_at");

CREATE TABLE IF NOT EXISTS "adscale_app"."assistant_artifact_annotations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "adscale_app"."workspaces"("id") ON DELETE CASCADE,
  "client_profile_id" uuid NOT NULL REFERENCES "adscale_app"."client_profiles"("id") ON DELETE CASCADE,
  "thread_id" uuid NOT NULL REFERENCES "adscale_app"."assistant_threads"("id") ON DELETE CASCADE,
  "goal_run_id" uuid NOT NULL REFERENCES "adscale_app"."assistant_goal_runs"("id") ON DELETE CASCADE,
  "version_id" uuid NOT NULL REFERENCES "adscale_app"."assistant_artifact_versions"("id") ON DELETE CASCADE,
  "action_record_id" uuid REFERENCES "adscale_app"."assistant_action_records"("id") ON DELETE SET NULL,
  "addressed_by_version_id" uuid REFERENCES "adscale_app"."assistant_artifact_versions"("id") ON DELETE SET NULL,
  "x" real NOT NULL,
  "y" real NOT NULL,
  "width" real NOT NULL,
  "height" real NOT NULL,
  "comment" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "created_by_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "assistant_artifact_annotations_rect_check" CHECK (
    "x" >= 0 AND "x" <= 1 AND "y" >= 0 AND "y" <= 1 AND
    "width" > 0 AND "width" <= 1 AND "height" > 0 AND "height" <= 1 AND
    "x" + "width" <= 1 AND "y" + "height" <= 1
  ),
  CONSTRAINT "assistant_artifact_annotations_status_check" CHECK ("status" in ('draft','submitted','addressed'))
);

CREATE INDEX IF NOT EXISTS "assistant_artifact_annotations_version_status_idx"
  ON "adscale_app"."assistant_artifact_annotations" ("version_id", "status", "created_at");

CREATE TABLE IF NOT EXISTS "adscale_app"."client_corpus_consents" (
  "client_profile_id" uuid PRIMARY KEY REFERENCES "adscale_app"."client_profiles"("id") ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "adscale_app"."workspaces"("id") ON DELETE CASCADE,
  "status" text NOT NULL,
  "reviewed_by_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "granted_at" timestamp,
  "revoked_at" timestamp,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "client_corpus_consents_status_check" CHECK ("status" in ('granted','revoked'))
);
```

- [ ] **Step 4: Add shared schemas**

`app/src/lib/assistant/goal.ts` must export:

```ts
export const GOAL_BASE_FORMAT = "1:1" as const;
export const GOAL_FORMATS = ["1:1", "4:5", "9:16", "16:9"] as const;
export const GOAL_CREATIVE_LEVELS = ["conservative", "balanced", "bold"] as const;

export const goalStageSchema = z.enum([
  "intake", "planning", "awaiting_generation", "generating_variants",
  "choosing_base", "reviewing_base", "awaiting_package",
  "generating_package", "reviewing_package", "completed", "stopped", "failed",
]);

export const goalBriefSchema = z.object({
  productOffer: z.string().trim().max(2_000).default(""),
  audience: z.string().trim().max(2_000).default(""),
  constraints: z.string().trim().max(2_000).default(""),
  objective: z.string().trim().max(2_000).default(""),
  cta: z.string().trim().max(500).default(""),
  referenceIds: z.array(z.string().uuid()).max(20).default([]),
  baseAssetId: z.string().uuid().nullable().default(null),
}).strict();

export const goalPlanSchema = z.object({
  strategy: z.string().trim().max(2_000).default(""),
  angles: z.array(z.string().trim().max(500)).max(20).default([]),
  hooks: z.array(z.string().trim().max(500)).max(20).default([]),
  ctas: z.array(z.string().trim().max(500)).max(20).default([]),
}).strict();

export const goalAnnotationInputSchema = z.object({
  versionId: z.string().uuid(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
  comment: z.string().trim().min(1).max(1_000),
}).refine((r) => r.x + r.width <= 1 && r.y + r.height <= 1, "rectangle_out_of_bounds");
```

Also define a strict `assistantGoalPresentationSchema` containing only stage, objective, plan steps, assumptions, blockers, candidates, selected base, annotations, package items, and completion progress. It must not permit prompts, object keys, provider payloads, generation logs, or signed URLs outside the ephemeral `previewUrl` field.

- [ ] **Step 5: Implement scoped CAS persistence**

Use the same transaction and scope patterns as `artifact-version.ts`. `updateGoalRun()` must use:

```ts
.where(and(
  eq(assistantGoalRuns.id, input.goalRunId),
  eq(assistantGoalRuns.workspaceId, input.workspaceId),
  eq(assistantGoalRuns.clientProfileId, input.clientProfileId),
  eq(assistantGoalRuns.threadId, input.threadId),
  eq(assistantGoalRuns.revision, input.expectedRevision),
))
```

and increment `revision` by one. Throw `AssistantGoalConflictError` when no row is updated.

- [ ] **Step 6: Run repository tests and typecheck**

```bash
npx vitest run src/server/repositories/assistant-goal.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/drizzle/0070_assistant_goal_agent.sql app/src/server/db/schema.ts app/src/lib/assistant/goal.ts app/src/server/repositories/assistant-goal.ts app/src/server/repositories/assistant-goal.test.ts
git commit -m "feat(assistant): add durable goal and annotation state"
```

### Task 2: Gate the pilot with existing owner/tester access

**Files:**
- Create: `app/src/server/assistant/goal/pilot.ts`
- Modify: `app/src/app/api/assistant/threads/route.ts`
- Modify: `app/src/server/repositories/assistant-thread.ts`
- Modify: `app/src/lib/hooks/use-assistant-threads.ts`
- Modify: `app/src/components/assistant/AssistantStartComposer.tsx`
- Modify: `app/src/components/assistant/AssistantSurfaceContext.tsx`
- Test: `app/src/server/assistant/goal/pilot.test.ts`
- Test: `app/src/app/api/assistant/threads/route.test.ts`
- Test: `app/src/components/assistant/AssistantStartComposer.test.tsx`

- [ ] **Step 1: Add failing eligibility and creation tests**

Test these cases:

```ts
it("enables goal-agent for a platform owner");
it("enables goal-agent for a tester-entitled workspace");
it("keeps non-eligible workspaces on classic experience");
it("creates a goal run when experience=agent and caller is eligible");
it("rejects experience=agent for an ineligible caller");
it("creates a classic thread without a goal run when experience=classic");
```

- [ ] **Step 2: Implement the eligibility function without a new flag system**

```ts
export async function resolveAssistantExperience(input: {
  workspaceId: string;
  userEmail: string;
  requested?: "agent" | "classic";
}) {
  const eligible =
    isPlatformOwnerEmail(input.userEmail) ||
    Boolean(await getActiveTesterEntitlementByWorkspace(input.workspaceId));
  if (input.requested === "agent" && !eligible) {
    throw new AssistantGoalPilotError("goal_agent_not_enabled");
  }
  return input.requested ?? (eligible ? "agent" : "classic");
}
```

- [ ] **Step 3: Extend thread creation**

Add `experience: z.enum(["agent", "classic"]).optional()` to the POST schema. In one transaction, create the thread and, for agent experience, create its `assistant_goal_runs` row with the selected `clientProfileId` and `startedByUserId`. Do not create a campaign yet.

- [ ] **Step 4: Remove mandatory journey cards only for eligible agent mode**

`AssistantStartComposer` must:

- use a native `<select>` for the mandatory client;
- create `{ experience: "agent" }` by default for eligible users;
- keep a compact “Usar fluxo clássico” choice;
- stop rendering `AssistantJourneyCards` in agent mode;
- keep classic cards unchanged when classic is selected;
- reuse `uploadChatAttachment()` so a first-message image can infer the existing-piece path;
- change `pendingFirstMessage` in `AssistantSurfaceContext` from a string to `{ text, attachments }` and forward the exact uploaded asset metadata into `sendMessage()`.

- [ ] **Step 5: Verify**

```bash
npx vitest run src/server/assistant/goal/pilot.test.ts src/app/api/assistant/threads/route.test.ts src/components/assistant/AssistantStartComposer.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src/server/assistant/goal/pilot.ts app/src/app/api/assistant/threads/route.ts app/src/server/repositories/assistant-thread.ts app/src/lib/hooks/use-assistant-threads.ts app/src/components/assistant/AssistantStartComposer.tsx app/src/components/assistant/AssistantSurfaceContext.tsx app/src/server/assistant/goal/pilot.test.ts app/src/app/api/assistant/threads/route.test.ts app/src/components/assistant/AssistantStartComposer.test.tsx
git commit -m "feat(assistant): gate goal-agent pilot with tester access"
```

---

## Phase 2 — Inferred brief and bounded MiniMax-M3 agent loop

### Task 3: Build goal readiness and automatic campaign materialization

**Files:**
- Create: `app/src/server/assistant/goal/service.ts`
- Modify: `app/src/server/assistant/context/context-builder.ts`
- Modify: `app/src/server/assistant/artifact-version/service.ts`
- Test: `app/src/server/assistant/goal/service.test.ts`

- [ ] **Step 1: Write failing domain tests**

```ts
it("blocks only productOffer, audience, and constraints");
it("accepts an explicit no-constraints answer");
it("keeps inferred values in assumptions instead of facts");
it("uses existing client references but never blocks when there are none");
it("materializes one draft campaign and plan idempotently");
it("copies an existing uploaded base into the campaign when present");
it("adopts the new plan into artifact versioning and links the thread");
```

- [ ] **Step 2: Implement readiness**

```ts
export const GOAL_BLOCKING_FIELDS = ["productOffer", "audience", "constraints"] as const;

export function goalBlockers(brief: GoalBrief): string[] {
  return GOAL_BLOCKING_FIELDS.filter((key) => !brief[key].trim());
}
```

`constraints` is satisfied by an explicit phrase such as `Nenhuma restrição adicional`; an empty string remains a blocker.

- [ ] **Step 3: Implement idempotent materialization**

When blockers become empty:

1. Return the existing campaign if the goal already has `campaignId`.
2. Load the scoped client profile.
3. Create one draft campaign with `creativeLevel: "balanced"`, `targetFormats: ["1:1","4:5","9:16","16:9"]`, and optional reference IDs.
4. If `baseAssetId` exists, validate workspace ownership and create one campaign asset with role `base`.
5. Create the creative plan from the goal plan.
6. Link the thread to the campaign.
7. Adopt the plan using `adoptArtifactForThread()`.
8. Update the goal to `awaiting_generation` in the same service boundary.

Use a transaction/advisory lock keyed by `goalRunId` so replay cannot create two campaigns. Make the thread, campaign, goal, and artifact repository helpers accept an optional transaction handle so campaign creation, thread linkage, plan adoption, and the goal transition are actually atomic.

- [ ] **Step 4: Add goal state to scoped context**

Append an allowlisted block to `AllowedContextShape`:

```ts
goal: {
  id: goal.id,
  revision: goal.revision,
  stage: goal.stage,
  objective: goal.objective,
  planVersionId: resolvedPlanVersionId,
  brief: goalBriefSchema.parse(goal.brief),
  plan: goalPlanSchema.parse(goal.plan),
  assumptions: goal.assumptions,
  blockers: goal.blockers,
} | null
```

- [ ] **Step 5: Verify**

```bash
npx vitest run src/server/assistant/goal/service.test.ts src/server/assistant/context/context-builder.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src/server/assistant/goal/service.ts app/src/server/assistant/goal/service.test.ts app/src/server/assistant/context/context-builder.ts app/src/server/assistant/context/context-builder.test.ts app/src/server/assistant/artifact-version/service.ts
git commit -m "feat(assistant): infer goal brief and materialize draft campaign"
```

### Task 4: Turn the MiniMax adapter into a bounded tool-result loop

**Files:**
- Modify: `app/src/server/assistant/model/client.ts`
- Modify: `app/src/server/assistant/model/minimax-adapter.ts`
- Modify: `app/src/server/assistant/model/minimax-adapter.test.ts`
- Create: `app/src/server/assistant/goal/system-prompt.ts`
- Create: `app/src/server/assistant/tools/update-goal-plan.ts`
- Modify: `app/src/server/assistant/tools/registry.ts`
- Modify: `app/src/server/assistant/orchestrator.ts`
- Modify: `app/src/server/assistant/orchestrator.test.ts`
- Modify: `app/src/server/assistant/stream/sse.ts`
- Modify: `app/src/app/api/assistant/threads/[threadId]/chat/route.ts`
- Modify: `app/src/lib/assistant/parse-sse.ts`
- Modify: `app/src/lib/hooks/use-assistant-chat.ts`

- [ ] **Step 1: Write failing model-loop tests**

```ts
it("serializes assistant tool calls and tool results back to MiniMax");
it("runs at most six provider steps per user turn");
it("emits goal_state after update_goal_plan");
it("asks one blocker when the minimum brief is incomplete");
it("proposes generate_creative_triplet when the brief and plan are ready");
it("queues a user instruction when generation is already dispatched");
it("never persists reasoning or provider payloads");
```

- [ ] **Step 2: Extend provider message types**

Use a discriminated union:

```ts
export type AssistantModelMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: AssistantModelToolCall[] }
  | { role: "tool"; content: string; toolCallId: string };
```

Map assistant tool calls to `tool_calls` and tool results to `role: "tool", tool_call_id` in `minimax-adapter.ts`. Keep `model: env.MINIMAX_MODEL`; do not add routing or fallback providers.

- [ ] **Step 3: Add the free plan-update tool**

The strict input schema is:

```ts
const updateGoalPlanSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  objective: z.string().trim().min(1).max(2_000),
  brief: goalBriefSchema,
  plan: goalPlanSchema,
  assumptions: z.array(z.string().trim().max(500)).max(20),
}).strict();
```

The handler computes blockers server-side, updates the goal with CAS, materializes the campaign only when ready, and returns a safe summary such as `Plano atualizado; bloqueios: audience`.

When ready, the tool result also returns the scoped opaque identifiers MiniMax needs for the next typed proposal: `goalRunId`, the new `goalRevision`, and `planVersionId`. `propose_action` still validates every identifier against the thread on proposal and confirmation; the model never chooses scope.

- [ ] **Step 4: Add the senior creative-director prompt**

The prompt must contain these instructions verbatim in meaning:

```text
You are ADScale's senior creative director and goal agent.
Drive the current thread to one approved four-format creative package.
Infer from scoped client, brand, campaign, asset, and history context before asking.
Ask exactly one question only when product/offer, primary audience, or mandatory constraints are missing.
Keep facts and assumptions separate. Never invent price, deadline, guarantee, legal claim, or client fact.
Update the compact plan when the objective changes.
References are optional; explain their value without blocking.
Use propose_action for any generation that spends credits.
Never claim completion before every required format is approved.
Be concise, factual, and direct. Do not praise the user. Do not expose hidden reasoning.
```

- [ ] **Step 5: Implement the bounded orchestrator loop**

```ts
const MAX_AGENT_STEPS = 6;

for (let stepIndex = 0; stepIndex < MAX_AGENT_STEPS; stepIndex += 1) {
  const toolCalls: AssistantModelToolCall[] = [];
  let text = "";
  for await (const event of modelClient.stream(request)) {
    if (event.type === "text_delta") text += event.text;
    if (event.type === "tool_call") toolCalls.push(event);
  }
  if (toolCalls.length === 0) return persistFinalText(text);
  request.messages.push({ role: "assistant", content: text || null, toolCalls });
  for (const call of toolCalls) {
    const result = await evaluateToolCall(scope, call);
    request.messages.push({
      role: "tool",
      toolCallId: call.id,
      content: result.allowed ? result.sanitizedSummary : `Denied: ${result.denialReason}`,
    });
  }
}
throw new AssistantGoalStepLimitError();
```

Only the pilot goal path uses this loop. Classic threads continue through the existing guided orchestrator.

- [ ] **Step 6: Add `goal_state` SSE event**

Emit only the strict goal presentation after a durable state change. The client updates the thread query cache and never persists the SSE DTO separately.

- [ ] **Step 7: Verify**

```bash
npx vitest run src/server/assistant/model/minimax-adapter.test.ts src/server/assistant/orchestrator.test.ts src/lib/assistant/parse-sse.test.ts src/lib/hooks/use-assistant-chat.test.tsx
```

Expected: PASS with MiniMax-M3 still read from the existing environment variable.

- [ ] **Step 8: Commit**

```bash
git add app/src/server/assistant/model app/src/server/assistant/goal/system-prompt.ts app/src/server/assistant/tools/update-goal-plan.ts app/src/server/assistant/tools/registry.ts app/src/server/assistant/orchestrator.ts app/src/server/assistant/orchestrator.test.ts app/src/server/assistant/stream/sse.ts app/src/app/api/assistant/threads/[threadId]/chat/route.ts app/src/lib/assistant/parse-sse.ts app/src/lib/assistant/parse-sse.test.ts app/src/lib/hooks/use-assistant-chat.ts app/src/lib/hooks/use-assistant-chat.test.tsx
git commit -m "feat(assistant): add bounded MiniMax goal-agent loop"
```

---

## Phase 3 — Paid controlled triplet and durable background lifecycle

### Task 5: Add multi-job action support and exact credit amounts

**Files:**
- Modify: `app/src/server/assistant/action-contracts/types.ts`
- Modify: `app/src/server/assistant/action-contracts/risk-copy.ts`
- Modify: `app/src/server/assistant/action-contracts/validate.ts`
- Modify: `app/src/lib/assistant/display-contract.ts`
- Modify: `app/src/server/assistant/action-execution/types.ts`
- Modify: `app/src/server/repositories/assistant-action.ts`
- Modify: `app/src/server/repositories/assistant-message.ts`
- Modify: `app/src/server/repositories/assistant-job-sync.ts`
- Test: corresponding existing test files

- [ ] **Step 1: Write failing tests for amount-aware and aggregate actions**

```ts
it("preflights a 15-credit action with amount=15");
it("persists all three derivation job refs without duplicates");
it("treats repeated running callbacks as idempotent while merging job refs");
it("keeps the action running while any expected job is active");
it("completes when all expected jobs are terminal and at least one output exists");
it("marks failed only when every expected job fails");
it("serializes jobRefs and non-refundable copy into the action card");
```

- [ ] **Step 2: Extend credit impact and execution results**

```ts
export type CreditImpact =
  | { kind: "fixed"; credits: number; label?: string }
  | { kind: "creditAction"; action: CreditAction; amount?: number; label?: string };

export interface ActionExecutionResult {
  mode: "async" | "sync";
  jobRefs?: JobRef[];
  resultSummary?: string;
  campaignId?: string;
  route?: string;
}
```

`revalidateOnConfirm()` must call `checkSpend(workspaceId, action, amount)`. For goal actions it must also reload the goal and reject stale `goalRevision`, a `planVersionId` outside that goal, or a goal outside the current thread/workspace. `transitionAssistantAction()` must accept `jobRefs` and merge them idempotently. Message payloads must expose `jobRefs`, not only the last `jobRef`.

- [ ] **Step 3: Aggregate job completion**

`syncAssistantActionFromJob()` must load all referenced derivations and derive action status from the full set. It must not transition `running -> completed` on the first callback.

`transitionAssistantAction()` must treat an identical status as an idempotent patch: merge new job refs and safe display data, then return the current status without throwing `InvalidActionTransitionError`.

- [ ] **Step 4: Verify**

```bash
npx vitest run src/server/assistant/action-contracts/validate.test.ts src/server/repositories/assistant-action.test.ts src/server/repositories/assistant-job-sync.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/server/assistant/action-contracts/types.ts app/src/server/assistant/action-contracts/risk-copy.ts app/src/server/assistant/action-contracts/validate.ts app/src/lib/assistant/display-contract.ts app/src/server/assistant/action-execution/types.ts app/src/server/repositories/assistant-action.ts app/src/server/repositories/assistant-message.ts app/src/server/repositories/assistant-job-sync.ts app/src/server/assistant/action-contracts/validate.test.ts app/src/server/repositories/assistant-action.test.ts app/src/server/repositories/assistant-job-sync.test.ts
git commit -m "feat(assistant): support amount-aware multi-job actions"
```

### Task 6: Generate the conservative, balanced, and bold batch

**Files:**
- Create: `app/src/server/assistant/action-contracts/contracts/generate-creative-triplet.ts`
- Modify: `app/src/server/assistant/action-contracts/contracts/index.ts`
- Create: `app/src/server/assistant/action-execution/handlers/generate-creative-triplet.ts`
- Modify: `app/src/server/assistant/action-execution/execute.ts`
- Modify: `app/src/server/repositories/derivation.ts`
- Modify: `app/src/server/jobs/derivation.ts`
- Modify: `app/src/server/ai/derivation-auto-retry-policy.ts`
- Modify: `app/src/server/assistant/artifact-version/snapshots.ts`
- Modify: `app/src/lib/assistant/artifact-version.ts`
- Test: `app/src/server/assistant/action-execution/handlers/generate-creative-triplet.test.ts`
- Test: `app/src/server/jobs/derivation.test.ts`

- [ ] **Step 1: Write failing batch tests**

```ts
it("charges 15 credits once before creating jobs");
it("creates exactly three 1:1 derivations with fixed creative levels");
it("binds every derivation to the same plan, CTA, assets, and references");
it("uses derivation creativeLevel instead of mutating campaign creativeLevel");
it("does not refund a failed goal-agent derivation");
it("runs one existing free quality retry per failed-quality derivation");
it("creates a safe artifact lineage/version after the final retry settles");
```

- [ ] **Step 2: Add the strict action contract**

```ts
export const generateCreativeTripletInputSchema = z.object({
  goalRunId: z.string().uuid(),
  goalRevision: z.number().int().nonnegative(),
  planVersionId: z.string().uuid(),
  format: z.literal("1:1"),
}).strict();

export const generateCreativeTripletContract: ActionContract = {
  actionType: "generate_creative_triplet",
  intentFamily: "complete_campaign",
  label: "Gerar três direções criativas",
  inputSchema: generateCreativeTripletInputSchema,
  requiredFields: ["goalRunId", "goalRevision", "planVersionId", "format"],
  optionalFields: [],
  allowedRoles: ["owner", "admin", "member"],
  riskLabel: "high",
  creditImpact: { kind: "creditAction", action: "image_derivation", amount: 15, label: "15 créditos" },
  confirmationPolicy: "required",
  alwaysRiskCopy: ["Cobrança definitiva: não há estorno, inclusive se uma geração falhar."],
};
```

Add `alwaysRiskCopy?: readonly string[]` to `ActionContract` and merge it into `buildRiskCopyLines()`.

- [ ] **Step 3: Create all jobs under one action**

After charging once with idempotency key `assistant-action:${actionId}:creative-triplet`, create three derivations in one transaction using `GOAL_CREATIVE_LEVELS`. Every row uses `variantIndex: 0`; do not encode the level in `variantIndex`, because that would vary two prompt inputs and invalidate the controlled experiment. Dispatch three `derivation.generate` events with:

```ts
{
  assistantActionId: ctx.actionId,
  goalRunId: input.goalRunId,
  refundPolicy: "none",
  generationMode: "art_variation",
  creativeLevel,
  format: "1:1",
  variantIndex: 0,
  planVersionId: input.planVersionId,
}
```

If dispatch fails after rows are created, mark that row failed; do not refund.

- [ ] **Step 4: Honor per-derivation creative level**

Add `creativeLevel?: "conservative" | "balanced" | "bold" | "extreme"` to `CreateDerivationInput`. In `derivationJob`, compute:

```ts
const effectiveCreativeLevel =
  derivation.creativeLevel ?? event.data.creativeLevel ?? campaign.creativeLevel ?? "balanced";
const campaignForGeneration = { ...campaign, creativeLevel: effectiveCreativeLevel };
```

Use `campaignForGeneration` for prompt context, score, quality evaluation, and learning snapshots. Never update `campaigns.creative_level` while producing the triplet.

- [ ] **Step 5: Finalize goal outputs after retry, not before**

Move the goal-only callback after quality gate and auto-retry. It must:

1. adopt the derivation into artifact versions;
2. include optional `creativeLevel` in the safe snapshot;
3. sync the aggregate action;
4. advance the goal to `choosing_base` only when all three slots are terminal;
5. create one in-app `assistant_goal_ready` notification;
6. never call `refundCredits()` when `refundPolicy === "none"`.
7. capture the final post-retry output as a corpus candidate only after the last quality gate.
8. suppress the existing completion email for goal events (`notificationPolicy: "in_app"`); the in-app record plus optional browser notification is the pilot contract.

Extend `shouldAutoRetryDerivation()` so the one bounded retry covers every hard failure that makes the output unapprovable, including legibility, brand-integrity, and layout-integrity failures. `generationLog.autoRetryAttempted` remains the hard ceiling.

Legacy callback order and refund behavior remain unchanged.

- [ ] **Step 6: Verify**

```bash
npx vitest run src/server/assistant/action-execution/handlers/generate-creative-triplet.test.ts src/server/jobs/derivation.test.ts src/server/ai/derivation-auto-retry.integration.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/src/server/assistant/action-contracts/contracts/generate-creative-triplet.ts app/src/server/assistant/action-contracts/contracts/index.ts app/src/server/assistant/action-execution/handlers/generate-creative-triplet.ts app/src/server/assistant/action-execution/execute.ts app/src/server/repositories/derivation.ts app/src/server/jobs/derivation.ts app/src/server/ai/derivation-auto-retry-policy.ts app/src/server/assistant/artifact-version/snapshots.ts app/src/lib/assistant/artifact-version.ts app/src/server/assistant/action-execution/handlers/generate-creative-triplet.test.ts app/src/server/jobs/derivation.test.ts app/src/server/ai/derivation-auto-retry.integration.test.ts
git commit -m "feat(assistant): generate controlled three-level creative batch"
```

### Task 7: Add stop, replan, resume, and completion notifications

**Files:**
- Create: `app/src/app/api/assistant/threads/[threadId]/goal/route.ts`
- Modify: `app/src/server/assistant/goal/service.ts`
- Modify: `app/src/server/jobs/derivation.ts`
- Modify: `app/src/server/repositories/notification.ts`
- Create: `app/src/lib/hooks/use-assistant-goal.ts`
- Test: `app/src/app/api/assistant/threads/[threadId]/goal/route.test.ts`

- [ ] **Step 1: Write failing lifecycle tests**

```ts
it("cancels a pending paid action before dispatch");
it("stops future goal steps but leaves dispatched jobs running and charged");
it("stores one queued instruction while a batch is running");
it("restores exact stage and progress after reload");
it("creates one notification when a batch becomes reviewable");
it("records an optional abandonment reason without requiring it");
```

- [ ] **Step 2: Implement route commands**

Use a strict union:

```ts
const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("stop"), expectedRevision: z.number().int().nonnegative() }),
  z.object({ type: z.literal("resume"), expectedRevision: z.number().int().nonnegative() }),
  z.object({ type: z.literal("abandon"), expectedRevision: z.number().int().nonnegative(), reason: z.string().trim().max(500).optional() }),
]);
```

`stop` cancels only a still-pending action. Running derivations continue. `resume` returns to the stage derived from artifacts/actions. `abandon` records telemetry and stops.

- [ ] **Step 3: Add optional native notification**

In `use-assistant-goal.ts`, expose `requestNativeNotifications()` from a user click and call the browser `Notification` API only when permission is `granted` and an ADScale tab observes a transition into `choosing_base`, `reviewing_package`, or `completed`. Do not add a service worker or web-push backend in this pilot.

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run src/app/api/assistant/threads/[threadId]/goal/route.test.ts src/server/repositories/notification.test.ts
git add app/src/app/api/assistant/threads/[threadId]/goal/route.ts app/src/server/assistant/goal/service.ts app/src/server/jobs/derivation.ts app/src/server/repositories/notification.ts app/src/lib/hooks/use-assistant-goal.ts app/src/app/api/assistant/threads/[threadId]/goal/route.test.ts
git commit -m "feat(assistant): persist goal stop resume and notifications"
```

---

## Phase 4 — Goal workspace and neutral candidate selection

### Task 8: Project safe goal state and build the adaptive workspace

**Files:**
- Create: `app/src/server/assistant/goal/projection.ts`
- Modify: `app/src/app/api/assistant/threads/[threadId]/route.ts`
- Modify: `app/src/lib/hooks/use-assistant-threads.ts`
- Create: `app/src/components/assistant/AssistantGoalPlan.tsx`
- Create: `app/src/components/assistant/AssistantGoalWorkspace.tsx`
- Create: `app/src/components/assistant/CreativeTripletGrid.tsx`
- Modify: `app/src/components/assistant/AssistantShell.tsx`
- Modify: `app/src/components/assistant/AssistantChatCore.tsx`
- Modify: `app/src/components/assistant/AssistantContextPanel.tsx`
- Modify: `app/src/components/assistant/AssistantMessageList.tsx`
- Modify: `app/src/components/assistant/AssistantChatInput.tsx`
- Create: `app/src/app/api/assistant/threads/[threadId]/goal/select-base/route.ts`
- Test: co-located component and route tests

- [ ] **Step 1: Write failing projection and component tests**

```ts
it("returns goal state without prompt, outputKey, provider payload, or signed URL persistence");
it("renders the four live plan steps and current stage");
it("renders three candidates at equal visual weight in fixed level order");
it("does not rank or recommend a candidate");
it("shows a failed slot after final retry failure");
it("selects only a version belonging to the current triplet");
it("switches shell to workspace mode when candidates exist");
it("keeps mobile to monitoring selection comments and approval controls");
```

- [ ] **Step 2: Build the strict projection**

The projection resolves preview URLs at request time from stored output keys and returns:

```ts
{
  stage,
  revision,
  objective,
  planSteps: [
    { key: "understand", status },
    { key: "plan", status },
    { key: "create", status },
    { key: "review", status },
  ],
  assumptions,
  blockers,
  candidates: [{ versionId, derivationId, creativeLevel, format, status, previewUrl }],
  selectedBaseVersionId,
  annotations,
  packageItems,
  approvedFormatCount,
  requiredFormatCount: 4,
}
```

Parse the final object through `assistantGoalPresentationSchema` before returning it.

- [ ] **Step 3: Implement adaptive grid**

`AssistantShell` receives `mode: "conversation" | "workspace"` and uses existing CSS variables:

```tsx
className={cn(
  "hidden min-h-screen md:grid",
  mode === "workspace"
    ? "grid-cols-[220px_minmax(320px,0.65fr)_minmax(640px,1.35fr)]"
    : "grid-cols-[240px_minmax(0,1fr)_320px]"
)}
```

At widths that cannot fit 1,180 px, collapse the tree sidebar before shrinking the visual workspace below 640 px.

- [ ] **Step 4: Implement neutral triplet selection**

Render candidates in the fixed order `conservative`, `balanced`, `bold`. Labels and actions are identical. No score, recommendation, winner badge, or default selection appears. Zoom is per candidate. Selection POSTs `{ versionId, expectedRevision }`, records a client-scoped `selected_for_delivery` output decision, and advances the goal to `reviewing_base`.

- [ ] **Step 5: Keep chat concise**

In goal mode, assistant messages render as borderless content blocks; user messages remain compact. Tool messages become expandable activity rows. Keep action cards in the thread. Add copy/retry/stop controls, but do not expose chain-of-thought or raw tool arguments.

- [ ] **Step 6: Verify**

```bash
npx vitest run src/server/assistant/goal/projection.test.ts src/components/assistant/AssistantGoalPlan.test.tsx src/components/assistant/CreativeTripletGrid.test.tsx src/components/assistant/AssistantShell.test.tsx src/app/api/assistant/threads/[threadId]/goal/select-base/route.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/src/server/assistant/goal/projection.ts app/src/app/api/assistant/threads/[threadId]/route.ts app/src/lib/hooks/use-assistant-threads.ts app/src/components/assistant/AssistantGoalPlan.tsx app/src/components/assistant/AssistantGoalWorkspace.tsx app/src/components/assistant/CreativeTripletGrid.tsx app/src/components/assistant/AssistantShell.tsx app/src/components/assistant/AssistantChatCore.tsx app/src/components/assistant/AssistantContextPanel.tsx app/src/components/assistant/AssistantMessageList.tsx app/src/components/assistant/AssistantChatInput.tsx app/src/app/api/assistant/threads/[threadId]/goal/select-base/route.ts app/src/server/assistant/goal/projection.test.ts app/src/components/assistant/AssistantGoalPlan.test.tsx app/src/components/assistant/CreativeTripletGrid.test.tsx app/src/components/assistant/AssistantShell.test.tsx app/src/app/api/assistant/threads/[threadId]/goal/select-base/route.test.ts
git commit -m "feat(assistant): add adaptive goal workspace and triplet selection"
```

---

## Phase 5 — Spatial annotation and version-bound revision

### Task 9: Add desktop rectangle annotations and one revision action

**Files:**
- Create: `app/src/components/assistant/CreativeAnnotationEditor.tsx`
- Create: `app/src/app/api/assistant/threads/[threadId]/goal/annotations/route.ts`
- Create: `app/src/app/api/assistant/threads/[threadId]/goal/annotations/submit/route.ts`
- Create: `app/src/server/assistant/goal/annotation-overlay.ts`
- Create: `app/src/server/assistant/action-contracts/contracts/revise-creative-annotations.ts`
- Create: `app/src/server/assistant/action-execution/handlers/revise-creative-annotations.ts`
- Modify: `app/src/server/assistant/action-contracts/contracts/index.ts`
- Modify: `app/src/server/assistant/action-execution/execute.ts`
- Modify: `app/src/server/ai/derivation-pipeline.ts`
- Modify: `app/src/server/jobs/derivation.ts`
- Test: route, component, overlay, and handler tests

- [ ] **Step 1: Write failing annotation tests**

```ts
it("normalizes a dragged rectangle against the rendered image bounds");
it("requires a non-empty comment before saving a rectangle");
it("supports keyboard deletion and visible focus for annotation list items");
it("persists drafts across reload");
it("submits every draft annotation for the selected source version as one batch");
it("charges 5 credits once and never refunds the new annotation revision");
it("passes source image plus numbered overlay to image edit");
it("marks source annotations addressed only after the new version succeeds");
it("never copies rectangle coordinates to the new version");
```

- [ ] **Step 2: Implement native pointer drawing**

Use pointer events on an absolutely positioned overlay. Store only normalized coordinates. On pointer up, reject rectangles smaller than 1% of image width or height. The editor supports desktop drawing; on mobile it renders the annotation list and comment input but disables drawing with an explanatory label.

- [ ] **Step 3: Render a numbered instruction overlay with Sharp**

`annotation-overlay.ts` loads the source dimensions and composites one SVG containing rectangle strokes and numeric labels. Escape comment text; comments belong in the prompt, not the SVG. Return `{ overlayBuffer, instructionText }`, where instruction text is deterministic:

```text
Region 1 [x=0.120,y=0.200,w=0.300,h=0.180]: Reduce headline size.
Region 2 [x=0.620,y=0.580,w=0.220,h=0.240]: Move CTA upward.
```

- [ ] **Step 4: Add an annotated image reference kind**

Extend `GenerationReferenceInput`:

```ts
| {
    kind: "annotated";
    baseBuffer: Buffer;
    baseMimeType: string;
    overlayBuffer: Buffer;
    overlayMimeType: "image/png";
  }
```

Call `openai.images.edit` with `[baseFile, overlayFile]`. The prompt must say that rectangles/numbers are instructions and must not appear in the output.

- [ ] **Step 5: Create the non-refundable revision contract**

Input contains only `goalRunId`, `goalRevision`, `sourceVersionId`, `planVersionId`, and submitted `annotationIds`. The handler reloads and validates all annotation content server-side, creates a child derivation with `parentId` equal to the source derivation, sets `refundPolicy: "none"`, and dispatches one `creative_revision` event.

- [ ] **Step 6: Fix revision source semantics at the shared job boundary**

For `creative_revision`, use the parent derivation output as the base image just as `format_adaptation` already does. This is the root-cause fix; do not special-case only the annotation endpoint.

- [ ] **Step 7: Verify**

```bash
npx vitest run src/components/assistant/CreativeAnnotationEditor.test.tsx src/app/api/assistant/threads/[threadId]/goal/annotations/route.test.ts src/app/api/assistant/threads/[threadId]/goal/annotations/submit/route.test.ts src/server/assistant/goal/annotation-overlay.test.ts src/server/assistant/action-execution/handlers/revise-creative-annotations.test.ts src/server/ai/derivation-pipeline.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/src/components/assistant/CreativeAnnotationEditor.tsx app/src/components/assistant/CreativeAnnotationEditor.test.tsx app/src/app/api/assistant/threads/[threadId]/goal/annotations app/src/server/assistant/goal/annotation-overlay.ts app/src/server/assistant/goal/annotation-overlay.test.ts app/src/server/assistant/action-contracts/contracts/revise-creative-annotations.ts app/src/server/assistant/action-contracts/contracts/index.ts app/src/server/assistant/action-execution/handlers/revise-creative-annotations.ts app/src/server/assistant/action-execution/handlers/revise-creative-annotations.test.ts app/src/server/assistant/action-execution/execute.ts app/src/server/ai/derivation-pipeline.ts app/src/server/ai/derivation-pipeline.test.ts app/src/server/jobs/derivation.ts
git commit -m "feat(assistant): revise creatives from spatial annotation batches"
```

---

## Phase 6 — Base approval, four-format package, and delivery

### Task 10: Generate and review the three missing formats

**Files:**
- Create: `app/src/server/assistant/action-contracts/contracts/generate-goal-package.ts`
- Create: `app/src/server/assistant/action-execution/handlers/generate-goal-package.ts`
- Modify: `app/src/server/assistant/action-contracts/contracts/index.ts`
- Modify: `app/src/server/assistant/action-execution/execute.ts`
- Modify: `app/src/server/repositories/derivation.ts`
- Modify: `app/src/server/assistant/artifact-version/promotion.ts`
- Modify: `app/src/app/api/assistant/threads/[threadId]/artifact-versions/promote/route.ts`
- Create: `app/src/components/assistant/GoalPackageReview.tsx`
- Test: handler, promotion, and component tests

- [ ] **Step 1: Write failing package tests**

```ts
it("moves an approved selected base to awaiting_package");
it("proposes exactly 4:5, 9:16, and 16:9 when base is 1:1");
it("charges 15 credits once before dispatch");
it("never refunds package failures");
it("binds every child to the approved base output and exact approved plan");
it("preserves copy offer CTA and identity in every adaptation contract");
it("shows each format as separately approvable");
it("completes only when all four canonical derivations are approved");
it("invalidates package items when base content changes");
```

- [ ] **Step 2: Reuse package-child creation through a service**

Extract the core of `POST /api/derivations/[id]/delivery-package` into one server service used by both the legacy route and the goal handler. Pass `assistantActionId`, `goalRunId`, `refundPolicy: "none"`, and `triggeredByUserId` to each event. Do not duplicate package creation logic.

Copy `source.creativeLevel` to every package child so intensity remains provenance, while format adaptation itself varies only layout. The child keeps the source `creativeContract`, exact plan version, literal copy, offer, and CTA.

- [ ] **Step 3: Add the fixed package contract**

```ts
creditImpact: {
  kind: "creditAction",
  action: "delivery_package_child",
  amount: 15,
  label: "15 créditos — três formatos adicionais",
},
alwaysRiskCopy: [
  "A peça-base 1:1 já conta no pacote.",
  "Cobrança definitiva: não há estorno, inclusive se uma geração falhar.",
],
```

- [ ] **Step 4: Sync goal after artifact promotion**

After `promoteThreadArtifactVersion()` succeeds, call `syncGoalRunFromArtifacts()` when the thread has a goal run. It counts approved derivations by required format. At 1/4, stage is `awaiting_package`; while child jobs run, `generating_package`; after jobs settle, `reviewing_package`; at 4/4, `completed` with `completedAt`.

- [ ] **Step 5: Build package review**

Render four fixed format slots. Each slot displays status, preview, history, annotate/revise, and approve. Do not provide a single approve-all button. A content-changing request routes back to base revision and shows all existing derivatives as stale.

- [ ] **Step 6: Verify and commit**

```bash
npx vitest run src/server/assistant/action-execution/handlers/generate-goal-package.test.ts src/server/assistant/artifact-version/promotion.test.ts src/components/assistant/GoalPackageReview.test.tsx src/app/api/derivations/[id]/delivery-package/route.test.ts
git add app/src/server/assistant/action-contracts/contracts/generate-goal-package.ts app/src/server/assistant/action-contracts/contracts/index.ts app/src/server/assistant/action-execution/handlers/generate-goal-package.ts app/src/server/assistant/action-execution/handlers/generate-goal-package.test.ts app/src/server/assistant/action-execution/execute.ts app/src/server/repositories/derivation.ts app/src/server/assistant/artifact-version/promotion.ts app/src/server/assistant/artifact-version/promotion.test.ts app/src/app/api/assistant/threads/[threadId]/artifact-versions/promote/route.ts app/src/components/assistant/GoalPackageReview.tsx app/src/components/assistant/GoalPackageReview.test.tsx app/src/app/api/derivations/[id]/delivery-package/route.ts app/src/app/api/derivations/[id]/delivery-package/route.test.ts
git commit -m "feat(assistant): complete goals with four approved formats"
```

### Task 11: Produce stable individual downloads and a manifest ZIP

**Files:**
- Modify: `app/src/app/api/export/zip/route.ts`
- Modify: `app/src/server/services/export.ts`
- Modify: `app/src/components/assistant/GoalPackageReview.tsx`
- Test: `app/src/app/api/export/zip/route.test.ts`

- [ ] **Step 1: Write failing export tests**

```ts
it("rejects a goal export until all four scoped formats are approved");
it("uses png extensions instead of treating 1:1 as an extension");
it("writes one stable file per required format");
it("adds manifest.json with client campaign objective version and format mapping");
it("never exposes output keys signed URLs prompts or provider metadata in the manifest");
```

- [ ] **Step 2: Use deterministic names**

For the goal path, accept `{ goalRunId }` and resolve the four derivations server-side. Preserve the legacy `{ derivationIds }` request as a separate schema branch. The goal branch refuses export unless the caller owns the thread and all four required formats are approved.

Normalize the campaign slug and write:

```text
<slug>-1x1.png
<slug>-4x5.png
<slug>-9x16.png
<slug>-16x9.png
manifest.json
```

The manifest shape is:

```ts
{
  schemaVersion: 1,
  client: string,
  campaign: string,
  objective: string,
  approvedAt: string,
  files: Array<{ format: "1:1" | "4:5" | "9:16" | "16:9"; fileName: string; version: number }>,
}
```

- [ ] **Step 3: Verify and commit**

```bash
npx vitest run src/app/api/export/zip/route.test.ts
git add app/src/app/api/export/zip/route.ts app/src/app/api/export/zip/route.test.ts app/src/server/services/export.ts app/src/components/assistant/GoalPackageReview.tsx
git commit -m "feat(export): package approved goal formats with manifest"
```

---

## Phase 7 — Learning, consent, telemetry, and pilot graduation

### Task 12: Capture client preference without automatic global promotion

**Files:**
- Modify: `app/src/server/output-learning/output-decision-events.ts`
- Modify: `app/src/server/output-learning/types.ts`
- Modify: `app/src/server/output-learning/variable-value.ts`
- Modify: `app/src/server/human-quality/auto-promote.ts`
- Modify: `app/src/server/human-quality/candidate-promotion.ts`
- Modify: `app/src/app/api/feedback/human-quality-corpus/candidates/[id]/promote/route.ts`
- Create: `app/src/app/api/assistant/threads/[threadId]/goal/corpus-consent/route.ts`
- Test: existing learning and corpus tests plus consent route test

- [ ] **Step 1: Write failing policy tests**

```ts
it("extracts creative_level from a selected candidate decision");
it("keeps selected variant learning scoped to clientProfileId");
it("captures a completed derivation as a candidate without auto-promoting it");
it("blocks owner promotion when client consent is absent or revoked");
it("allows platform-owner promotion after active consent");
it("never stores annotation comments in the global corpus artifact ref");
```

- [ ] **Step 2: Add creative-level learning**

Add `creativeLevel?: string | null` to `OutputDecisionSnapshot`, add `creative_level` to `OUTPUT_SUPPORTED_VARIABLE_KEYS`, and emit it from selected/approved goal creatives. A single selection is weak client evidence; approval is strong evidence. Non-selected candidates remain retained for reviewed corpus comparison but are not automatically converted into negative client rules.

- [ ] **Step 3: Stop global auto-promotion**

Replace the job call to `captureAndAutoPromote()` with capture-only `captureCorpusCandidateFromDerivation()`. Keep the old exported function temporarily only if another caller needs it, but no generation path may call it.

- [ ] **Step 4: Enforce consent at owner promotion**

`promoteCorpusCandidateToQueue()` must load the candidate's client profile and require `client_corpus_consents.status === "granted"`. Return `client_consent_required` on absence/revocation. Platform-owner auth remains mandatory. The consent route requires workspace owner/admin to grant or revoke for a client in the same workspace.

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run src/server/output-learning/variable-value.test.ts src/server/human-quality/auto-promote.test.ts src/server/human-quality/candidate-promotion.test.ts src/app/api/feedback/human-quality-corpus/candidates/[id]/promote/route.test.ts src/app/api/assistant/threads/[threadId]/goal/corpus-consent/route.test.ts
git add app/src/server/output-learning app/src/server/human-quality/auto-promote.ts app/src/server/human-quality/auto-promote.test.ts app/src/server/human-quality/candidate-promotion.ts app/src/server/human-quality/candidate-promotion.test.ts app/src/app/api/feedback/human-quality-corpus/candidates/[id]/promote/route.ts app/src/app/api/feedback/human-quality-corpus/candidates/[id]/promote/route.test.ts app/src/app/api/assistant/threads/[threadId]/goal/corpus-consent/route.ts app/src/app/api/assistant/threads/[threadId]/goal/corpus-consent/route.test.ts
git commit -m "feat(learning): gate global corpus promotion on client consent"
```

### Task 13: Add goal telemetry, abandonment reasons, and graduation report

**Files:**
- Create: `app/src/server/assistant/goal/analytics.ts`
- Modify: `app/src/server/assistant/artifact-iteration-telemetry.ts`
- Create: `app/src/app/api/feedback/analytics/goal-agent/route.ts`
- Test: `app/src/server/assistant/goal/analytics.test.ts`
- Test: `app/src/app/api/feedback/analytics/goal-agent/route.test.ts`

- [ ] **Step 1: Define bounded events**

Add these event keys with strict scalar metadata only:

```ts
const GOAL_EVENT_KEYS = [
  "goal_started", "goal_plan_ready", "goal_action_confirmed",
  "goal_batch_ready", "goal_base_selected", "goal_annotation_submitted",
  "goal_base_approved", "goal_package_started", "goal_format_approved",
  "goal_completed", "goal_stopped", "goal_abandoned",
] as const;
```

Allowed metadata: `stage`, `creativeLevel`, `format`, `candidateCount`, `approvedFormatCount`, `reasonCode`, `actionId`. Do not store message text, annotations, prompts, URLs, or provider data.

- [ ] **Step 2: Compute the graduation report**

Return:

```ts
{
  startedObjectives,
  completedObjectives,
  distinctClients,
  completionRate,
  criticalCreditFailures,
  criticalScopeFailures,
  stageDropoff,
  graduation: {
    enoughObjectives: startedObjectives >= 20,
    enoughClients: distinctClients >= 3,
    enoughCompletion: completionRate >= 0.60,
    noCriticalFailures: criticalCreditFailures === 0 && criticalScopeFailures === 0,
    passed: boolean,
  },
}
```

- [ ] **Step 3: Verify and commit**

```bash
npx vitest run src/server/assistant/goal/analytics.test.ts src/app/api/feedback/analytics/goal-agent/route.test.ts
git add app/src/server/assistant/goal/analytics.ts app/src/server/assistant/goal/analytics.test.ts app/src/server/assistant/artifact-iteration-telemetry.ts app/src/app/api/feedback/analytics/goal-agent/route.ts app/src/app/api/feedback/analytics/goal-agent/route.test.ts
git commit -m "feat(analytics): measure goal-agent pilot graduation"
```

---

## Phase 8 — Integrated verification and rollout

### Task 14: Add browser coverage, release gate, and rollout evidence

**Files:**
- Create: `app/e2e/assistant-goal-agent.spec.ts`
- Create: `app/scripts/run-goal-agent-release-gate.mjs`
- Modify: `app/package.json`
- Modify: `app/messages/en.json`
- Modify: `app/messages/pt-BR.json`
- Create: `docs/staging/assistant-goal-agent-pilot.md`

- [ ] **Step 1: Add authenticated browser scenarios**

The Playwright spec must cover:

1. agent pilot available to tester and classic fallback available;
2. mandatory client selection and single-composer start;
3. from-zero brief inference with one blocker at a time;
4. existing-piece path inferred from attachment;
5. exact 15-credit non-refundable confirmation copy;
6. three neutral fixed-level candidates after reload;
7. base selection;
8. two rectangle annotations submitted as one revision;
9. annotation history remains on the old version;
10. base approval then 15-credit package confirmation;
11. individual approval of four formats;
12. final ZIP download;
13. stop before dispatch and stop after dispatch semantics;
14. mobile can monitor/comment/approve but cannot draw rectangles;
15. cross-client thread, version, annotation, and action access rejected.

- [ ] **Step 2: Add the release gate script**

Run in this order and stop on first failure:

```text
npx vitest run <all focused goal-agent tests>
npm run typecheck
npm run lint
npm run build
npx playwright test e2e/assistant-goal-agent.spec.ts
```

Add `"goal-agent-release-gate": "node scripts/run-goal-agent-release-gate.mjs"` to `app/package.json`.

- [ ] **Step 3: Write the staging runbook**

The runbook must state:

- migration apply and rollback check;
- owner/tester eligibility setup;
- one real from-zero objective and one existing-piece objective;
- credit ledger before/after triplet, revision, and package;
- deliberate provider failure proving no refund and explicit failure UI;
- scope-isolation probes;
- consent absent/present/revoked corpus promotion probes;
- browser notification check with permission granted;
- artifact reload after closing and reopening the thread;
- graduation report command/API snapshot.

- [ ] **Step 4: Run the full gate**

```bash
cd app
npm run goal-agent-release-gate
```

Expected: all focused tests, typecheck, lint, build, and Playwright pass.

- [ ] **Step 5: Perform final diff checks**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only scoped goal-agent files are changed.

- [ ] **Step 6: Commit**

```bash
git add app/e2e/assistant-goal-agent.spec.ts app/scripts/run-goal-agent-release-gate.mjs app/package.json app/messages/en.json app/messages/pt-BR.json docs/staging/assistant-goal-agent-pilot.md
git commit -m "test(assistant): add goal-agent pilot release gate"
```

---

## Implementation Order and Safe Merge Points

| Wave | Tasks | Shippable state |
|---|---:|---|
| 1 | 1–2 | Hidden durable pilot domain and eligibility; no behavior change for classic users |
| 2 | 3–4 | Pilot can infer brief, persist plan, and propose typed actions |
| 3 | 5–7 | Paid triplet runs durably with exact billing, retry, stop, and notifications |
| 4 | 8 | Desktop pilot can compare and select candidates |
| 5 | 9 | Spatial revision loop works against exact source versions |
| 6 | 10–11 | Four-format approval and final delivery complete the objective |
| 7 | 12–13 | Client learning, consent, telemetry, and graduation evidence are truthful |
| 8 | 14 | Release gate and staging evidence allow controlled rollout |

## Explicit Non-Goals During Implementation

- Do not rename or delete the legacy guided-flow tables or routes.
- Do not add a second action-card system, second artifact-version model, second job runner, second notification store, or second ZIP library.
- Do not add Konva, Fabric.js, or another canvas dependency; pointer events + SVG overlay + Sharp cover the rectangle-only requirement.
- Do not add a general feature-flag service; owner/tester entitlement is the pilot gate.
- Do not change MiniMax-M3, add provider routing, or expose model selection.
- Do not auto-publish ads or build a manual creative editor.
- Do not claim global fine-tuning readiness from client preference data alone; only consented, owner-reviewed corpus items qualify.

## Self-Review Checklist

- [x] Every locked product decision maps to a task and test.
- [x] Legacy fallback survives every phase.
- [x] All new persistence is scoped by workspace, client, thread, and version where applicable.
- [x] All paid actions show exact amount and non-refundable copy before confirmation.
- [x] Multi-job actions cannot complete on the first child callback.
- [x] Goal completion requires four approved formats, not merely four generated files.
- [x] MiniMax-M3 remains the exact agent model.
- [x] No prompt, reasoning, output key, signed URL, annotation comment, or provider payload enters telemetry/global corpus.
- [x] Corpus promotion fails closed without active client consent and platform-owner review.
- [x] Browser and release-gate coverage exercise both input paths and background reload.
