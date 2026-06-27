# Stack Research

**Domain:** Adaptive guided conversation inside an existing campaign assistant (v13.8 Conversa Guiada Adaptativa)
**Researched:** 2026-06-26
**Confidence:** HIGH

## Executive Recommendation

**Do not add a new runtime dependency for v13.8.** The current stack already contains the right primitives: Next.js Route Handlers, React 19, Drizzle/Postgres, Zod, TanStack Query, the OpenAI SDK, existing upload/storage APIs, Vitest, Testing Library, and Playwright. The milestone is primarily a contract and state-model change, not a framework-selection problem.

The material stack changes are:

1. Replace arbitrary `currentStep: string` patches with a **server-owned, typed transition function** driven by a Zod discriminated union of journey events.
2. Add **optimistic concurrency** (`revision`) and a persisted state schema version to `assistant_guided_flows`; transition and telemetry writes should commit in one Drizzle transaction.
3. Store progressive answers, editable summaries, assumptions, and asset/reference envelopes as validated journey state. Keep the existing relational identity columns and JSONB slots; do not introduce a second workflow store.
4. Use the model only for bounded suggestions, extraction, and diagnosis. **The model must never select or persist the next state.** Deterministic code evaluates guards and chooses transitions.
5. Expand the existing Vitest/Testing Library/Playwright suites into transition-matrix, resume/edit/back/switch/retry, inline-upload, action-confirmation, responsive, and staging UAT coverage.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js App Router | `16.2.6` | Journey event Route Handlers and assistant UI | Already owns `/api/assistant/threads/[threadId]/guided-flow/*`; Route Handlers support the required `GET`, `POST`, and `PATCH` boundaries without a second backend. |
| React / React DOM | `19.2.4` | Progressive prompt, quick replies, editable summary, inline assets | Existing assistant components are client components. Controlled local edit state plus server mutation state is enough; no form framework is required. |
| TypeScript | `^5` | Exhaustive path/step/event contracts | Use literal unions, discriminated unions, `satisfies`, and exhaustive `never` checks so an unhandled transition fails at build/test time. |
| Zod | `^3.0.0` | Runtime validation of journey events, persisted slots, summaries, and AI suggestions | Already used in assistant routes. Define each path/step schema once and infer TypeScript types from it; reject arbitrary steps and malformed JSONB at every boundary. |
| Drizzle ORM / drizzle-kit | `^0.45.2` / `^0.31.10` | Atomic state transition, revision check, persistence migration | Existing source of truth for `assistant_guided_flows` and telemetry. A transaction can update the flow and append its transition event atomically. |
| Neon PostgreSQL driver | `^1.1.0` | Durable resume/edit/back/switch state | The current flow row is already keyed to workspace, client, and thread. Extend it instead of creating a workflow database or client-only store. |
| TanStack Query | `^5.100.1` | Server-state fetch, mutation, invalidation, narrow optimistic UI | Existing guided hooks already invalidate `assistantThreadQueryKey`. Use mutation variables for local pending feedback; use cache optimism only where rollback is unambiguous. |
| OpenAI SDK | `^6.34.0` | Contextual suggestions and structured extraction | Already used for image analysis and diagnosis. Use schema-bounded output where the configured model supports it, then validate with Zod; always provide deterministic/rule-based fallback copy. |

### Required Stack Changes (no new packages)

| Addition/change | Type | Purpose | Recommendation |
|-----------------|------|---------|----------------|
| `GuidedFlowEvent` Zod discriminated union | Shared TS module | Commands such as `answer`, `accept_suggestion`, `edit_summary`, `back`, `switch_path`, `restart`, `select_asset`, `replace_asset`, `select_reference`, `remove_reference`, `retry`, `confirm` | Route bodies should carry an event and `expectedRevision`, not caller-selected `currentStep`, `status`, or arbitrary merged slots. |
| Path-specific state schemas | Shared TS module | Validate `existing_creative` and `from_zero` state by current step | Use a discriminated union keyed by `path` and `currentStep`; derive allowed events and UI prompt descriptor from the same registry. |
| Pure transition function | Server domain module | Deterministic next state and guard evaluation | Signature should resemble `transition(state, event) -> { state, effects, telemetry }`. Keep side effects outside the reducer and execute them only after validation. |
| `revision integer NOT NULL DEFAULT 0` | Drizzle migration | Prevent stale tabs/double clicks from overwriting newer answers | Update with `WHERE id = ? AND revision = expectedRevision`, increment on success, and return `409` on conflict so the client refetches. |
| `schema_version integer NOT NULL DEFAULT 1` | Drizzle migration | Resume old flows after state shape evolves | Parse and migrate persisted slots before transition. Do not silently treat malformed legacy state as current. |
| Typed journey state in existing JSONB | Schema + repository change | Progressive answers, summary draft, field provenance/confidence, navigation history, recoverable error, inline resource envelopes | Keep `slots` for v13.8, but parse it with the path/step schema on read and before write. Do not expose unvalidated `Record<string, unknown>` to UI code. |
| Atomic flow + event persistence | Drizzle transaction | Make state and audit trail agree | Persist the revised flow and append transition telemetry in one transaction. Provider/job effects remain idempotent and occur after the committed transition. |
| Prompt descriptor registry | Shared TS module | Progressive question, quick replies, required/optional rules, summary section | UI renders descriptors from deterministic state. Suggestions may be AI-generated content, but visibility/order/next-step rules stay in code. |
| Resource envelope | Zod schema in journey state | Distinguish workspace assets from client references and their role/status | Store `{ id, source: "workspace_asset" | "client_reference", role, status }`; the current `referenceIds: string[]` cannot express source or replacement state safely. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-dropzone` | `^15.0.0` | Multi-file inline drag/drop | Already installed. Use only if the reference step needs multi-file drop and keyboard handling; otherwise keep the existing shared file input/upload helper. |
| `zustand` | `^5.0.12` | Ephemeral cross-component UI state | Avoid for canonical flow data. Use only if composer/panel coordination becomes awkward; persisted journey state remains in Query/Postgres. |
| `next-intl` | `^4.9.1` | Localized prompt labels, quick replies, errors | Keep deterministic UI copy in existing namespaces. Do not persist translated labels as state identifiers. |
| `lucide-react` | `^1.11.0` | Back, edit, restart, replace, retry controls | Reuse the installed icon set and existing button patterns. |
| `sonner` | `^2.0.7` | Non-blocking mutation feedback | Use for save/retry/upload outcomes that do not need an inline recovery panel. |
| Existing upload/storage stack | `@aws-sdk/client-s3 ^3.0.0`, current workspace asset APIs | Inline upload, replacement, signed previews | Reuse `uploadChatAttachment`, `/api/workspace/assets`, R2/S3 storage, magic-byte validation, and workspace scoping. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Vitest | Pure transition and guard tests | Current `^4.1.5`. Build table-driven coverage for every `(path, step, event)` pair, invalid event, revision conflict, and state migration. |
| Testing Library | Progressive prompt and editable-summary component tests | Current React `^16.3.2`, DOM `^10.4.1`, jest-dom `^6.9.1`. Test visible behavior and keyboard-accessible editing, not implementation state. |
| Playwright | Browser UAT for both journeys | Current `^1.60.0`. Extend `guided-assistant-journeys.spec.ts`; retain traces/screenshots on failure and add real staging walks for provider/storage boundaries. |
| Existing v13.7 telemetry/evidence tooling | Funnel and staging proof | Extend event keys/metadata for back, edit, switch, retry, resource replace, summary confirm, and revision conflict. Do not create a parallel analytics SDK. |
| `drizzle-kit generate` / `npm run db:migrate` | Persistence migration | Add revision/schema version and any constrained resource-state migration using the established migration journal. |

## Capability-to-Stack Decision

| Capability | Use | Change required |
|------------|-----|-----------------|
| Adaptive guided conversation | React + deterministic prompt registry + optional OpenAI suggestions | Split the all-at-once `FromZeroBriefPanel` into one prompt descriptor at a time; adapt based on validated answers/guards, not free-form model intent. |
| Deterministic transitions | TypeScript + Zod + pure transition function | Remove public arbitrary step/status patches. Server accepts typed events and derives the next state. |
| Progressive prompting | React local draft + TanStack mutations | Persist each accepted answer; optional debounce is acceptable for summary text, but step completion must be explicit and revision-checked. |
| Editable summaries | Controlled fields + Zod field schemas + Query mutation | Persist canonical field values plus provenance (`user`, `extracted`, `suggested`) and confidence; editing an upstream field invalidates/recomputes only dependent suggestions. |
| Inline assets/references | Existing workspace assets, client references, upload helper, R2/S3 | Add typed resource envelopes, inline remove/replace/retry actions, and compensation for uploaded-but-not-attached assets. |
| Action cards | Existing action contracts/cards | Build card payloads from the confirmed summary snapshot. Preserve required confirmation before writes, credits, jobs, memory, or export. |
| UAT | Existing Playwright + v13.7 staging evidence | Automated mocked transition coverage plus authenticated staging walks for upload, model diagnosis/suggestions, action confirmation, resume, and telemetry. |

## Installation

```bash
# No new runtime or development packages are required for v13.8.

# After implementation adds the flow revision/schema migration:
cd app
npm run db:generate
npm run db:migrate

# Focused verification baseline:
npm test -- --run \
  src/server/assistant/guided-paths \
  src/server/repositories/guided-flow.test.ts \
  src/components/assistant
npx playwright test tests/e2e/guided-assistant-journeys.spec.ts
```

Do not run package upgrades as part of this milestone unless a separate security or compatibility requirement demands them. The package versions above are the versions declared in `app/package.json` on 2026-06-26.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Typed transition registry + pure reducer | XState/statecharts | Add XState only if journeys gain parallel states, nested history, timers, invoked-service cancellation, or enough paths that the local transition matrix becomes difficult to audit. Two bounded paths do not justify a second state runtime today. |
| Existing JSONB slots parsed by Zod | New normalized answer/event tables | Normalize later if product analytics needs cross-flow SQL over individual answers or immutable regulatory audit. v13.8 can use typed JSONB plus the existing event table. |
| Server-owned state + TanStack Query | Zustand/Redux as journey source of truth | Use a client store only for temporary presentation state; it is not appropriate for cross-device resume or concurrency. |
| Existing OpenAI SDK with Zod validation | Vercel AI SDK / LangChain | Revisit only if the product needs provider-independent structured streaming across multiple adapters. Current need is bounded suggestions, not a new orchestration layer. |
| Existing asset/reference APIs | New upload service or media CMS | Revisit only for direct multipart/resumable uploads at materially larger file sizes. Current images already pass through scoped, validated storage APIs. |
| Vitest + Testing Library + Playwright | Cypress/TestSprite-only suite | Use an alternative only if an organization-wide testing migration is decided separately. Existing Playwright already covers authenticated assistant flows and file input. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **LLM-selected next steps** | Non-deterministic, hard to resume/audit, vulnerable to malformed output and prompt drift | Deterministic transition function; LLM supplies suggestions/extraction only |
| **XState now** | Adds serialization/integration concepts while the app already has a small persisted server state model | Typed transition registry with exhaustive tests; define an extraction threshold for future adoption |
| **Vercel AI SDK, LangChain, or LlamaIndex** | Duplicates the existing assistant adapter/streaming and action-contract stack | Existing `AssistantModelClient`, OpenAI SDK, SSE route, and action contracts |
| **Redux or a new Zustand journey store** | Creates two canonical states and weakens resume/concurrency guarantees | Postgres + TanStack Query; local component state only for unsaved edits |
| **react-hook-form/Formik** | The target is one decision at a time plus a small editable summary, not a large validation-heavy form | Controlled React fields + shared Zod schemas |
| **New WebSocket/Socket.IO layer** | Journey transitions are user-driven mutations; existing polling/invalidation and SSE chat streaming are sufficient | Route Handler mutations + Query invalidation; keep SSE for assistant text |
| **Separate document/workflow database** | Splits workspace/client/thread scope and complicates transactions with action records/telemetry | Existing Neon Postgres and `assistant_guided_flows` |
| **Raw `Record<string, unknown>` slots in components** | Hides invalid legacy state until runtime and allows unsafe casts | Parse persisted state into path/step-specific Zod types before returning it |
| **Generic `PATCH currentStep` API** | Lets clients skip guards and fabricate impossible states | Event command API with expected revision and server-derived next state |
| **Parallel upload/reference library** | Existing storage, validation, signed URL, and workspace asset paths already work | Shared `uploadChatAttachment`/workspace asset APIs and typed resource envelopes |
| **AI-generated action-card risk/cost metadata** | Can misstate writes or credits | Existing action contract registry remains authoritative |
| **Only mocked E2E as release proof** | Cannot prove live upload, provider output, action execution, or telemetry persistence | Mocked deterministic regression plus explicit staging UAT evidence for both paths |

## Stack Patterns by Variant

**If a prompt has a deterministic answer derived from prior state:**
- Prefill it and ask for confirmation/edit instead of calling a model.
- Preserve provenance so the summary can distinguish extracted, suggested, and user-confirmed values.

**If a contextual suggestion benefits from AI:**
- Call through the existing provider boundary, request structured output where supported, validate with Zod, and fall back to deterministic copy.
- Never let a refusal, timeout, malformed response, or provider outage block manual answering.

**If an edit changes an upstream field:**
- Transition back to the affected summary/prompt, invalidate dependent suggestions, preserve unrelated confirmed fields, and increment the revision.
- Do not restart the whole journey or silently overwrite downstream user edits.

**If the user switches path or restarts:**
- Require an explicit event, retain an auditable transition, and define whether reusable assets/answers are carried forward.
- Do not mutate `path` directly through a generic patch.

**If upload succeeds but attaching the resource fails:**
- Keep the workspace asset available, mark the journey resource as recoverable/unattached, and expose retry/remove.
- Do not upload the same bytes again automatically.

**If two tabs submit from the same revision:**
- Accept one update, reject the stale update with `409 Conflict`, refetch, and let the user reapply the edit.
- Do not use last-write-wins for guided answers or confirmed summaries.

**If a transition creates a write/cost effect:**
- Transition only to a ready-for-confirmation state and create the existing action card from a frozen summary snapshot.
- Execution still requires the existing action contract confirmation policy.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `next@16.2.6` | `react@19.2.4`, `react-dom@19.2.4` | Current declared application baseline; keep journey mutations in App Router Route Handlers. |
| `drizzle-orm@^0.45.2` | `drizzle-kit@^0.31.10`, `@neondatabase/serverless@^1.1.0` | Current persistence/migration stack. Use a transaction for flow + transition event and a revision predicate for concurrency. |
| `zod@^3.0.0` | TypeScript `^5`, OpenAI SDK `^6.34.0` | Current code imports Zod v3 APIs. Keep runtime schemas as the authority; structured model output support still depends on the configured model/provider. |
| `@tanstack/react-query@^5.100.1` | React `19.2.4` | Existing hooks use v5 object syntax. Prefer invalidation after authoritative transition; narrow optimism must include rollback/refetch. |
| `react-dropzone@^15.0.0` | React `19.2.4` | Already declared; use only for richer multi-file reference selection, not as a new persistence layer. |
| `vitest@^4.1.5` | Testing Library React `^16.3.2`, jsdom `^29.0.2` | Existing unit/component stack is sufficient for transition and UI behavior tests. |
| `@playwright/test@^1.60.0` | Next.js app at configured `E2E_BASE_URL` | Existing config already retains traces/screenshots on failure; extend the guided journey spec and staging evidence workflow. |

## UAT Stack Contract

Automated browser coverage should exercise, for **both** `existing_creative` and `from_zero`:

- start, progressive answer, quick reply, edit, back, resume after reload, switch path, restart;
- extracted/suggested assumptions corrected before summary confirmation;
- editable summary persistence and stale-revision conflict recovery;
- inline select, upload, replace, remove, failed upload recovery, and minimum-reference guard;
- action card generated from the confirmed snapshot and no write/cost before confirmation;
- desktop and mobile layouts, keyboard navigation, focus return after edit/back, and no overlapping controls;
- transition telemetry with path, previous step, next step, event key, revision, reason code, and action record link where applicable.

Mock provider/storage responses for deterministic CI coverage. Separately record authenticated staging evidence for real image upload, image diagnosis/suggestions, persisted resume, action confirmation, and telemetry rows. A green mocked Playwright spec is not sufficient staging proof.

## Sources

### Live repository (HIGH confidence)

- `app/package.json` — all versions listed above, read 2026-06-26.
- `.planning/PROJECT.md` — v13.8 goal, target capabilities, and confirmation-before-write/cost principle.
- `app/src/lib/guided-flow/types.ts` — two paths and current string step model.
- `app/src/server/repositories/guided-flow.ts` and `app/src/server/db/schema.ts` — current JSONB persistence, merge-patch behavior, scope checks, and telemetry hook.
- `app/src/server/assistant/guided-paths/from-zero.ts` and `existing-creative.ts` — current fixed transitions, diagnosis, brief snapshot, and reference minimum.
- `app/src/components/assistant/AssistantChatCore.tsx`, `FromZeroBriefPanel.tsx`, `FromZeroReferencesPanel.tsx`, `CreativeDiagnosisPanel.tsx`, and `ExistingCreativeSelectPanel.tsx` — current all-at-once form, direct step switches, read-only diagnosis, and asset/reference surfaces.
- `app/src/lib/assistant/chat-attachments.ts` and workspace asset APIs — existing upload and validation path.
- `app/tests/e2e/guided-assistant-journeys.spec.ts` and Playwright configs — current browser coverage and retained failure artifacts.

### Official documentation (HIGH confidence)

- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers) — App Router request handlers and supported HTTP methods.
- [Zod v3 documentation](https://v3.zod.dev/) — parse/safeParse runtime validation used by the installed major version.
- [Drizzle transactions](https://orm.drizzle.team/docs/transactions) — atomic multi-statement transition persistence.
- [TanStack Query optimistic updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates) — UI-only optimism versus cache updates and rollback considerations.
- [OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs) — schema adherence when supported; also documents why JSON mode alone is insufficient.
- [Playwright Trace Viewer](https://playwright.dev/docs/trace-viewer) and [best practices](https://playwright.dev/docs/best-practices) — trace-based debugging and failure evidence.

---
*Stack research for: v13.8 Conversa Guiada Adaptativa*
*Researched: 2026-06-26*
