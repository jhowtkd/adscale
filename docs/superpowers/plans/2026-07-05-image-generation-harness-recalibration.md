# Image Generation Harness Recalibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recalibrate image generation so only objective integrity failures block or retry, reference fidelity remains authoritative, and art direction ranks otherwise eligible outputs.

**Architecture:** Extend the existing canonical creative contract with a resolved policy keyed by generation mode and the existing `conservative | balanced | bold | extreme` level. Prompt construction, QA classification, score ceilings, retry, and the validation harness consume that policy; no database migration or parallel evaluator is added.

**Tech Stack:** TypeScript, Next.js 16, Vitest, OpenAI Responses API, existing creative validation scripts.

---

## File map

- `app/src/server/ai/creative-contract.ts`: shared policy and fidelity types on the existing contract.
- `app/src/server/ai/canonical-creative-contract.ts`: single policy resolver and canonical prompt rendering.
- `app/src/server/ai/prompt-builder.ts`: remove literal CTA and fixed-layout hard rules; pass the resolved policy.
- `app/src/server/ai/per-mode-prompt-rules.ts`: mode-specific freedoms and fidelity wording.
- `app/src/server/ai/observable-rubric.ts`: advisory, contextual art-direction rubric.
- `app/src/server/ai/creative-qa.ts`: factual compliance wording and optional CTA semantics.
- `app/src/server/ai/creative-quality-gate.ts`: objective hard failures versus polish/fidelity findings.
- `app/src/server/ai/creative-score-ceilings.ts`: ceilings only for objective failures.
- `app/src/server/ai/derivation-auto-retry-policy.ts`: retry only objective failures.
- `app/scripts/creative-validation-ranking.ts`: deterministic integrity → fidelity → art-direction comparator.
- `app/scripts/run-creative-validation.ts`: use the shared comparator and remove score-driven retry.
- Focused tests beside the existing prompt, gate, retry, scoring, and validation tests.

### Task 1: Resolve one canonical creative policy

**Files:**
- Modify: `app/src/server/ai/creative-contract.ts`
- Modify: `app/src/server/ai/canonical-creative-contract.ts`
- Create: `app/src/server/ai/canonical-creative-policy.test.ts`
- Modify: `app/src/server/jobs/derivation.ts`

- [x] **Step 1: Write failing policy-resolution tests**

```ts
import { describe, expect, it } from "vitest";
import { resolveCanonicalCreativePolicy } from "./canonical-creative-contract";

describe("resolveCanonicalCreativePolicy", () => {
  it.each(["conservative", "balanced", "bold", "extreme"] as const)(
    "keeps %s as the requested fidelity band",
    (level) => {
      expect(resolveCanonicalCreativePolicy("art_variation", level).fidelityLevel).toBe(level);
    }
  );

  it("makes CTA optional and preserves action intent", () => {
    expect(resolveCanonicalCreativePolicy("art_variation", "balanced").cta).toEqual({
      presence: "optional",
      wording: "preserve_action_intent",
    });
  });

  it("keeps fixed layout numbers advisory", () => {
    expect(resolveCanonicalCreativePolicy("format_adaptation", "balanced").heuristics).toEqual([
      "three_zones",
      "free_space_20_percent",
      "safe_margin_8_percent",
      "thumbnail_25_percent",
    ]);
  });
});
```

- [x] **Step 2: Run the test and verify failure**

Run: `cd app && npm test -- src/server/ai/canonical-creative-policy.test.ts`  
Expected: FAIL because `resolveCanonicalCreativePolicy` does not exist.

- [x] **Step 3: Add the minimal shared types**

```ts
export type CreativeFidelityLevel = "conservative" | "balanced" | "bold" | "extreme";

export interface CanonicalCreativePolicy {
  fidelityLevel: CreativeFidelityLevel;
  cta: { presence: "optional"; wording: "preserve_action_intent" };
  copy: "facts_fixed_expression_flexible";
  heuristics: readonly [
    "three_zones",
    "free_space_20_percent",
    "safe_margin_8_percent",
    "thumbnail_25_percent",
  ];
}

export interface CreativeContract {
  // existing fields remain
  creativeLevel?: CreativeFidelityLevel;
  policy?: CanonicalCreativePolicy;
}
```

- [x] **Step 4: Implement the resolver in the existing canonical module**

```ts
export function resolveCanonicalCreativePolicy(
  _mode: CreativeContract["generationMode"],
  fidelityLevel: CreativeFidelityLevel = "balanced"
): CanonicalCreativePolicy {
  return {
    fidelityLevel,
    cta: { presence: "optional", wording: "preserve_action_intent" },
    copy: "facts_fixed_expression_flexible",
    heuristics: [
      "three_zones",
      "free_space_20_percent",
      "safe_margin_8_percent",
      "thumbnail_25_percent",
    ],
  };
}
```

When `resolveCanonicalCreative` or the derivation job builds the persisted contract, attach `creativeLevel: campaign.creativeLevel ?? "balanced"` and `policy: resolveCanonicalCreativePolicy(mode, level)`. Fallback contracts continue resolving `balanced`, so old rows remain readable without migration.

- [x] **Step 5: Run focused tests**

Run: `cd app && npm test -- src/server/ai/canonical-creative-policy.test.ts src/server/ai/creative-contract.test.ts src/server/jobs/derivation.test.ts`  
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add app/src/server/ai/creative-contract.ts app/src/server/ai/canonical-creative-contract.ts app/src/server/ai/canonical-creative-policy.test.ts app/src/server/jobs/derivation.ts app/src/server/jobs/derivation.test.ts
git commit -m "refactor: centralize creative generation policy"
```

### Task 2: Make prompts flexible inside the fidelity band

**Files:**
- Modify: `app/src/server/ai/canonical-creative-contract.ts`
- Modify: `app/src/server/ai/prompt-builder.ts`
- Modify: `app/src/server/ai/per-mode-prompt-rules.ts`
- Modify: `app/src/server/ai/prompt-builder.test.ts`
- Modify: `app/tests/unit/ai/quality-prompt-regression.test.ts`

- [ ] **Step 1: Replace literal-contract expectations with policy expectations**

Add focused assertions:

```ts
expect(prompt).toContain("CTA PRESENCE: optional");
expect(prompt).toContain("Preserve the intended action when a CTA is rendered");
expect(prompt).toContain("Facts are fixed; headline and supporting expression are flexible");
expect(prompt).not.toContain("CTA text above is MANDATORY and FINAL");
expect(prompt).not.toContain("must appear verbatim");
expect(prompt).not.toContain("at least 8% of the canvas");
```

For `format_adaptation`, also assert:

```ts
expect(prompt).toContain("same campaign and visual system");
expect(prompt).toContain("may condense or rewrite non-factual copy");
expect(prompt).not.toContain("keeping all copy and facts verbatim");
```

- [ ] **Step 2: Run prompt tests and verify failure**

Run: `cd app && npm test -- src/server/ai/prompt-builder.test.ts tests/unit/ai/quality-prompt-regression.test.ts`  
Expected: FAIL on the old literal CTA, verbatim-copy, margin, and three-zone contracts.

- [ ] **Step 3: Render policy once in the canonical contract section**

Change the canonical block to emit:

```ts
"OBJECTIVE INTEGRITY: brand, product, price, conditions, dates, claims, and target format must remain correct.",
"CTA PRESENCE: optional. Preserve the intended action when a CTA is rendered; literal wording is not required.",
"COPY: Facts are fixed; headline and supporting expression are flexible and may be rewritten, condensed, or omitted.",
`REFERENCE FIDELITY: ${policy.fidelityLevel}. Visual-system recognition governs permitted distance.`,
"ADVISORY HEURISTICS: three zones, whitespace, safe margins, and thumbnail checks may guide composition but never override art direction.",
```

Remove CTA from `DEFAULT_TIERS.mandatory` and change precedence to factual accuracy → requested fidelity → art direction.

- [ ] **Step 4: Delete duplicate hard wording from prompt and per-mode rules**

In `buildHardRulesSection`, retain target format, real-logo protection, locale, and factual-integrity precedence. Delete the explicit/inherited literal CTA branches.

In `per-mode-prompt-rules.ts`:

- keep factual-source isolation for restyling;
- keep native target-format output and no letterboxing for format adaptation;
- replace verbatim copy/CTA requirements with factual preservation and flexible expression;
- retain the four fidelity templates already present in `prompt-builder.ts` but rewrite them around visual-system distance;
- convert 8%, 20%, three-zone, and 25%-thumbnail language from commands into optional examples.

- [ ] **Step 5: Run focused prompt tests**

Run: `cd app && npm test -- src/server/ai/prompt-builder.test.ts tests/unit/prompt-builder.test.ts tests/unit/ai/quality-prompt-regression.test.ts tests/unit/ai/regression-prompt-contract.test.ts`  
Expected: PASS with no literal CTA or numeric aesthetic hard-rule snapshots.

- [ ] **Step 6: Commit**

```bash
git add app/src/server/ai/canonical-creative-contract.ts app/src/server/ai/prompt-builder.ts app/src/server/ai/per-mode-prompt-rules.ts app/src/server/ai/prompt-builder.test.ts app/tests/unit/prompt-builder.test.ts app/tests/unit/ai/quality-prompt-regression.test.ts app/tests/unit/ai/regression-prompt-contract.test.ts
git commit -m "feat: loosen creative prompts within fidelity bands"
```

### Task 3: Separate objective integrity from art-direction advice

**Files:**
- Modify: `app/src/server/ai/observable-rubric.ts`
- Modify: `app/src/server/ai/creative-qa.ts`
- Modify: `app/src/server/ai/creative-qa.test.ts`
- Modify: `app/src/server/ai/creative-quality-gate.ts`
- Modify: `app/tests/unit/ai/creative-quality-gate.test.ts`
- Modify: `app/src/server/ai/creative-score-ceilings.ts`
- Modify: `app/tests/unit/ai/creative-score-ceilings.test.ts`

- [ ] **Step 1: Write failing gate tests for the new boundary**

```ts
it.each([
  ["ctaOffer", "CTA is absent"],
  ["legibility", "Supporting copy is hard to read at thumbnail size"],
  ["creativeRisk", "Four equal-weight zones create visual overload"],
  ["creativeRisk", "Generic glassmorphism template"],
] as const)("keeps %s aesthetic failure advisory", (criterion, note) => {
  const result = classifyCreativeQualityGate({
    contract: artVariationContract,
    checklist: checklist({ [criterion]: { status: "failed", note } }),
  });
  expect(result.hardFailures).toEqual([]);
  expect(result.polishSuggestions).toContain(note);
});

it("still blocks invented offers", () => {
  const result = classifyCreativeQualityGate({
    contract: artVariationContract,
    checklist: checklist({
      ctaOffer: { status: "failed", note: "Invented 50% discount not in the campaign." },
    }),
  });
  expect(result.hardFailures.map(({ code }) => code)).toContain("unsupported_offer");
});
```

- [ ] **Step 2: Run gate tests and verify failure**

Run: `cd app && npm test -- tests/unit/ai/creative-quality-gate.test.ts src/server/ai/creative-qa.test.ts tests/unit/ai/creative-score-ceilings.test.ts`  
Expected: FAIL because CTA drift, illegibility, overload, and generic aesthetics are still promoted or capped.

- [ ] **Step 3: Make the observable rubric contextual and advisory**

Replace fail/cap language with:

```ts
export const ART_DIRECTION_RUBRIC = `ART DIRECTION (ranking guidance):
- Judge composition, typography, rhythm, contrast, visual treatment, and campaign-specific character.
- Evaluate comprehension in the intended format and context; do not apply a universal 25% thumbnail threshold.
- Three zones, whitespace, safe margins, and CTA prominence are optional techniques, not validity rules.
- Cite visible evidence for every observation.`;
```

Remove `SCORE_VISUAL_QUALITY_CAPS` and keep the existing extractor header stable if downstream snapshots depend on it.

- [ ] **Step 4: Rewrite QA compliance wording**

In `buildCreativeQaPrompt`:

- state that CTA absence and paraphrase are allowed;
- ask whether a rendered CTA preserves action intent;
- reserve failed compliance for invented or incorrect facts, unusable format, corruption, and severe factual-element cropping;
- keep art-direction observations in `creativeRisk` as ranking advice;
- keep style-reference factual contamination as a failure.

- [ ] **Step 5: Demote subjective hard-failure classifications**

In `classifyCreativeQualityGate`, move these to `polishSuggestions`:

```ts
cta_drift
unreadable_required_text
visual_overload
generic_template_aesthetic
missing_dominant_idea
decorative_only_variation
campaign_identity_drift
```

Keep objective codes hard: wrong brand, unsupported offer, invented entity, copied style-reference facts, replaced source subject, unauthorized brand/IP, severe factual-content crop, and invalid output format/layout.

Update score ceilings so only remaining hard failures have mappings. Numeric scores remain compatibility data.

- [ ] **Step 6: Run focused tests**

Run: `cd app && npm test -- src/server/ai/creative-qa.test.ts tests/unit/ai/creative-quality-gate.test.ts tests/unit/ai/creative-score-ceilings.test.ts tests/unit/ai/quality-rubric-regression.test.ts`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/src/server/ai/observable-rubric.ts app/src/server/ai/creative-qa.ts app/src/server/ai/creative-qa.test.ts app/src/server/ai/creative-quality-gate.ts app/tests/unit/ai/creative-quality-gate.test.ts app/src/server/ai/creative-score-ceilings.ts app/tests/unit/ai/creative-score-ceilings.test.ts app/tests/unit/ai/quality-rubric-regression.test.ts
git commit -m "refactor: reserve quality failures for objective defects"
```

### Task 4: Retry only objective failures

**Files:**
- Modify: `app/src/server/ai/derivation-auto-retry-policy.ts`
- Modify: `app/tests/unit/ai/derivation-auto-retry-policy.test.ts`
- Modify: `app/scripts/run-creative-validation.ts`
- Modify: `app/tests/unit/ai/derivation-auto-retry-policy.test.ts`

- [ ] **Step 1: Write failing retry tests**

```ts
it.each(["cta_drift", "unreadable_required_text", "visual_overload", "decorative_only_variation"] as const)(
  "does not retry advisory finding %s",
  (code) => {
    expect(shouldAutoRetryDerivation("art_variation", [{ code, message: code }], false)).toBe(false);
  }
);

it.each(["invented_factual_entity", "unsupported_offer", "wrong_brand"] as const)(
  "retries objective failure %s once",
  (code) => {
    expect(shouldAutoRetryDerivation("art_variation", [{ code, message: code }], false)).toBe(true);
    expect(shouldAutoRetryDerivation("art_variation", [{ code, message: code }], true)).toBe(false);
  }
);
```

- [ ] **Step 2: Run tests and verify failure**

Run: `cd app && npm test -- tests/unit/ai/derivation-auto-retry-policy.test.ts src/server/ai/derivation-auto-retry.integration.test.ts`  
Expected: FAIL on the old mode-specific aesthetic retry sets.

- [ ] **Step 3: Replace mode sets with one objective set**

```ts
const RETRYABLE_OBJECTIVE_FAILURES = new Set<CreativeHardFailure["code"]>([
  "wrong_brand",
  "unsupported_offer",
  "invented_factual_entity",
  "style_reference_contamination",
  "replaced_source_subject",
  "unauthorized_brand_or_ip",
  "cropped_critical_content",
  "invalid_format_layout",
]);
```

Keep the existing `autoRetryAttempted` guard. In `captureLiveWithAutoRetry`, delete `capture.qualityScore < 75`; retry only when `shouldAutoRetryDerivation(...)` returns true.

- [ ] **Step 4: Run retry and derivation integration tests**

Run: `cd app && npm test -- tests/unit/ai/derivation-auto-retry-policy.test.ts src/server/ai/derivation-auto-retry.integration.test.ts tests/integration/derivation-job.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/server/ai/derivation-auto-retry-policy.ts app/tests/unit/ai/derivation-auto-retry-policy.test.ts app/src/server/ai/derivation-auto-retry.integration.test.ts app/scripts/run-creative-validation.ts app/tests/integration/derivation-job.test.ts
git commit -m "fix: retry creative generation only for objective failures"
```

### Task 5: Rank validation captures by integrity, fidelity, then finish

**Files:**
- Create: `app/scripts/creative-validation-ranking.ts`
- Create: `app/tests/unit/ai/creative-validation-ranking.test.ts`
- Modify: `app/scripts/run-creative-validation.ts`

- [ ] **Step 1: Write the failing comparator tests**

```ts
import { describe, expect, it } from "vitest";
import { compareCreativeCaptures } from "../../../scripts/creative-validation-ranking";

const capture = (hardFailures: string[], fidelity: number, finish: number) => ({
  hardFailures: hardFailures.map((code) => ({ code, message: code })),
  score: { scoreBreakdown: { variationLevelFit: fidelity, visualQuality: finish } },
});

it("prefers objective integrity before any score", () => {
  expect(compareCreativeCaptures(capture([], 70, 70), capture(["wrong_brand"], 100, 100))).toBeGreaterThan(0);
});

it("prefers fidelity before finish", () => {
  expect(compareCreativeCaptures(capture([], 90, 60), capture([], 70, 100))).toBeGreaterThan(0);
});

it("uses finish after integrity and fidelity", () => {
  expect(compareCreativeCaptures(capture([], 90, 85), capture([], 90, 70))).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `cd app && npm test -- tests/unit/ai/creative-validation-ranking.test.ts`  
Expected: FAIL because the comparator module does not exist.

- [ ] **Step 3: Implement the smallest comparator**

```ts
export function compareCreativeCaptures(left: CaptureRankInput, right: CaptureRankInput): number {
  if (left.hardFailures.length !== right.hardFailures.length) {
    return right.hardFailures.length - left.hardFailures.length;
  }
  const leftFidelity = left.score.scoreBreakdown?.variationLevelFit ?? 0;
  const rightFidelity = right.score.scoreBreakdown?.variationLevelFit ?? 0;
  if (leftFidelity !== rightFidelity) return leftFidelity - rightFidelity;
  return (left.score.scoreBreakdown?.visualQuality ?? 0) -
    (right.score.scoreBreakdown?.visualQuality ?? 0);
}
```

Use it inside `isCaptureBetter`. Do not add automatic winner selection to the product UI; the current product still lets the user choose the triplet winner.

- [ ] **Step 4: Run comparator and validation tests**

Run: `cd app && npm test -- tests/unit/ai/creative-validation-ranking.test.ts tests/unit/ai/creative-validation-matrix.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/scripts/creative-validation-ranking.ts app/tests/unit/ai/creative-validation-ranking.test.ts app/scripts/run-creative-validation.ts
git commit -m "test: rank creative captures by integrity and fidelity"
```

### Task 6: Add the blind human acceptance gate

**Files:**
- Create: `app/scripts/check-image-harness-blind-gate.ts`
- Create: `app/tests/unit/ai/image-harness-blind-gate.test.ts`
- Create at validation time: `.planning/validation/image-harness-blind-gate.json`

- [ ] **Step 1: Write failing gate tests**

```ts
it("passes 12 decisions at 60% preference with no integrity regressions", () => {
  const decisions = Array.from({ length: 12 }, (_, index) => ({
    preferred: index < 8 ? "recalibrated" : "baseline",
    objectiveRegression: false,
  }));
  expect(evaluateBlindGate(decisions)).toEqual({ passed: true, preferenceRate: 8 / 12 });
});

it("fails any objective regression", () => {
  const decisions = Array.from({ length: 12 }, () => ({ preferred: "recalibrated", objectiveRegression: false }));
  decisions[0].objectiveRegression = true;
  expect(evaluateBlindGate(decisions).passed).toBe(false);
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `cd app && npm test -- tests/unit/ai/image-harness-blind-gate.test.ts`  
Expected: FAIL because the gate checker does not exist.

- [ ] **Step 3: Implement a stdlib-only checker**

The checker validates exactly 12 decisions, computes `recalibrated / 12`, rejects any objective regression, and exits non-zero below `0.60`:

```ts
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export type BlindDecision = {
  preferred: "baseline" | "recalibrated";
  objectiveRegression: boolean;
};

export function evaluateBlindGate(decisions: BlindDecision[]) {
  if (decisions.length !== 12) throw new Error("Blind gate requires exactly 12 decisions");
  const preferenceRate = decisions.filter((item) => item.preferred === "recalibrated").length / 12;
  return {
    passed: preferenceRate >= 0.6 && decisions.every((item) => !item.objectiveRegression),
    preferenceRate,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: check-image-harness-blind-gate.ts <evidence.json>");
  const evidence = JSON.parse(fs.readFileSync(file, "utf8")) as { pairs: BlindDecision[] };
  const result = evaluateBlindGate(evidence.pairs);
  console.log(`${result.passed ? "PASS" : "FAIL"} preference=${(result.preferenceRate * 100).toFixed(1)}%`);
  if (!result.passed) process.exitCode = 1;
}
```

Expected evidence shape:

```json
{
  "pairs": [
    {
      "id": "pair-01",
      "mode": "art_variation",
      "format": "1:1",
      "creativeLevel": "balanced",
      "preferred": "recalibrated",
      "objectiveRegression": false
    }
  ]
}
```

- [ ] **Step 4: Run automated tests and generate the live comparison set**

Run: `cd app && npm test -- tests/unit/ai/image-harness-blind-gate.test.ts`  
Expected: PASS.

Run the existing live harness for representative rows, preserving baseline and recalibrated images with randomized labels. Collect 12 decisions spanning all three formats, all three modes, and the four fidelity levels where supported. Do not claim acceptance before human decisions exist.

- [ ] **Step 5: Validate human decisions**

Run: `cd app && npx tsx scripts/check-image-harness-blind-gate.ts ../.planning/validation/image-harness-blind-gate.json`  
Expected: `PASS preference >= 60% and objective regressions = 0`. If it fails, retain the evidence and revise only recurring rules before generating another small batch.

- [ ] **Step 6: Run the full focused release check**

```bash
cd app
npm test -- src/server/ai/canonical-creative-policy.test.ts src/server/ai/prompt-builder.test.ts src/server/ai/creative-qa.test.ts tests/unit/ai/creative-quality-gate.test.ts tests/unit/ai/creative-score-ceilings.test.ts tests/unit/ai/derivation-auto-retry-policy.test.ts tests/unit/ai/creative-validation-ranking.test.ts tests/unit/ai/image-harness-blind-gate.test.ts
npm run typecheck
```

Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 7: Commit code and evidence separately**

```bash
git add app/scripts/check-image-harness-blind-gate.ts app/tests/unit/ai/image-harness-blind-gate.test.ts
git commit -m "test: add blind gate for creative recalibration"

git add .planning/validation/image-harness-blind-gate.json
git commit -m "test: record image harness blind comparison"
```

## Completion check

- Only objective integrity findings produce `qualityVerdict: invalid` or automatic retry.
- CTA is optional and preserves action intent only when rendered.
- Copy expression is flexible while facts remain protected.
- `conservative`, `balanced`, `bold`, and `extreme` remain the persisted fidelity vocabulary.
- Format adaptation remains visually faithful without requiring all copy verbatim.
- Validation ranking is integrity → fidelity → art direction.
- The 12-pair blind gate passes at 60% or higher with zero objective regressions.
