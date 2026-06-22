# Corpus Learning Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar o loop corpus → aprendizado: auto-promote de todas as derivações elegíveis para avaliação, backfill histórico, propostas cliente (propõe+aceita) → `calibration_rules` no prompt, e promoção cross-client → `rubric_calibration_adjustments`.

**Architecture:** Estende módulos existentes (`candidate-capture`, `candidate-promotion`, `calibration_rules`, `rubric_calibration_adjustments`). Nova tabela `client_learning_proposals` para lifecycle propose/accept. Migration torna `selected_by_user_id` nullable com flag `auto_promoted`. Admin APIs em `/api/admin/quality/*` com `requirePlatformOwner`. Depende parcialmente do admin shell (`/admin/quality/queue`) — pode implementar APIs antes da UI admin.

**Tech Stack:** Next.js App Router, Drizzle ORM, Inngest (backfill job opcional), Vitest, TanStack Query.

**Spec:** `docs/superpowers/specs/2026-06-21-corpus-learning-loop-design.md`

---

## File Map

### Created

| File | Responsibility |
|------|----------------|
| `app/drizzle/0051_corpus_auto_promote.sql` | `auto_promoted` + nullable `selected_by_user_id` |
| `app/drizzle/0052_client_learning_proposals.sql` | Tabela propostas cliente |
| `app/src/server/human-quality/auto-promote.ts` | Promote após capture; retry |
| `app/src/server/human-quality/ingestion/backfill.ts` | Backfill cursor-based |
| `app/src/server/human-quality/ingestion/status.ts` | Contadores ingestão |
| `app/src/server/human-quality/learning/aggregate.ts` | Agregador de slices → propostas |
| `app/src/server/human-quality/learning/proposals.ts` | Accept/reject proposta → rule |
| `app/src/server/human-quality/learning/cross-client.ts` | Detecção global cross-client |
| `app/src/server/human-quality/learning/corpus-quality-prompt.ts` | `buildCorpusQualityPromptSection` |
| `app/src/server/human-quality/learning/directives.ts` | Failure reason → directive text |
| `app/src/server/repositories/client-learning-proposal.ts` | CRUD propostas |
| `app/src/server/repositories/human-quality-ingestion.ts` | Queries backfill elegíveis |
| `app/src/app/api/admin/quality/ingestion/status/route.ts` | GET status |
| `app/src/app/api/admin/quality/ingestion/status/route.test.ts` | Tests |
| `app/src/app/api/admin/quality/ingestion/backfill/route.ts` | POST backfill |
| `app/src/app/api/admin/quality/ingestion/backfill/route.test.ts` | Tests |
| `app/src/app/api/admin/quality/learning/proposals/route.ts` | GET propostas |
| `app/src/app/api/admin/quality/learning/proposals/route.test.ts` | Tests |
| `app/src/app/api/admin/quality/learning/proposals/generate/route.ts` | POST agregador |
| `app/src/app/api/admin/quality/learning/proposals/[id]/accept/route.ts` | POST accept |
| `app/src/app/api/admin/quality/learning/proposals/[id]/reject/route.ts` | POST reject |
| `app/src/components/admin/quality/LearningProposalsView.tsx` | UI propostas (Fase 4) |
| `app/src/app/(admin)/admin/quality/learning/page.tsx` | Rota learning |
| `app/tests/unit/human-quality/auto-promote.test.ts` | Tests auto-promote |
| `app/tests/unit/human-quality/ingestion/backfill.test.ts` | Tests backfill |
| `app/tests/unit/human-quality/learning/aggregate.test.ts` | Tests agregador |
| `app/tests/unit/human-quality/learning/proposals.test.ts` | Tests accept/reject |
| `app/tests/unit/human-quality/learning/corpus-quality-prompt.test.ts` | Tests prompt section |

### Modified

| File | Change |
|------|--------|
| `app/src/server/db/schema.ts` | `autoPromoted` em corpus items; `clientLearningProposals` table |
| `app/drizzle/meta/_journal.json` | Entradas 0051, 0052 |
| `app/src/server/human-quality/candidate-capture.ts` | Retornar candidate mesmo sem throw em edge cases; chamar auto-promote |
| `app/src/server/human-quality/candidate-promotion.ts` | Suportar `autoPromoted` + `selectedByUserId` opcional |
| `app/src/server/jobs/derivation.ts` | capture → auto-promote; inject corpus rules no prompt |
| `app/src/server/repositories/human-quality-corpus.ts` | Cursor pagination; `insertCorpusItem` autoPromoted |
| `app/src/server/repositories/human-quality-candidate.ts` | `promoteError` column opcional ou metadata |
| `app/src/server/brand-taste/calibration-signal-types.ts` | Add `corpus_quality` to `RULE_CATEGORIES` |
| `app/src/server/brand-taste/taste-application.ts` | Export merge helper ou reexport corpus section |
| `app/src/server/ai/regeneration-correction-brief.ts` | Preencher `HUMAN_FAILURE_CORRECTION_DIRECTIVES` para todos os reasons visuais |
| `app/src/server/repositories/calibration-rule.ts` | `listApprovedCalibrationRulesByCategories` |
| `app/src/app/api/feedback/human-quality-corpus/route.ts` | Cursor query param na fila global |
| `app/src/components/admin/quality/CorpusQueueView.tsx` | Paginação cursor (quando admin shell existir) |
| `app/src/components/admin/AdminSidebar.tsx` | Item Learning |

---

## Task 1: Migration `auto_promoted`

**Files:**
- Create: `app/drizzle/0051_corpus_auto_promote.sql`
- Modify: `app/src/server/db/schema.ts`
- Modify: `app/drizzle/meta/_journal.json`

- [ ] **Step 1: Write migration SQL**

```sql
-- app/drizzle/0051_corpus_auto_promote.sql
ALTER TABLE "adscale_app"."human_quality_corpus_items"
  ADD COLUMN IF NOT EXISTS "auto_promoted" boolean NOT NULL DEFAULT false;

ALTER TABLE "adscale_app"."human_quality_corpus_items"
  ALTER COLUMN "selected_by_user_id" DROP NOT NULL;
```

- [ ] **Step 2: Update Drizzle schema**

Em `humanQualityCorpusItems` em `app/src/server/db/schema.ts`:

```typescript
autoPromoted: boolean("auto_promoted").notNull().default(false),
selectedByUserId: text("selected_by_user_id")
  .references(() => user.id, { onDelete: "cascade" }), // remove .notNull()
```

- [ ] **Step 3: Run migration**

```bash
cd app && npm run db:migrate
```

Expected: migration applies without error.

- [ ] **Step 4: Commit**

```bash
git add app/drizzle/0051_corpus_auto_promote.sql app/src/server/db/schema.ts app/drizzle/meta/_journal.json
git commit -m "feat(corpus): add auto_promoted flag and nullable selected_by_user_id"
```

---

## Task 2: Auto-promote service

**Files:**
- Create: `app/src/server/human-quality/auto-promote.ts`
- Create: `app/tests/unit/human-quality/auto-promote.test.ts`
- Modify: `app/src/server/human-quality/candidate-promotion.ts`

- [ ] **Step 1: Write failing test**

```typescript
// app/tests/unit/human-quality/auto-promote.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/human-quality/candidate-promotion", () => ({
  promoteCorpusCandidateToQueue: vi.fn(),
}));

import { autoPromoteCandidate } from "@/server/human-quality/auto-promote";
import { promoteCorpusCandidateToQueue } from "@/server/human-quality/candidate-promotion";

const mockPromote = vi.mocked(promoteCorpusCandidateToQueue);

describe("autoPromoteCandidate", () => {
  it("promotes with baseline cohort and autoPromoted flag", async () => {
    mockPromote.mockResolvedValue({
      candidate: { id: "c1" } as never,
      item: { id: "i1", autoPromoted: true } as never,
      created: true,
    });

    const result = await autoPromoteCandidate({ candidateId: "c1" });

    expect(mockPromote).toHaveBeenCalledWith({
      candidateId: "c1",
      cohort: "baseline",
      autoPromoted: true,
      selectedByUserId: undefined,
    });
    expect(result.created).toBe(true);
  });

  it("returns existing item without error when already promoted", async () => {
    mockPromote.mockResolvedValue({
      candidate: { id: "c1" } as never,
      item: { id: "i1" } as never,
      created: false,
    });

    const result = await autoPromoteCandidate({ candidateId: "c1" });
    expect(result.created).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd app && npm test -- tests/unit/human-quality/auto-promote.test.ts
```

- [ ] **Step 3: Implement `auto-promote.ts` and update promotion**

```typescript
// app/src/server/human-quality/auto-promote.ts
import { promoteCorpusCandidateToQueue } from "./candidate-promotion";

export async function autoPromoteCandidate(input: { candidateId: string }) {
  return promoteCorpusCandidateToQueue({
    candidateId: input.candidateId,
    cohort: "baseline",
    autoPromoted: true,
  });
}

export async function captureAndAutoPromote(input: {
  workspaceId: string;
  derivationId: string;
}) {
  const { captureCorpusCandidateFromDerivation } = await import("./candidate-capture");
  const candidate = await captureCorpusCandidateFromDerivation(input);
  if (!candidate) return { candidate: null, promoted: null };

  try {
    const promoted = await autoPromoteCandidate({ candidateId: candidate.id });
    return { candidate, promoted };
  } catch (error) {
    const message = error instanceof Error ? error.message : "promote_failed";
    return { candidate, promoted: null, promoteError: message };
  }
}
```

Update `PromoteCorpusCandidateInput` in `candidate-promotion.ts`:

```typescript
export interface PromoteCorpusCandidateInput {
  candidateId: string;
  cohort: string;
  selectedByUserId?: string;
  autoPromoted?: boolean;
}

// in insertCorpusItem call:
selectedByUserId: input.selectedByUserId ?? null,
autoPromoted: input.autoPromoted ?? false,
```

- [ ] **Step 4: Run tests**

```bash
cd app && npm test -- tests/unit/human-quality/auto-promote.test.ts tests/unit/human-quality/candidate-promotion.test.ts
```

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(corpus): auto-promote service after candidate capture"
```

---

## Task 3: Wire derivation job

**Files:**
- Modify: `app/src/server/jobs/derivation.ts`

- [ ] **Step 1: Replace capture step with captureAndAutoPromote**

```typescript
// app/src/server/jobs/derivation.ts — step "capture-corpus-candidate"
import { captureAndAutoPromote } from "../human-quality/auto-promote";

await step.run("capture-corpus-candidate", async () => {
  try {
    const result = await captureAndAutoPromote({ workspaceId, derivationId });
    if (result.promoteError) {
      logger.warn(
        `[capture-corpus-candidate] promote failed derivationId=${derivationId}: ${result.promoteError}`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.warn(
      `[capture-corpus-candidate] failed derivationId=${derivationId}: ${message}`
    );
  }
});
```

- [ ] **Step 2: Run build**

```bash
cd app && npm run build
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(corpus): auto-promote on derivation completion"
```

---

## Task 4: Backfill + ingestion status

**Files:**
- Create: `app/src/server/repositories/human-quality-ingestion.ts`
- Create: `app/src/server/human-quality/ingestion/backfill.ts`
- Create: `app/src/server/human-quality/ingestion/status.ts`
- Create: `app/tests/unit/human-quality/ingestion/backfill.test.ts`

- [ ] **Step 1: Write failing backfill test**

```typescript
// app/tests/unit/human-quality/ingestion/backfill.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/human-quality-ingestion", () => ({
  listEligibleDerivationsForBackfill: vi.fn(),
}));
vi.mock("@/server/human-quality/auto-promote", () => ({
  captureAndAutoPromote: vi.fn(),
}));

import { runCorpusBackfillBatch } from "@/server/human-quality/ingestion/backfill";
import { listEligibleDerivationsForBackfill } from "@/server/repositories/human-quality-ingestion";
import { captureAndAutoPromote } from "@/server/human-quality/auto-promote";

describe("runCorpusBackfillBatch", () => {
  it("processes eligible derivations idempotently", async () => {
    vi.mocked(listEligibleDerivationsForBackfill).mockResolvedValue([
      { workspaceId: "ws-1", derivationId: "d-1" },
    ]);
    vi.mocked(captureAndAutoPromote).mockResolvedValue({
      candidate: { id: "c1" } as never,
      promoted: { created: true } as never,
    });

    const result = await runCorpusBackfillBatch({ batchSize: 500 });

    expect(result.processed).toBe(1);
    expect(result.created).toBe(1);
    expect(captureAndAutoPromote).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      derivationId: "d-1",
    });
  });
});
```

- [ ] **Step 2: Implement repository query**

```typescript
// app/src/server/repositories/human-quality-ingestion.ts
import { and, eq, isNotNull, gt, asc } from "drizzle-orm";
import { db } from "../db";
import { derivations } from "../db/schema";

export async function listEligibleDerivationsForBackfill(input: {
  batchSize: number;
  cursor?: { createdAt: Date; id: string } | null;
  workspaceId?: string;
}) {
  const conditions = [
    eq(derivations.status, "completed"),
    isNotNull(derivations.outputKey),
  ];
  if (input.workspaceId) {
    conditions.push(eq(derivations.workspaceId, input.workspaceId));
  }
  if (input.cursor) {
    conditions.push(
      gt(derivations.createdAt, input.cursor.createdAt)
    );
  }

  return db
    .select({
      workspaceId: derivations.workspaceId,
      derivationId: derivations.id,
      createdAt: derivations.createdAt,
    })
    .from(derivations)
    .where(and(...conditions))
    .orderBy(asc(derivations.createdAt), asc(derivations.id))
    .limit(input.batchSize);
}
```

`captureAndAutoPromote` já é idempotente (candidate/corpus dedupe).

- [ ] **Step 3: Implement backfill + status**

```typescript
// app/src/server/human-quality/ingestion/backfill.ts
export async function runCorpusBackfillBatch(input: {
  batchSize?: number;
  cursor?: { createdAt: string; id: string } | null;
  workspaceId?: string;
}) {
  const batchSize = input.batchSize ?? 500;
  const rows = await listEligibleDerivationsForBackfill({
    batchSize,
    cursor: input.cursor
      ? { createdAt: new Date(input.cursor.createdAt), id: input.cursor.id }
      : null,
    workspaceId: input.workspaceId,
  });

  let created = 0;
  let promoted = 0;
  let skipped = 0;
  let blocked = 0;

  for (const row of rows) {
    const result = await captureAndAutoPromote({
      workspaceId: row.workspaceId,
      derivationId: row.derivationId,
    });
    if (!result.candidate) {
      skipped += 1;
      continue;
    }
    created += 1;
    if (result.promoted?.created) promoted += 1;
    if (result.promoteError) blocked += 1;
  }

  const last = rows[rows.length - 1];
  return {
    processed: rows.length,
    created,
    promoted,
    skipped,
    blocked,
    nextCursor: last
      ? { createdAt: last.createdAt.toISOString(), id: last.derivationId }
      : null,
  };
}
```

```typescript
// app/src/server/human-quality/ingestion/status.ts
export async function getCorpusIngestionStatus() {
  // count derivations completed with outputKey
  // count candidates, corpus pending, evaluated, unpromoted candidates
  return {
    eligibleDerivations,
    totalCandidates,
    pendingQueue,
    evaluated,
    blockedMissingClientProfile,
  };
}
```

- [ ] **Step 4: Run tests**

```bash
cd app && npm test -- tests/unit/human-quality/ingestion/backfill.test.ts
```

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(corpus): backfill batch and ingestion status helpers"
```

---

## Task 5: Ingestion APIs

**Files:**
- Create: `app/src/app/api/admin/quality/ingestion/status/route.ts`
- Create: `app/src/app/api/admin/quality/ingestion/backfill/route.ts`
- Create: `app/src/app/api/admin/quality/ingestion/status/route.test.ts`
- Create: `app/src/app/api/admin/quality/ingestion/backfill/route.test.ts`

- [ ] **Step 1: Implement routes with requirePlatformOwner**

```typescript
// app/src/app/api/admin/quality/ingestion/status/route.ts
import { NextResponse } from "next/server";
import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { getCorpusIngestionStatus } from "@/server/human-quality/ingestion/status";

export async function GET(request: Request) {
  const { user } = await requirePlatformOwner(request);
  void user;
  const status = await getCorpusIngestionStatus();
  return NextResponse.json(status);
}
```

```typescript
// app/src/app/api/admin/quality/ingestion/backfill/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { runCorpusBackfillBatch } from "@/server/human-quality/ingestion/backfill";

const bodySchema = z.object({
  batchSize: z.number().int().min(1).max(1000).optional(),
  cursor: z
    .object({ createdAt: z.string(), id: z.string().uuid() })
    .nullable()
    .optional(),
  workspaceId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  await requirePlatformOwner(request);
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error" }, { status: 400 });
  }
  const result = await runCorpusBackfillBatch(parsed.data);
  return NextResponse.json(result);
}
```

- [ ] **Step 2: Write route tests** (mirror `human-quality-corpus/route.test.ts` owner auth pattern)

- [ ] **Step 3: Run tests + build**

```bash
cd app && npm test -- src/app/api/admin/quality/ingestion && npm run build
```

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(corpus): admin ingestion status and backfill APIs"
```

---

## Task 6: Queue cursor pagination

**Files:**
- Modify: `app/src/server/repositories/human-quality-corpus.ts`
- Modify: `app/src/app/api/feedback/human-quality-corpus/route.ts`

- [ ] **Step 1: Add cursor to `listCorpusQueueItems`**

```typescript
export interface ListCorpusQueueFilters {
  // existing fields...
  cursor?: { selectedAt: Date; id: string } | null;
  limit?: number;
}

// in query: if cursor, add (selectedAt, id) < cursor ordering
// return { items, nextCursor }
```

- [ ] **Step 2: Expose cursor in GET route query params**

```typescript
const querySchema = z.object({
  // existing...
  cursorSelectedAt: z.string().datetime().optional(),
  cursorId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
```

- [ ] **Step 3: Test repository cursor**

```bash
cd app && npm test -- tests/unit/human-quality/human-quality-repository.test.ts
```

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(corpus): cursor pagination for global queue"
```

---

## Task 7: Migration `client_learning_proposals`

**Files:**
- Create: `app/drizzle/0052_client_learning_proposals.sql`
- Create: `app/src/server/repositories/client-learning-proposal.ts`
- Modify: `app/src/server/db/schema.ts`

- [ ] **Step 1: Write migration**

```sql
CREATE TABLE IF NOT EXISTS "adscale_app"."client_learning_proposals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "adscale_app"."workspaces"("id") ON DELETE CASCADE,
  "client_profile_id" uuid NOT NULL REFERENCES "adscale_app"."client_profiles"("id") ON DELETE CASCADE,
  "slice_key" text NOT NULL,
  "primary_failure_reason" text NOT NULL,
  "status" text NOT NULL DEFAULT 'proposed',
  "evidence_refs" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "rationale" text NOT NULL,
  "proposed_at" timestamp DEFAULT now() NOT NULL,
  "accepted_at" timestamp,
  "accepted_by" text REFERENCES "adscale_app"."user"("id") ON DELETE SET NULL,
  "rejected_reason" text,
  "cooldown_until" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "client_learning_proposals_status_check"
    CHECK ("status" in ('proposed', 'accepted', 'rejected'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "client_learning_proposals_active_slice_uq"
  ON "adscale_app"."client_learning_proposals" ("workspace_id", "client_profile_id", "slice_key")
  WHERE "status" = 'proposed';
```

- [ ] **Step 2: Drizzle schema + repository CRUD**

- [ ] **Step 3: Migrate + commit**

```bash
cd app && npm run db:migrate
git commit -am "feat(corpus): client_learning_proposals table"
```

---

## Task 8: Learning aggregator

**Files:**
- Create: `app/src/server/human-quality/learning/aggregate.ts`
- Create: `app/src/server/human-quality/learning/directives.ts`
- Create: `app/tests/unit/human-quality/learning/aggregate.test.ts`

- [ ] **Step 1: Write failing aggregate test**

```typescript
import { describe, expect, it } from "vitest";
import { buildClientLearningProposals } from "@/server/human-quality/learning/aggregate";

describe("buildClientLearningProposals", () => {
  it("proposes when slice has 3+ evaluations and |meanSignedDelta| >= 15", () => {
    const rows = [/* 3 EvaluatedCorpusRow mocks with same failure reason */];
    const proposals = buildClientLearningProposals(rows);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].status).toBe("proposed");
  });

  it("skips when fewer than 3 evaluations", () => {
    const proposals = buildClientLearningProposals([/* 2 rows */]);
    expect(proposals).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Implement aggregate using `buildCalibrationComparisons` + `aggregateGroup`**

```typescript
// app/src/server/human-quality/learning/aggregate.ts
import { buildCalibrationComparisons } from "../calibration/compare";
import { aggregateGroup, buildCompositeSliceKey } from "../calibration/aggregate";
import { MIN_SLICE_SAMPLE } from "../calibration/report";
import { buildDirectiveForFailureReason } from "./directives";
import type { EvaluatedCorpusRow } from "@/server/repositories/human-quality-corpus";

const DIVERGENCE_THRESHOLD = 15;

export function buildClientLearningProposals(rows: EvaluatedCorpusRow[]) {
  const comparisons = buildCalibrationComparisons(rows);
  const buckets = new Map<string, typeof comparisons>();

  for (const comparison of comparisons) {
    const key = `${comparison.workspaceId}:${comparison.clientProfileId}:${buildCompositeSliceKey(
      comparison.primaryFailureReason,
      comparison.generationMode,
      comparison.format
    )}`;
    buckets.set(key, [...(buckets.get(key) ?? []), comparison]);
  }

  const proposals = [];
  for (const [sliceKey, sliceComparisons] of buckets) {
    const stats = aggregateGroup(sliceComparisons);
    if (stats.count < MIN_SLICE_SAMPLE) continue;
    if (
      stats.meanSignedDelta === null ||
      Math.abs(stats.meanSignedDelta) < DIVERGENCE_THRESHOLD
    ) continue;

    const rejectRegenerateCount = sliceComparisons.filter(
      (c) => c.intent === "reject" || c.intent === "regenerate"
    ).length;
    if (rejectRegenerateCount < 2) continue;

    const primaryFailureReason = sliceComparisons[0].primaryFailureReason;
    if (primaryFailureReason === "factual_issue") continue;

    proposals.push({
      sliceKey,
      workspaceId: sliceComparisons[0].workspaceId,
      clientProfileId: sliceComparisons[0].clientProfileId,
      primaryFailureReason,
      status: "proposed" as const,
      rationale: buildDirectiveForFailureReason(primaryFailureReason),
      evidenceRefs: {
        corpusItemIds: sliceComparisons.map((c) => c.corpusItemId),
        stats,
      },
    });
  }
  return proposals;
}
```

- [ ] **Step 3: Implement directives map** (reuse `getHumanFailureCorrectionDirectives` + expand `HUMAN_FAILURE_CORRECTION_DIRECTIVES` in `regeneration-correction-brief.ts`)

- [ ] **Step 4: Run tests + commit**

```bash
cd app && npm test -- tests/unit/human-quality/learning/aggregate.test.ts
git commit -am "feat(corpus): client learning proposal aggregator"
```

---

## Task 9: Accept/reject proposals → calibration_rules

**Files:**
- Create: `app/src/server/human-quality/learning/proposals.ts`
- Create: `app/tests/unit/human-quality/learning/proposals.test.ts`
- Modify: `app/src/server/brand-taste/calibration-signal-types.ts`

- [ ] **Step 1: Add `corpus_quality` to RULE_CATEGORIES**

```typescript
export const RULE_CATEGORIES = [
  "figure",
  "gestalt",
  "hierarchy",
  "voice",
  "invite",
  "export_conflict",
  "brand_nuance",
  "corpus_quality",
] as const;
```

- [ ] **Step 2: Write failing accept test**

```typescript
it("acceptProposal creates approved calibration_rule and marks proposal accepted", async () => {
  // mock proposal repo + insertCalibrationRule
  const result = await acceptClientLearningProposal({
    proposalId: "p1",
    reviewerUserId: "user-1",
  });
  expect(result.rule.category).toBe("corpus_quality");
  expect(result.rule.status).toBe("approved");
});
```

- [ ] **Step 3: Implement accept**

```typescript
export async function acceptClientLearningProposal(input: {
  proposalId: string;
  reviewerUserId: string;
}) {
  const proposal = await getClientLearningProposalById(input.proposalId);
  if (!proposal || proposal.status !== "proposed") {
    throw new ClientLearningProposalError("not_proposed", "Proposal not found or not proposed");
  }
  if (proposal.evidenceRefs.corpusItemIds.length < MIN_SLICE_SAMPLE) {
    throw new ClientLearningProposalError("insufficient_evidence", "Need 3+ corpus items");
  }

  const rule = await insertCalibrationRule({
    workspaceId: proposal.workspaceId,
    clientProfileId: proposal.clientProfileId,
    category: "corpus_quality",
    status: "approved",
    rationale: proposal.rationale,
    supportingSignalIds: proposal.evidenceRefs.feedbackArtifactIds ?? [],
    confidence: "medium",
    caveats: [],
    mismatchBucket: null,
    version: 1,
    approvedAt: new Date(),
    approvedBy: input.reviewerUserId,
  });

  await markProposalAccepted(proposal.id, input.reviewerUserId);
  return { proposal, rule };
}
```

- [ ] **Step 4: Implement reject with 30-day cooldown**

- [ ] **Step 5: Run tests + commit**

```bash
cd app && npm test -- tests/unit/human-quality/learning/proposals.test.ts
git commit -am "feat(corpus): accept client learning proposals as calibration rules"
```

---

## Task 10: Learning APIs

**Files:**
- Create: `app/src/app/api/admin/quality/learning/proposals/route.ts`
- Create: `app/src/app/api/admin/quality/learning/proposals/generate/route.ts`
- Create: `app/src/app/api/admin/quality/learning/proposals/[id]/accept/route.ts`
- Create: `app/src/app/api/admin/quality/learning/proposals/[id]/reject/route.ts`

- [ ] **Step 1: GET lists proposals with filters (status, clientProfileId)**

- [ ] **Step 2: POST generate runs aggregator on `listEvaluatedCorpusWithEvaluations` global, upserts proposals**

```typescript
export async function persistGeneratedProposals(proposals: GeneratedProposal[]) {
  for (const proposal of proposals) {
    const existing = await findActiveProposalBySlice(proposal.sliceKey);
    if (existing) continue;
    await insertClientLearningProposal(proposal);
  }
}
```

- [ ] **Step 3: Accept/reject routes**

- [ ] **Step 4: Route tests + build**

```bash
cd app && npm test -- src/app/api/admin/quality/learning && npm run build
```

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(corpus): admin learning proposal APIs"
```

---

## Task 11: Prompt injection

**Files:**
- Create: `app/src/server/human-quality/learning/corpus-quality-prompt.ts`
- Create: `app/tests/unit/human-quality/learning/corpus-quality-prompt.test.ts`
- Modify: `app/src/server/repositories/calibration-rule.ts`
- Modify: `app/src/server/jobs/derivation.ts`

- [ ] **Step 1: Add listApprovedByCategories to calibration-rule repo**

```typescript
export async function listApprovedCalibrationRulesByCategories(input: {
  workspaceId: string;
  clientProfileId: string;
  categories: string[];
}): Promise<CalibrationRule[]> {
  return db
    .select()
    .from(calibrationRules)
    .where(
      and(
        eq(calibrationRules.workspaceId, input.workspaceId),
        eq(calibrationRules.clientProfileId, input.clientProfileId),
        eq(calibrationRules.status, "approved"),
        inArray(calibrationRules.category, input.categories)
      )
    );
}
```

- [ ] **Step 2: Implement prompt section**

```typescript
export function buildCorpusQualityPromptSection(
  rules: Array<{ id: string; rationale: string; category: string }>
): string[] {
  if (rules.length === 0) return [];
  return [
    "CORPUS QUALITY CONSTRAINTS (human-evaluated patterns for this brand):",
    ...rules.map(
      (rule) => `[corpus-quality:${rule.id}] ${rule.category}: ${rule.rationale}`
    ),
    "Do not weaken factual text, CTA spelling, or export compliance.",
  ];
}
```

- [ ] **Step 3: Wire in derivationJob before buildDerivationPrompt**

```typescript
const corpusQualityRules = await listApprovedCalibrationRulesByCategories({
  workspaceId,
  clientProfileId,
  categories: ["corpus_quality"],
});
const corpusQualitySection = buildCorpusQualityPromptSection(corpusQualityRules);
// append to brandTasteConstraints or dedicated config field
generationLog.appliedCorpusRuleIds = corpusQualityRules.map((r) => r.id);
```

Cap: slice to 10 rules max (spec risk mitigation).

- [ ] **Step 4: Tests + regression**

```bash
cd app && npm test -- tests/unit/human-quality/learning/corpus-quality-prompt.test.ts
cd app && npm test -- tests/unit/ai/creative-validation-evidence-guard.test.ts
```

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(corpus): inject corpus_quality rules into derivation prompt"
```

---

## Task 12: Cross-client global promotion

**Files:**
- Create: `app/src/server/human-quality/learning/cross-client.ts`
- Modify: `app/src/server/human-quality/calibration/service.ts` (or call from generate route)

- [ ] **Step 1: Write test for cross-client detection**

```typescript
it("promotes to global when 2+ clients have approved corpus_quality rules for same failure", async () => {
  const result = await detectCrossClientGlobalProposals();
  expect(result).toHaveLength(1);
  expect(result[0].primaryFailureReason).toBe("illegible_cta");
});
```

- [ ] **Step 2: Implement detection**

```typescript
export async function detectCrossClientGlobalProposals() {
  const approvedRules = await listApprovedCorpusQualityRules();
  const byFailure = groupBy(approvedRules, (r) => extractFailureFromRationale(r));
  const proposals = [];
  for (const [failure, rules] of byFailure) {
    const distinctClients = new Set(rules.map((r) => r.clientProfileId));
    if (distinctClients.size < 2) continue;
    // load evaluated rows for those clients + failure, run proposeAdjustments
    proposals.push(...);
  }
  return proposals;
}
```

Store `primaryFailureReason` on `calibration_rules` when created from proposal (add column or encode in rationale prefix `failure:illegible_cta|`).

- [ ] **Step 3: Call from POST generate after client proposals**

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(corpus): cross-client detection for global calibration proposals"
```

---

## Task 13: Learning UI (admin)

**Files:**
- Create: `app/src/components/admin/quality/LearningProposalsView.tsx`
- Create: `app/src/app/(admin)/admin/quality/learning/page.tsx`
- Modify: `app/src/components/admin/AdminSidebar.tsx`

**Depends on:** admin shell from `docs/superpowers/plans/2026-06-21-admin-panel.md`. Se admin ainda não existir, adicionar tab temporária em `HumanQualityCorpusPanel`.

- [ ] **Step 1: LearningProposalsView with two tabs (Cliente | Global)**

- [ ] **Step 2: TanStack Query hooks for proposals APIs**

- [ ] **Step 3: Accept/Reject buttons with confirmation**

- [ ] **Step 4: Ingestion banner component on queue page** (status + backfill button)

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(admin): corpus learning proposals UI"
```

---

## Task 14: Daily aggregator job (optional but recommended)

**Files:**
- Modify: `app/src/server/jobs/` (new Inngest function or extend existing)

- [ ] **Step 1: Create `learning-proposal-aggregator` Inngest cron daily**

- [ ] **Step 2: Calls same logic as POST generate**

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(corpus): daily learning proposal aggregator job"
```

---

## Task 15: Final verification

- [ ] **Run full test suite**

```bash
cd app && npm test
```

- [ ] **Run build**

```bash
cd app && npm run build
```

- [ ] **Manual smoke**

1. Complete a derivation → verify corpus item `pending` + `auto_promoted=true` without manual promote
2. POST backfill with `batchSize: 10` → verify counts
3. Submit 3 evaluations same client/failure → POST generate → proposal appears
4. Accept proposal → next derivation for client includes corpus constraint in generation log

---

## Spec Coverage Check

| Spec section | Task |
|--------------|------|
| Auto-promote total | 1, 2, 3 |
| Backfill histórico | 4, 5 |
| Ingestion status UI | 5, 13 |
| Queue pagination | 6 |
| client_learning_proposals | 7, 8, 9, 10 |
| Propõe + aceita | 9, 10, 13 |
| Failure → directive | 8, 11 |
| Prompt injection | 11 |
| Cross-client global | 12 |
| Jobs diário | 14 |
| Fora de escopo respeitado | no regenerate auto task |

---

## Dependency Note

Este plano pode rodar **em paralelo parcial** com o admin panel plan:

- Tasks 1–6, 7–12: APIs + server logic independentes da UI admin
- Task 13: requer admin shell ou fallback em `HumanQualityCorpusPanel`

Recomendação: implementar Tasks 1–6 primeiro (ingestão + fila), depois 7–12 (learning loop), depois UI quando admin shell estiver pronto.
