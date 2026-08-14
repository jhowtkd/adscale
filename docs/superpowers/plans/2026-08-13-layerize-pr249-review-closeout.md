# Layerize PR #249 Review Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining PR #249 audit findings with a real PostgreSQL race regression, deterministic catalog/document cleanup, and validation evidence for the final local revision.

**Architecture:** Keep the production Layerize implementation unchanged: the existing `SELECT ... FOR UPDATE` selection transaction and guarded Layerize claim already provide the intended serialization. Add one focused real-PostgreSQL integration test around those public repository functions, remove merge residue from the message catalogs and migration documentation, then regenerate the existing release-evidence document from actual command output.

**Tech Stack:** TypeScript, Vitest, Drizzle ORM, PostgreSQL 16 test container, Next.js 16.2.6, Graphify, Git.

## Global Constraints

- Work only in `/Users/jhonatan/Repos/ADScale_2-worktrees/seedream-layerize` on `feat/227-seedream-layerize`.
- Preserve every existing `.planning/**` modification and untracked file; never stage them and never use `git add -A` or `git add .`.
- Keep `FAL_KEY` unset. Automated tests must not contact fal or perform paid inference.
- Do not push, merge, deploy, configure production secrets, run a paid smoke, or start #235 during this plan.
- Keep Layerize as optional post-approval export of the selected Peça; do not change generation routing, billing, persistence shape, API surface, or provider choice.
- Use the existing `selectCreativeWorkOutput()` and `claimCreativeWorkLayerization()` functions; add no transaction abstraction or test-only production hook.
- Retain canonical copy: English uses “Piece”; Portuguese uses “Peça”.
- The canonical migration order is `0083_brand_font_assets`, `0084_brand_knowledge`, `0085_creative_work_layerization`.
- Stage explicit paths for every commit and verify the staged diff before committing.

---

## File Structure

- Create `app/tests/integration/creative-work-layerization-selection-lock.test.ts`: real-PostgreSQL regression proving that a Layerize claim and a competing selection cannot both win.
- Modify `app/messages/en.json`: retain one `downloadPngs` entry in the Layerize copy block.
- Modify `app/messages/pt-BR.json`: retain one `downloadPngs` entry in the Layerize copy block.
- Modify `docs/superpowers/plans/2026-08-12-brand-evidence-graph.md`: reconcile the two stale migration filenames with the committed journal.
- Modify `docs/evidence/creative-work-layerization-local-validation-2026-08-12.md`: record the actual final tested revision and command results.
- Do not modify production Layerize code unless the real PostgreSQL regression exposes a new defect; stop and review the result before expanding scope.

### Task 1: Add the real PostgreSQL claim-versus-selection regression

**Files:**
- Create: `app/tests/integration/creative-work-layerization-selection-lock.test.ts`
- Reference: `app/src/server/repositories/creative-work.ts:1408-1480`
- Reference: `app/src/server/repositories/creative-work-layerization.ts:59-78`

**Interfaces:**
- Consumes: `selectCreativeWorkOutput(workspaceId: string, workItemId: string, outputId: string, options?: { confirmObjective?: boolean }): Promise<CreativeWorkOutput | null>`.
- Consumes: `claimCreativeWorkLayerization(input: { workspaceId: string; workItemId: string; outputId: string; state: LayerizationState }): Promise<CreativeWorkOutput | null>`.
- Produces: one real-database regression asserting that exactly one concurrent operation wins and the durable row state matches that winner.

- [ ] **Step 1: Create the integration test with a controlled start barrier**

Create `app/tests/integration/creative-work-layerization-selection-lock.test.ts` with this content:

```ts
/**
 * Real-PostgreSQL regression for the selected-Peça Layerize lock.
 *
 * Both repository calls start behind the same in-process barrier. PostgreSQL
 * decides which row lock wins; the invariant is that claim and selection can
 * never both commit successfully.
 *
 * Requires:
 *   DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
 *   TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
 *   npm test -- --run tests/integration/creative-work-layerization-selection-lock.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  clientProfiles,
  creativeWorkItems,
  creativeWorkOutputs,
  user,
  workspaces,
} from "@/server/db/schema";
import { layerizationStateFromDatabase, type LayerizationState } from "@/server/layerize/contracts";
import { claimCreativeWorkLayerization } from "@/server/repositories/creative-work-layerization";
import { selectCreativeWorkOutput } from "@/server/repositories/creative-work";

const TEST_DB_EXPLICITLY_CONFIGURED = Boolean(
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
);
const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const userId = `layerize-lock-${runId}`;
const createdWorkspaceIds: string[] = [];

let workspaceId = "";
let clientProfileId = "";

function queuedState(attemptId: string): LayerizationState {
  const now = new Date();
  return {
    status: "queued",
    attemptId,
    callbackTokenHash: "a".repeat(64),
    callbackConsumedAt: null,
    requestedByUserId: userId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    callbackDeadlineAt: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    latencyMs: null,
    providerRequestId: null,
    providerModel: "bytedance/seedream/v5/pro/layerize",
    providerEndpoint: "https://queue.fal.run/bytedance/seedream/v5/pro/layerize",
    estimatedCostUsd: null,
    baseWidth: null,
    baseHeight: null,
    layers: [],
    psdKey: null,
    diagnosticZipKey: null,
    fidelity: null,
    failureCode: null,
  };
}

function controlledStart() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}

async function createRace(index: number) {
  const [work] = await db.insert(creativeWorkItems).values({
    workspaceId,
    clientProfileId,
    createdByUserId: userId,
    toolKind: "social_post",
    title: `Layerize lock ${runId}-${index}`,
    request: "Synthetic transaction race",
    format: "4:5",
    settings: { targetFormats: [] },
    status: "completed",
  }).returning();

  const [selected] = await db.insert(creativeWorkOutputs).values({
    workspaceId,
    workItemId: work.id,
    creativeLevel: "conservative",
    targetFormat: "4:5",
    operationKey: `selected-${index}`,
    status: "completed",
    outputKey: `creative-work/${work.id}/selected.png`,
    quality: { schemaVersion: 1, objectiveVerdict: "pass" },
    isSelected: true,
  }).returning();
  const [candidate] = await db.insert(creativeWorkOutputs).values({
    workspaceId,
    workItemId: work.id,
    creativeLevel: "balanced",
    targetFormat: "4:5",
    operationKey: `candidate-${index}`,
    status: "completed",
    outputKey: `creative-work/${work.id}/candidate.png`,
    quality: { schemaVersion: 1, objectiveVerdict: "pass" },
    isSelected: false,
  }).returning();

  return { work, selected, candidate };
}

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)(
  "creative-work Layerize selection lock (PostgreSQL real)",
  () => {
    beforeAll(async () => {
      await db.execute(sql`select 1`);
      const migration = await db.execute(sql`
        select column_name
        from information_schema.columns
        where table_schema = 'adscale_app'
          and table_name = 'creative_work_outputs'
          and column_name = 'layerization'
      `);
      if (migration.rows.length === 0) {
        throw new Error("Migration 0085 is not applied to the integration database");
      }

      await db.insert(user).values({
        id: userId,
        name: "Layerize Lock Test",
        email: `${userId}@example.com`,
        emailVerified: true,
      });
      const [workspace] = await db.insert(workspaces).values({
        name: `Layerize Lock ${runId}`,
        slug: `layerize-lock-${runId}`,
      }).returning();
      const [profile] = await db.insert(clientProfiles).values({
        workspaceId: workspace.id,
        name: "Synthetic lock brand",
      }).returning();
      workspaceId = workspace.id;
      clientProfileId = profile.id;
      createdWorkspaceIds.push(workspace.id);
    }, 30_000);

    afterAll(async () => {
      if (createdWorkspaceIds.length > 0) {
        await db.delete(creativeWorkOutputs).where(inArray(creativeWorkOutputs.workspaceId, createdWorkspaceIds));
        await db.delete(creativeWorkItems).where(inArray(creativeWorkItems.workspaceId, createdWorkspaceIds));
        await db.delete(clientProfiles).where(inArray(clientProfiles.workspaceId, createdWorkspaceIds));
        await db.delete(workspaces).where(inArray(workspaces.id, createdWorkspaceIds));
      }
      await db.delete(user).where(eq(user.id, userId));
    }, 30_000);

    it("allows exactly one winner when Layerize claim races a new selection", async () => {
      for (let index = 0; index < 12; index += 1) {
        const race = await createRace(index);
        const start = controlledStart();

        const claimPromise = start.wait.then(() => claimCreativeWorkLayerization({
          workspaceId,
          workItemId: race.work.id,
          outputId: race.selected.id,
          state: queuedState(`attempt-${runId}-${index}`),
        }));
        const selectionPromise = start.wait.then(() => selectCreativeWorkOutput(
          workspaceId,
          race.work.id,
          race.candidate.id,
          { confirmObjective: true },
        ));

        start.release();
        const [claimed, newlySelected] = await Promise.all([claimPromise, selectionPromise]);
        expect([claimed, newlySelected].filter(Boolean)).toHaveLength(1);

        const rows = await db.select().from(creativeWorkOutputs)
          .where(eq(creativeWorkOutputs.workItemId, race.work.id));
        const original = rows.find((row) => row.id === race.selected.id);
        const candidate = rows.find((row) => row.id === race.candidate.id);
        expect(original).toBeDefined();
        expect(candidate).toBeDefined();

        if (claimed) {
          expect(newlySelected).toBeNull();
          expect(original?.isSelected).toBe(true);
          expect(candidate?.isSelected).toBe(false);
          expect(layerizationStateFromDatabase(original?.layerization)?.status).toBe("queued");
        } else {
          expect(newlySelected?.id).toBe(race.candidate.id);
          expect(original?.isSelected).toBe(false);
          expect(candidate?.isSelected).toBe(true);
          expect(original?.layerization).toBeNull();
        }
      }
    }, 30_000);
  },
);
```

This is a characterization/regression test for production code already fixed in `aa1bc649`; it is expected to pass on the current HEAD. Do not create a production seam merely to force a particular winner.

- [ ] **Step 2: Prepare the migrated test database**

Run from `app/`:

```bash
npm run test:db:setup
```

Expected: PostgreSQL at `localhost:5433` is ready and migrations through `0085_creative_work_layerization` apply successfully.

- [ ] **Step 3: Run the focused real-PostgreSQL regression**

Run from `app/`:

```bash
DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
NODE_ENV=test npm test -- --run \
tests/integration/creative-work-layerization-selection-lock.test.ts
```

Expected: one file and one test pass; no fal HTTP request or storage operation occurs.

- [ ] **Step 4: Verify and commit only the regression**

```bash
git diff --check -- app/tests/integration/creative-work-layerization-selection-lock.test.ts
git add app/tests/integration/creative-work-layerization-selection-lock.test.ts
git diff --cached --check
git diff --cached --stat
git commit -m "test: cover layerization selection race in postgres"
```

Expected staged content: only the new integration test.

### Task 2: Remove merge residue from catalogs and migration documentation

**Files:**
- Modify: `app/messages/en.json:632-657`
- Modify: `app/messages/pt-BR.json:668-693`
- Modify: `docs/superpowers/plans/2026-08-12-brand-evidence-graph.md:259,403`

**Interfaces:**
- Consumes: existing `downloadPngs` lookup used by the Layerize result card.
- Produces: one unambiguous translation value per locale and migration documentation matching the Drizzle journal.

- [ ] **Step 1: Delete only the later duplicate catalog keys**

Keep the `downloadPngs` entry beside `downloadPsdWithLayers` and remove the later entry beside `downloadPsd` in each locale:

```diff
           "downloadPsd": "Download PSD",
-          "downloadPngs": "Download PNGs",
           "failure": {
```

```diff
           "downloadPsd": "Baixar PSD",
-          "downloadPngs": "Baixar PNGs",
           "failure": {
```

- [ ] **Step 2: Correct both stale migration references**

Apply these exact documentation changes:

```diff
-- Entregue: `app/drizzle/0084_brand_font_assets.sql` (`0083` pertence à layerization).
+- Entregue: `app/drizzle/0083_brand_font_assets.sql`.
```

```diff
-- Criar: `app/drizzle/0085_brand_knowledge.sql`
+- Criar: `app/drizzle/0084_brand_knowledge.sql`
```

The Layerize runbook remains correct at `0085_creative_work_layerization.sql` and must not be changed.

- [ ] **Step 3: Validate JSON and exact key counts**

Run from `app/`:

```bash
node -e 'const fs=require("node:fs"); for (const file of ["messages/en.json","messages/pt-BR.json"]) { const text=fs.readFileSync(file,"utf8"); JSON.parse(text); const count=(text.match(/"downloadPngs"/g)||[]).length; if (count !== 1) throw new Error(`${file}: expected one downloadPngs, found ${count}`); }'
```

Expected: exit 0 with no output.

Run from the worktree root:

```bash
rg -n "008[345].*(brand|layer)|layerization.*008[345]" \
  docs/superpowers/plans/2026-08-12-brand-evidence-graph.md \
  docs/creative-work-layerization-runbook.md \
  app/drizzle/meta/_journal.json
```

Expected canonical mapping: Brand Fonts `0083`, Brand Knowledge `0084`, Layerize `0085`.

- [ ] **Step 4: Commit the cleanup with explicit paths**

```bash
git diff --check -- \
  app/messages/en.json \
  app/messages/pt-BR.json \
  docs/superpowers/plans/2026-08-12-brand-evidence-graph.md
git add \
  app/messages/en.json \
  app/messages/pt-BR.json \
  docs/superpowers/plans/2026-08-12-brand-evidence-graph.md
git diff --cached --check
git diff --cached --stat
git commit -m "chore: clean up layerize merge residue"
```

Expected staged content: exactly the two message catalogs and the existing Brand Evidence Graph plan.

### Task 3: Validate the combined revision and refresh committed evidence

**Files:**
- Modify: `docs/evidence/creative-work-layerization-local-validation-2026-08-12.md`
- Add: `docs/superpowers/plans/2026-08-13-layerize-pr249-review-closeout.md`
- Inspect only: `graphify-out/**`

**Interfaces:**
- Consumes: the two commits produced by Tasks 1 and 2.
- Produces: release evidence naming the exact tested code revision, exact command results, explicit intercepted seams, and unchanged human/paid gates.

- [ ] **Step 1: Capture the code revision that will be tested**

Run from the worktree root and save the output for the evidence document:

```bash
git show -s --format='commit: %H%nsubject: %s%ncommitted_at: %cI' HEAD
```

Expected subject: `chore: clean up layerize merge residue`. The resulting hash—not `f0786453` or `983f0fdb`—is the tested revision.

- [ ] **Step 2: Run the focused Layerize suite against PostgreSQL**

Run from `app/`:

```bash
DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
NODE_ENV=test npm test -- --run \
src/server/application/request-creative-work-layerization.test.ts \
src/server/application/recover-expired-creative-work-layerizations.test.ts \
src/server/application/select-creative-work-output.test.ts \
src/server/repositories/creative-work.test.ts \
src/server/repositories/creative-work-layerization.test.ts \
src/server/jobs/creative-work-layerization.test.ts \
src/server/layerize \
'src/app/api/creative-work/[id]/route.test.ts' \
tests/integration/creative-work-layerization-journey.test.ts \
tests/integration/creative-work-layerization-selection-lock.test.ts \
src/components/creative-work/CreativeResultCard.test.tsx
```

Expected: exit 0. Record the exact file count, test count, duration, and exit code shown by Vitest.

- [ ] **Step 3: Run static, full-suite, build, and convergence checks**

Run each command separately from `app/`; do not combine them so the evidence preserves independent exit status:

```bash
npm run typecheck
npm run lint
DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
NODE_ENV=test npm test
npm run build
npm run convergence:gate
```

Expected for every command: exit 0. Lint may report pre-existing warnings but must report zero errors. The full suite must have zero failed files and zero failed tests; record the actual counts instead of copying the previous `4,844` result.

- [ ] **Step 4: Run repository integrity and graph checks**

Run from the worktree root:

```bash
git diff --check origin/main...HEAD
graphify update .
git status --short graphify-out
```

Expected: `git diff --check` exits 0. Because this closeout changes tests, catalogs, and documentation but no production symbols, `graphify-out` should remain unchanged. If Graphify produces a diff, stop and inspect it rather than staging generated files blindly.

- [ ] **Step 5: Rewrite the existing evidence with actual outputs**

In `docs/evidence/creative-work-layerization-local-validation-2026-08-12.md`:

1. Replace the `Tested revision` block with the exact three lines from Step 1.
2. State that the revision includes the PostgreSQL selection-lock regression and migration reconciliation through `0085`.
3. Replace the focused-suite results with the exact Step 2 counts and add a subsection named `### Real-PostgreSQL selection-lock race` containing the single-test command and result from Task 1.
4. Replace the full-suite, lint, build, and convergence sections with the exact Step 3 output summaries and exit codes.
5. Retain the journey tracer’s four honest intercepted seams: `inngest.send`, in-process continuation, in-memory storage, and fake fal HTTP.
6. Retain these negative claims verbatim in substance: no real `FAL_KEY`, fal request, paid generation, deploy, production authentication, partner approval, push, or merge occurred; #235 remains `ready-for-human`.
7. Remove the obsolete paragraph describing the old `artifact-version.test.ts` failure if the new full suite exits 0.

Do not claim CI, GitHub mergeability, deployment, R2 behavior, provider economics, PSD application compatibility, or paid acceptance from local automated checks.

- [ ] **Step 6: Verify and commit the evidence and this execution plan**

```bash
rg -n "f0786453|22452093|983f0fdb|1 failed|4844 passed" \
  docs/evidence/creative-work-layerization-local-validation-2026-08-12.md
git diff --check -- docs/evidence/creative-work-layerization-local-validation-2026-08-12.md
git add \
  docs/evidence/creative-work-layerization-local-validation-2026-08-12.md \
  docs/superpowers/plans/2026-08-13-layerize-pr249-review-closeout.md
git diff --cached --check
git diff --cached --stat
git commit -m "docs: refresh layerize closeout evidence"
```

Expected: the `rg` command returns no matches; the commit contains only the evidence file and this plan.

- [ ] **Step 7: Verify the final worktree boundary**

```bash
git status --short --branch
git log --oneline --decorate -6
git diff --check origin/main...HEAD
```

Expected: the branch contains the three new closeout commits. Existing `.planning/**` WIP remains visible and unstaged; no other product source is dirty.

## Self-Review Results

- Spec coverage: Task 1 closes the real-concurrency evidence gap; Task 2 closes duplicate catalog keys and both stale migration references; Task 3 closes revision/evidence drift and reruns the required automatic release checks.
- Intentional exclusions: production Layerize behavior, provider configuration, push, merge, deploy, paid smoke, Partner approval, and #235 remain outside this implementation plan.
- Type consistency: the test calls the current exported `selectCreativeWorkOutput`, `claimCreativeWorkLayerization`, and `layerizationStateFromDatabase` signatures directly.
- Placeholder scan: the plan contains no deferred implementation markers; future-dependent hashes and counts are captured by exact commands and copied from actual output.

## Delivery Gate After This Plan

After explicit push authorization, push `feat/227-seedream-layerize`, wait for GitHub to recompute PR #249 mergeability, and require all remote checks to pass. Merge review comes next. Only after merge may #235 begin, still requiring separate authorization for `FAL_KEY`, deploy, authenticated smoke, paid inference, and human PSD acceptance.
