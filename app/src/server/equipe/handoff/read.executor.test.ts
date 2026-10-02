// The handoff reading under an Inngest executor (ticket 13: the Instagram reading hung for good after the reader).
//
// read.test.ts runs the steps as plain calls in the order of the code, so it can never see a dependency BETWEEN steps. Inngest runs every step of a function as a call
// of its own, one at a time (the reading has concurrency 1 per account), in an order the function does not control, and replays the function body each time. A step
// whose callback waited for another step's promise waited for a step that could not start while it held the only place: the Instagram reading stopped after the reader.
//
// Here the REAL handler is served by the real Inngest SDK (inngest/edge, the same request handler a Next route uses) and this file plays the executor's part over the
// wire protocol the SDK speaks (recorded from the Inngest dev server, SDK 4.4: a request with the memoized steps and the completion order, answered with the steps it
// found or ran, then one request per planned step). Every order the executor could run a batch of planned steps in is explored.
//
// The same serial schedule is why the provider's cost (ten seconds of waiting) is NOT a step of the reading: it held the screen for them (60 s reading, 10.5 s of cost
// ahead of the records). The reading only tells a function of its own, after the last group is recorded, and that function is played here too.
import { describe, expect, it } from "vitest";
import { Inngest } from "inngest";
import { serve } from "inngest/edge";
import { createHandoffReadHandler } from "./read";
import { createInstagramCostHandler } from "./instagram-cost";
import { FakeInstagramReader, FakeSiteReader, type InstagramReadResult, type SiteReadResult } from "./readers";
import type { InstagramEnrichment } from "./instagram-enrichment";
import type { SiteEnrichment } from "./site-enrichment";
import { executeCommand } from "../module/commands";
import { makeTestDeps, uuid } from "../module/testing/deps";
import { allGroupsFinished, HANDOFF_GROUPS, readingRun, type HandoffState } from "../domain/handoff";
import { HANDOFF_INSTAGRAM_COST_EVENT, HANDOFF_READ_EVENT } from "./contract";
import type { JobStep } from "../jobs/shared";

type Deps = ReturnType<typeof makeTestDeps>;
type Scope = { workspaceId: string; accountId: string };
type Op = { id: string; op: string; name?: string; data?: unknown; error?: unknown };
type Outcome = { status: "completed" | "hung" | "failed"; ran: string[]; at?: string; detail?: string; path: number[] };

const STEP_TIMEOUT_MS = 1500;
const SYSTEM_OPEN = { kind: "system", job: "free-open" } as const;

async function openHandoff(t: Deps) {
  const workspaceId = uuid();
  const userId = `user-${uuid()}`;
  t.store.workspaceMembers.rows.set(uuid(), { id: uuid(), workspaceId, userId, name: "Ana Souza", email: "ana@example.com", emailVerified: true, role: "owner", createdAt: new Date("2026-01-01T00:00:00.000Z") });
  const opened = await executeCommand(t.deps, { actor: SYSTEM_OPEN, workspaceId }, { type: "open_free_account", payload: { userId } });
  if (!opened.ok) throw new Error(`openHandoff failed: ${opened.error.code}`);
  const accountId = opened.value.accountId!;
  const people = await t.deps.uow.repos.people.list({ workspaceId, accountId });
  return { scope: { workspaceId, accountId }, approver: { kind: "client_person", role: "approver", personId: people[0]!.id } as const };
}
async function currentHandoff(t: Deps, scope: Scope): Promise<HandoffState & { id: string }> {
  const [row] = await t.deps.uow.repos.handoffs.list(scope);
  if (!row) throw new Error("no handoff row");
  return row;
}
async function setSource(t: Deps, scope: Scope, approver: { kind: "client_person"; role: "approver"; personId: string }, kind: "site" | "instagram", value: string) {
  const row = await currentHandoff(t, scope);
  const outcome = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, { type: "handoff_set_source", payload: { expectedStep: row.step, expectedVersion: row.version, kind, value } });
  if (!outcome.ok) throw new Error(`setSource failed: ${outcome.error.code}`);
}
async function readEventData(t: Deps, scope: Scope) {
  const row = await currentHandoff(t, scope);
  const taskIntentId = row.reading[HANDOFF_GROUPS[0]]!.taskIntentId;
  const runIds = Object.fromEntries(HANDOFF_GROUPS.map((g) => [g, row.reading[g]!.runId]));
  return { workspaceId: scope.workspaceId, accountId: scope.accountId, taskIntentId, readingId: row.readingId, source: row.source, groups: [...HANDOFF_GROUPS], runIds };
}

/**
 * The second shape of the Instagram reading, the one that hung in the retest too: the site was read first, the person confirms the Instagram profile it found, and the
 * module dispatches a NEW, partial reading of the profile for the colors and the images only. Returns the event of that reading, as the module wrote it.
 */
async function partialInstagramReading(t: Deps) {
  const { scope, approver } = await openHandoff(t);
  await setSource(t, scope, approver, "site", "https://acme.com");
  let row = await currentHandoff(t, scope);
  const system = { kind: "system", job: "equipe.handoff.read" } as const;
  const record = async (group: "name" | "logo" | "colors" | "fonts" | "networks", status: "found" | "not_found", items: Array<Record<string, unknown>> = []) => {
    const g = row.reading[group]!;
    const out = await executeCommand(t.deps, { actor: system, workspaceId: scope.workspaceId, accountId: scope.accountId }, { type: "handoff_record_group", payload: { readingId: row.readingId!, runId: g.runId, taskIntentId: g.taskIntentId, group, result: { status, items } } } as never);
    if (!out.ok) throw new Error(out.error.code);
  };
  const netId = uuid();
  await record("networks", "found", [{ id: netId, value: "acme.oficial", origin: "site", platform: "instagram" }]);
  await record("name", "found", [{ id: uuid(), value: "Acme", origin: "site" }]);
  await record("logo", "not_found");
  await record("colors", "found", [{ id: uuid(), value: "#111111", origin: "site" }]);
  await record("fonts", "found", [{ id: uuid(), value: "Inter", origin: "site" }]);
  row = await currentHandoff(t, scope);
  const identity = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, { type: "handoff_confirm_identity", payload: { expectedStep: row.step, expectedVersion: row.version, name: "Acme", logo: null, colors: ["#111111"], fonts: ["Inter"], paletteChoice: "site" } });
  if (!identity.ok) throw new Error(identity.error.code);
  row = await currentHandoff(t, scope);
  const networks = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, { type: "handoff_confirm_networks", payload: { expectedStep: row.step, expectedVersion: row.version, kept: [netId], added: [] } });
  if (!networks.ok) throw new Error(networks.error.code);
  row = await currentHandoff(t, scope);
  const intent = await t.deps.uow.repos.taskOutbox.get(scope, row.reading.colors!.taskIntentId);
  return { scope, data: { workspaceId: scope.workspaceId, accountId: scope.accountId, taskIntentId: row.reading.colors!.taskIntentId, readingId: row.readingId, source: (intent!.data as { source: unknown }).source,
    groups: ["colors", "images"], runIds: { colors: row.reading.colors!.runId, images: row.reading.images!.runId } } };
}

const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));
/** The `index`-th permutation of `items` (Lehmer code), so every order of a batch can be visited. */
function permute<T>(items: T[], index: number): T[] {
  const pool = [...items]; const out: T[] = []; let rest = index;
  for (let size = pool.length; size > 0; size -= 1) { const f = factorial(size - 1); out.push(pool.splice(Math.floor(rest / f), 1)[0]!); rest %= f; }
  return out;
}

/**
 * Plays the Inngest executor for one run of the function: asks it to run (stepId "step"), keeps the memoized steps and their completion order, and runs each planned
 * step as a request of its own (stepId = the step), in the order `pick` gives, until the function says it is complete. A request that never answers is a hung step.
 */
async function playExecutor(handler: (request: Request) => Promise<Response>, fnId: string, event: Record<string, unknown>, pick: (batch: Op[], index: number) => Op[]): Promise<Omit<Outcome, "path">> {
  const steps: Record<string, { data: unknown }> = {}; const stack: string[] = []; const names = new Map<string, string>(); const ran: string[] = [];
  const runId = `run-${uuid()}`; let first = true; let batchIndex = 0;
  const call = async (stepId: string, immediate: boolean) => {
    const body = JSON.stringify({
      ctx: { attempt: 0, disable_immediate_execution: !immediate, env: "", fn_id: uuid(), generation_id: 1, job_id: uuid(), max_attempts: 2, qi_id: uuid(), request_id: uuid(), run_id: runId, stack: { current: stack.length, stack }, step_id: "step", use_api: false },
      defers: {}, event, events: [event], steps, use_api: false, version: first ? -1 : 2,
    });
    const request = new Request(`http://localhost/api/inngest?fnId=${encodeURIComponent(fnId)}&stepId=${stepId}`, { method: "POST", headers: { "content-type": "application/json", host: "localhost:3000", "x-inngest-req-version": first ? "-1" : "2" }, body });
    first = false;
    const answer = await Promise.race([handler(request).then(async (response) => ({ status: response.status, text: await response.text() })), new Promise<null>((resolve) => setTimeout(() => resolve(null), STEP_TIMEOUT_MS))]);
    return answer;
  };
  const absorb = (ops: Op[]) => { for (const op of ops) if (op.op === "StepRun") { steps[op.id] = { data: op.data }; stack.push(op.id); ran.push(names.get(op.id) ?? op.name ?? op.id); } };
  for (let guard = 0; guard < 200; guard += 1) {
    const found = await call("step", true);
    if (!found) return { status: "hung", ran, at: "the function body (a replay)" };
    if (found.status === 200) return { status: "completed", ran }; // the function returned (without checkpointing the SDK answers with the value itself)
    const ops = JSON.parse(found.text) as Op[] | unknown;
    if (found.status === 500 || !Array.isArray(ops)) return { status: "failed", ran, detail: found.text.slice(0, 400) };
    if (ops.some((op) => op.op === "RunComplete")) return { status: "completed", ran };
    absorb(ops.filter((op) => op.op === "StepRun"));
    const planned = ops.filter((op) => op.op === "StepPlanned");
    if (planned.length === 0 && !ops.some((op) => op.op === "StepRun")) return { status: "failed", ran, detail: `no step planned and no completion: ${found.text.slice(0, 300)}` };
    for (const op of planned) names.set(op.id, op.name ?? op.id);
    for (const op of pick(planned, batchIndex)) {
      const result = await call(op.id, false);
      if (!result) return { status: "hung", ran, at: op.name ?? op.id };
      const done = JSON.parse(result.text) as Op[] | unknown;
      if (!Array.isArray(done) || !done.some((x) => x.op === "StepRun")) return { status: "failed", ran, at: op.name ?? op.id, detail: result.text.slice(0, 400) };
      absorb(done);
    }
    batchIndex += 1;
  }
  return { status: "failed", ran, detail: "the function never completed" };
}

/** Runs the function once for every order the executor could run each batch of planned steps in (stops at the first order that does not finish). */
async function exploreEveryOrder(build: () => Promise<{ handler: (request: Request) => Promise<Response>; fnId: string; event: Record<string, unknown>; after: () => Promise<void> }>): Promise<Outcome[]> {
  const outcomes: Outcome[] = []; let path: number[] = [];
  for (let guard = 0; guard < 5000; guard += 1) {
    const sizes: number[] = [];
    const run = await build();
    const outcome = await playExecutor(run.handler, run.fnId, run.event, (batch, index) => { sizes[index] = factorial(batch.length); return permute(batch, path[index] ?? 0); });
    if (outcome.status === "completed") await run.after();
    outcomes.push({ ...outcome, path: [...path] });
    if (outcome.status !== "completed") break;
    const next = [...path]; while (next.length < sizes.length) next.push(0);
    let i = sizes.length - 1;
    while (i >= 0) { next[i] = (next[i] ?? 0) + 1; if (next[i]! < sizes[i]!) break; next[i] = 0; i -= 1; }
    if (i < 0) break;
    path = next.slice(0, sizes.length);
  }
  return outcomes;
}

const INSTAGRAM_IMAGES = (data: InstagramReadResult) => ({ ...data, avatarUrl: "https://r2.example/avatar.jpg", avatarKey: "k-avatar", posts: [{ imageUrl: "https://r2.example/p1.jpg", caption: "c1", key: "k-p1" }] });

/** A function exactly as its job declares it (id, retries, the concurrency of one place per account), around the real handler. */
function served(handler: (args: { event: { data: unknown }; step: JobStep }) => Promise<unknown>, id = "equipe-handoff-read", event: string = HANDOFF_READ_EVENT) {
  // Nothing may be sent anywhere (the base URL is a closed port). Without a server to check in with, the SDK's checkpointing would only add retries to every step.
  const client = new Inngest({ id: "regression", isDev: true, baseUrl: "http://127.0.0.1:9", eventKey: "regression", checkpointing: false });
  const fn = client.createFunction(
    { id, triggers: [{ event }], retries: 1, concurrency: [{ limit: 1, key: "event.data.accountId" }] },
    ({ event, step }) => handler({ event, step: step as unknown as JobStep }),
  );
  return { handler: serve({ client, functions: [fn] }) as (request: Request) => Promise<Response>, fnId: `${client.id}-${fn.id()}` };
}
const eventOf = (data: unknown, name: string = HANDOFF_READ_EVENT) => ({ id: `evt-${uuid()}`, name, ts: Date.now(), data, user: {} });

const failure = (outcome: Outcome) => `${outcome.status} at ${outcome.at ?? "-"} after ${outcome.ran.join(" > ")} (order ${outcome.path.join(",")}) ${outcome.detail ?? ""}`;
const isCostMeasuring = (step: string) => /^instagram-cost-(?!dispatch)/.test(step);

describe("the handoff reading under an Inngest executor, whatever order it runs the planned steps in (ticket 13)", () => {
  it("the Instagram reading, with its images and identity steps, finishes in every order, and only tells the cost function once every group is recorded", async () => {
    const outcomes = await exploreEveryOrder(async () => {
      const t = makeTestDeps();
      const { scope, approver } = await openHandoff(t);
      await setSource(t, scope, approver, "instagram", "acme.oficial");
      const base = new FakeInstagramReader();
      let measured = 0;
      const sent: unknown[] = []; let recordedWhenSent: boolean | null = null;
      const reader = { profile: (handle: string) => base.profile(handle), measureCost: async () => { measured += 1; } };
      const enrichment: InstagramEnrichment = { images: async (data) => INSTAGRAM_IMAGES(data), identity: async () => ({ colors: ["#123456"] }) };
      const dispatchInstagramCost = async (data: unknown) => { sent.push(data); recordedWhenSent = allGroupsFinished(await currentHandoff(t, scope)); };
      const { handler, fnId } = served(createHandoffReadHandler(t.deps, { site: new FakeSiteReader(), instagram: reader }, undefined, enrichment, { dispatchInstagramCost }));
      return { handler, fnId, event: eventOf(await readEventData(t, scope)), after: async () => {
        const row = await currentHandoff(t, scope);
        expect(HANDOFF_GROUPS.map((g) => row.reading[g]?.status)).toEqual(["found", "found", "found", "not_found", "found", "found"]);
        expect(row.captured.colors).toEqual([expect.objectContaining({ value: "#123456" })]);
        expect(sent).toEqual([expect.objectContaining({ taskIntentId: (await readEventData(t, scope)).taskIntentId, handoffId: row.id })]);
        expect(recordedWhenSent).toBe(true);
        expect(measured).toBe(0); // the reading never measures: it holds the screen for those seconds
      } };
    });
    const last = outcomes.at(-1)!;
    expect(last.status, failure(last)).toBe("completed");
    expect(outcomes.length).toBeGreaterThan(1);
    // Whatever the order, the function has no step that measures, and its last step is the one that tells the cost function.
    for (const outcome of outcomes) {
      expect(outcome.ran.filter(isCostMeasuring), failure(outcome)).toEqual([]);
      expect(outcome.ran.at(-1), failure(outcome)).toMatch(/^instagram-cost-dispatch-/);
    }
  });

  it("the Instagram reading without a cost to measure finishes in every order too, and tells nothing", async () => {
    const outcomes = await exploreEveryOrder(async () => {
      const t = makeTestDeps();
      const { scope, approver } = await openHandoff(t);
      await setSource(t, scope, approver, "instagram", "acme.oficial");
      const enrichment: InstagramEnrichment = { images: async (data) => INSTAGRAM_IMAGES(data), identity: async () => ({ colors: ["#123456"] }) };
      const { handler, fnId } = served(createHandoffReadHandler(t.deps, { site: new FakeSiteReader(), instagram: new FakeInstagramReader() }, undefined, enrichment, { dispatchInstagramCost: async () => { throw new Error("nothing to tell"); } }));
      return { handler, fnId, event: eventOf(await readEventData(t, scope)), after: async () => { expect(allGroupsFinished(await currentHandoff(t, scope))).toBe(true); } };
    });
    const last = outcomes.at(-1)!;
    expect(last.status, failure(last)).toBe("completed");
    for (const outcome of outcomes) expect(outcome.ran.some((step) => step.startsWith("instagram-cost")), failure(outcome)).toBe(false);
  });

  it("the site reading, with its identity and images steps, finishes in every order", async () => {
    const outcomes = await exploreEveryOrder(async () => {
      const t = makeTestDeps();
      const { scope, approver } = await openHandoff(t);
      await setSource(t, scope, approver, "site", "https://acme.com");
      const enrichment: SiteEnrichment = { identity: async () => ({}), images: async (data: SiteReadResult) => data } as SiteEnrichment;
      const { handler, fnId } = served(createHandoffReadHandler(t.deps, { site: new FakeSiteReader(), instagram: new FakeInstagramReader() }, enrichment));
      return { handler, fnId, event: eventOf(await readEventData(t, scope)), after: async () => { expect(allGroupsFinished(await currentHandoff(t, scope))).toBe(true); } };
    });
    const last = outcomes.at(-1)!;
    expect(last.status, failure(last)).toBe("completed");
  });

  it("the partial Instagram reading of a profile found on the site (colors and images only) finishes in every order, and tells the cost function once", async () => {
    const outcomes = await exploreEveryOrder(async () => {
      const t = makeTestDeps();
      const { scope, data } = await partialInstagramReading(t);
      const sent: unknown[] = [];
      const reader = { profile: (handle: string) => new FakeInstagramReader().profile(handle), measureCost: async () => {} };
      const enrichment: InstagramEnrichment = { images: async (given) => INSTAGRAM_IMAGES(given), identity: async () => ({ colors: ["#123456"] }) };
      const { handler, fnId } = served(createHandoffReadHandler(t.deps, { site: new FakeSiteReader(), instagram: reader }, undefined, enrichment, { dispatchInstagramCost: async (event) => { sent.push(event); } }));
      return { handler, fnId, event: eventOf(data), after: async () => {
        const row = await currentHandoff(t, scope);
        // The groups carry one run per source: the Instagram runs are the ones this reading recorded.
        expect(readingRun(row.reading.colors, "instagram")).toMatchObject({ status: "found" });
        expect(readingRun(row.reading.images, "instagram")).toMatchObject({ status: "found" });
        expect(sent).toHaveLength(1);
      } };
    });
    const last = outcomes.at(-1)!;
    expect(last.status, failure(last)).toBe("completed");
    expect(outcomes.length).toBeGreaterThan(1);
  });

  it("the cost function, served on its own, measures the run of the reading in one step", async () => {
    const outcomes = await exploreEveryOrder(async () => {
      const context = { workspaceId: uuid(), accountId: uuid(), handoffId: uuid(), readingId: uuid(), taskIntentId: uuid() };
      const measured: unknown[] = [];
      const reader = { instagram: { profile: (handle: string) => new FakeInstagramReader().profile(handle), measureCost: async (given?: unknown) => { measured.push(given); } } };
      const { handler, fnId } = served(createInstagramCostHandler(reader), "equipe-handoff-instagram-cost", HANDOFF_INSTAGRAM_COST_EVENT);
      return { handler, fnId, event: eventOf(context, HANDOFF_INSTAGRAM_COST_EVENT), after: async () => { expect(measured).toEqual([context]); } };
    });
    const last = outcomes.at(-1)!;
    expect(last.status, failure(last)).toBe("completed");
    expect(last.ran).toEqual([expect.stringMatching(/^instagram-cost-/)]);
  });
});
