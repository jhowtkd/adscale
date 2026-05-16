# Delivery Package Multi-Format Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users generate selected `1:1`, `4:5`, and `9:16` delivery-package versions from an approved winning derivation.

**Architecture:** Add a dedicated delivery-package endpoint on derivations. It validates an approved source derivation, creates child `format_adaptation` derivations for selected target formats, and queues the existing Inngest image job. Update the derivation job so package children use the parent derivation output image as the `images.edit()` source instead of falling back to the original campaign asset.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle, Inngest, OpenAI Images API, React Query hooks, Vitest/React Testing Library.

---

### Task 1: Add Delivery Package Repository Helpers

**Files:**
- Modify: `app/src/server/repositories/derivation.ts`
- Test: `app/src/server/repositories/derivation.test.ts`

**Step 1: Write repository tests**

Create focused tests for helpers that will be needed by the API route:

```ts
describe("delivery package derivation helpers", () => {
  it("finds active package children for a parent and target formats", async () => {
    const rows = await getActivePackageChildren({
      parentId: "source-id",
      workspaceId: "workspace-id",
      formats: ["4:5", "9:16"],
    });

    expect(db.select).toHaveBeenCalled();
    expect(rows).toEqual(expect.any(Array));
  });
});
```

**Step 2: Run the failing test**

Run: `cd app && npm test -- derivation.test.ts`

Expected: FAIL because `getActivePackageChildren` does not exist.

**Step 3: Implement minimal helpers**

Add:

```ts
export async function getActivePackageChildren({
  parentId,
  workspaceId,
  formats,
}: {
  parentId: string;
  workspaceId: string;
  formats: string[];
}) {
  if (formats.length === 0) return [];

  return db
    .select()
    .from(derivations)
    .where(
      and(
        eq(derivations.parentId, parentId),
        eq(derivations.workspaceId, workspaceId),
        eq(derivations.generationMode, "format_adaptation"),
        inArray(derivations.format, formats),
        inArray(derivations.status, ["queued", "processing"])
      )
    );
}
```

**Step 4: Run tests**

Run: `cd app && npm test -- derivation.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add app/src/server/repositories/derivation.ts app/src/server/repositories/derivation.test.ts
git commit -m "feat: add delivery package derivation helpers"
```

### Task 2: Add Delivery Package API Route

**Files:**
- Create: `app/src/app/api/derivations/[id]/delivery-package/route.ts`
- Test: `app/src/app/api/derivations/[id]/delivery-package/route.test.ts`

**Step 1: Write route tests**

Cover these behaviors:

```ts
it("rejects invalid formats", async () => {
  const res = await POST(requestWith({ formats: ["16:9"] }), paramsWith("source-id"));
  expect(res.status).toBe(400);
});

it("rejects source without outputKey", async () => {
  mockGetDerivationById.mockResolvedValue({ status: "approved", outputKey: null });
  const res = await POST(requestWith({ formats: ["4:5"] }), paramsWith("source-id"));
  expect(res.status).toBe(400);
});

it("creates child derivations for selected generatable formats", async () => {
  mockGetDerivationById.mockResolvedValue({
    id: "source-id",
    campaignId: "campaign-id",
    workspaceId: "workspace-id",
    planId: "plan-id",
    status: "approved",
    outputKey: "derivations/source.png",
    format: "1:1",
    ctaText: "Comprar agora",
    variantIndex: 0,
  });

  const res = await POST(requestWith({ formats: ["1:1", "4:5", "9:16"] }), paramsWith("source-id"));
  const body = await res.json();

  expect(mockCreateDerivation).toHaveBeenCalledTimes(2);
  expect(body.readyFormats).toEqual(["1:1"]);
  expect(body.queued).toEqual([
    expect.objectContaining({ format: "4:5" }),
    expect.objectContaining({ format: "9:16" }),
  ]);
});
```

**Step 2: Run the failing tests**

Run: `cd app && npm test -- delivery-package`

Expected: FAIL because the route does not exist.

**Step 3: Implement the route**

Implementation outline:

```ts
const bodySchema = z.object({
  formats: z.array(z.enum(["1:1", "4:5", "9:16"])).min(1),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, workspace } = await requireWorkspaceAccess(request);
  const locale = await getUserLocale(user.id);
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json());

  if (!parsed.success) return apiError("invalidRequestBody", 400, parsed.error.flatten());

  const source = await getDerivationById(id, workspace.id);
  if (!source) return apiError("derivationNotFound", 404);
  if (source.status !== "approved") return apiError("sourceDerivationNotApproved", 409);
  if (!source.outputKey) return apiError("sourceDerivationMissingOutput", 400);

  const requestedFormats = [...new Set(parsed.data.formats)];
  const readyFormats = source.format ? requestedFormats.filter((format) => format === source.format) : [];
  const generatableFormats = requestedFormats.filter((format) => format !== source.format);
  const activeChildren = await getActivePackageChildren({
    parentId: source.id,
    workspaceId: workspace.id,
    formats: generatableFormats,
  });
  const activeFormats = new Set(activeChildren.map((child) => child.format).filter(Boolean));
  const formatsToCreate = generatableFormats.filter((format) => !activeFormats.has(format));

  const queued = [];
  for (const format of formatsToCreate) {
    const child = await createDerivation({
      campaignId: source.campaignId,
      workspaceId: workspace.id,
      planId: source.planId ?? undefined,
      parentId: source.id,
      status: "queued",
      generationMode: "format_adaptation",
      variantIndex: source.variantIndex ?? undefined,
      ctaText: source.ctaText ?? undefined,
      format,
    });

    await inngest.send({
      name: "derivation.generate",
      data: {
        derivationId: child.id,
        campaignId: source.campaignId,
        workspaceId: workspace.id,
        locale,
        generationMode: "format_adaptation",
        variantIndex: source.variantIndex,
        ctaText: source.ctaText,
        format,
      },
    });

    queued.push({ id: child.id, format });
  }

  await updateCampaign(source.campaignId, workspace.id, { status: queued.length > 0 ? "generating" : undefined });
  return NextResponse.json({ source: { id: source.id, format: source.format }, readyFormats, queued, skipped: [...activeFormats] });
}
```

Adjust `updateCampaign` handling so it never writes `undefined` values if the repository does not ignore them.

**Step 4: Run tests**

Run: `cd app && npm test -- delivery-package derivation.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add app/src/app/api/derivations/[id]/delivery-package/route.ts app/src/app/api/derivations/[id]/delivery-package/route.test.ts app/src/server/repositories/derivation.ts
git commit -m "feat: add delivery package endpoint"
```

### Task 3: Use Parent Derivation Output in Format Adaptation

**Files:**
- Modify: `app/src/server/jobs/derivation.ts`
- Modify: `app/src/server/ai/prompt-builder.ts`
- Test: `app/src/server/jobs/derivation.test.ts`
- Test: `app/src/server/ai/prompt-builder.test.ts`

**Step 1: Write prompt-builder tests**

```ts
it("describes the reference as approved winner for package format adaptation", () => {
  const prompt = buildDerivationPrompt({
    generationMode: "format_adaptation",
    targetFormat: "9:16",
    packageSource: "approved_derivation",
    ctaText: "Comprar agora",
  });

  expect(prompt).toContain("approved winning creative");
  expect(prompt).toContain("Target format: 9:16");
  expect(prompt).toContain("Comprar agora");
});
```

**Step 2: Write derivation job tests**

Mock `getDerivationById`, `downloadBuffer`, and OpenAI image edit. Verify:

```ts
it("uses parent outputKey as reference image for package format adaptation", async () => {
  mockChildDerivation.parentId = "parent-id";
  mockParentDerivation.outputKey = "derivations/parent/output.png";

  await runDerivationJob();

  expect(downloadBuffer).toHaveBeenCalledWith("derivations/parent/output.png");
  expect(openai.images.edit).toHaveBeenCalled();
});
```

**Step 3: Run failing tests**

Run: `cd app && npm test -- prompt-builder.test.ts derivation.test.ts`

Expected: FAIL because `packageSource` and parent-output handling do not exist.

**Step 4: Update prompt builder**

Add to `DerivationPromptConfig`:

```ts
packageSource?: "campaign_asset" | "approved_derivation";
```

When `generationMode === "format_adaptation"` and `packageSource === "approved_derivation"`, append:

```ts
"The uploaded reference image is the approved winning creative from this campaign.",
"Preserve this winner's visible copy, CTA, product, offer, brand cues, and design identity.",
"Only rearrange the approved winner into the target format. Do not return to the original campaign asset or invent a new concept."
```

**Step 5: Update derivation job context fetch**

In `app/src/server/jobs/derivation.ts`, after loading the child derivation:

```ts
let parentDerivation = null;
if (derivation.parentId) {
  parentDerivation = await getDerivationById(derivation.parentId, workspaceId);
  if (parentDerivation && parentDerivation.campaignId !== campaignId) {
    throw new Error("Parent derivation does not belong to this campaign");
  }
}
```

Return `parentDerivation` from the fetch-context step.

**Step 6: Select reference buffer**

Before downloading the campaign asset, choose package source:

```ts
const usesParentOutput =
  effectiveGenerationMode === "format_adaptation" &&
  derivation.parentId &&
  parentDerivation?.outputKey;

if (usesParentOutput) {
  referenceBuffer = await downloadBuffer(parentDerivation.outputKey);
  referenceMimeType = "image/png";
} else if (asset) {
  referenceBuffer = await downloadBuffer(asset.key);
  referenceMimeType = asset.type;
}
```

If `derivation.parentId` exists but `parentDerivation?.outputKey` is missing, throw a clear error.

Pass `packageSource: usesParentOutput ? "approved_derivation" : "campaign_asset"` into `buildDerivationPrompt`.

**Step 7: Run tests**

Run: `cd app && npm test -- prompt-builder.test.ts derivation.test.ts`

Expected: PASS.

**Step 8: Commit**

```bash
git add app/src/server/jobs/derivation.ts app/src/server/ai/prompt-builder.ts app/src/server/jobs/derivation.test.ts app/src/server/ai/prompt-builder.test.ts
git commit -m "feat: adapt delivery packages from approved outputs"
```

### Task 4: Add Client Hook for Delivery Package

**Files:**
- Create: `app/src/lib/hooks/use-delivery-package.ts`
- Test: `app/src/lib/hooks/use-delivery-package.test.ts`

**Step 1: Write hook test**

```ts
it("posts selected formats to delivery package endpoint", async () => {
  apiFetchMock.mockResolvedValue({ queued: [], readyFormats: ["1:1"] });

  const { result } = renderHook(() => useCreateDeliveryPackage(), { wrapper });
  await result.current.mutateAsync({
    derivationId: "derivation-id",
    formats: ["1:1", "4:5"],
  });

  expect(apiFetchMock).toHaveBeenCalledWith("/api/derivations/derivation-id/delivery-package", {
    method: "POST",
    body: JSON.stringify({ formats: ["1:1", "4:5"] }),
  });
});
```

**Step 2: Run failing test**

Run: `cd app && npm test -- use-delivery-package`

Expected: FAIL because the hook does not exist.

**Step 3: Implement hook**

```ts
export function useCreateDeliveryPackage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ derivationId, formats }: { derivationId: string; formats: string[] }) => {
      return apiFetch(`/api/derivations/${derivationId}/delivery-package`, {
        method: "POST",
        body: JSON.stringify({ formats }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["derivations"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}
```

Use the exact query keys already used by `use-derivations.ts` and `use-campaigns.ts`.

**Step 4: Run tests**

Run: `cd app && npm test -- use-delivery-package`

Expected: PASS.

**Step 5: Commit**

```bash
git add app/src/lib/hooks/use-delivery-package.ts app/src/lib/hooks/use-delivery-package.test.ts
git commit -m "feat: add delivery package mutation hook"
```

### Task 5: Add Delivery Package Modal and Card Action

**Files:**
- Create: `app/src/components/workspace/DeliveryPackageModal.tsx`
- Modify: `app/src/components/workspace/DerivationCard.tsx`
- Modify: `app/src/components/workspace/DerivationsStep.tsx`
- Modify: `app/src/app/(dashboard)/campaigns/[id]/page.tsx`
- Modify: `app/messages/en.json`
- Modify: `app/messages/pt-BR.json`
- Test: `app/src/components/workspace/DeliveryPackageModal.test.tsx`
- Test: `app/src/components/workspace/DerivationCard.test.tsx`

**Step 1: Write modal tests**

```tsx
it("shows all formats selected by default and disables the source format", () => {
  render(
    <DeliveryPackageModal
      open
      sourceFormat="1:1"
      isSubmitting={false}
      onOpenChange={vi.fn()}
      onConfirm={vi.fn()}
    />
  );

  expect(screen.getByLabelText("1:1")).toBeChecked();
  expect(screen.getByLabelText("1:1")).toBeDisabled();
  expect(screen.getByLabelText("4:5")).toBeChecked();
  expect(screen.getByLabelText("9:16")).toBeChecked();
});
```

**Step 2: Write card action test**

```tsx
it("shows package action only for approved derivations with output", () => {
  render(<DerivationCard derivation={{ ...baseDerivation, status: "approved", imageUrl: "/x.png" }} />);
  expect(screen.getByRole("button", { name: /generate package/i })).toBeInTheDocument();
});
```

**Step 3: Run failing tests**

Run: `cd app && npm test -- DeliveryPackageModal DerivationCard`

Expected: FAIL because components/actions do not exist.

**Step 4: Implement modal**

Use existing `Dialog`, `Button`, labels, and checkbox-style controls. Keep state local:

```ts
const [selected, setSelected] = useState<Record<DeliveryFormat, boolean>>({
  "1:1": true,
  "4:5": true,
  "9:16": true,
});
```

Source format remains selected but disabled. Confirm sends all selected formats, including the source format, so the API can return it in `readyFormats`.

**Step 5: Wire action through gallery**

Add props:

```ts
onCreateDeliveryPackage?: (derivation: Derivation) => void;
```

Show the action in `DerivationCard` only when:

```ts
derivation.status === "approved" && !!derivation.imageUrl
```

At the campaign page level, open the modal with selected source derivation and call `useCreateDeliveryPackage`.

**Step 6: Add translations**

Add concise labels under a namespace such as `deliveryPackage`:

```json
{
  "title": "Generate delivery package",
  "description": "Create final formats from this approved creative.",
  "generate": "Generate package",
  "ready": "Already ready",
  "confirm": "Generate selected formats"
}
```

Add equivalent `pt-BR` copy.

**Step 7: Run tests**

Run: `cd app && npm test -- DeliveryPackageModal DerivationCard`

Expected: PASS.

**Step 8: Commit**

```bash
git add app/src/components/workspace/DeliveryPackageModal.tsx app/src/components/workspace/DerivationCard.tsx app/src/components/workspace/DerivationsStep.tsx "app/src/app/(dashboard)/campaigns/[id]/page.tsx" app/messages/en.json app/messages/pt-BR.json app/src/components/workspace/DeliveryPackageModal.test.tsx app/src/components/workspace/DerivationCard.test.tsx
git commit -m "feat: add delivery package UI"
```

### Task 6: End-to-End Verification and Hardening

**Files:**
- Modify as needed based on failures from prior tasks.
- Update: `tasks/todo.md`

**Step 1: Run focused tests**

Run:

```bash
cd app
npm test -- delivery-package derivation prompt-builder DeliveryPackageModal DerivationCard
```

Expected: all focused tests pass.

**Step 2: Run project checks**

Run:

```bash
cd app
npm run typecheck
npm run lint
npm run test
npm run build
```

Expected: typecheck, lint, test, and build pass. If a known pre-existing test still fails, document the exact failing test and why it is unrelated.

**Step 3: Manual smoke**

Run the app and worker, then:

1. Create/open an `art_variation` campaign.
2. Generate variations.
3. Approve a completed derivation.
4. Click `Generate package`.
5. Confirm `1:1`, `4:5`, and `9:16`.
6. Verify only non-source formats are queued.
7. Verify generated package children appear in gallery.
8. Verify package children use the approved winner visually.

**Step 4: Update task review**

Add a review section to `tasks/todo.md` with:

- files changed
- tests run
- manual smoke result
- known risks

**Step 5: Final commit**

```bash
git add tasks/todo.md
git commit -m "docs: record delivery package verification"
```
