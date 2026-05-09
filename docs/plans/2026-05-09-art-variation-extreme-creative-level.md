# Art Variation Extreme Creative Level Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a fourth `extreme` creative level to `art_variation` mode and rewrite existing `creativeLevel` prompts to generate more visually distinct variations.

**Architecture:** Update the prompt templates in `src/server/ai/prompt-builder.ts`, add `extreme` to all enums/types across the stack (API, hooks, repository), and add the fourth radio option in the briefing form UI.

**Tech Stack:** Next.js 16, TypeScript, Zod, Drizzle ORM, React

---

### Task 1: Rewrite prompt templates and add extreme level

**Files:**
- Modify: `src/server/ai/prompt-builder.ts:81-109`

**Step 1: Rewrite conservative template**

Replace the `conservative` constant with:

```typescript
const conservative = `CREATIVITY LEVEL: conservative.
OPERATIONAL RULES FOR CONSERVATIVE:
- Preserve character/product, brand palette, texture, typography style, and visual structure from the reference.
- Change ONLY: layout/disposition, text content, CTA module placement, and minor spacing adjustments.
- Do not introduce new scenes, unrelated motifs, experimental layouts, or major copy shifts.
- Maintain minimal structural change; the result should feel like the same visual universe as the reference.
- Preserve logo behavior, offer structure, and overall campaign recognition.`;
```

**Step 2: Rewrite balanced template**

Replace the `balanced` constant with:

```typescript
const balanced = `CREATIVITY LEVEL: balanced.
OPERATIONAL RULES FOR BALANCED:
- Create a noticeably new composition while keeping brand identity recognizable.
- Rebuild layout, visual hierarchy, CTA module placement, supporting shapes, rhythm, and spacing.
- The result should feel like a sibling creative from the same campaign, not a near-copy.
- Ensure perceptible difference in background, composition, CTA module, and visual hierarchy.
- Preserve palette, character/product, texture, and brand system from the reference.`;
```

**Step 3: Rewrite bold template**

Replace the `bold` constant with:

```typescript
const bold = `CREATIVITY LEVEL: bold.
OPERATIONAL RULES FOR BOLD:
- Change the background structure completely. Use a different scene, texture, or environment.
- Reorganize visual hierarchy: resize, reposition, and regroup key elements.
- Apply new lighting treatment, shadows, and color grading while staying within the brand palette.
- Preserve core brand assets (logo, product), campaign message, offer, and CTA.
- Do not invent a new brand or unrelated visual universe.
- The result must be clearly a different creative from the same campaign.`;
```

**Step 4: Add extreme template**

Add after the `bold` constant:

```typescript
const extreme = `CREATIVITY LEVEL: extreme.
OPERATIONAL RULES FOR EXTREME:
- Reimagine the entire visual context: new scene, new environment, new background treatment.
- Change product angle, framing, scale, or photo treatment dramatically.
- Rebuild composition from scratch: new hierarchy, new spacing language, new rhythm.
- Apply bold lighting shifts, contrast changes, and atmospheric treatment.
- Preserve only: brand identity (logo behavior, palette family), campaign message, offer, and CTA.
- The result should be almost unrecognizable side-by-side with the reference, yet clearly belong to the same campaign when viewed independently.`;
```

**Step 5: Update CREATIVITY_TEMPLATES**

Update the record to include `extreme`:

```typescript
const CREATIVITY_TEMPLATES: Record<string, string> = {
  conservative,
  balanced,
  bold,
  extreme,
};
```

**Step 6: Verify TypeScript compiles**

Run: `cd app && npx tsc --noEmit 2>&1 | grep -E "prompt-builder|error TS" | head -20`
Expected: No errors related to prompt-builder

**Step 7: Commit**

```bash
git add src/server/ai/prompt-builder.ts
git commit -m "feat(prompts): rewrite creative levels and add extreme"
```

---

### Task 2: Update API validation schemas

**Files:**
- Modify: `src/app/api/campaigns/route.ts:24`
- Modify: `src/app/api/campaigns/[id]/route.ts:21`

**Step 1: Add extreme to campaigns create schema**

In `src/app/api/campaigns/route.ts`, find:
```typescript
creativeLevel: z.enum(["conservative", "balanced", "bold"]).optional().default("balanced"),
```

Replace with:
```typescript
creativeLevel: z.enum(["conservative", "balanced", "bold", "extreme"]).optional().default("balanced"),
```

**Step 2: Add extreme to campaigns update schema**

In `src/app/api/campaigns/[id]/route.ts`, find:
```typescript
creativeLevel: z.enum(["conservative", "balanced", "bold"]).optional(),
```

Replace with:
```typescript
creativeLevel: z.enum(["conservative", "balanced", "bold", "extreme"]).optional(),
```

**Step 3: Verify TypeScript compiles**

Run: `cd app && npx tsc --noEmit 2>&1 | grep -E "campaigns/route|campaigns/\[id\]/route|error TS" | head -20`
Expected: No errors

**Step 4: Commit**

```bash
git add src/app/api/campaigns/route.ts src/app/api/campaigns/\[id\]/route.ts
git commit -m "feat(api): add extreme to creativeLevel validation"
```

---

### Task 3: Update repository types

**Files:**
- Modify: `src/server/repositories/campaign.ts:12` (or wherever the type is defined)

**Step 1: Update Campaign insert type**

Find the `CreateCampaignData` or insert type and update `creativeLevel` field to accept `"extreme"`.

In `src/server/repositories/campaign.ts`, find:
```typescript
creativeLevel?: "conservative" | "balanced" | "bold";
```

Replace with:
```typescript
creativeLevel?: "conservative" | "balanced" | "bold" | "extreme";
```

**Step 2: Update Campaign update type**

Find the update type and make the same change.

**Step 3: Verify TypeScript compiles**

Run: `cd app && npx tsc --noEmit 2>&1 | grep -E "repositories/campaign|error TS" | head -20`
Expected: No errors

**Step 4: Commit**

```bash
git add src/server/repositories/campaign.ts
git commit -m "feat(repo): add extreme to creativeLevel types"
```

---

### Task 4: Update frontend hooks types

**Files:**
- Modify: `src/lib/hooks/use-campaigns.ts:19`
- Modify: `src/lib/hooks/use-campaigns.ts:46`
- Modify: `src/lib/hooks/use-campaigns.ts:70`
- Modify: `src/lib/hooks/use-campaigns.ts:123`

**Step 1: Update Campaign interface creativeLevel**

Find all occurrences of:
```typescript
creativeLevel: "conservative" | "balanced" | "bold" | null;
```
and
```typescript
creativeLevel?: "conservative" | "balanced" | "bold";
```

Replace all with `"conservative" | "balanced" | "bold" | "extreme"`.

**Step 2: Verify TypeScript compiles**

Run: `cd app && npx tsc --noEmit 2>&1 | grep -E "use-campaigns|error TS" | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/hooks/use-campaigns.ts
git commit -m "feat(hooks): add extreme to creativeLevel types"
```

---

### Task 5: Add extreme option to BriefingStep UI

**Files:**
- Modify: `src/components/workspace/BriefingStep.tsx` (creativeLevel radio group)

**Step 1: Add extreme option**

Find the `creativeLevel` RadioGroup section. Add a fourth option:

```tsx
<div className="flex items-center space-x-2">
  <RadioGroupItem value="extreme" id="cl-extreme" />
  <Label htmlFor="cl-extreme" className="text-sm text-[var(--text-primary)]">
    {tBriefing("creativeLevel.extreme")}
  </Label>
</div>
```

**Step 2: Add translation keys**

In `messages/pt-BR.json`, under `briefing.creativeLevel`, add:
```json
"extreme": "Extremo"
```

In `messages/en.json`, under `briefing.creativeLevel`, add:
```json
"extreme": "Extreme"
```

**Step 3: Verify TypeScript compiles**

Run: `cd app && npx tsc --noEmit 2>&1 | grep -E "BriefingStep|error TS" | head -20`
Expected: No errors

**Step 4: Commit**

```bash
git add src/components/workspace/BriefingStep.tsx messages/pt-BR.json messages/en.json
git commit -m "feat(ui): add extreme creative level option to briefing form"
```

---

### Task 6: Update mock-data type

**Files:**
- Modify: `src/lib/mock-data.ts:31`

**Step 1: Update Campaign mock type**

Find:
```typescript
styleIntensity?: "soft" | "medium" | "strong";
```

Actually look for `creativeLevel` in the Campaign type if it exists there, or skip if not present.

Check if `creativeLevel` exists in `mock-data.ts` Campaign type. If yes, add `"extreme"`.

**Step 2: Verify TypeScript compiles**

Run: `cd app && npx tsc --noEmit 2>&1 | grep -E "mock-data|error TS" | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/mock-data.ts
git commit -m "feat(types): add extreme to mock-data creativeLevel"
```

---

### Task 7: Build and test in Docker

**Step 1: Build Docker image**

Run: `cd app && docker compose up --build -d app`
Expected: Build succeeds, container starts

**Step 2: Verify health endpoint**

Run: `sleep 8 && curl -s http://localhost:3000/api/health`
Expected: `{"ok":true,...}`

**Step 3: Verify TypeScript passes in build**

Check Docker logs for compilation errors:
Run: `docker logs app-app-1 --tail 20`
Expected: No TypeScript errors, "Ready in" message

**Step 4: Commit (if any Dockerfile or config changes)**

If no config changes needed, skip. Otherwise commit.

---

## Done

All creative levels are updated and `extreme` is available across the full stack: prompts → API → repository → hooks → UI.
