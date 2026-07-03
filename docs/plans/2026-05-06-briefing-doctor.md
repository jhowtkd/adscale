# Briefing Doctor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an assistive Briefing Doctor that reviews campaign briefings before generation, flags weak inputs, and offers field-by-field improvements without blocking the existing flow.

**Architecture:** Implement deterministic local checks in a pure `src/lib/briefing-doctor.ts` module, then add an AI-backed `POST /api/briefing-doctor/analyze` endpoint for richer suggestions. Wire a compact panel into `BriefingStep` that runs local checks instantly, calls AI on demand, and applies validated field patches one at a time while preserving CTA, format, and generation-mode contracts.

**Tech Stack:** Next.js 16.2.4 App Router, React 19, TypeScript, OpenAI SDK Responses API, Zod, Vitest, next-intl, Tailwind CSS.

---

### Task 1: Add local Briefing Doctor rules

**Files:**
- Create: `app/src/lib/briefing-doctor.ts` <!-- VERIFY: app/src/lib/briefing-doctor.ts — see verification in .planning/tmp/ -->
- Create: `app/tests/unit/briefing-doctor.test.ts` <!-- VERIFY: app/tests/unit/briefing-doctor.test.ts — see verification in .planning/tmp/ -->

**Step 1: Write the failing tests**

Create `app/tests/unit/briefing-doctor.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  analyzeBriefingLocal, <!-- VERIFY: analyzeBriefingLocal — see verification in .planning/tmp/ -->
  applyBriefingFieldPatch, <!-- VERIFY: applyBriefingFieldPatch — see verification in .planning/tmp/ -->
  type BriefingDoctorInput,
} from "@/lib/briefing-doctor";

const baseBriefing: BriefingDoctorInput = {
  name: "Summer Sale",
  client: "Acme",
  objective: "Drive purchases",
  audience: "Women 25-34 who buy fitness apparel online",
  platforms: ["Meta"],
  tone: "Energetic",
  offer: "20% off until Sunday",
  constraints: "Use brand colors",
  notes: "",
  generationMode: "art_variation",
  creativeLevel: "balanced",
  targetFormat: "",
  ctaVariants: ["Shop now", "", ""],
};

describe("briefing doctor local rules", () => {
  it("detects missing objective", () => {
    const result = analyzeBriefingLocal({ ...baseBriefing, objective: "" });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "objective", severity: "high" }),
      ])
    );
  });

  it("detects missing audience", () => {
    const result = analyzeBriefingLocal({ ...baseBriefing, audience: "" });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "audience", severity: "high" }),
      ])
    );
  });

  it("flags generic audience", () => {
    const result = analyzeBriefingLocal({ ...baseBriefing, audience: "todos" });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "audience", severity: "medium" }),
      ])
    );
  });

  it("detects weak offer", () => {
    const result = analyzeBriefingLocal({ ...baseBriefing, offer: "Great deal" });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "offer" }),
      ])
    );
  });

  it("detects generic CTA", () => {
    const result = analyzeBriefingLocal({
      ...baseBriefing,
      ctaVariants: ["Clique aqui", "", ""],
    });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "ctaVariants", severity: "medium" }),
      ])
    );
  });

  it("detects missing target format for format adaptation", () => {
    const result = analyzeBriefingLocal({
      ...baseBriefing,
      generationMode: "format_adaptation",
      targetFormat: "",
    });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "targetFormat", severity: "high" }),
      ])
    );
  });

  it("applies a patch to one field only", () => {
    const result = applyBriefingFieldPatch(baseBriefing, {
      field: "audience",
      value: "Parents 30-45 shopping for school supplies",
    });
    expect(result.audience).toBe("Parents 30-45 shopping for school supplies");
    expect(result.offer).toBe(baseBriefing.offer);
  });

  it("does not overwrite existing CTAs when applying CTA patches", () => {
    const result = applyBriefingFieldPatch(baseBriefing, {
      field: "ctaVariants",
      value: ["Get 20% off", "Buy before Sunday"],
    });
    expect(result.ctaVariants).toEqual(["Shop now", "Get 20% off", "Buy before Sunday"]);
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run --config config/vitest.config.ts tests/unit/briefing-doctor.test.ts
```

Expected: FAIL because `@/lib/briefing-doctor` does not exist.

**Step 3: Implement the local module**

Create `app/src/lib/briefing-doctor.ts`:

```ts
export type BriefingDoctorSeverity = "low" | "medium" | "high";
export type BriefingDoctorReadiness = "ready" | "needs_attention" | "weak";

export interface BriefingDoctorInput {
  name: string;
  client: string;
  objective: string;
  audience: string;
  platforms: string[];
  tone: string;
  offer: string;
  constraints: string;
  notes: string;
  generationMode: "art_variation" | "format_adaptation";
  creativeLevel: "conservative" | "balanced" | "bold";
  targetFormat?: string;
  ctaVariants: [string, string, string] | string[];
}

export interface BriefingDoctorIssue {
  field: keyof BriefingDoctorInput;
  severity: BriefingDoctorSeverity;
  message: string;
  impact: string;
}

export interface BriefingFieldPatch {
  field: keyof BriefingDoctorInput;
  value: string | string[];
}

export interface BriefingLocalAnalysis {
  readiness: BriefingDoctorReadiness;
  issues: BriefingDoctorIssue[];
}

const genericAudiences = new Set(["todos", "todo mundo", "everyone", "all", "geral", "público geral", "publico geral"]);
const genericCtas = new Set(["clique aqui", "click here", "saiba mais", "learn more", "ver mais"]);
const validFormats = new Set(["1:1", "4:5", "9:16"]);

function isBlank(value?: string | null) {
  return !value || value.trim().length === 0;
}

function hasOfferSignal(value: string) {
  return /\d|%|off|desconto|até|ate|hoje|domingo|prazo|grátis|gratis|frete|benef[ií]cio|econom/i.test(value);
}

function computeReadiness(issues: BriefingDoctorIssue[]): BriefingDoctorReadiness {
  if (issues.some((issue) => issue.severity === "high")) return "weak";
  if (issues.length > 0) return "needs_attention";
  return "ready";
}

export function analyzeBriefingLocal(input: BriefingDoctorInput): BriefingLocalAnalysis {
  const issues: BriefingDoctorIssue[] = [];

  if (isBlank(input.objective)) {
    issues.push({
      field: "objective",
      severity: "high",
      message: "Objective is missing.",
      impact: "The generated creative may not know what action or outcome to optimize for.",
    });
  }

  const audience = input.audience.trim().toLowerCase();
  if (isBlank(input.audience)) {
    issues.push({
      field: "audience",
      severity: "high",
      message: "Audience is missing.",
      impact: "The model may produce generic copy and visuals.",
    });
  } else if (genericAudiences.has(audience) || audience.length < 8) {
    issues.push({
      field: "audience",
      severity: "medium",
      message: "Audience is too broad.",
      impact: "More specific audiences usually produce sharper hooks and visuals.",
    });
  }

  if (isBlank(input.offer)) {
    issues.push({
      field: "offer",
      severity: "medium",
      message: "Offer is missing.",
      impact: "The ad may lack a concrete reason to click.",
    });
  } else if (!hasOfferSignal(input.offer)) {
    issues.push({
      field: "offer",
      severity: "low",
      message: "Offer could be more specific.",
      impact: "Numbers, deadlines, or benefits make the creative easier to understand.",
    });
  }

  const ctas = input.ctaVariants.map((cta) => cta.trim()).filter(Boolean);
  if (input.generationMode === "art_variation" && ctas.length === 0) {
    issues.push({
      field: "ctaVariants",
      severity: "high",
      message: "At least one CTA is missing.",
      impact: "Generated pieces need a clear action to preserve campaign intent.",
    });
  }

  for (const cta of ctas) {
    const normalized = cta.toLowerCase();
    if (genericCtas.has(normalized)) {
      issues.push({
        field: "ctaVariants",
        severity: "medium",
        message: "CTA is generic.",
        impact: "A more specific CTA can better match the offer and campaign goal.",
      });
      break;
    }
    if (cta.length > 34) {
      issues.push({
        field: "ctaVariants",
        severity: "low",
        message: "CTA may be too long.",
        impact: "Long CTAs can become hard to render legibly in generated ads.",
      });
      break;
    }
  }

  if (input.generationMode === "format_adaptation") {
    if (isBlank(input.targetFormat) || !validFormats.has(input.targetFormat ?? "")) {
      issues.push({
        field: "targetFormat",
        severity: "high",
        message: "Target format is missing.",
        impact: "Format adaptation needs one exact output ratio.",
      });
    }
  }

  return {
    readiness: computeReadiness(issues),
    issues,
  };
}

export function applyBriefingFieldPatch(
  current: BriefingDoctorInput,
  patch: BriefingFieldPatch
): BriefingDoctorInput {
  if (patch.field === "targetFormat") {
    const value = Array.isArray(patch.value) ? patch.value[0] : patch.value;
    if (!validFormats.has(value)) return current;
    return { ...current, targetFormat: value };
  }

  if (patch.field === "ctaVariants") {
    const incoming = Array.isArray(patch.value) ? patch.value : [patch.value];
    const next = [...current.ctaVariants] as [string, string, string];
    for (const suggestion of incoming) {
      const emptyIndex = next.findIndex((cta) => cta.trim().length === 0);
      if (emptyIndex === -1) break;
      next[emptyIndex] = suggestion;
    }
    return { ...current, ctaVariants: next };
  }

  if (Array.isArray(patch.value)) return current;
  return { ...current, [patch.field]: patch.value };
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run --config config/vitest.config.ts tests/unit/briefing-doctor.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/lib/briefing-doctor.ts app/tests/unit/briefing-doctor.test.ts && git commit -m "feat: add local briefing doctor rules"
```

---

### Task 2: Add AI Briefing Doctor endpoint

**Files:**
- Create: `app/src/app/api/briefing-doctor/analyze/route.ts` <!-- VERIFY: app/src/app/api/briefing-doctor/analyze/route.ts — see verification in .planning/tmp/ -->
- Create: `app/tests/integration/briefing-doctor.test.ts` <!-- VERIFY: app/tests/integration/briefing-doctor.test.ts — see verification in .planning/tmp/ -->

**Step 1: Write failing endpoint tests**

Create `app/tests/integration/briefing-doctor.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn().mockResolvedValue({
    user: { id: "user-1" },
    workspace: { id: "workspace-1" },
  }),
}));

vi.mock("@/server/repositories/user", () => ({
  getUserLocale: vi.fn().mockResolvedValue("pt-BR"),
}));

const mockCreate = vi.fn();

vi.mock("openai", () => ({
  default: class MockOpenAI {
    responses = { create: mockCreate };
  },
}));

vi.mock("@/server/validation/env", () => ({
  env: {
    OPENAI_API_KEY: "test-key",
    OPENAI_TEXT_MODEL: "gpt-5-mini",
  },
}));

import { POST } from "@/app/api/briefing-doctor/analyze/route";

const validPayload = {
  briefing: {
    name: "Summer Sale",
    client: "Acme",
    objective: "Drive purchases",
    audience: "Women 25-34",
    platforms: ["Meta"],
    tone: "Energetic",
    offer: "20% off until Sunday",
    constraints: "",
    notes: "",
    generationMode: "art_variation",
    creativeLevel: "balanced",
    targetFormat: "",
    ctaVariants: ["Shop now", "", ""],
  },
};

describe("POST /api/briefing-doctor/analyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns structured analysis from AI response", async () => {
    mockCreate.mockResolvedValue({
      output_text: JSON.stringify({
        overallScore: 82,
        readiness: "needs_attention",
        issues: [
          {
            field: "audience",
            severity: "medium",
            message: "Audience can be more specific.",
            impact: "Sharper targeting improves creative direction.",
          },
        ],
        suggestions: [
          {
            field: "audience",
            title: "Specify audience",
            suggestedValue: "Women 25-34 shopping fitness apparel online",
            rationale: "Specific audience improves hooks.",
          },
        ],
        improvedBrief: {
          audience: "Women 25-34 shopping fitness apparel online",
        },
        fieldPatches: [
          {
            field: "audience",
            value: "Women 25-34 shopping fitness apparel online",
          },
        ],
      }),
    });

    const request = new Request("http://localhost/api/briefing-doctor/analyze", {
      method: "POST",
      body: JSON.stringify(validPayload),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.analysis.overallScore).toBe(82);
    expect(body.analysis.fieldPatches[0].field).toBe("audience");
  });

  it("rejects invalid payload", async () => {
    const request = new Request("http://localhost/api/briefing-doctor/analyze", {
      method: "POST",
      body: JSON.stringify({ briefing: { name: "" } }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns controlled error for malformed AI JSON", async () => {
    mockCreate.mockResolvedValue({ output_text: "not json" });
    const request = new Request("http://localhost/api/briefing-doctor/analyze", {
      method: "POST",
      body: JSON.stringify(validPayload),
    });

    const response = await POST(request);
    expect(response.status).toBe(502);
  });

  it("filters invalid target format patches", async () => {
    mockCreate.mockResolvedValue({
      output_text: JSON.stringify({
        overallScore: 70,
        readiness: "needs_attention",
        issues: [],
        suggestions: [],
        improvedBrief: {},
        fieldPatches: [{ field: "targetFormat", value: "16:9" }],
      }),
    });

    const request = new Request("http://localhost/api/briefing-doctor/analyze", {
      method: "POST",
      body: JSON.stringify(validPayload),
    });

    const response = await POST(request);
    const body = await response.json();
    expect(body.analysis.fieldPatches).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run --config config/vitest.config.ts tests/integration/briefing-doctor.test.ts
```

Expected: FAIL because the route does not exist.

**Step 3: Implement the endpoint**

Create `app/src/app/api/briefing-doctor/analyze/route.ts`:

```ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getUserLocale } from "@/server/repositories/user";
import { env } from "@/server/validation/env";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const fieldSchema = z.enum([
  "objective",
  "audience",
  "offer",
  "constraints",
  "notes",
  "targetFormat",
  "ctaVariants",
]);

const briefingSchema = z.object({
  name: z.string().min(1),
  client: z.string().min(1),
  objective: z.string().optional().default(""),
  audience: z.string().optional().default(""),
  platforms: z.array(z.string()).optional().default([]),
  tone: z.string().optional().default(""),
  offer: z.string().optional().default(""),
  constraints: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  generationMode: z.enum(["art_variation", "format_adaptation"]),
  creativeLevel: z.enum(["conservative", "balanced", "bold"]),
  targetFormat: z.string().optional().default(""),
  ctaVariants: z.array(z.string()).max(3).optional().default([]),
});

const bodySchema = z.object({
  briefing: briefingSchema,
});

const issueSchema = z.object({
  field: fieldSchema,
  severity: z.enum(["low", "medium", "high"]),
  message: z.string(),
  impact: z.string(),
});

const suggestionSchema = z.object({
  field: fieldSchema,
  title: z.string(),
  suggestedValue: z.union([z.string(), z.array(z.string())]),
  rationale: z.string(),
});

const analysisSchema = z.object({
  overallScore: z.number().min(0).max(100),
  readiness: z.enum(["ready", "needs_attention", "weak"]),
  issues: z.array(issueSchema),
  suggestions: z.array(suggestionSchema),
  improvedBrief: z.record(z.unknown()).default({}),
  fieldPatches: z.array(z.object({
    field: fieldSchema,
    value: z.union([z.string(), z.array(z.string())]),
  })),
});

const validFormats = new Set(["1:1", "4:5", "9:16"]);

function buildPrompt(briefing: z.infer<typeof briefingSchema>, locale: string) {
  return [
    "You are Briefing Doctor, an advertising briefing reviewer for an image generation product.",
    "Review the briefing and return only JSON.",
    `User locale: ${locale}. Respond in this locale.`,
    "Do not invent factual discounts, deadlines, claims, guarantees, or benefits.",
    "Do not overwrite existing CTA text. CTA ideas are alternatives only.",
    "Allowed target formats: 1:1, 4:5, 9:16.",
    "Do not silently change generationMode.",
    "",
    `Briefing: ${JSON.stringify(briefing)}`,
    "",
    "Return exactly: overallScore, readiness, issues, suggestions, improvedBrief, fieldPatches.",
  ].join("\n");
}

function sanitizeAnalysis(raw: unknown) {
  const parsed = analysisSchema.parse(raw);
  return {
    ...parsed,
    fieldPatches: parsed.fieldPatches.filter((patch) => {
      if (patch.field !== "targetFormat") return true;
      const value = Array.isArray(patch.value) ? patch.value[0] : patch.value;
      return validFormats.has(value);
    }),
    suggestions: parsed.suggestions.filter((suggestion) => {
      if (suggestion.field !== "targetFormat") return true;
      const value = Array.isArray(suggestion.suggestedValue)
        ? suggestion.suggestedValue[0]
        : suggestion.suggestedValue;
      return validFormats.has(value);
    }),
  };
}

export async function POST(request: Request) {
  try {
    const { user } = await requireWorkspaceAccess(request);
    const locale = await getUserLocale(user.id);
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const response = await openai.responses.create({
      model: env.OPENAI_TEXT_MODEL,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: buildPrompt(parsed.data.briefing, locale) }],
        },
      ],
      text: {
        format: { type: "json_object" },
      },
    });

    const raw = response.output_text;
    if (!raw) {
      return apiError("briefingDoctorFailed", 502);
    }

    try {
      const json = JSON.parse(raw);
      const analysis = sanitizeAnalysis(json);
      return NextResponse.json({ analysis });
    } catch {
      return apiError("briefingDoctorFailed", 502);
    }
  } catch (error) {
    return handleApiError(error, "briefing-doctor.analyze.POST");
  }
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run --config config/vitest.config.ts tests/integration/briefing-doctor.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/app/api/briefing-doctor/analyze/route.ts app/tests/integration/briefing-doctor.test.ts && git commit -m "feat: add briefing doctor analysis endpoint"
```

---

### Task 3: Add frontend hook for AI analysis

**Files:**
- Create: `app/src/lib/hooks/use-briefing-doctor.ts` <!-- VERIFY: app/src/lib/hooks/use-briefing-doctor.ts — see verification in .planning/tmp/ -->

**Step 1: Create hook types and mutation**

Create `app/src/lib/hooks/use-briefing-doctor.ts`:

```ts
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type {
  BriefingDoctorInput,
  BriefingDoctorIssue,
  BriefingDoctorReadiness,
  BriefingFieldPatch,
} from "@/lib/briefing-doctor";

export interface BriefingDoctorSuggestion {
  field: BriefingFieldPatch["field"];
  title: string;
  suggestedValue: string | string[];
  rationale: string;
}

export interface BriefingDoctorAnalysis {
  overallScore: number;
  readiness: BriefingDoctorReadiness;
  issues: BriefingDoctorIssue[];
  suggestions: BriefingDoctorSuggestion[];
  improvedBrief: Record<string, unknown>;
  fieldPatches: BriefingFieldPatch[];
}

export function useBriefingDoctorAnalysis() { <!-- VERIFY: useBriefingDoctorAnalysis — see verification in .planning/tmp/ -->
  return useMutation({
    mutationFn: async (briefing: BriefingDoctorInput): Promise<BriefingDoctorAnalysis> => {
      const res = await apiFetch("/api/briefing-doctor/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ briefing }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Briefing analysis failed");
      }
      const data = await res.json();
      return data.analysis as BriefingDoctorAnalysis;
    },
  });
}
```

**Step 2: Run type check**

Run:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx tsc --noEmit --pretty false
```

Expected: PASS.

**Step 3: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/lib/hooks/use-briefing-doctor.ts && git commit -m "feat: add briefing doctor analysis hook"
```

---

### Task 4: Add Briefing Doctor panel to the briefing UI

**Files:**
- Modify: `app/src/components/workspace/BriefingStep.tsx`
- Modify: `app/messages/en.json`
- Modify: `app/messages/pt-BR.json`

**Step 1: Import helpers**

In `BriefingStep.tsx`, add:

```ts
import {
  analyzeBriefingLocal,
  applyBriefingFieldPatch,
  type BriefingFieldPatch,
} from "@/lib/briefing-doctor";
import { useBriefingDoctorAnalysis } from "@/lib/hooks/use-briefing-doctor";
```

**Step 2: Add analysis state**

Inside the component:

```ts
const briefingDoctor = useBriefingDoctorAnalysis();
const localAnalysis = analyzeBriefingLocal(formData);
const aiAnalysis = briefingDoctor.data;

const handleAnalyzeBriefing = () => {
  briefingDoctor.mutate(formData);
};

const handleApplyPatch = (patch: BriefingFieldPatch) => {
  const next = applyBriefingFieldPatch(formData, patch);
  setFormData(next as BriefingFormData);
};
```

**Step 3: Add compact panel**

Place this panel after CTA variants and before constraints:

```tsx
<motion.div
  variants={fieldVariants}
  className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-4 space-y-3"
>
  <div className="flex items-center justify-between gap-3">
    <div>
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">
        {tBriefing("doctor.title")}
      </h3>
      <p className="text-xs text-[var(--text-muted)] mt-0.5">
        {tBriefing("doctor.subtitle")}
      </p>
    </div>
    <span className="rounded-md bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-secondary)]">
      {tBriefing(`doctor.readiness.${aiAnalysis?.readiness ?? localAnalysis.readiness}`)}
    </span>
  </div>

  {localAnalysis.issues.length > 0 ? (
    <div className="space-y-2">
      {localAnalysis.issues.slice(0, 3).map((issue, index) => (
        <div key={`${issue.field}-${index}`} className="rounded-md bg-[var(--surface-raised)] p-2">
          <p className="text-xs font-medium text-[var(--text-primary)]">{issue.message}</p>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{issue.impact}</p>
        </div>
      ))}
    </div>
  ) : (
    <p className="text-xs text-[var(--text-secondary)]">
      {tBriefing("doctor.noLocalIssues")}
    </p>
  )}

  {briefingDoctor.isError && (
    <p className="text-xs text-[var(--accent-rose)]">
      {tBriefing("doctor.analysisFailed")}
    </p>
  )}

  {aiAnalysis?.suggestions?.length ? (
    <div className="space-y-2">
      {aiAnalysis.suggestions.slice(0, 4).map((suggestion, index) => {
        const patch = aiAnalysis.fieldPatches.find((item) => item.field === suggestion.field);
        return (
          <div key={`${suggestion.field}-${index}`} className="rounded-md border border-[var(--border-dim)] p-3">
            <p className="text-xs font-medium text-[var(--text-primary)]">{suggestion.title}</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">{suggestion.rationale}</p>
            {patch && (
              <button
                type="button"
                onClick={() => handleApplyPatch(patch)}
                className="mt-2 text-xs font-medium text-[var(--accent-mint)] hover:text-[var(--accent-mint-light)]"
              >
                {tBriefing("doctor.apply")}
              </button>
            )}
          </div>
        );
      })}
    </div>
  ) : null}

  <button
    type="button"
    onClick={handleAnalyzeBriefing}
    disabled={briefingDoctor.isPending}
    className="inline-flex items-center rounded-md border border-[var(--border-dim)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-raised)] disabled:opacity-60"
  >
    {briefingDoctor.isPending ? tBriefing("doctor.analyzing") : tBriefing("doctor.analyze")}
  </button>
</motion.div>
```

Refine styles to match the app, but keep the panel compact.

**Step 4: Add translations**

In `app/messages/en.json` under `briefing`:

```json
"doctor": {
  "title": "Briefing Doctor",
  "subtitle": "Review gaps before generating.",
  "analyze": "Analyze briefing",
  "analyzing": "Analyzing...",
  "apply": "Apply",
  "analysisFailed": "Could not analyze with AI. Local checks are still available.",
  "noLocalIssues": "No obvious issues in the briefing.",
  "readiness": {
    "ready": "Ready",
    "needs_attention": "Needs attention",
    "weak": "Weak"
  }
}
```

In `app/messages/pt-BR.json`:

```json
"doctor": {
  "title": "Briefing Doctor",
  "subtitle": "Revise lacunas antes de gerar.",
  "analyze": "Analisar briefing",
  "analyzing": "Analisando...",
  "apply": "Aplicar",
  "analysisFailed": "Não foi possível analisar com IA. As checagens locais continuam disponíveis.",
  "noLocalIssues": "Nenhum problema óbvio no briefing.",
  "readiness": {
    "ready": "Pronto",
    "needs_attention": "Atenção",
    "weak": "Fraco"
  }
}
```

**Step 5: Run checks**

Run:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npm run lint && npx tsc --noEmit --pretty false
```

Expected: PASS.

**Step 6: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/components/workspace/BriefingStep.tsx app/messages/en.json app/messages/pt-BR.json && git commit -m "feat: add briefing doctor panel"
```

---

### Task 5: Add UI tests for patch application and assistive flow

**Files:**
- Create: `app/tests/unit/briefing-doctor-ui.test.tsx` <!-- VERIFY: app/tests/unit/briefing-doctor-ui.test.tsx — see verification in .planning/tmp/ -->

**Step 1: Write focused component tests**

Create `app/tests/unit/briefing-doctor-ui.test.tsx` with React Testing Library.

Mock `next-intl` translations with identity function, and mock `useBriefingDoctorAnalysis`.

Test cases:

- renders local issues without calling AI
- clicking `Analyze briefing` calls the mutation
- applying an audience patch changes only the audience input
- continue remains clickable when local warnings exist

Keep selectors based on visible labels from the current form.

**Step 2: Run the UI test**

Run:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run --config config/vitest.config.ts tests/unit/briefing-doctor-ui.test.tsx
```

Expected: PASS.

**Step 3: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/tests/unit/briefing-doctor-ui.test.tsx && git commit -m "test: cover briefing doctor ui flow"
```

---

### Task 6: Final validation

**Files:**
- No code changes expected unless validation exposes a bug.

**Step 1: Run focused tests**

Run:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run --config config/vitest.config.ts tests/unit/briefing-doctor.test.ts tests/integration/briefing-doctor.test.ts tests/unit/briefing-doctor-ui.test.tsx
```

Expected: PASS.

**Step 2: Run full test suite**

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

- Briefing form works exactly as before.
- Local Briefing Doctor warnings appear without pressing analyze.
- `Analyze briefing` returns suggestions when API succeeds.
- AI failure leaves local warnings visible and does not block continue.
- Applying an audience suggestion does not change offer, CTAs, format, or mode.
- Applying CTA suggestions fills empty CTA slots and does not overwrite existing CTAs.
- Continue/generation remains available with warnings.

**Step 7: Commit validation fixes if needed**

If validation required fixes:

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add <changed-files> && git commit -m "fix: stabilize briefing doctor flow"
```

If no fixes were needed, do not create an empty commit.
