# Creative Scoring and Guided Regeneration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist a hybrid creative score for generated derivations, surface the best variations in the gallery, and let users regenerate weak creatives with score-derived feedback.

**Architecture:** Add score fields to `derivations`, a dedicated `creative-score` AI module, and a repository helper for score updates. The generation job writes a heuristic score after image completion, then attempts visual analysis without changing completed generations to failed when scoring errors occur. The UI reads persisted score data from the existing derivations endpoint and adds ranking plus guided regeneration actions.

**Tech Stack:** Next.js 16.2.4 App Router, React 19, TypeScript, Drizzle/Postgres, OpenAI SDK, Inngest, Vitest, Tailwind CSS.

---

### Task 1: Add score fields to the derivation schema

**Files:**
- Modify: `app/src/server/db/schema.ts`
- Create: `app/drizzle/0003_creative_scoring.sql`
- Modify: `app/drizzle/meta/_journal.json`
- Create/Modify: generated Drizzle metadata snapshot if using `npx drizzle-kit generate`

**Step 1: Read current migration state**

Run:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && ls drizzle && cat drizzle/meta/_journal.json
```

Expected: existing migrations are visible and the next migration number is clear.

**Step 2: Modify the schema**

Add these imports and fields in `derivations`:

```ts
// existing import list already includes integer, text, timestamp, jsonb

qualityScore: integer("quality_score"),
scoreStatus: text("score_status").notNull().default("pending"),
scoreBreakdown: jsonb("score_breakdown"),
scoreIssues: jsonb("score_issues"),
regenerationSuggestion: text("regeneration_suggestion"),
scoredAt: timestamp("scored_at", { mode: "date" }),
```

Place them near `feedback`, before timestamps.

**Step 3: Generate or write the migration**

Preferred:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx drizzle-kit generate --name creative_scoring
```

If generation is unavailable, create SQL manually:

```sql
ALTER TABLE "adscale_app"."derivations" ADD COLUMN "quality_score" integer;
ALTER TABLE "adscale_app"."derivations" ADD COLUMN "score_status" text DEFAULT 'pending' NOT NULL;
ALTER TABLE "adscale_app"."derivations" ADD COLUMN "score_breakdown" jsonb;
ALTER TABLE "adscale_app"."derivations" ADD COLUMN "score_issues" jsonb;
ALTER TABLE "adscale_app"."derivations" ADD COLUMN "regeneration_suggestion" text;
ALTER TABLE "adscale_app"."derivations" ADD COLUMN "scored_at" timestamp;
```

**Step 4: Run the schema/type check**

Run:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx tsc --noEmit --pretty false
```

Expected: no TypeScript errors from the schema change.

**Step 5: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/server/db/schema.ts app/drizzle && git commit -m "feat: add creative scoring fields"
```

---

### Task 2: Add score types and repository update helper

**Files:**
- Modify: `app/src/server/repositories/derivation.ts`
- Modify: `app/tests/unit/repositories/derivation.test.ts`

**Step 1: Write the failing test**

Add to `app/tests/unit/repositories/derivation.test.ts`:

```ts
import { updateDerivationScore } from "@/server/repositories/derivation";

it("updateDerivationScore persists score data", async () => {
  const mockReturning = vi.fn().mockResolvedValue([{ id: "deriv-1", qualityScore: 87 }]);
  const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

  const result = await updateDerivationScore("deriv-1", workspaceId, {
    qualityScore: 87,
    scoreStatus: "analyzed",
    scoreBreakdown: {
      ctaClarity: 90,
      textLegibility: 82,
      briefMatch: 88,
      visualQuality: 85,
      formatFit: 91,
    },
    scoreIssues: ["CTA could be more prominent"],
    regenerationSuggestion: "Make the CTA more prominent while preserving the exact CTA text.",
  });

  expect(result).toEqual({ id: "deriv-1", qualityScore: 87 });
  expect(mockSet).toHaveBeenCalledWith(
    expect.objectContaining({
      qualityScore: 87,
      scoreStatus: "analyzed",
      regenerationSuggestion: "Make the CTA more prominent while preserving the exact CTA text.",
      updatedAt: expect.any(Date),
      scoredAt: expect.any(Date),
    })
  );
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run tests/unit/repositories/derivation.test.ts
```

Expected: FAIL because `updateDerivationScore` does not exist.

**Step 3: Implement the helper**

In `app/src/server/repositories/derivation.ts`:

```ts
export type ScoreStatus = "pending" | "heuristic" | "analyzed" | "failed";

export interface CreativeScoreBreakdown {
  ctaClarity: number;
  textLegibility: number;
  briefMatch: number;
  visualQuality: number;
  formatFit: number;
}

export interface UpdateDerivationScoreInput {
  qualityScore?: number | null;
  scoreStatus: ScoreStatus;
  scoreBreakdown?: CreativeScoreBreakdown | null;
  scoreIssues?: string[] | null;
  regenerationSuggestion?: string | null;
}

export async function updateDerivationScore(
  id: string,
  workspaceId: string,
  data: UpdateDerivationScoreInput
) {
  const result = await db
    .update(derivations)
    .set({
      qualityScore: data.qualityScore ?? null,
      scoreStatus: data.scoreStatus,
      scoreBreakdown: data.scoreBreakdown ?? null,
      scoreIssues: data.scoreIssues ?? null,
      regenerationSuggestion: data.regenerationSuggestion ?? null,
      scoredAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(derivations.id, id),
        eq(derivations.workspaceId, workspaceId)
      )
    )
    .returning();
  return result[0] ?? null;
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run tests/unit/repositories/derivation.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/server/repositories/derivation.ts app/tests/unit/repositories/derivation.test.ts && git commit -m "feat: add derivation score repository helper"
```

---

### Task 3: Create the creative score AI module

**Files:**
- Create: `app/src/server/ai/creative-score.ts`
- Create: `app/tests/unit/ai/creative-score.test.ts`

**Step 1: Write failing tests**

Create `app/tests/unit/ai/creative-score.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("openai", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      responses: {
        create: vi.fn().mockResolvedValue({
          output_text: JSON.stringify({
            qualityScore: 84,
            scoreBreakdown: {
              ctaClarity: 88,
              textLegibility: 80,
              briefMatch: 86,
              visualQuality: 82,
              formatFit: 84,
            },
            scoreIssues: ["CTA contrast could be stronger"],
            regenerationSuggestion: "Increase CTA contrast while preserving the exact CTA text.",
          }),
        }),
      },
    })),
  };
});

vi.mock("@/server/validation/env", () => ({
  env: {
    OPENAI_API_KEY: "test-key",
    OPENAI_TEXT_MODEL: "gpt-5-mini",
  },
}));

import {
  analyzeDerivationCreative,
  buildRegenerationSuggestion,
  scoreDerivationHeuristic,
} from "@/server/ai/creative-score";

describe("creative scoring", () => {
  it("creates a heuristic score without visual analysis", () => {
    const result = scoreDerivationHeuristic({
      status: "completed",
      format: "1:1",
      generationMode: "art_variation",
      ctaText: "Compre agora",
      parentId: null,
    });

    expect(result.scoreStatus).toBe("heuristic");
    expect(result.qualityScore).toBeGreaterThanOrEqual(0);
    expect(result.qualityScore).toBeLessThanOrEqual(100);
    expect(result.scoreBreakdown).toHaveProperty("ctaClarity");
  });

  it("analyzes a generated creative from a vision response", async () => {
    const result = await analyzeDerivationCreative({
      imageBuffer: Buffer.from("fake-image"),
      mimeType: "image/png",
      campaign: {
        name: "Summer campaign",
        client: "Client",
        product: "Product",
        offer: "50% off",
        objective: "Sales",
        audience: "Busy parents",
      },
      derivation: {
        ctaText: "Compre agora",
        format: "1:1",
        generationMode: "art_variation",
        feedback: null,
      },
      locale: "pt-BR",
    });

    expect(result.scoreStatus).toBe("analyzed");
    expect(result.qualityScore).toBe(84);
    expect(result.regenerationSuggestion).toContain("preserving the exact CTA text");
  });

  it("builds corrective feedback that preserves CTA and format", () => {
    const suggestion = buildRegenerationSuggestion({
      ctaText: "Compre agora",
      format: "4:5",
      generationMode: "format_adaptation",
      scoreIssues: ["Text is hard to read"],
      modelSuggestion: "Increase text contrast.",
    });

    expect(suggestion).toContain("Compre agora");
    expect(suggestion).toContain("4:5");
    expect(suggestion).toContain("format_adaptation");
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run tests/unit/ai/creative-score.test.ts
```

Expected: FAIL because the module does not exist.

**Step 3: Implement minimal module**

Implement:

- score clamping to `0-100`
- JSON block extraction for model responses
- `zod` validation for score response if preferred
- prompt language that forbids changing CTA, format, or generation mode

Important prompt constraints:

```txt
Evaluate the generated ad as a reviewer. Do not invent a new CTA.
The exact CTA, if present, must remain: [ctaText].
The target format must remain: [format].
The generation mode must remain: [generationMode].
Return only JSON with qualityScore, scoreBreakdown, scoreIssues, regenerationSuggestion.
```

**Step 4: Run tests**

Run:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run tests/unit/ai/creative-score.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/server/ai/creative-score.ts app/tests/unit/ai/creative-score.test.ts && git commit -m "feat: add creative score analyzer"
```

---

### Task 4: Wire scoring into the generation job

**Files:**
- Modify: `app/src/server/jobs/derivation.ts`
- Modify: `app/tests/integration/derivation-job.test.ts`

**Step 1: Add tests for non-blocking scoring**

Mock these modules in `app/tests/integration/derivation-job.test.ts` if the job execution is covered directly:

```ts
vi.mock("@/server/ai/creative-score", () => ({
  scoreDerivationHeuristic: vi.fn().mockReturnValue({
    qualityScore: 72,
    scoreStatus: "heuristic",
    scoreBreakdown: {
      ctaClarity: 70,
      textLegibility: 70,
      briefMatch: 75,
      visualQuality: 72,
      formatFit: 73,
    },
    scoreIssues: [],
    regenerationSuggestion: "Improve contrast while preserving the exact CTA text.",
  }),
  analyzeDerivationCreative: vi.fn().mockRejectedValue(new Error("vision unavailable")),
}));
```

Add a test around the new helper behavior if direct Inngest execution is hard:

```ts
it("score failures update score status without changing completed status", async () => {
  // Prefer extracting a small helper from derivation.ts:
  // scoreCompletedDerivation({ ...context })
  // Assert updateDerivationStatus("completed") remains separate from updateDerivationScore("failed").
});
```

If extracting the helper is cleaner, create an internal exported function:

```ts
export async function scoreCompletedDerivation(...)
```

Keep this helper small and testable.

**Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run tests/integration/derivation-job.test.ts
```

Expected: FAIL until scoring is wired or helper exists.

**Step 3: Implement job wiring**

In `app/src/server/jobs/derivation.ts`, after the output has been uploaded and the derivation is marked completed:

```ts
try {
  const heuristicScore = scoreDerivationHeuristic({
    status: "completed",
    format: targetFormat,
    generationMode: effectiveGenerationMode,
    ctaText: ctaText ?? derivation.ctaText,
    parentId: derivation.parentId,
  });
  await updateDerivationScore(derivationId, workspaceId, heuristicScore);

  try {
    const visualScore = await analyzeDerivationCreative({
      imageBuffer: normalizedBuffer,
      mimeType: "image/png",
      campaign,
      derivation: {
        ctaText: ctaText ?? derivation.ctaText,
        format: targetFormat,
        generationMode: effectiveGenerationMode,
        feedback: derivation.feedback,
      },
      locale,
    });
    await updateDerivationScore(derivationId, workspaceId, visualScore);
  } catch (error) {
    console.warn("[generate-and-store-output] creative visual scoring failed", error);
    await updateDerivationScore(derivationId, workspaceId, {
      ...heuristicScore,
      scoreStatus: "failed",
    });
  }
} catch (error) {
  console.warn("[generate-and-store-output] creative scoring failed", error);
}
```

Use the actual buffer variable names from the job. Do not re-download from R2 if the normalized generated image buffer is still in scope.

**Step 4: Run focused tests**

Run:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run tests/unit/ai/creative-score.test.ts tests/unit/repositories/derivation.test.ts tests/integration/derivation-job.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/server/jobs/derivation.ts app/tests/integration/derivation-job.test.ts && git commit -m "feat: score completed derivations"
```

---

### Task 5: Expose score fields to frontend types and polling

**Files:**
- Modify: `app/src/lib/hooks/use-derivations.ts`
- Modify: `app/src/lib/mock-data.ts`

**Step 1: Update types**

Add score fields to both derivation interfaces:

```ts
export type ScoreStatus = "pending" | "heuristic" | "analyzed" | "failed";

export interface CreativeScoreBreakdown {
  ctaClarity: number;
  textLegibility: number;
  briefMatch: number;
  visualQuality: number;
  formatFit: number;
}
```

In derivation types:

```ts
qualityScore?: number | null;
scoreStatus?: ScoreStatus | null;
scoreBreakdown?: CreativeScoreBreakdown | null;
scoreIssues?: string[] | null;
regenerationSuggestion?: string | null;
scoredAt?: Date | null;
```

**Step 2: Parse `scoredAt`**

In `fetchDerivations`:

```ts
scoredAt: d.scoredAt ? new Date(d.scoredAt) : null,
```

**Step 3: Extend polling for score updates**

Refetch while any derivation is `queued`, `processing`, or has `scoreStatus === "heuristic"` after completion:

```ts
data?.some(
  (d) =>
    d.status === "queued" ||
    d.status === "processing" ||
    d.scoreStatus === "heuristic"
)
```

**Step 4: Run type check**

Run:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx tsc --noEmit --pretty false
```

Expected: PASS.

**Step 5: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/lib/hooks/use-derivations.ts app/src/lib/mock-data.ts && git commit -m "feat: expose creative score to frontend"
```

---

### Task 6: Add score display and best-first sorting in the gallery

**Files:**
- Modify: `app/src/components/workspace/DerivationsStep.tsx`
- Modify: `app/src/components/workspace/DerivationCard.tsx`
- Modify: `app/messages/en.json`
- Modify: `app/messages/pt-BR.json`

**Step 1: Add sort option**

In `DerivationsStep.tsx`:

```ts
type SortOption = "best" | "newest" | "oldest" | "angle" | "status";
const [sortBy, setSortBy] = useState<SortOption>("best");
```

Sort logic:

```ts
case "best":
  filtered.sort((a, b) => (b.qualityScore ?? -1) - (a.qualityScore ?? -1));
  break;
```

Add option:

```tsx
<option value="best">{t("bestFirst")}</option>
```

**Step 2: Add compact score UI**

In `DerivationCard.tsx`, add a small helper:

```ts
function getScoreLabel(score?: number | null) {
  if (score == null) return null;
  if (score >= 80) return "Strong";
  if (score >= 60) return "Adjust";
  return "Weak";
}
```

Render near status:

```tsx
{derivation.qualityScore != null && (
  <div className="inline-flex items-center gap-1 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2 py-1">
    <span className="text-xs font-semibold text-[var(--text-primary)]">
      {derivation.qualityScore}
    </span>
    <span className="text-[10px] text-[var(--text-muted)]">
      {getScoreLabel(derivation.qualityScore)}
    </span>
  </div>
)}
```

Render top issue below prompt if present:

```tsx
{derivation.scoreIssues?.[0] && (
  <p className="text-[11px] text-[var(--text-muted)] line-clamp-1">
    {derivation.scoreIssues[0]}
  </p>
)}
```

Use translations instead of hardcoded labels in the final implementation.

**Step 3: Add messages**

In `app/messages/en.json` under `derivation`:

```json
"bestFirst": "Best first",
"scoreStrong": "Strong",
"scoreAdjust": "Adjust",
"scoreWeak": "Weak"
```

In `app/messages/pt-BR.json`:

```json
"bestFirst": "Melhores primeiro",
"scoreStrong": "Forte",
"scoreAdjust": "Ajustar",
"scoreWeak": "Fraco"
```

**Step 4: Run lint and type check**

Run:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npm run lint && npx tsc --noEmit --pretty false
```

Expected: PASS.

**Step 5: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/components/workspace/DerivationsStep.tsx app/src/components/workspace/DerivationCard.tsx app/messages/en.json app/messages/pt-BR.json && git commit -m "feat: show creative scores in gallery"
```

---

### Task 7: Add guided regeneration in review

**Files:**
- Modify: `app/src/components/workspace/ComparisonView.tsx`
- Modify: `app/src/components/workspace/ReviewStep.tsx`
- Modify: `app/messages/en.json`
- Modify: `app/messages/pt-BR.json`

**Step 1: Inspect current regeneration UI**

Run:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && sed -n '1,320p' src/components/workspace/ComparisonView.tsx
```

Expected: identify where manual feedback is entered and where `onRegenerate` is called.

**Step 2: Add score panel**

In the selected derivation view, render:

- score
- criterion breakdown
- top issues
- button for guided regeneration

The action should call:

```ts
onRegenerate?.(
  derivation.id,
  derivation.regenerationSuggestion || derivation.scoreIssues?.join(". ") || ""
);
```

Label: `Regenerate with improvements`.

**Step 3: Keep user-editable feedback**

If `ComparisonView` already has a feedback text area, prefill it with `regenerationSuggestion` only when the user chooses the guided action. Do not remove manual regeneration.

**Step 4: Add messages**

In `app/messages/en.json`:

```json
"regenerateWithImprovements": "Regenerate with improvements",
"creativeScore": "Creative score",
"detectedIssues": "Detected issues"
```

In `app/messages/pt-BR.json`:

```json
"regenerateWithImprovements": "Regenerar com melhorias",
"creativeScore": "Score criativo",
"detectedIssues": "Problemas detectados"
```

**Step 5: Run checks**

Run:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npm run lint && npx tsc --noEmit --pretty false
```

Expected: PASS.

**Step 6: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/components/workspace/ComparisonView.tsx app/src/components/workspace/ReviewStep.tsx app/messages/en.json app/messages/pt-BR.json && git commit -m "feat: add guided creative regeneration"
```

---

### Task 8: Validate end-to-end behavior

**Files:**
- No code changes expected unless validation exposes a bug.

**Step 1: Run focused tests**

Run:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run tests/unit/ai/creative-score.test.ts tests/unit/repositories/derivation.test.ts tests/integration/derivation-job.test.ts
```

Expected: PASS.

**Step 2: Run broad tests**

Run:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npm run test
```

Expected: PASS.

**Step 3: Run lint**

Run:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npm run lint
```

Expected: PASS.

**Step 4: Run type check**

Run:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx tsc --noEmit --pretty false
```

Expected: PASS.

**Step 5: Run build**

Run:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npm run build
```

Expected: PASS.

**Step 6: Manual app check**

Run:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npm run dev
```

Open `http://localhost:3000`.

Verify:

- gallery defaults or offers `Best first`
- completed cards show scores when fields exist
- pending/failed score states do not break card layout
- review panel shows score details
- guided regeneration sends feedback and preserves `generationMode`, `format`, and `ctaText`

**Step 7: Commit validation fixes if needed**

If validation required fixes:

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add <changed-files> && git commit -m "fix: stabilize creative scoring flow"
```

If no fixes were needed, do not create an empty commit.
