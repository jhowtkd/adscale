# Landing Page Match Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Landing Page Match function that generates a complete downloadable HTML landing page from an approved derivation and its campaign briefing.

**Architecture:** Persist landing page artifacts in a new `landing_pages` table, generate structured JSON with OpenAI from the approved derivation plus campaign context, render that structure into standalone HTML server-side, upload it to R2, and expose the action from approved derivation cards. Keep the first version export-only with no editor.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle/Postgres, OpenAI SDK, R2 storage helpers, TanStack Query, Vitest, React Testing Library.

---

### Task 1: Add Landing Page Schema

**Files:**
- Modify: `app/src/server/db/schema.ts`
- Create: `app/drizzle/0010_landing_pages.sql`

**Step 1: Write the migration**

Create `app/drizzle/0010_landing_pages.sql`:

```sql
CREATE TABLE IF NOT EXISTS "adscale_app"."landing_pages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "source_derivation_id" uuid NOT NULL,
  "status" text NOT NULL DEFAULT 'queued',
  "title" text,
  "structure" jsonb,
  "html_key" text,
  "error" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "adscale_app"."landing_pages"
  ADD CONSTRAINT "landing_pages_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id")
  ON DELETE cascade;

ALTER TABLE "adscale_app"."landing_pages"
  ADD CONSTRAINT "landing_pages_campaign_id_campaigns_id_fk"
  FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id")
  ON DELETE cascade;

ALTER TABLE "adscale_app"."landing_pages"
  ADD CONSTRAINT "landing_pages_source_derivation_id_derivations_id_fk"
  FOREIGN KEY ("source_derivation_id") REFERENCES "adscale_app"."derivations"("id")
  ON DELETE cascade;

CREATE INDEX IF NOT EXISTS "landing_pages_workspace_id_idx"
  ON "adscale_app"."landing_pages" ("workspace_id");

CREATE INDEX IF NOT EXISTS "landing_pages_campaign_id_idx"
  ON "adscale_app"."landing_pages" ("campaign_id");

CREATE INDEX IF NOT EXISTS "landing_pages_source_derivation_id_idx"
  ON "adscale_app"."landing_pages" ("source_derivation_id");
```

**Step 2: Add Drizzle table**

In `app/src/server/db/schema.ts`, add `landingPages` near the other app tables:

```ts
export const landingPages = adscaleSchema.table(
  "landing_pages",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    sourceDerivationId: uuid("source_derivation_id").notNull().references(() => derivations.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("queued"),
    title: text("title"),
    structure: jsonb("structure"),
    htmlKey: text("html_key"),
    error: text("error"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("landing_pages_workspace_id_idx").on(table.workspaceId),
    index("landing_pages_campaign_id_idx").on(table.campaignId),
    index("landing_pages_source_derivation_id_idx").on(table.sourceDerivationId),
  ]
);
```

**Step 3: Verify migration**

Run: `cd app && npx drizzle-kit check`

Expected: `Everything's fine`.

**Step 4: Commit**

```bash
git add app/src/server/db/schema.ts app/drizzle/0010_landing_pages.sql
git commit -m "feat: add landing page schema"
```

---

### Task 2: Add Landing Page Repository

**Files:**
- Create: `app/src/server/repositories/landing-page.ts`
- Create: `app/src/server/repositories/landing-page.test.ts`

**Step 1: Write repository tests**

Mock the database and cover:

- `createLandingPage` inserts workspace, campaign, derivation, and `queued` status.
- `completeLandingPage` stores title, structure, html key, clears error, and sets `completed`.
- `failLandingPage` stores a readable error and sets `failed`.
- `getLandingPagesByDerivation` scopes by workspace and source derivation.

**Step 2: Implement repository**

Create:

```ts
export type LandingPageStatus = "queued" | "completed" | "failed";

export async function createLandingPage(input: {
  workspaceId: string;
  campaignId: string;
  sourceDerivationId: string;
}) { /* insert queued row */ }

export async function completeLandingPage(input: {
  id: string;
  workspaceId: string;
  title: string;
  structure: unknown;
  htmlKey: string;
}) { /* update completed row scoped by workspace */ }

export async function failLandingPage(input: {
  id: string;
  workspaceId: string;
  error: string;
}) { /* update failed row scoped by workspace */ }

export async function getLandingPagesByDerivation(
  workspaceId: string,
  sourceDerivationId: string
) { /* select newest first */ }
```

Use `eq`, `and`, and `desc` from Drizzle.

**Step 3: Run repository tests**

Run: `cd app && npx vitest run --config config/vitest.config.ts --passWithNoTests src/server/repositories/landing-page.test.ts`

Expected: new tests pass.

**Step 4: Commit**

```bash
git add app/src/server/repositories/landing-page.ts app/src/server/repositories/landing-page.test.ts
git commit -m "feat: add landing page repository"
```

---

### Task 3: Add AI Generator And HTML Renderer

**Files:**
- Create: `app/src/server/ai/landing-page.ts`
- Create: `app/src/server/ai/landing-page.test.ts`
- Create: `app/src/server/services/landing-page-renderer.ts`
- Create: `app/src/server/services/landing-page-renderer.test.ts`

**Step 1: Write generator tests**

Cover:

- `buildLandingPagePrompt` includes campaign objective, audience, offer, CTA variants, constraints, and derivation context.
- `normalizeLandingPageStructure` accepts complete valid structure.
- `normalizeLandingPageStructure` rejects missing required sections.
- unsafe proof claims are not required when campaign proof is absent.

**Step 2: Implement types and normalizer**

Use a strict structure:

```ts
export type LandingPageSectionKey =
  | "hero"
  | "problem"
  | "solution"
  | "benefits"
  | "trust"
  | "offer"
  | "faq"
  | "finalCta";

export interface LandingPageStructure {
  title: string;
  sections: Record<LandingPageSectionKey, {
    eyebrow?: string;
    headline: string;
    body: string;
    bullets?: string[];
    cta?: string;
    items?: Array<{ question: string; answer: string }>;
  }>;
}
```

**Step 3: Implement prompt builder**

The prompt must instruct the model to return JSON only and to avoid fake testimonials, unsupported guarantees, legal claims, and unavailable discounts.

**Step 4: Implement `generateLandingPageStructure`**

Use the existing OpenAI environment values from `app/src/server/validation/env.ts`. Parse code-fenced JSON if the model returns it, then normalize.

**Step 5: Write renderer tests**

Cover:

- output starts with `<!doctype html>`;
- output includes all required sections;
- output escapes HTML-sensitive copy;
- output includes responsive CSS;
- output can include the approved creative image URL.

**Step 6: Implement renderer**

Create `renderLandingPageHtml(input)` that returns a full standalone HTML document with inline CSS. Do not use external JS or fonts.

**Step 7: Run tests**

Run: `cd app && npx vitest run --config config/vitest.config.ts --passWithNoTests landing-page.test.ts landing-page-renderer.test.ts`

Expected: generator and renderer tests pass.

**Step 8: Commit**

```bash
git add app/src/server/ai/landing-page.ts app/src/server/ai/landing-page.test.ts app/src/server/services/landing-page-renderer.ts app/src/server/services/landing-page-renderer.test.ts
git commit -m "feat: add landing page generator"
```

---

### Task 4: Add Landing Page API Route

**Files:**
- Create: `app/src/app/api/derivations/[id]/landing-page/route.ts`
- Create: `app/src/app/api/derivations/[id]/landing-page/route.test.ts`

**Step 1: Write route tests**

Cover:

- 404 when derivation is missing.
- 409 when derivation is not approved.
- 400 when derivation has no `outputKey`.
- 404 when campaign is missing.
- success creates a landing page, generates structure, renders HTML, uploads `text/html`, completes record, and returns `downloadUrl`.
- AI or upload failure marks the record failed.

**Step 2: Implement route**

Use:

- `requireWorkspaceAccess(request)`
- `getDerivationById(id, workspace.id)`
- `getCampaignById(derivation.campaignId, workspace.id)`
- `objectStorage.publicUrl(derivation.outputKey)` for image reference in HTML
- `objectStorage.put(htmlKey, Buffer.from(html), "text/html")`
- `objectStorage.signedDownloadUrl(htmlKey)`

Use key format:

```ts
const htmlKey = `landing-pages/${workspace.id}/${derivation.id}/${Date.now()}.html`;
```

**Step 3: Run route tests**

Run: `cd app && npx vitest run --config config/vitest.config.ts --passWithNoTests landing-page/route.test.ts`

Expected: route tests pass.

**Step 4: Commit**

```bash
git add app/src/app/api/derivations/[id]/landing-page
git commit -m "feat: add landing page api"
```

---

### Task 5: Add Client Hook

**Files:**
- Create: `app/src/lib/hooks/use-landing-page.ts`
- Create: `app/src/lib/hooks/use-landing-page.test.tsx`

**Step 1: Write hook tests**

Cover:

- posts to `/api/derivations/{id}/landing-page`;
- opens returned `downloadUrl`;
- shows success toast;
- shows error toast on failure.

**Step 2: Implement hook**

Create:

```ts
export interface LandingPageResponse {
  landingPage: {
    id: string;
    status: "queued" | "completed" | "failed";
    title: string | null;
    htmlKey: string | null;
  };
  downloadUrl: string;
  expiresAt: string;
}

export function useGenerateLandingPage() {
  // mutationFn posts derivationId, onSuccess opens downloadUrl
}
```

Mirror `useExport` patterns for toasts and opening downloads.

**Step 3: Run hook tests**

Run: `cd app && npx vitest run --config config/vitest.config.ts --passWithNoTests use-landing-page.test.tsx`

Expected: hook tests pass.

**Step 4: Commit**

```bash
git add app/src/lib/hooks/use-landing-page.ts app/src/lib/hooks/use-landing-page.test.tsx
git commit -m "feat: add landing page hook"
```

---

### Task 6: Wire UI Action Into Approved Derivations

**Files:**
- Modify: `app/src/components/workspace/DerivationCard.tsx`
- Modify: `app/src/components/workspace/DerivationCard.test.tsx`
- Modify: `app/src/components/workspace/DerivationsStep.tsx` <!-- VERIFY: app/src/components/workspace/DerivationsStep.tsx — file not found; see verification in .planning/tmp/ -->
- Modify: `app/src/app/(dashboard)/campaigns/[id]/page.tsx`
- Modify: `app/messages/en.json`
- Modify: `app/messages/pt-BR.json`

**Step 1: Write card tests**

Add tests proving:

- "Generate landing page" appears for approved derivations with images.
- it does not appear for unapproved derivations.
- it does not appear when no image exists.
- click calls `onGenerateLandingPage`.
- loading state disables the action for the active derivation.

**Step 2: Update component props**

Add:

```ts
onGenerateLandingPage?: () => void;
landingPageGeneratingId?: string | null;
```

Use a small icon button or compact action beside export/package actions.

**Step 3: Wire through `DerivationsStep`**

Pass the handler and active id to each card.

**Step 4: Wire campaign page**

Import `useGenerateLandingPage`, create mutation, and pass:

```ts
onGenerateLandingPage={handleGenerateLandingPage}
landingPageGeneratingId={generateLandingPage.isPending ? generateLandingPage.variables?.derivationId ?? null : null}
```

**Step 5: Add translations**

Add English and Portuguese strings for:

- `generateLandingPage`
- `landingPageGenerating`
- `landingPageReady`
- `landingPageFailed`

**Step 6: Run UI tests**

Run: `cd app && npx vitest run --config config/vitest.config.ts --passWithNoTests DerivationCard.test.tsx`

Expected: card tests pass.

**Step 7: Commit**

```bash
git add app/src/components/workspace/DerivationCard.tsx app/src/components/workspace/DerivationCard.test.tsx app/src/components/workspace/DerivationsStep.tsx 'app/src/app/(dashboard)/campaigns/[id]/page.tsx' app/messages/en.json app/messages/pt-BR.json
git commit -m "feat: add landing page action"
```

---

### Task 7: Verify End To End

**Files:**
- Modify: `tasks/todo.md`

**Step 1: Run database check**

Run: `cd app && npx drizzle-kit check`

Expected: `Everything's fine`.

**Step 2: Run focused test suite**

Run:

```bash
cd app && npx vitest run --config config/vitest.config.ts --passWithNoTests landing-page.test.ts landing-page-renderer.test.ts landing-page/route.test.ts use-landing-page.test.tsx DerivationCard.test.tsx landing-page.test.ts
```

Expected: focused tests pass.

**Step 3: Run lint**

Run: `cd app && npm run lint`

Expected: no new errors.

**Step 4: Run build with required env values**

Use the same dummy-env pattern already documented in `tasks/todo.md` for builds in this repo.

Expected: build succeeds; TypeScript clean.

**Step 5: Document implementation review**

Append to `tasks/todo.md`:

- files changed;
- commands run;
- known blockers;
- acceptance criteria coverage.

**Step 6: Commit verification notes**

```bash
git add tasks/todo.md
git commit -m "docs: record landing page match verification"
```
