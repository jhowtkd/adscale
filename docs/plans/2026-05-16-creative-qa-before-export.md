# Creative QA Before Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an assistive QA review for approved derivations before export, with persisted checklist results and non-blocking UI guidance.

**Architecture:** Store QA fields directly on `derivations`, expose `POST /api/derivations/[id]/qa`, add an OpenAI-backed `creative-qa` module with a strict normalizer, and surface the result in the existing derivation card/gallery flow. QA is user-triggered and never blocks export.

**Tech Stack:** Next.js app router, TypeScript, Drizzle/Postgres, Vitest, React Testing Library, TanStack Query, OpenAI Responses API, next-intl.

---

### Task 1: Add QA Schema Fields

**Files:**
- Modify: `app/src/server/db/schema.ts`
- Create: `app/drizzle/0008_creative_qa.sql`

**Step 1: Write the migration**

Create `app/drizzle/0008_creative_qa.sql`:

```sql
ALTER TABLE "adscale_app"."derivations"
  ADD COLUMN "qa_status" text NOT NULL DEFAULT 'pending',
  ADD COLUMN "qa_checklist" jsonb,
  ADD COLUMN "qa_issues" jsonb,
  ADD COLUMN "qa_suggestions" jsonb,
  ADD COLUMN "qa_analyzed_at" timestamp;
```

**Step 2: Update the schema**

In `app/src/server/db/schema.ts`, add these fields inside `derivations` after `scoredAt`:

```ts
qaStatus: text("qa_status").notNull().default("pending"),
qaChecklist: jsonb("qa_checklist"),
qaIssues: jsonb("qa_issues"),
qaSuggestions: jsonb("qa_suggestions"),
qaAnalyzedAt: timestamp("qa_analyzed_at", { mode: "date" }),
```

**Step 3: Validate migration syntax**

Run:

```bash
cd app
npx drizzle-kit check
```

Expected: no SQL/schema errors. If the project needs env vars for this command, use the same dummy env pattern from prior build checks.

**Step 4: Commit**

```bash
git add app/src/server/db/schema.ts app/drizzle/0008_creative_qa.sql
git commit -m "feat: add creative qa schema fields"
```

---

### Task 2: Add QA Types and Normalizer

**Files:**
- Create: `app/src/server/ai/creative-qa.ts`
- Create: `app/src/server/ai/creative-qa.test.ts`

**Step 1: Write failing normalizer tests**

Create `app/src/server/ai/creative-qa.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeCreativeQaResult } from "./creative-qa";

describe("normalizeCreativeQaResult", () => {
  it("normalizes a complete QA result", () => {
    const result = normalizeCreativeQaResult({
      status: "warning",
      checklist: {
        legibility: { status: "passed", note: "Readable." },
        ctaOffer: { status: "passed", note: "CTA preserved." },
        briefMatch: { status: "warning", note: "Audience could be clearer." },
        formatFit: { status: "passed", note: "Fits 4:5." },
        creativeRisk: { status: "warning", note: "Generic visual." },
      },
      issues: ["Audience could be clearer."],
      suggestions: ["Add audience-specific visual cues."],
    });

    expect(result.status).toBe("warning");
    expect(result.checklist.legibility.status).toBe("passed");
    expect(result.issues).toEqual(["Audience could be clearer."]);
  });

  it("fills missing criteria with warning fallbacks", () => {
    const result = normalizeCreativeQaResult({
      status: "ready",
      checklist: {},
    });

    expect(result.status).toBe("warning");
    expect(result.checklist.legibility.status).toBe("warning");
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("limits issues and suggestions", () => {
    const result = normalizeCreativeQaResult({
      status: "review",
      checklist: {},
      issues: ["1", "2", "3", "4"],
      suggestions: ["1", "2", "3", "4"],
    });

    expect(result.issues).toHaveLength(3);
    expect(result.suggestions).toHaveLength(3);
  });
});
```

**Step 2: Run tests and verify failure**

Run:

```bash
cd app
npm test -- creative-qa.test.ts
```

Expected: fail because `creative-qa.ts` does not exist.

**Step 3: Implement normalizer and analyzer shell**

Create `app/src/server/ai/creative-qa.ts`:

```ts
import OpenAI from "openai";
import { env } from "@/server/validation/env";

export type CreativeQaStatus = "ready" | "warning" | "review" | "failed";
export type CreativeQaCheckStatus = "passed" | "warning" | "failed";
export type CreativeQaCriterion =
  | "legibility"
  | "ctaOffer"
  | "briefMatch"
  | "formatFit"
  | "creativeRisk";

export interface CreativeQaCriterionResult {
  status: CreativeQaCheckStatus;
  note: string;
}

export type CreativeQaChecklist = Record<CreativeQaCriterion, CreativeQaCriterionResult>;

export interface CreativeQaResult {
  status: CreativeQaStatus;
  checklist: CreativeQaChecklist;
  issues: string[];
  suggestions: string[];
}

const CRITERIA: CreativeQaCriterion[] = [
  "legibility",
  "ctaOffer",
  "briefMatch",
  "formatFit",
  "creativeRisk",
];

function getOpenAI() {
  return new OpenAI({ apiKey: env.OPENAI_API_KEY });
}

function asStatus(value: unknown): CreativeQaStatus {
  return value === "ready" || value === "warning" || value === "review" ? value : "warning";
}

function asCheckStatus(value: unknown): CreativeQaCheckStatus {
  return value === "passed" || value === "warning" || value === "failed" ? value : "warning";
}

function asShortList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 3)
    : [];
}

export function normalizeCreativeQaResult(value: unknown): CreativeQaResult {
  const input = (value && typeof value === "object" ? value : {}) as {
    status?: unknown;
    checklist?: Record<string, { status?: unknown; note?: unknown }>;
    issues?: unknown;
    suggestions?: unknown;
  };

  const checklist = CRITERIA.reduce((acc, criterion) => {
    const item = input.checklist?.[criterion];
    acc[criterion] = {
      status: asCheckStatus(item?.status),
      note:
        typeof item?.note === "string" && item.note.trim().length > 0
          ? item.note.trim()
          : "Needs a quick manual review.",
    };
    return acc;
  }, {} as CreativeQaChecklist);

  const hasFallback = CRITERIA.some((criterion) => checklist[criterion].note === "Needs a quick manual review.");
  const issues = asShortList(input.issues);
  const suggestions = asShortList(input.suggestions);

  return {
    status: hasFallback ? "warning" : asStatus(input.status),
    checklist,
    issues: issues.length > 0 ? issues : ["Review the creative before export."],
    suggestions: suggestions.length > 0 ? suggestions : ["Export is still available, but consider a quick visual check."],
  };
}
```

**Step 4: Run tests**

Run:

```bash
cd app
npm test -- creative-qa.test.ts
```

Expected: pass.

**Step 5: Commit**

```bash
git add app/src/server/ai/creative-qa.ts app/src/server/ai/creative-qa.test.ts
git commit -m "feat: add creative qa normalizer"
```

---

### Task 3: Implement OpenAI QA Analyzer

**Files:**
- Modify: `app/src/server/ai/creative-qa.ts`
- Modify: `app/src/server/ai/creative-qa.test.ts`

**Step 1: Add prompt tests**

Add tests for a `buildCreativeQaPrompt` export:

```ts
import { buildCreativeQaPrompt } from "./creative-qa";

it("builds a QA prompt with CTA, offer, format, and campaign context", () => {
  const prompt = buildCreativeQaPrompt({
    campaign: {
      name: "Launch",
      client: "Acme",
      product: "Serum",
      offer: "20% off",
      objective: "Conversions",
      audience: "New buyers",
      tone: "Premium",
    },
    derivation: {
      ctaText: "Shop now",
      format: "4:5",
      generationMode: "art_variation",
    },
    locale: "en",
  });

  expect(prompt).toContain("Shop now");
  expect(prompt).toContain("20% off");
  expect(prompt).toContain("4:5");
  expect(prompt).toContain("Return only JSON");
});
```

**Step 2: Implement prompt builder and analyzer**

Add to `creative-qa.ts`:

```ts
export interface AnalyzeCreativeQaInput {
  imageBuffer: Buffer;
  mimeType: string;
  locale: string;
  campaign: {
    name: string;
    client: string;
    product: string;
    offer: string;
    objective: string;
    audience: string;
    tone?: string | null;
    creativeDiagnosis?: unknown;
  };
  derivation: {
    ctaText: string | null | undefined;
    format: string | null | undefined;
    generationMode: string | null | undefined;
  };
}

export function buildCreativeQaPrompt(input: Omit<AnalyzeCreativeQaInput, "imageBuffer" | "mimeType">) {
  return `Review this final ad creative before export.
Return only JSON with status, checklist, issues, and suggestions.

Allowed status values: ready, warning, review.
Checklist keys: legibility, ctaOffer, briefMatch, formatFit, creativeRisk.
Each checklist item must include status passed/warning/failed and a short note.

Export must remain allowed. Use warning or review to guide the user, not to block them.

Campaign:
- Name: ${input.campaign.name}
- Client: ${input.campaign.client}
- Product: ${input.campaign.product}
- Offer: ${input.campaign.offer}
- Objective: ${input.campaign.objective}
- Audience: ${input.campaign.audience}
- Tone: ${input.campaign.tone ?? "not specified"}
- Creative diagnosis: ${JSON.stringify(input.campaign.creativeDiagnosis ?? null)}

Derivation:
- Exact CTA: ${input.derivation.ctaText ?? "none"}
- Format: ${input.derivation.format ?? "unknown"}
- Generation mode: ${input.derivation.generationMode ?? "unknown"}

Evaluate legibility, exact CTA and offer preservation, briefing fit, format fit, and simple creative risk.
Do not invent new facts, claims, offers, products, logos, or CTAs.
Keep issues and suggestions short and actionable.
Locale for user-facing notes: ${input.locale}.`;
}

export async function analyzeCreativeQa(input: AnalyzeCreativeQaInput): Promise<CreativeQaResult> {
  const dataUrl = `data:${input.mimeType};base64,${input.imageBuffer.toString("base64")}`;
  const response = await getOpenAI().responses.create({
    model: env.OPENAI_TEXT_MODEL,
    input: [
      { role: "system", content: "You are an expert creative QA reviewer for paid social ads." },
      {
        role: "user",
        content: [
          { type: "input_text", text: buildCreativeQaPrompt(input) },
          { type: "input_image", image_url: dataUrl, detail: "high" },
        ],
      },
    ],
    text: { format: { type: "json_object" } },
  });

  const raw = (response as unknown as { output_text?: string }).output_text;
  if (!raw) throw new Error("Empty vision response for creative QA");
  return normalizeCreativeQaResult(JSON.parse(raw));
}
```

**Step 3: Run tests**

Run:

```bash
cd app
npm test -- creative-qa.test.ts
```

Expected: pass.

**Step 4: Commit**

```bash
git add app/src/server/ai/creative-qa.ts app/src/server/ai/creative-qa.test.ts
git commit -m "feat: add creative qa analyzer"
```

---

### Task 4: Add Repository Helper

**Files:**
- Modify: `app/src/server/repositories/derivation.ts`
- Modify: `app/src/server/repositories/derivation.test.ts`

**Step 1: Write repository tests**

Extend `app/src/server/repositories/derivation.test.ts` with a mocked-db test for `updateDerivationQa`.

Expected behavior:

- calls `db.update(derivations)`
- sets `qaStatus`, `qaChecklist`, `qaIssues`, `qaSuggestions`, `qaAnalyzedAt`, and `updatedAt`
- scopes update by derivation id and workspace id

**Step 2: Implement helper**

Add an exported function:

```ts
export async function updateDerivationQa(
  id: string,
  workspaceId: string,
  qa: {
    qaStatus: string;
    qaChecklist: unknown;
    qaIssues: string[];
    qaSuggestions: string[];
  }
) {
  const now = new Date();
  const [updated] = await db
    .update(derivations)
    .set({
      qaStatus: qa.qaStatus,
      qaChecklist: qa.qaChecklist,
      qaIssues: qa.qaIssues,
      qaSuggestions: qa.qaSuggestions,
      qaAnalyzedAt: now,
      updatedAt: now,
    })
    .where(and(eq(derivations.id, id), eq(derivations.workspaceId, workspaceId)))
    .returning();
  return updated ?? null;
}
```

**Step 3: Run tests**

Run:

```bash
cd app
npm test -- derivation.test.ts
```

Expected: pass.

**Step 4: Commit**

```bash
git add app/src/server/repositories/derivation.ts app/src/server/repositories/derivation.test.ts
git commit -m "feat: persist derivation qa results"
```

---

### Task 5: Add QA API Route

**Files:**
- Create: `app/src/app/api/derivations/[id]/qa/route.ts`
- Create: `app/src/app/api/derivations/[id]/qa/route.test.ts`

**Step 1: Write route tests**

Mock:

- `requireWorkspaceAccess`
- `getUserLocale`
- `getDerivationById`
- `getCampaignById`
- `downloadBuffer`
- `analyzeCreativeQa`
- `updateDerivationQa`

Cover:

- success for approved derivation with `outputKey`
- `404` when missing
- `409` when not approved
- `400` when missing output
- `500` or handled API error when analyzer fails

**Step 2: Implement route**

Route behavior:

```ts
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    const locale = await getUserLocale(user.id);
    const { id } = await params;
    const derivation = await getDerivationById(id, workspace.id);

    if (!derivation) return apiError("derivationNotFound", 404);
    if (derivation.status !== "approved") return apiError("derivationNotApprovedForQa", 409);
    if (!derivation.outputKey) return apiError("derivationMissingOutput", 400);

    const campaign = await getCampaignById(derivation.campaignId, workspace.id);
    if (!campaign) return apiError("campaignNotFound", 404);

    const imageBuffer = await downloadBuffer(derivation.outputKey);  // <!-- VERIFY: `downloadBuffer` — nenhuma definição encontrada em app/src; verificação em .planning/tmp/ -->
    const qa = await analyzeCreativeQa({
      imageBuffer,
      mimeType: "image/png",
      locale,
      campaign: {
        name: campaign.name ?? "",
        client: campaign.client ?? "",
        product: campaign.name ?? "",
        offer: campaign.offer ?? "",
        objective: campaign.objective ?? "",
        audience: campaign.audience ?? "",
        tone: campaign.tone,
        creativeDiagnosis: campaign.creativeDiagnosis,
      },
      derivation: {
        ctaText: derivation.ctaText,
        format: derivation.format,
        generationMode: derivation.generationMode,
      },
    });

    const updated = await updateDerivationQa(id, workspace.id, {
      qaStatus: qa.status,
      qaChecklist: qa.checklist,
      qaIssues: qa.issues,
      qaSuggestions: qa.suggestions,
    });

    return NextResponse.json({ qa, derivation: updated });
  } catch (error) {
    return handleApiError(error, "derivations.[id].qa.POST");
  }
}
```

Adjust field names to match the real campaign repository return type.

**Step 3: Run route tests**

Run:

```bash
cd app
npm test -- qa/route.test.ts
```

Expected: pass.

**Step 4: Commit**

```bash
git add 'app/src/app/api/derivations/[id]/qa/route.ts' 'app/src/app/api/derivations/[id]/qa/route.test.ts'
git commit -m "feat: add derivation qa endpoint"
```

---

### Task 6: Expose QA Fields to Client Types

**Files:**
- Modify: `app/src/lib/hooks/use-derivations.ts`
- Modify: `app/src/lib/mock-data.ts`
- Modify: `app/src/app/(dashboard)/campaigns/[id]/page.tsx`

**Step 1: Extend client derivation types**

Add QA fields to both server hook type and UI derivation type:

```ts
qaStatus?: "pending" | "ready" | "warning" | "review" | "failed" | null;
qaChecklist?: Record<string, { status: string; note: string }> | null;
qaIssues?: string[] | null;
qaSuggestions?: string[] | null;
qaAnalyzedAt?: Date | null;
```

**Step 2: Map dates in `use-derivations.ts`**

When mapping API data:

```ts
qaAnalyzedAt: d.qaAnalyzedAt ? new Date(d.qaAnalyzedAt) : null,
```

**Step 3: Map fields in campaign page**

In `allDerivations`, pass QA fields from `d` into the UI derivation object.

**Step 4: Run TypeScript via build or focused tests**

Run:

```bash
cd app
npm test -- DerivationCard.test.tsx
```

Expected: pass.

**Step 5: Commit**

```bash
git add app/src/lib/hooks/use-derivations.ts app/src/lib/mock-data.ts 'app/src/app/(dashboard)/campaigns/[id]/page.tsx'
git commit -m "feat: expose qa fields to derivation UI"
```

---

### Task 7: Add QA Hook

**Files:**
- Create: `app/src/lib/hooks/use-creative-qa.ts`
- Create: `app/src/lib/hooks/use-creative-qa.test.tsx`

**Step 1: Write hook tests**

Test that it:

- posts to `/api/derivations/:id/qa`
- throws on non-ok response
- invalidates `["derivations"]` and `["campaigns"]`

**Step 2: Implement hook**

```ts
import { apiFetch } from "@/lib/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useCreativeQa() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ derivationId }: { derivationId: string }) => {
      const res = await apiFetch(`/api/derivations/${derivationId}/qa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao revisar QA da arte");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["derivations"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}
```

**Step 3: Run hook tests**

Run:

```bash
cd app
npm test -- use-creative-qa.test.tsx
```

Expected: pass.

**Step 4: Commit**

```bash
git add app/src/lib/hooks/use-creative-qa.ts app/src/lib/hooks/use-creative-qa.test.tsx
git commit -m "feat: add creative qa hook"
```

---

### Task 8: Add QA UI to Derivation Card

**Files:**
- Modify: `app/src/components/workspace/DerivationCard.tsx`
- Modify: `app/src/components/workspace/DerivationCard.test.tsx`
- <!-- VERIFY: `app/src/components/workspace/DerivationsStep.tsx` — arquivo não encontrado; componentes existentes em workspace/ incluem `DerivationGrid.tsx`, `DerivationCard.tsx`; verificação em .planning/tmp/ -->
- Modify: `app/src/app/(dashboard)/campaigns/[id]/page.tsx`
- Modify: `app/messages/en.json`
- Modify: `app/messages/pt-BR.json`

**Step 1: Write UI tests**

Extend `DerivationCard.test.tsx` to cover:

- QA button appears for approved derivation with image
- QA button is hidden for non-approved derivation
- saved warning displays first issue
- clicking QA calls callback

**Step 2: Add props**

Add to `DerivationCardProps`:

```ts
onRunQa?: () => void;
qaAnalyzingId?: string | null;
```

Pass through `DerivationsStep`.

**Step 3: Wire page handler**

In campaign page:

```ts
const creativeQa = useCreativeQa();

const handleRunQa = useCallback((id: string) => {
  creativeQa.mutate(
    { derivationId: id },
    {
      onSuccess: () => addToast("success", tc("creativeQaComplete")),
      onError: () => addToast("error", tc("creativeQaFailed")),
    }
  );
}, [creativeQa, addToast, tc]);
```

Pass `onRunQa={handleRunQa}` and `qaAnalyzingId`.

**Step 4: Render compact QA state**

In `DerivationCard`, for approved image derivations:

- show button with icon such as `ShieldCheck` or `ClipboardCheck`
- label from `t("runQa")`
- if `qaStatus` exists and not pending, show a small status chip and first issue
- button label becomes rerun if result exists

Keep export button enabled regardless of QA status.

**Step 5: Add translations**

Add keys in `derivation` and `common`/`toast` namespaces as appropriate:

```json
"runQa": "QA da arte",
"rerunQa": "Revisar novamente",
"qaReady": "Pronta",
"qaWarning": "Atenção",
"qaReview": "Revisar",
"creativeQaComplete": "QA da arte concluído",
"creativeQaFailed": "Não foi possível revisar a arte agora"
```

Use English equivalents in `en.json`.

**Step 6: Run UI tests**

Run:

```bash
cd app
npm test -- DerivationCard.test.tsx use-creative-qa.test.tsx
```

Expected: pass.

**Step 7: Commit**

```bash
git add app/src/components/workspace/DerivationCard.tsx app/src/components/workspace/DerivationCard.test.tsx app/src/components/workspace/DerivationsStep.tsx 'app/src/app/(dashboard)/campaigns/[id]/page.tsx' app/messages/en.json app/messages/pt-BR.json
git commit -m "feat: show creative qa in derivation cards"
```

---

### Task 9: Final Verification

**Files:**
- Modify: `tasks/todo.md`

**Step 1: Run focused tests**

Run:

```bash
cd app
npm test -- creative-qa.test.ts qa/route.test.ts use-creative-qa.test.tsx DerivationCard.test.tsx derivation.test.ts
```

Expected: all focused tests pass.

**Step 2: Run lint**

Run:

```bash
cd app
npm run lint
```

Expected: 0 errors. Existing unrelated warnings in templates may remain.

**Step 3: Run full tests**

Run:

```bash
cd app
npm run test
```

Expected: all tests except the known pre-existing `src/server/repositories/template.test.ts` env blocker pass, unless that blocker has since been fixed.

**Step 4: Run build**

Run with required env vars:

```bash
cd app
DATABASE_URL=postgres://localhost:5432/test BETTER_AUTH_SECRET=01234567890123456789012345678901 BETTER_AUTH_URL=http://localhost:3000 OPENAI_API_KEY=sk-test1234567890123456789012345678901234567890 R2_ACCOUNT_ID=test R2_ACCESS_KEY_ID=test R2_SECRET_ACCESS_KEY=test R2_BUCKET=test R2_PUBLIC_BASE_URL=http://localhost INNGEST_EVENT_KEY=test INNGEST_SIGNING_KEY=test APP_URL=http://localhost:3000 npm run build
```

Expected: build passes. Better Auth low-entropy warnings are acceptable with dummy env values.

**Step 5: Update task review**

Append a review section to `tasks/todo.md` with:

- files changed
- commands run
- known blockers
- acceptance criteria coverage

**Step 6: Commit verification note**

```bash
git add tasks/todo.md
git commit -m "docs: record creative qa verification"
```
