# Client Reference Library Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a lightweight client reference library so campaigns can reuse client-specific visual references and save approved creatives back into that library.

**Architecture:** Add client profile and reference tables, expose focused API routes and hooks, wire client/reference selection into the campaign briefing, and pass selected references into derivation prompt context without changing existing CTA, format, or generation-mode contracts. Keep this first version close to campaign workflow and avoid a full asset-management surface.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle/Postgres, TanStack Query, Vitest, React Testing Library, R2 storage metadata already represented by asset keys.

---

### Task 1: Add Database Schema And Migration

**Files:**
- Modify: `app/src/server/db/schema.ts`
- Create: `app/drizzle/0009_client_reference_library.sql`

**Step 1: Write the migration**

Create `app/drizzle/0009_client_reference_library.sql`:

```sql
CREATE TABLE IF NOT EXISTS "adscale_app"."client_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "visual_notes" text,
  "tone_notes" text,
  "constraints" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "adscale_app"."client_references" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "client_profile_id" uuid NOT NULL,
  "asset_key" text NOT NULL,
  "label" text NOT NULL,
  "kind" text NOT NULL DEFAULT 'other',
  "notes" text,
  "source_derivation_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "adscale_app"."campaigns"
  ADD COLUMN IF NOT EXISTS "client_profile_id" uuid,
  ADD COLUMN IF NOT EXISTS "selected_reference_ids" text[];

ALTER TABLE "adscale_app"."client_profiles"
  ADD CONSTRAINT "client_profiles_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id")
  ON DELETE cascade;

ALTER TABLE "adscale_app"."client_references"
  ADD CONSTRAINT "client_references_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id")
  ON DELETE cascade;

ALTER TABLE "adscale_app"."client_references"
  ADD CONSTRAINT "client_references_client_profile_id_client_profiles_id_fk"
  FOREIGN KEY ("client_profile_id") REFERENCES "adscale_app"."client_profiles"("id")
  ON DELETE cascade;

ALTER TABLE "adscale_app"."client_references"
  ADD CONSTRAINT "client_references_source_derivation_id_derivations_id_fk"
  FOREIGN KEY ("source_derivation_id") REFERENCES "adscale_app"."derivations"("id")
  ON DELETE set null;

ALTER TABLE "adscale_app"."campaigns"
  ADD CONSTRAINT "campaigns_client_profile_id_client_profiles_id_fk"
  FOREIGN KEY ("client_profile_id") REFERENCES "adscale_app"."client_profiles"("id")
  ON DELETE set null;

CREATE INDEX IF NOT EXISTS "client_profiles_workspace_id_idx"
  ON "adscale_app"."client_profiles" ("workspace_id");

CREATE INDEX IF NOT EXISTS "client_references_workspace_id_idx"
  ON "adscale_app"."client_references" ("workspace_id");

CREATE INDEX IF NOT EXISTS "client_references_client_profile_id_idx"
  ON "adscale_app"."client_references" ("client_profile_id");
```

**Step 2: Update Drizzle schema**

Add `clientProfiles` and `clientReferences` exports in `app/src/server/db/schema.ts`, near the app tables. Add `clientProfileId` and `selectedReferenceIds` to `campaigns`.

Use `text("selected_reference_ids").array()` for first version because the UI only needs selected reference IDs, and route validation will ensure they belong to the workspace/client.

**Step 3: Verify migration syntax**

Run: `cd app && npx drizzle-kit check`

Expected: `Everything's fine`.

**Step 4: Commit**

```bash
git add app/src/server/db/schema.ts app/drizzle/0009_client_reference_library.sql
git commit -m "feat: add client reference schema"
```

---

### Task 2: Add Repository Layer

**Files:**
- Create: `app/src/server/repositories/client-reference.ts`
- Create: `app/src/server/repositories/client-reference.test.ts`
- Modify: `app/src/server/repositories/campaign.ts`

**Step 1: Write repository tests**

Create mocked-db tests covering:

- `createClientProfile` inserts workspace-scoped profile fields.
- `getClientProfiles` orders by name or updated date.
- `createClientReference` inserts `assetKey`, `kind`, `label`, optional `sourceDerivationId`.
- `getClientReferences` scopes by workspace and `clientProfileId`.
- `getClientReferencesByIds` returns only references matching workspace and selected IDs.

**Step 2: Implement repository**

Create these exports:

```ts
export type ClientReferenceKind =
  | "style"
  | "product"
  | "layout"
  | "logo"
  | "negative"
  | "other";

export interface CreateClientProfileInput {
  name: string;
  description?: string;
  visualNotes?: string;
  toneNotes?: string;
  constraints?: string;
}

export interface CreateClientReferenceInput {
  clientProfileId: string;
  assetKey: string;
  label: string;
  kind: ClientReferenceKind;
  notes?: string;
  sourceDerivationId?: string;
}
```

Use `eq`, `and`, `desc`, and `inArray` from Drizzle. Validate workspace by including `workspaceId` in every query condition.

**Step 3: Extend campaign repository**

Add to `CreateCampaignInput` and `UpdateCampaignInput`:

```ts
clientProfileId?: string | null;
selectedReferenceIds?: string[] | null;
```

Include both in `campaignFields`, `createCampaign`, and `updateCampaign`.

**Step 4: Run tests**

Run: `cd app && npx vitest run --config config/vitest.config.ts --passWithNoTests src/server/repositories/client-reference.test.ts src/server/repositories/campaign.test.ts`

Expected: new repository tests pass. If `campaign.test.ts` does not exist, run only the new test and note the absent suite.

**Step 5: Commit**

```bash
git add app/src/server/repositories/client-reference.ts app/src/server/repositories/client-reference.test.ts app/src/server/repositories/campaign.ts
git commit -m "feat: add client reference repositories"
```

---

### Task 3: Add API Routes

**Files:**
- Create: `app/src/app/api/client-profiles/route.ts`
- Create: `app/src/app/api/client-profiles/route.test.ts`
- Create: `app/src/app/api/client-profiles/[id]/references/route.ts`
- Create: `app/src/app/api/client-profiles/[id]/references/route.test.ts`
- Create: `app/src/app/api/derivations/[id]/save-reference/route.ts`
- Create: `app/src/app/api/derivations/[id]/save-reference/route.test.ts`

**Step 1: Write route tests**

Cover:

- `GET /api/client-profiles` returns workspace profiles.
- `POST /api/client-profiles` validates `name` and creates a profile.
- `GET /api/client-profiles/[id]/references` returns references for that client.
- `POST /api/client-profiles/[id]/references` creates metadata for an existing uploaded asset key.
- `POST /api/derivations/[id]/save-reference` rejects missing derivation, non-approved derivation, and derivation without `outputKey`.
- `POST /api/derivations/[id]/save-reference` creates a client reference using the derivation `outputKey`.

**Step 2: Implement schemas**

Use Zod:

```ts
const referenceKindSchema = z.enum(["style", "product", "layout", "logo", "negative", "other"]);

const createProfileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  visualNotes: z.string().trim().max(1000).optional(),
  toneNotes: z.string().trim().max(1000).optional(),
  constraints: z.string().trim().max(1000).optional(),
});

const createReferenceSchema = z.object({
  assetKey: z.string().trim().min(1),
  label: z.string().trim().min(1).max(120),
  kind: referenceKindSchema.default("other"),
  notes: z.string().trim().max(1000).optional(),
});

const saveDerivationReferenceSchema = z.object({
  clientProfileId: z.string().uuid(),
  label: z.string().trim().min(1).max(120),
  kind: referenceKindSchema.default("style"),
  notes: z.string().trim().max(1000).optional(),
});
```

**Step 3: Implement routes**

Use `requireWorkspaceAccess(request)` in every route. Return `{ profiles }`, `{ profile }`, `{ references }`, or `{ reference }`.

For save-from-derivation, use `getDerivationById(id, workspace.id)`, require `status === "approved"` and `outputKey`.

**Step 4: Run route tests**

Run: `cd app && npx vitest run --config config/vitest.config.ts --passWithNoTests client-profiles/route.test.ts references/route.test.ts save-reference/route.test.ts`

Expected: all route tests pass.

**Step 5: Commit**

```bash
git add app/src/app/api/client-profiles app/src/app/api/derivations/[id]/save-reference
git commit -m "feat: add client reference api"
```

---

### Task 4: Add Client Hooks And Types

**Files:**
- Create: `app/src/lib/hooks/use-client-profiles.ts`
- Create: `app/src/lib/hooks/use-client-profiles.test.tsx`
- Modify: `app/src/lib/hooks/use-campaigns.ts`
- Modify: `app/src/lib/mock-data.ts`

**Step 1: Write hook tests**

Cover:

- `useClientProfiles` fetches `/api/client-profiles`.
- `useCreateClientProfile` posts profile input and invalidates `["client-profiles"]`.
- `useClientReferences(clientProfileId)` fetches references only when a profile exists.
- `useSaveDerivationAsReference` posts to `/api/derivations/:id/save-reference` and invalidates client references.

**Step 2: Implement hooks**

Export:

```ts
export interface ClientProfile { ... }
export interface ClientReference { ... url?: string }
export function useClientProfiles()
export function useCreateClientProfile()
export function useClientReferences(clientProfileId?: string | null)
export function useCreateClientReference(clientProfileId: string)
export function useSaveDerivationAsReference()
```

**Step 3: Extend campaign client types**

Add `clientProfileId` and `selectedReferenceIds` to campaign types and update create/update payloads in `app/src/lib/hooks/use-campaigns.ts`.

**Step 4: Run hook tests**

Run: `cd app && npx vitest run --config config/vitest.config.ts --passWithNoTests use-client-profiles.test.tsx`

Expected: hook tests pass.

**Step 5: Commit**

```bash
git add app/src/lib/hooks/use-client-profiles.ts app/src/lib/hooks/use-client-profiles.test.tsx app/src/lib/hooks/use-campaigns.ts app/src/lib/mock-data.ts
git commit -m "feat: add client reference hooks"
```

---

### Task 5: Wire Briefing Selection UI

**Files:**
- Modify: `app/src/components/workspace/BriefingStep.tsx`
- Modify: `app/src/app/(dashboard)/campaigns/[id]/page.tsx`
- Modify: `app/messages/en.json`
- Modify: `app/messages/pt-BR.json`
- Create or extend: `app/src/components/workspace/BriefingStep.test.tsx`

**Step 1: Write UI tests**

Test:

- selected existing campaign `clientProfileId` renders selected client.
- selecting a client shows references.
- checking references updates `selectedReferenceIds`.
- creating a new client profile from the briefing adds it to the selection.

**Step 2: Update form data**

Add to `BriefingFormData`:

```ts
clientProfileId?: string | null;
selectedReferenceIds?: string[];
```

Initialize from `campaign.clientProfileId` and `campaign.selectedReferenceIds`.

**Step 3: Add UI**

Add a compact section near the client field:

- select dropdown for existing client profile;
- small create-client inline form with name and optional notes;
- reference checklist with thumbnail, label, kind, and notes;
- empty state when profile has no references.

Keep manual upload out of this first UI slice unless it is trivial; saving approved derivations as references is already enough for the first version.

**Step 4: Persist campaign fields**

In `app/src/app/(dashboard)/campaigns/[id]/page.tsx`, include `clientProfileId` and `selectedReferenceIds` in `handleBriefingContinue` and `handleSaveDraft`.

**Step 5: Run UI tests**

Run: `cd app && npx vitest run --config config/vitest.config.ts --passWithNoTests BriefingStep.test.tsx`

Expected: briefing tests pass.

**Step 6: Commit**

```bash
git add app/src/components/workspace/BriefingStep.tsx 'app/src/app/(dashboard)/campaigns/[id]/page.tsx' app/messages/en.json app/messages/pt-BR.json
git commit -m "feat: select client references in briefing"
```

---

### Task 6: Add References To Prompt Context

**Files:**
- Modify: `app/src/server/ai/prompt-builder.ts`
- Modify: `app/src/server/ai/prompt-builder.test.ts`
- Modify: `app/src/app/api/campaigns/[id]/derivations/route.ts`
- Modify: `app/src/server/jobs/derivation.ts`
- Modify: `app/src/server/jobs/derivation.test.ts`

**Step 1: Write prompt tests**

Add tests proving:

- selected references render under a `CLIENT REFERENCE LIBRARY` section;
- `negative` references render as things to avoid;
- literal CTA text is still mandatory and not overwritten;
- `format_adaptation` only receives references as textual context.

**Step 2: Extend prompt config**

Add:

```ts
export interface ClientReferenceContext {
  id: string;
  kind: "style" | "product" | "layout" | "logo" | "negative" | "other";
  label: string;
  notes: string | null;
  assetKey: string;
}
```

Add `clientReferences?: ClientReferenceContext[]` to `DerivationPromptConfig`.

**Step 3: Update prompt builder**

Append a section like:

```ts
if (clientReferences?.length) {
  parts.push("\nCLIENT REFERENCE LIBRARY:");
  for (const ref of clientReferences) {
    const intent = ref.kind === "negative" ? "Avoid repeating this pattern" : "Use as auxiliary visual guidance";
    parts.push(`- ${ref.kind}: ${ref.label}. ${intent}. Notes: ${ref.notes ?? "None"}. Asset: ${ref.assetKey}`);
  }
  parts.push("These references are auxiliary context only. They must not override the primary campaign asset, literal CTA, target format, or campaign constraints.");
}
```

**Step 4: Fetch selected references for jobs**

In `app/src/server/jobs/derivation.ts`, after campaign fetch, call `getClientReferencesByIds(workspaceId, campaign.selectedReferenceIds ?? [])`.

Pass those references into `buildDerivationPrompt`.

**Step 5: Keep API route unchanged unless needed**

`app/src/app/api/campaigns/[id]/derivations/route.ts` should continue creating derivation rows. It only needs to ensure campaign `selectedReferenceIds` are already persisted before queueing.

**Step 6: Run prompt/job tests**

Run: `cd app && npx vitest run --config config/vitest.config.ts --passWithNoTests prompt-builder.test.ts derivation.test.ts`

Expected: all focused prompt/job tests pass.

**Step 7: Commit**

```bash
git add app/src/server/ai/prompt-builder.ts app/src/server/ai/prompt-builder.test.ts app/src/server/jobs/derivation.ts app/src/server/jobs/derivation.test.ts app/src/app/api/campaigns/[id]/derivations/route.ts
git commit -m "feat: use client references in generation prompts"
```

---

### Task 7: Add Save-As-Reference Action On Approved Cards

**Files:**
- Modify: `app/src/components/workspace/DerivationCard.tsx`
- Modify: `app/src/components/workspace/DerivationsStep.tsx`
- Modify: `app/src/app/(dashboard)/campaigns/[id]/page.tsx`
- Modify: `app/messages/en.json`
- Modify: `app/messages/pt-BR.json`
- Extend: `app/src/components/workspace/DerivationCard.test.tsx`

**Step 1: Write card tests**

Test:

- "Save as reference" action is visible only for approved derivations with `imageUrl`.
- action is not visible for preview, completed, rejected, or approved without image.
- clicking action opens a small save dialog or calls the provided handler.

**Step 2: Add UI**

Use a compact action beside QA/package actions. Dialog fields:

- client profile select;
- kind select;
- label input defaulting to derivation name;
- notes textarea.

Use existing `Button`, `Dialog`, `Select`, `Input`, and `Textarea` components.

**Step 3: Wire mutation**

In campaign page, use `useSaveDerivationAsReference`. On success, show toast and invalidate references.

**Step 4: Run component tests**

Run: `cd app && npx vitest run --config config/vitest.config.ts --passWithNoTests DerivationCard.test.tsx`

Expected: updated card tests pass.

**Step 5: Commit**

```bash
git add app/src/components/workspace/DerivationCard.tsx app/src/components/workspace/DerivationsStep.tsx 'app/src/app/(dashboard)/campaigns/[id]/page.tsx' app/messages/en.json app/messages/pt-BR.json app/src/components/workspace/DerivationCard.test.tsx
git commit -m "feat: save approved creatives as references"
```

---

### Task 8: Final Verification

**Files:**
- Modify: `tasks/todo.md`

**Step 1: Run schema check**

Run: `cd app && npx drizzle-kit check`

Expected: `Everything's fine`.

**Step 2: Run focused tests**

Run:

```bash
cd app && npx vitest run --config config/vitest.config.ts --passWithNoTests \
  client-reference.test.ts \
  client-profiles/route.test.ts \
  references/route.test.ts \
  save-reference/route.test.ts \
  use-client-profiles.test.tsx \
  BriefingStep.test.tsx \
  prompt-builder.test.ts \
  derivation.test.ts \
  DerivationCard.test.tsx
```

Expected: all focused suites pass.

**Step 3: Run lint**

Run: `cd app && npm run lint`

Expected: 0 new errors. Existing warnings may remain if unrelated.

**Step 4: Run build with required env vars**

Use the same dummy env pattern already recorded in `tasks/todo.md` for prior builds.

Expected: build succeeds and TypeScript is clean.

**Step 5: Update task review**

Add a review section to `tasks/todo.md` with changed files, commands, blockers, and acceptance criteria coverage.

**Step 6: Commit final review**

```bash
git add tasks/todo.md
git commit -m "docs: review client reference library implementation"
```
