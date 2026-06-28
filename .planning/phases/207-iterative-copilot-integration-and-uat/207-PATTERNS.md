# Phase 207: Iterative Copilot Integration and UAT - Pattern Map

**Mapped:** 2026-06-28
**Files analyzed:** 35 new/modified targets
**Analogs found:** 33 / 35

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/drizzle/0068_assistant_artifact_iteration_events.sql` | migration | batch | `app/drizzle/0059_assistant_guided_flow_events.sql` | exact |
| `app/src/server/db/schema.ts` (add table) | model | batch | `assistantGuidedFlowEvents` in `schema.ts` | exact |
| `app/src/server/assistant/artifact-iteration-telemetry.ts` | service | event-driven | `app/src/server/assistant/guided-flow-telemetry.ts` | exact |
| `app/src/server/assistant/artifact-iteration-telemetry.test.ts` | test | event-driven | `app/src/server/assistant/guided-flow-telemetry.test.ts` | exact |
| `app/src/server/repositories/artifact-iteration-telemetry.ts` | service | CRUD | `app/src/server/repositories/guided-flow-telemetry.ts` | exact |
| `app/src/server/repositories/artifact-iteration-telemetry.test.ts` | test | CRUD | `app/src/server/repositories/guided-flow-telemetry.test.ts` | exact |
| `app/src/server/assistant/artifact-iteration-funnel.ts` (optional) | utility | transform | `app/src/server/assistant/guided-flow-funnel.ts` | role-match |
| `app/src/app/api/feedback/analytics/artifact-iteration/route.ts` | route | request-response | `app/src/app/api/feedback/analytics/guided-flow-funnel/route.ts` | exact |
| `app/src/app/api/feedback/analytics/artifact-iteration/route.test.ts` | test | request-response | `guided-flow-funnel/route.test.ts` | exact |
| `app/src/server/assistant/plan-iteration/proposal.ts` (emit) | service | event-driven | `guided-conversation/service.ts` emit calls | role-match |
| `app/src/server/assistant/creative-iteration/proposal.ts` (emit) | service | event-driven | `plan-iteration/proposal.ts` | exact |
| `app/src/server/jobs/derivation.ts` (emit) | service | event-driven | `guided-flow-telemetry-lifecycle.ts` | role-match |
| `app/src/server/action-execution/handlers/revise-creative.ts` (emit) | handler | event-driven | `guided-conversation/service.ts` | role-match |
| `app/src/server/assistant/artifact-version/comparison.ts` (emit) | service | request-response | `guided-conversation/service.ts` post-mutation emit | role-match |
| `app/src/server/assistant/artifact-version/promotion.ts` (emit) | service | CRUD | `guided-conversation/service.ts` post-mutation emit | role-match |
| `app/src/server/repositories/artifact-version.ts` (stale emit) | service | event-driven | `guided-flow-telemetry-lifecycle.ts` | role-match |
| `app/src/server/assistant/creative-iteration/service.ts` (stale emit) | service | event-driven | `guided-flow-telemetry-lifecycle.ts` | role-match |
| `app/src/app/api/.../artifact-versions/promote/route.ts` (conflict emit) | route | request-response | `promote/route.test.ts` conflict path | role-match |
| `app/src/lib/assistant/artifact-version.test.ts` (extend) | test | transform | existing file | exact |
| `app/src/server/repositories/artifact-version.test.ts` (extend) | test | CRUD | existing file | exact |
| `app/src/server/assistant/plan-iteration/proposal.test.ts` (extend) | test | CRUD | existing + `guided-flow-telemetry-lifecycle.test.ts` mock | exact |
| `app/src/server/assistant/plan-iteration/service.test.ts` (extend) | test | CRUD | existing file | exact |
| `app/src/server/assistant/creative-iteration/*.test.ts` (extend) | test | CRUD | existing files | exact |
| `app/src/server/assistant/artifact-version/comparison.test.ts` (extend) | test | request-response | existing file | exact |
| `app/src/server/assistant/artifact-version/promotion.test.ts` (extend) | test | CRUD | existing + lifecycle mock pattern | role-match |
| `app/src/server/jobs/derivation.test.ts` (extend) | test | event-driven | existing file | exact |
| `app/src/components/assistant/VersionHistory.test.tsx` (extend) | test | request-response | existing file | exact |
| `app/src/components/assistant/AssistantActionCard.test.tsx` (extend) | test | request-response | `VersionComparisonDialog.test.tsx` | role-match |
| `app/tests/e2e/iterative-copilot-loop.desktop.spec.ts` | test | request-response | `app/tests/e2e/guided-assistant-journeys.spec.ts` | exact |
| `app/tests/e2e/iterative-copilot-loop.mobile.spec.ts` | test | request-response | `guided-assistant-journeys.spec.ts` mobile tests | exact |
| `app/playwright.guided.config.ts` (extend testMatch) | config | — | existing file | exact |
| `app/scripts/run-v13-9-release-gate.mjs` | config | batch | `app/scripts/run-v13-8-release-gate.mjs` | exact |
| `app/tests/unit/release/v13-9-release-evidence.test.ts` | test | batch | `app/tests/unit/release/v13-8-release-evidence.test.ts` | exact |
| `app/scripts/run-iterative-copilot-e2e.mjs` (optional) | config | batch | `app/scripts/run-guided-e2e.mjs` | exact |

## Pattern Assignments

### `app/drizzle/0068_assistant_artifact_iteration_events.sql` (migration, batch)

**Analog:** `app/drizzle/0059_assistant_guided_flow_events.sql`

**Table shape pattern** (lines 1–16):
```sql
CREATE TABLE IF NOT EXISTS "adscale_app"."assistant_guided_flow_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_profile_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	...
	"event_key" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
```

**Index pattern** (lines 24–27):
```sql
CREATE INDEX IF NOT EXISTS "assistant_guided_flow_events_workspace_occurred_idx" ON "adscale_app"."assistant_guided_flow_events" ("workspace_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "assistant_guided_flow_events_thread_occurred_idx" ON "adscale_app"."assistant_guided_flow_events" ("thread_id", "occurred_at");
```

**Adaptation:** Replace `guided_flow_id`, `path`, `step`, `blocker_category`, `action_record_id`, `campaign_id` with artifact-iteration columns: `artifact_type`, `lineage_id`, `proposal_id`, `action_record_id`, `operation_id`, `reason_code`. Keep four-dimensional scope FKs (`workspace_id`, `client_profile_id`, `thread_id`) plus `campaign_id` FK mirroring `0064_assistant_artifact_versions.sql`.

---

### `app/src/server/db/schema.ts` — `assistantArtifactIterationEvents` (model, batch)

**Analog:** `assistantGuidedFlowEvents` in `app/src/server/db/schema.ts` (lines 2502–2558)

**Drizzle table pattern:**
```typescript
export const assistantGuidedFlowEvents = adscaleSchema.table(
  "assistant_guided_flow_events",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    clientProfileId: uuid("client_profile_id").notNull().references(() => clientProfiles.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id").notNull().references(() => assistantThreads.id, { onDelete: "cascade" }),
    eventKey: text("event_key").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    occurredAt: timestamp("occurred_at", { mode: "date" }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("assistant_guided_flow_events_workspace_occurred_idx").on(table.workspaceId, table.occurredAt),
    index("assistant_guided_flow_events_thread_occurred_idx").on(table.threadId, table.occurredAt),
  ]
);
```

**Adaptation:** Add `campaignId`, `artifactType`, `lineageId`, nullable `proposalId`, `actionRecordId`, `operationId`, `reasonCode`. Export `AssistantArtifactIterationEvent` / `NewAssistantArtifactIterationEvent` types.

---

### `app/src/server/assistant/artifact-iteration-telemetry.ts` (service, event-driven)

**Analog:** `app/src/server/assistant/guided-flow-telemetry.ts`

**Imports pattern** (lines 1–4):
```typescript
import { z } from "zod";
import { logger } from "@/lib/logger";
import { containsDeniedPersistenceKeys } from "@/server/repositories/assistant-types";
import { insertGuidedFlowTelemetryEvent } from "@/server/repositories/guided-flow-telemetry";
```

**Event keys + allowlist metadata** (lines 6–73):
```typescript
export const GUIDED_FLOW_EVENT_KEYS = [
  "guided_flow_started",
  ...
] as const;

export const ALLOWED_GUIDED_FLOW_METADATA_KEYS = [
  "inputType",
  ...
] as const;

const metadataSchema = z.strictObject(
  Object.fromEntries(
    ALLOWED_GUIDED_FLOW_METADATA_KEYS.map((key) => [key, scalarValueSchema.optional()])
  ) as Record<...>
);
```

**Sanitizer pattern** (lines 87–118):
```typescript
export function sanitizeGuidedFlowMetadata(input: unknown): Record<string, GuidedFlowMetadataValue> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new GuidedFlowTelemetrySanitizationError("metadata must be an object", { received: typeof input });
  }
  if (containsDeniedPersistenceKeys(input)) {
    throw new GuidedFlowTelemetrySanitizationError("metadata contains denied persistence keys");
  }
  const parsed = metadataSchema.safeParse(input);
  ...
}
```

**Fire-and-forget emit** (lines 138–195):
```typescript
export async function recordGuidedFlowTelemetryEvent(input: RecordGuidedFlowTelemetryInput): Promise<void> {
  try {
    ...
    await insertGuidedFlowTelemetryEvent({ ...input, metadata, occurredAt: input.occurredAt ?? new Date() });
  } catch (error) {
    telemetryLogger.warn("guided_flow_telemetry.record_failed", { eventKey: input.eventKey, ... });
  }
}

export function emitGuidedFlowTelemetry(input: RecordGuidedFlowTelemetryInput): void {
  void recordGuidedFlowTelemetryEvent(input);
}
```

**Adaptation:** D-02 keys (`proposal_created`, `proposal_confirmed`, `generation_enqueued`, …). D-03 metadata allowlist: `artifactType`, `lineageId`, `versionNumber`, `proposalId`, `actionRecordId`, `operationId`, `idempotent`, `replayed`, `reasonCode`, `staleReason`, `conflictReason`. Input interface carries `ArtifactScope` dimensions + artifact fields instead of `path`/`step`/`guidedFlowId`.

---

### `app/src/server/assistant/artifact-iteration-telemetry.test.ts` (test, event-driven)

**Analog:** `app/src/server/assistant/guided-flow-telemetry.test.ts`

**Mock setup** (lines 1–24):
```typescript
vi.mock("@/server/repositories/guided-flow-telemetry", () => ({
  insertGuidedFlowTelemetryEvent: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ warn: vi.fn() }) },
}));
```

**Contract tests** (lines 51–102):
```typescript
it("exports stable event keys", () => {
  expect(GUIDED_FLOW_EVENT_KEYS).toContain("guided_flow_completed");
});
it("rejects denied persistence keys in metadata", () => {
  expect(() => sanitizeGuidedFlowMetadata({ reasoning: "hidden chain of thought" }))
    .toThrow(GuidedFlowTelemetrySanitizationError);
});
it("does not throw when repository insert fails", async () => {
  mockInsert.mockRejectedValue(new Error("db down"));
  await expect(recordGuidedFlowTelemetryEvent(baseInput)).resolves.toBeUndefined();
});
```

**Adaptation:** Test all 12 D-02 keys; reject `prompt`, `snapshot`, `previewUrl`, `signedUrl` via denylist; assert `idempotent`/`replayed` booleans pass sanitization.

---

### `app/src/server/repositories/artifact-iteration-telemetry.ts` (service, CRUD)

**Analog:** `app/src/server/repositories/guided-flow-telemetry.ts`

**Scope assertion before insert** (lines 29–61):
```typescript
async function assertTelemetryScope(workspaceId: string, clientProfileId: string, threadId: string) {
  const thread = await getAssistantThreadById(workspaceId, threadId);
  if (!thread) throw new GuidedFlowTelemetryValidationError("Thread not found");
  if (thread.clientProfileId !== clientProfileId) {
    throw new GuidedFlowTelemetryValidationError("Client profile does not match thread scope");
  }
  return thread;
}

export async function insertGuidedFlowTelemetryEvent(input: NewAssistantGuidedFlowEvent) {
  await assertTelemetryScope(input.workspaceId, input.clientProfileId, input.threadId);
  const [event] = await db.insert(assistantGuidedFlowEvents).values(input).returning();
  return event;
}
```

**Owner list (no scope assert)** (lines 157–173):
```typescript
export async function listGuidedFlowTelemetryEventsForOwner(
  filters: OwnerGuidedFlowTelemetryListFilters = {}
): Promise<AssistantGuidedFlowEvent[]> {
  const conditions = buildOwnerTelemetryConditions(filters);
  ...
}
```

**Adaptation:** Also assert `campaignId` matches thread when present. Filter by `artifactType`, `lineageId`, `eventKey` in addition to workspace/time.

---

### `app/src/server/repositories/artifact-iteration-telemetry.test.ts` (test, CRUD)

**Analog:** `app/src/server/repositories/guided-flow-telemetry.test.ts`

**Hoisted db mock + cross-scope rejection** (lines 3–105):
```typescript
const state = vi.hoisted(() => ({ selectResults: [] as unknown[][], insertResult: [] as unknown[] }));
vi.mock("../db", () => ({ db: { select: vi.fn(() => chain), insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(async () => state.insertResult) })) })) } }));

it("rejects cross-client profile mismatch on insert", async () => {
  await expect(insertGuidedFlowTelemetryEvent({ ...clientProfileId: "other-profile" }))
    .rejects.toBeInstanceOf(GuidedFlowTelemetryValidationError);
});
```

---

### `app/src/app/api/feedback/analytics/artifact-iteration/route.ts` (route, request-response)

**Analog:** `app/src/app/api/feedback/analytics/guided-flow-funnel/route.ts`

**Owner GET handler** (lines 1–36):
```typescript
import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { parseOwnerAnalyticsQuery } from "@/server/beta-analytics/query";
import { listGuidedFlowTelemetryEventsForOwner } from "@/server/repositories/guided-flow-telemetry";

export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);
    const { searchParams } = new URL(request.url);
    const filters = parseOwnerAnalyticsQuery(searchParams);
    const events = await listGuidedFlowTelemetryEventsForOwner({
      workspaceId: filters.workspaceId,
      from: filters.from,
      to: filters.to,
    });
    return NextResponse.json({ filters: { workspaceId: filters.workspaceId ?? null, ... }, ...summary });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("invalid_")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error, "feedback.analytics.guided-flow-funnel.GET");
  }
}
```

**Adaptation:** D-05 recommends raw filtered event list first; optional `buildArtifactIterationFunnelSummary` mirroring `guided-flow-funnel.ts` if parity needed. Error tag: `"feedback.analytics.artifact-iteration.GET"`.

---

### `app/src/app/api/feedback/analytics/artifact-iteration/route.test.ts` (test, request-response)

**Analog:** `app/src/app/api/feedback/analytics/guided-flow-funnel/route.test.ts`

**Route test pattern** (lines 1–43):
```typescript
vi.mock("@/server/auth/platform-owner", () => ({ requirePlatformOwner: vi.fn() }));
vi.mock("@/server/repositories/guided-flow-telemetry", () => ({
  listGuidedFlowTelemetryEventsForOwner: vi.fn(),
}));

it("returns guided flow funnel summary for platform owner", async () => {
  const res = await GET(new Request("http://localhost/api/feedback/analytics/guided-flow-funnel"));
  expect(res.status).toBe(200);
  expect(mockRequireOwner).toHaveBeenCalled();
});
```

---

### Service emit points — `plan-iteration/proposal.ts`, `creative-iteration/proposal.ts` (service, event-driven)

**Analog:** `app/src/server/assistant/guided-conversation/service.ts` (lines 224–238)

**Post-mutation emit (after success, not before idempotency check):**
```typescript
emitGuidedFlowTelemetry({
  workspaceId: input.workspaceId,
  clientProfileId: input.clientProfileId,
  threadId: input.threadId,
  guidedFlowId: persisted.id,
  path: persisted.path,
  step: persisted.currentStep,
  eventKey: "guided_input_supplied",
  metadata: {
    inputType: input.envelope.command.type,
    commandType: input.envelope.command.type,
    reasonCode: "journey_command",
    revision: persisted.revision,
  },
});
```

**Insert location in plan proposal** — after `createArtifactProposal` succeeds (lines 287–315):
```typescript
const proposal = await createArtifactProposal({ scope: input.scope, ... });
await clearPlanFeedbackDraft(input.scope);
// EMIT proposal_created here with { lineageId, proposalId, artifactType: "plan", versionNumber: nextVersionNumber }
return result;
```

**Confirm idempotency guard** — `confirmPlanRevision` (lines 336–344):
```typescript
if (existing) {
  return { version: existing, head: null, proposal: null, idempotent: true as const };
}
// EMIT proposal_confirmed only when idempotent !== true
```

**Test extension analog:** `guided-flow-telemetry-lifecycle.test.ts` (lines 9–53):
```typescript
vi.mock("./guided-flow-telemetry", () => ({ emitGuidedFlowTelemetry: vi.fn() }));
...
expect(mockEmit).toHaveBeenCalledWith(expect.objectContaining({ eventKey: "guided_flow_started" }));
```

Apply same mock to `proposal.test.ts`; add `-t telemetry` cases asserting emit after propose/confirm and no emit on idempotent replay.

---

### `app/src/server/jobs/derivation.ts` + `revise-creative.ts` (service/handler, event-driven)

**Analog:** `guided-flow-telemetry-lifecycle.ts` failure emit pattern

**Emit points (from RESEARCH Pattern 2):**
- `generation_enqueued` / `retry_requested` — after `inngest.send` in `revise-creative.ts`
- `generation_succeeded` — after `createArtifactVersion` for `creative_revision` (~line 995)
- `generation_failed` — in `onFailure` when `generationMode === "creative_revision"` (~line 296)

**Test extension analog:** `derivation.test.ts` — mock `emitArtifactIterationTelemetry`, assert failure path emits `generation_failed` with `reasonCode` only (no provider payload).

---

### `app/src/server/assistant/artifact-version/comparison.ts` + `promotion.ts` (service, CRUD)

**Analog:** Post-mutation emit in `guided-conversation/service.ts`

**comparison.ts:** Emit `comparison_opened` after successful compare DTO built (end of `compareArtifactVersions`).

**promotion.ts:** Emit sequence:
- `promotion_requested` — entry to `promoteThreadArtifactVersion` (line 47)
- `promotion_succeeded` — after `promoteArtifactVersion` commits with `replayed: false`
- `comparison_acknowledged` — after `acknowledgeLinkedPlanComparison` persists

**Skip duplicate success emit when replayed** (RESEARCH Pitfall 3):
```typescript
// Only emit promotion_succeeded when result.replayed !== true
```

**promote/route.ts conflict:** Emit `promotion_conflict` on `ArtifactHeadConflictError` — mirror `promote/route.test.ts` conflict handling (lines 3–6 imports `ArtifactHeadConflictError`).

---

### Test extensions — repository & service layers

**Analog:** `app/src/server/repositories/artifact-version.test.ts`

**Existing Nyquist scenarios to wire telemetry** (grep-confirmed):
```typescript
it("rolls back a head CAS when the canonical plan write fails", async () => { ... });
it("approves the first official version when the head has no current official", async () => { ... });
it("rejects replay when the operation id belongs to a different command", async () => { ... });
```

**Extension pattern:** After each scenario, query mocked telemetry or spy `emitArtifactIterationTelemetry`; assert `promotion_succeeded` metadata includes `expectedOfficialVersionId: null` for first-approval; assert no second `promotion_succeeded` on idempotent replay.

**Service reload analog:** `artifact-version/service.test.ts` line 107:
```typescript
it("returns approved and working versions independently on reload", async () => { ... });
```

---

### Test extensions — component layer (D-07)

**Analog:** `app/src/components/assistant/VersionHistory.test.tsx`

**Fixture + hook mock pattern** (lines 1–18, 230):
```typescript
vi.mock("@/lib/hooks/use-assistant-threads", () => ({ useAssistantThread: hookMocks.useAssistantThread }));
...
const history = screen.getByTestId("version-history");
```

**a11y landmark source** — `VersionHistory.tsx` (lines 92–96):
```tsx
<section data-testid="version-history" aria-labelledby="version-history-title">
  <h2 id="version-history-title">...</h2>
```

**VersionComparisonDialog.test.tsx** — Portuguese copy + dialog interaction (lines 100–117):
```typescript
render(<VersionComparisonDialog open request={request} lineages={[lineage]} onOpenChange={vi.fn()} />);
fireEvent.click(screen.getByRole("button", { name: "Aprovar v2" }));
expect(screen.getByText(/não usa créditos e não exclui nenhuma versão/i)).toBeInTheDocument();
```

**New tests needed:**
- `VersionHistory.test.tsx`: post-promotion reload — mutate hook return between renders, assert official label updates
- `AssistantActionCard.test.tsx`: stale card — render with `data-status="stale"`, assert Portuguese stale copy (mirror action card patterns from `guided-assistant-journeys.spec.ts` line 171–173)

---

### `app/tests/e2e/iterative-copilot-loop.*.spec.ts` (test, request-response)

**Analog:** `app/tests/e2e/guided-assistant-journeys.spec.ts` + `app/tests/e2e/support/guided-auth.ts`

**Auth + mock entry** (journeys spec lines 127–131, guided-auth lines 10–38):
```typescript
test.beforeEach(async ({ page }) => {
  await mockClientProfiles(page);
  await loginGuidedJourney(page);
});

// guided-auth.ts — API sign-in, no UI login
const response = await page.request.post("/api/auth/sign-in/email", {
  data: { email: GUIDED_E2E_EMAIL, password: GUIDED_E2E_PASSWORD },
});
```

**Route mock pattern** (journeys spec lines 72–125):
```typescript
async function mockAssistantActionConfirmFlow(page: Page) {
  await page.route("**/api/assistant/threads?**", async (route) => {
    await route.fulfill({ json: { threads: [...] } });
  });
  await page.route("**/api/assistant/threads/thread-e2e-confirm", async (route) => {
    await route.fulfill({ json: assistantThreadDetail(confirmed ? "running" : "pending") });
  });
}
```

**Adaptation for iteration loop (D-09):** Mock routes for `plan-revisions`, `creative-revisions`, `actions/confirm`, `artifact-versions/compare`, `comparison-acknowledgements`, `artifact-versions/promote`, thread detail with `artifactVersionState`. Portuguese assertions (D-13). Desktop viewport 1280×800; mobile 390×844 (journeys spec lines 134, 150).

**a11y assertions (D-10):**
```typescript
await expect(page.getByRole("dialog")).toBeVisible();
await expect(page.getByTestId("version-history")).toBeVisible();
// VersionHistory: aria-labelledby="version-history-title"
```

**Config analog:** `app/playwright.guided.config.ts` — extend `testMatch`:
```typescript
testMatch: /guided-assistant-(journeys|scenarios)\.spec\.ts$/,
// Add: iterative-copilot-loop\.(desktop|mobile)\.spec\.ts
```

**Optional runner:** `app/scripts/run-guided-e2e.mjs` — seed dev admin, spawn/reuse dev server, invoke playwright with `playwright.guided.config.ts`.

---

### `app/scripts/run-v13-9-release-gate.mjs` (config, batch)

**Analog:** `app/scripts/run-v13-8-release-gate.mjs`

**Structure** (lines 14–63, 99–215):
```javascript
const phaseDir = resolve(repoRoot, ".planning/phases/200-real-staging-evidence-and-release-gate");
const evidencePath = resolve(phaseDir, "200-EVIDENCE.json");
const AUTOMATED_STEPS = [
  { id: "journey-transition-engine", files: ["src/server/assistant/guided-conversation/transition.test.ts"] },
  ...
];

function runVitest(files) {
  execFileSync("npm", ["test", "--", "--run", ...files], { cwd: appDir, stdio: "inherit" });
}

// Gate verdict: automated pass + staging/sample/inngest debt with claim boundaries
evidence.inheritedDebt = { liveInngestLifecycle: "unverified" };
```

**v13.7 telemetry steps reference** (`run-v13-7-release-gate.mjs` lines 24–39):
```javascript
{ id: "telemetry-repository", files: ["src/server/repositories/guided-flow-telemetry.test.ts"] },
{ id: "telemetry-contract", files: ["src/server/assistant/guided-flow-telemetry.test.ts"] },
{ id: "guided-flow-funnel", files: ["src/server/assistant/guided-flow-funnel.test.ts", ".../guided-flow-funnel/route.test.ts"] },
```

**Adaptation for v13.9:** Point `phaseDir` to Phase 207 evidence; `AUTOMATED_STEPS` include artifact-iteration telemetry trio, extended 203–206 test files, `v13-9-release-evidence.test.ts`, Playwright iteration specs (or document as accepted debt per D-11). Preserve `--dry-run`, `--allow-pending-staging`, accepted_debt scopes pattern.

---

### `app/tests/unit/release/v13-9-release-evidence.test.ts` (test, batch)

**Analog:** `app/tests/unit/release/v13-8-release-evidence.test.ts`

**Evidence honesty checks** (lines 17–48):
```typescript
describe("v13.8 release evidence", () => {
  it("includes release gate script", () => {
    expect(existsSync(gateScript)).toBe(true);
  });
  it("keeps evidence template honest about pending sample", () => {
    expect(parsed.operationalSample.status).toBe("insufficient_sample");
    expect(parsed.stagingEvidence.status).toBe("pending");
  });
  it("records owner waiver without fabricating live evidence", () => {
    expect(parsed.inheritedDebt.liveInngestLifecycle).toBe("unverified");
  });
});
```

**Adaptation:** Assert v13.9 gate script exists; evidence template cites Phases 203–207 claim boundaries (CI vs staging vs human); inherit `liveInngestLifecycle: unverified`.

---

## Shared Patterns

### Safe telemetry sanitization
**Source:** `app/src/server/assistant/guided-flow-telemetry.ts` (lines 87–118)
**Apply to:** `artifact-iteration-telemetry.ts`, all emit call sites (metadata built inline, never from DTOs)
```typescript
if (containsDeniedPersistenceKeys(input)) {
  throw new ArtifactIterationTelemetrySanitizationError("metadata contains denied persistence keys");
}
return metadataSchema.parse(input); // zod strictObject on D-03 allowlist only
```

### Denylist enforcement
**Source:** `app/src/server/repositories/assistant-types.ts` (line 51)
**Apply to:** Telemetry metadata tests (mirror `artifact-version.test.ts` lines 24–38)
```typescript
it.each(["reasoning", "thinking", "signedUrl", "rawArgs", "prompt", "inputPrompt"])(
  "rejects denied or unallowlisted snapshot key %s",
  (key) => { expect(() => schema.parse({ ...base, [key]: "secret" })).toThrow(); }
);
```

### Owner analytics auth + filters
**Source:** `guided-flow-funnel/route.ts` + `beta-analytics/query.ts`
**Apply to:** `artifact-iteration/route.ts`
```typescript
await requirePlatformOwner(request);
const filters = parseOwnerAnalyticsQuery(new URL(request.url).searchParams);
// filters: workspaceId?, from?, to? — invalid dates throw invalid_from/invalid_to
```

### Fire-and-forget emit at service boundary
**Source:** `guided-flow-telemetry.ts` (lines 191–195)
**Apply to:** All D-04 emit points — never UI hooks
```typescript
export function emitArtifactIterationTelemetry(input: RecordArtifactIterationTelemetryInput): void {
  void recordArtifactIterationTelemetryEvent(input);
}
```

### Telemetry test mock isolation
**Source:** `guided-flow-telemetry-lifecycle.test.ts` (lines 9–15)
**Apply to:** proposal.test.ts, promotion.test.ts, derivation.test.ts extensions
```typescript
vi.mock("@/server/assistant/artifact-iteration-telemetry", () => ({
  emitArtifactIterationTelemetry: vi.fn(),
}));
```

### Playwright authenticated E2E
**Source:** `tests/e2e/support/guided-auth.ts` + `guided-assistant-journeys.spec.ts`
**Apply to:** iteration loop specs
```typescript
await mockClientProfiles(page);
await loginGuidedJourney(page);
// locale pt-BR from playwright.guided.config.ts; route mocks for LLM/credits/Inngest
```

### Release gate evidence + claim boundaries
**Source:** `run-v13-8-release-gate.mjs` + `v13-8-release-evidence.test.ts`
**Apply to:** v13.9 gate — D-11 explicit CI vs staging vs human matrix; never over-claim live Inngest

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `app/src/server/assistant/artifact-iteration-funnel.ts` | utility | transform | Optional; if skipped, route returns raw events (D-05). Use `guided-flow-funnel.ts` if summary needed |
| `app/src/components/assistant/AssistantActionCard.test.tsx` stale card test | test | request-response | No existing stale-card UI test; partial analog from `VersionComparisonDialog.test.tsx` conflict alert pattern |

## Metadata

**Analog search scope:** `app/src/server/assistant/`, `app/src/server/repositories/`, `app/src/app/api/feedback/analytics/`, `app/tests/e2e/`, `app/scripts/`, `app/drizzle/`, `app/src/components/assistant/`
**Files scanned:** ~45 analog files read or grep-verified
**Pattern extraction date:** 2026-06-28
