# Restyling Style Intensity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a persisted Suave/Medio/Forte style-intensity control to the Restyling quick tool and pass it into the restyling prompt.

**Architecture:** Store `styleIntensity` on campaigns with default `medium`, accept it in campaign and quick-tool APIs, expose it in the Restyling modal, and thread it through the derivation job into `buildRestylingPrompt`. Keep the control scoped to style strength only; CTA, offer, base content, target format, and generation mode remain unchanged.

**Tech Stack:** TypeScript, Next.js 16 route handlers, React 19, next-intl, Drizzle ORM, PostgreSQL, Vitest.

---

### Task 1: Add Campaign `styleIntensity` Persistence

**Files:**
- Modify: `app/src/server/db/schema.ts`
- Modify: `app/src/server/repositories/campaign.ts`
- Modify: `app/src/lib/mock-data.ts`
- Modify: `app/src/lib/hooks/use-campaigns.ts`
- Create: `app/drizzle/0005_add_campaign_style_intensity.sql`
- Test: `app/tests/unit/repositories/campaign.test.ts`

**Step 1: Write the failing repository tests**

Add tests to `app/tests/unit/repositories/campaign.test.ts`:

```ts
it("createCampaign defaults styleIntensity to medium", async () => {
  const mockReturning = vi.fn().mockResolvedValue([{ id: "camp-1" }]);
  const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
  (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

  await createCampaign(workspaceId, { name: "Restyling" });

  expect(mockValues).toHaveBeenCalledWith(
    expect.objectContaining({ styleIntensity: "medium" })
  );
});

it("createCampaign stores styleIntensity", async () => {
  const mockReturning = vi.fn().mockResolvedValue([{ id: "camp-1" }]);
  const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
  (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

  await createCampaign(workspaceId, {
    name: "Restyling",
    generationMode: "restyling",
    styleIntensity: "strong",
  });

  expect(mockValues).toHaveBeenCalledWith(
    expect.objectContaining({ styleIntensity: "strong" })
  );
});

it("updateCampaign updates styleIntensity", async () => {
  const mockReturning = vi.fn().mockResolvedValue([{ id: "camp-1" }]);
  const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

  await updateCampaign("camp-1", workspaceId, { styleIntensity: "soft" });

  expect(mockSet).toHaveBeenCalledWith(
    expect.objectContaining({ styleIntensity: "soft" })
  );
});
```

**Step 2: Run the focused test and verify it fails**

Run:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run --config config/vitest.config.ts tests/unit/repositories/campaign.test.ts
```

Expected: FAIL because `styleIntensity` does not exist on repository input/schema.

**Step 3: Add schema, type, and repository support**

In `app/src/server/db/schema.ts`, add:

```ts
styleIntensity: text("style_intensity").notNull().default("medium"),
```

Place it near `creativeLevel`.

In `app/src/server/repositories/campaign.ts`, add:

```ts
export type StyleIntensity = "soft" | "medium" | "strong";
```

Add `styleIntensity?: StyleIntensity` to `CreateCampaignInput` and `UpdateCampaignInput`.

Add `styleIntensity: campaigns.styleIntensity` to `campaignFields`.

In `createCampaign`, write:

```ts
styleIntensity: data.styleIntensity ?? "medium",
```

In `updateCampaign`, destructure `styleIntensity` and add:

```ts
...(styleIntensity !== undefined && { styleIntensity }),
```

Update frontend campaign types:

```ts
styleIntensity?: "soft" | "medium" | "strong";
```

In `app/src/lib/hooks/use-campaigns.ts`, include `styleIntensity` in `Campaign`, `UiCampaign`, `toUiCampaign`, and create/update payload types.

In `app/src/lib/mock-data.ts`, allow `generationMode?: "art_variation" | "format_adaptation" | "restyling"` and add optional `styleIntensity`.

**Step 4: Add migration**

Create `app/drizzle/0005_add_campaign_style_intensity.sql`:

```sql
ALTER TABLE "adscale_app"."campaigns" ADD COLUMN "style_intensity" text DEFAULT 'medium' NOT NULL;
```

If using Drizzle snapshots locally, run:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx drizzle-kit generate --name add_campaign_style_intensity
```

Then verify the generated SQL only adds `campaigns.style_intensity`. If Drizzle creates a different filename, keep the generated filename and do not duplicate migrations.

**Step 5: Run tests**

Run:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run --config config/vitest.config.ts tests/unit/repositories/campaign.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/server/db/schema.ts app/src/server/repositories/campaign.ts app/src/lib/mock-data.ts app/src/lib/hooks/use-campaigns.ts app/drizzle app/tests/unit/repositories/campaign.test.ts && git commit -m "feat: persist restyling style intensity"
```

---

### Task 2: Validate `styleIntensity` in Campaign and Restyling APIs

**Files:**
- Modify: `app/src/app/api/campaigns/route.ts`
- Modify: `app/src/app/api/campaigns/[id]/route.ts`
- Modify: `app/src/app/api/quick-tools/restyling/route.ts`
- Test: `app/tests/integration/campaign-crud.test.ts`
- Test: create `app/tests/integration/quick-tools-restyling.test.ts`

**Step 1: Check Next route-handler docs**

Before editing route handlers, skim the local Next docs required by `app/AGENTS.md`:

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && rg -n "Route Handlers|route handlers|Request" node_modules/next/dist/docs/01-app
```

Use the local docs if a route-handler convention is unclear.

**Step 2: Write failing campaign API validation tests**

In `app/tests/integration/campaign-crud.test.ts`, add repository-level assertions or route-level tests matching the existing style. At minimum cover:

```ts
it("passes styleIntensity when creating a campaign", async () => {
  const mockReturning = vi.fn().mockResolvedValue([{ id: "camp-1" }]);
  const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
  (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

  await createCampaign(workspaceA, {
    name: "Restyling",
    generationMode: "restyling",
    styleIntensity: "strong",
  });

  expect(mockValues).toHaveBeenCalledWith(
    expect.objectContaining({ styleIntensity: "strong" })
  );
});
```

**Step 3: Write failing quick-tool API tests**

Create `app/tests/integration/quick-tools-restyling.test.ts`.

Mock `requireWorkspaceAccess`, `getUserLocale`, campaign/asset/derivation repositories, R2 storage, and `inngest.send`.

Cover:

```ts
it("creates restyling campaign with selected styleIntensity", async () => {
  const formData = new FormData();
  formData.append("name", "Restyle");
  formData.append("styleIntensity", "strong");
  formData.append("baseImage", new File(["base"], "base.png", { type: "image/png" }));
  formData.append("styleImage", new File(["style"], "style.png", { type: "image/png" }));

  const response = await POST(new Request("http://localhost/api/quick-tools/restyling", {
    method: "POST",
    body: formData,
  }));

  expect(response.status).toBe(201);
  expect(createCampaign).toHaveBeenCalledWith(
    "ws-1",
    expect.objectContaining({ styleIntensity: "strong" })
  );
});

it("defaults missing styleIntensity to medium", async () => {
  // same request without styleIntensity
  expect(createCampaign).toHaveBeenCalledWith(
    "ws-1",
    expect.objectContaining({ styleIntensity: "medium" })
  );
});

it("rejects invalid styleIntensity", async () => {
  // styleIntensity = "extreme"
  expect(response.status).toBe(400);
});
```

**Step 4: Run tests and verify failure**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run --config config/vitest.config.ts tests/integration/campaign-crud.test.ts tests/integration/quick-tools-restyling.test.ts
```

Expected: FAIL because API schemas and quick tool do not accept the field yet.

**Step 5: Implement API validation**

In both campaign route schemas, add:

```ts
styleIntensity: z.enum(["soft", "medium", "strong"]).optional(),
```

For create route, default is optional because repository supplies `medium`. It is also acceptable to use `.default("medium")` if tests expect the route to pass it explicitly.

In `app/src/app/api/quick-tools/restyling/route.ts`, parse:

```ts
const styleIntensityRaw = formData.get("styleIntensity");
const styleIntensity = typeof styleIntensityRaw === "string" && ["soft", "medium", "strong"].includes(styleIntensityRaw)
  ? styleIntensityRaw
  : styleIntensityRaw == null
    ? "medium"
    : null;

if (!styleIntensity) {
  return apiError("invalidInput", 400, { message: "Invalid style intensity" });
}
```

Then pass it into `createCampaign`:

```ts
styleIntensity,
```

Do not add it to the Inngest event unless Task 4 chooses to thread through event data. The job can load it from campaign.

**Step 6: Run tests**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run --config config/vitest.config.ts tests/integration/campaign-crud.test.ts tests/integration/quick-tools-restyling.test.ts
```

Expected: PASS.

**Step 7: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/app/api/campaigns/route.ts 'app/src/app/api/campaigns/[id]/route.ts' app/src/app/api/quick-tools/restyling/route.ts app/tests/integration/campaign-crud.test.ts app/tests/integration/quick-tools-restyling.test.ts && git commit -m "feat: accept style intensity in restyling APIs"
```

---

### Task 3: Add Restyling Prompt Intensity Rules

**Files:**
- Modify: `app/src/server/ai/prompt-builder.ts`
- Test: `app/tests/unit/prompt-builder.test.ts`

**Step 1: Write failing prompt tests**

Add to `describe("buildRestylingPrompt", ...)`:

```ts
it("includes soft style intensity instruction", () => {
  const prompt = buildRestylingPrompt(contentBrief, styleBrief, campaign, "INSCREVA-SE", "pt-BR", "soft");
  expect(prompt).toContain("STYLE INTENSITY: soft");
  expect(prompt).toContain("borrow mainly palette, subtle texture, and mood");
});

it("includes medium style intensity instruction by default", () => {
  const prompt = buildRestylingPrompt(contentBrief, styleBrief, campaign, "INSCREVA-SE", "pt-BR");
  expect(prompt).toContain("STYLE INTENSITY: medium");
  expect(prompt).toContain("balance base content with reference style");
});

it("includes strong style intensity instruction", () => {
  const prompt = buildRestylingPrompt(contentBrief, styleBrief, campaign, "INSCREVA-SE", "pt-BR", "strong");
  expect(prompt).toContain("STYLE INTENSITY: strong");
  expect(prompt).toContain("high presence");
});

it("normalizes invalid style intensity to medium", () => {
  const prompt = buildRestylingPrompt(contentBrief, styleBrief, campaign, "INSCREVA-SE", "pt-BR", "extreme" as never);
  expect(prompt).toContain("STYLE INTENSITY: medium");
});
```

Extract `contentBrief`, `styleBrief`, and `campaign` constants to avoid duplication.

**Step 2: Run test and verify failure**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run --config config/vitest.config.ts tests/unit/prompt-builder.test.ts
```

Expected: FAIL because `buildRestylingPrompt` has no intensity argument.

**Step 3: Implement prompt rules**

In `app/src/server/ai/prompt-builder.ts`, add:

```ts
export type StyleIntensity = "soft" | "medium" | "strong";

const RESTYLING_INTENSITY_PROMPTS: Record<StyleIntensity, string> = {
  soft: [
    "STYLE INTENSITY: soft.",
    "Use the style reference lightly.",
    "Prioritize the base ad content and layout.",
    "Borrow mainly palette, subtle texture, and mood.",
  ].join("\n"),
  medium: [
    "STYLE INTENSITY: medium.",
    "Balance base content with reference style.",
    "Apply palette, typography, photo treatment, rhythm, and moderate composition influence.",
  ].join("\n"),
  strong: [
    "STYLE INTENSITY: strong.",
    "Apply the reference visual language with high presence.",
    "Allow stronger typography, texture, composition, and energy shifts while preserving campaign content.",
  ].join("\n"),
};

function normalizeStyleIntensity(value?: string | null): StyleIntensity {
  return value === "soft" || value === "strong" || value === "medium" ? value : "medium";
}
```

Update `buildRestylingPrompt` signature:

```ts
styleIntensity?: StyleIntensity | string | null
```

Inside the function:

```ts
const normalizedIntensity = normalizeStyleIntensity(styleIntensity);
```

Add after the style brief section:

```ts
"STYLE INTENSITY:",
RESTYLING_INTENSITY_PROMPTS[normalizedIntensity],
"",
```

Keep existing critical rules unchanged.

**Step 4: Run tests**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run --config config/vitest.config.ts tests/unit/prompt-builder.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/server/ai/prompt-builder.ts app/tests/unit/prompt-builder.test.ts && git commit -m "feat: add restyling style intensity prompt rules"
```

---

### Task 4: Thread `styleIntensity` Through the Restyling Job

**Files:**
- Modify: `app/src/server/jobs/derivation.ts`
- Test: `app/tests/integration/derivation-job.test.ts`

**Step 1: Write a failing job test**

Mock `buildRestylingPrompt` or spy on it so the test can assert the sixth argument.

Add a restyling job test that sets `getCampaignById` to return:

```ts
{
  id: campaignId,
  workspaceId,
  name: "Restyle",
  generationMode: "restyling",
  creativeLevel: "balanced",
  styleIntensity: "strong",
  status: "active",
}
```

Expected assertion:

```ts
expect(buildRestylingPrompt).toHaveBeenCalledWith(
  expect.anything(),
  expect.anything(),
  expect.objectContaining({ styleIntensity: "strong" }),
  expect.anything(),
  expect.anything(),
  "strong"
);
```

If direct spying is awkward because of module imports, test the generated prompt passed to `openai.images.generate` contains `STYLE INTENSITY: strong`.

**Step 2: Run test and verify failure**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run --config config/vitest.config.ts tests/integration/derivation-job.test.ts
```

Expected: FAIL because the job does not pass `campaign.styleIntensity`.

**Step 3: Implement job wiring**

In `app/src/server/jobs/derivation.ts`, update the restyling call:

```ts
unifiedPrompt = buildRestylingPrompt(
  contentBrief,
  styleBrief,
  campaign,
  ctaText ?? derivation.ctaText ?? undefined,
  locale,
  campaign.styleIntensity ?? "medium"
);
```

If the fallback `buildDerivationPrompt` should also mention intensity later, leave it unchanged for this version. The structured restyling prompt is the primary path.

**Step 4: Run test**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run --config config/vitest.config.ts tests/integration/derivation-job.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/server/jobs/derivation.ts app/tests/integration/derivation-job.test.ts && git commit -m "feat: apply style intensity in restyling generation"
```

---

### Task 5: Add Restyling Modal UI Control

**Files:**
- Modify: `app/src/components/workspace/RestylingModal.tsx`
- Modify: `app/messages/en.json`
- Modify: `app/messages/pt-BR.json`
- Test: create `app/tests/unit/restyling-modal.test.tsx`

**Step 1: Write failing UI tests**

Create `app/tests/unit/restyling-modal.test.tsx`.

Mock `next/navigation`, `next-intl`, and `fetch`.

Cover:

```ts
it("renders style intensity control with medium selected by default", () => {
  render(<RestylingModal open onOpenChange={vi.fn()} />);
  expect(screen.getByText("styleIntensityLabel")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "styleIntensity.medium" })).toHaveAttribute("aria-pressed", "true");
});

it("submits selected styleIntensity", async () => {
  render(<RestylingModal open onOpenChange={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "styleIntensity.strong" }));
  // fill required name and files, submit
  const submitted = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as FormData;
  expect(submitted.get("styleIntensity")).toBe("strong");
});
```

Use the existing translation mock pattern from `app/tests/unit/briefing-doctor-ui.test.tsx`.

**Step 2: Run test and verify failure**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run --config config/vitest.config.ts tests/unit/restyling-modal.test.tsx
```

Expected: FAIL because the modal has no intensity UI.

**Step 3: Implement UI state and submit field**

In `RestylingForm`, add:

```ts
styleIntensity: "soft" | "medium" | "strong";
```

Default:

```ts
styleIntensity: "medium",
```

Append to form submission:

```ts
formData.append("styleIntensity", form.styleIntensity);
```

Add a segmented control near the style image picker:

```tsx
const intensityOptions = ["soft", "medium", "strong"] as const;
```

Each button should use:

```tsx
type="button"
aria-pressed={form.styleIntensity === option}
onClick={() => updateField("styleIntensity", option)}
```

Render helper text:

```tsx
{t(`styleIntensity.help.${form.styleIntensity}`)}
```

Keep dimensions stable and use the existing restrained modal styling.

**Step 4: Add translations**

In both message files under `restyling`, add:

```json
"styleIntensity": {
  "label": "Style intensity",
  "soft": "Soft",
  "medium": "Medium",
  "strong": "Strong",
  "help": {
    "soft": "Applies color, texture, and mood without moving far from the base creative.",
    "medium": "Balances the base creative with typography, treatment, and rhythm from the reference.",
    "strong": "Pulls more of the reference visual language without copying its content."
  }
}
```

Use Portuguese equivalents in `pt-BR.json`:

```json
"label": "Intensidade do estilo",
"soft": "Suave",
"medium": "Médio",
"strong": "Forte"
```

**Step 5: Run UI test**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run --config config/vitest.config.ts tests/unit/restyling-modal.test.tsx
```

Expected: PASS.

**Step 6: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/components/workspace/RestylingModal.tsx app/messages/en.json app/messages/pt-BR.json app/tests/unit/restyling-modal.test.tsx && git commit -m "feat: add restyling style intensity control"
```

---

### Task 6: Final Verification

**Files:**
- No new source files unless a previous task exposed a missing type.

**Step 1: Run focused tests**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run --config config/vitest.config.ts tests/unit/repositories/campaign.test.ts tests/integration/campaign-crud.test.ts tests/integration/quick-tools-restyling.test.ts tests/unit/prompt-builder.test.ts tests/integration/derivation-job.test.ts tests/unit/restyling-modal.test.tsx
```

Expected: PASS.

**Step 2: Run full test suite**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npm run test
```

Expected: PASS.

**Step 3: Run lint**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npm run lint
```

Expected: PASS.

**Step 4: Run typecheck**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx tsc --noEmit --pretty false
```

Expected: PASS.

**Step 5: Run build**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npm run build
```

Expected: PASS. Use `next build --webpack` through the existing script.

**Step 6: Commit verification-only changes if any**

Only commit if previous commands produced intentional file changes, such as generated Drizzle metadata:

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git status --short
git add <intentional-files>
git commit -m "test: verify restyling style intensity"
```

Expected: no commit needed if no files changed.

---

### Acceptance Checklist

- Restyling modal shows Suave/Medio/Forte with Medio selected by default.
- Quick tool sends `styleIntensity`.
- Quick tool rejects invalid intensity and defaults missing intensity to `medium`.
- Campaign stores and returns `styleIntensity`.
- Restyling job passes `styleIntensity` to `buildRestylingPrompt`.
- Prompt differs for `soft`, `medium`, and `strong`.
- Style reference remains style-only; content, CTA, offer, format, and generation mode contracts remain preserved.

Plan complete and saved to `docs/plans/2026-05-07-restyling-style-intensity.md`.
