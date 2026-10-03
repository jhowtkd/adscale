// A failure of the SYSTEM in the images of a reading (ticket 17, fixup 01) under Inngest-style re-execution: steps are memoized by id and only SUCCESSES are kept, a step that threw runs
// again. The reading counter of the person is given back once per reading (never per step, never twice), a step that fails twice is recorded as `raster_system_failed` and the reading
// goes on, the steps that did finish (the reader, the identity with its paid call to the model) are never run again, and a reading that asks only for images asks for nothing else.
import { describe, expect, it, vi } from "vitest";
import { createHandoffReadHandler } from "./read";
import { FakeInstagramReader, FakeSiteReader, type InstagramReadResult } from "./readers";
import type { InstagramEnrichment } from "./instagram-enrichment";
import type { SiteEnrichment } from "./site-enrichment";
import { RasterRetryError } from "./raster-image";
import { executeCommand } from "../module/commands";
import { makeTestDeps, uuid } from "../module/testing/deps";
import { HANDOFF_GROUPS, type HandoffGroup } from "../domain/handoff";

type Deps = ReturnType<typeof makeTestDeps>;

async function open(kind: "site" | "instagram") {
  const t = makeTestDeps();
  const workspaceId = uuid(), userId = `user-${uuid()}`;
  t.store.workspaceMembers.rows.set(uuid(), { id: uuid(), workspaceId, userId, name: "Ana", email: "ana@example.com", emailVerified: true, role: "owner", createdAt: new Date("2026-01-01T00:00:00.000Z") });
  const opened = await executeCommand(t.deps, { actor: { kind: "system", job: "free-open" }, workspaceId }, { type: "open_free_account", payload: { userId } });
  if (!opened.ok) throw new Error(opened.error.code);
  const scope = { workspaceId, accountId: opened.value.accountId! };
  const [person] = await t.deps.uow.repos.people.list(scope);
  const approver = { kind: "client_person", role: "approver", personId: person!.id } as const;
  const row = async () => (await t.deps.uow.repos.handoffs.list(scope))[0]!;
  const h = await row();
  const set = await executeCommand(t.deps, { ...scope, actor: approver }, { type: "handoff_set_source", payload: { expectedStep: h.step, expectedVersion: h.version, kind, value: kind === "site" ? "https://acme.com" : "acme.oficial" } });
  if (!set.ok) throw new Error(set.error.code);
  const reading = await row();
  const event = (groups: readonly HandoffGroup[] = HANDOFF_GROUPS) => ({ data: { ...scope, taskIntentId: reading.reading[groups[0]!]!.taskIntentId, readingId: reading.readingId, source: reading.source, groups: [...groups],
    runIds: Object.fromEntries(groups.map(g => [g, reading.reading[g]!.runId])) } });
  /** A reading that asks for some groups only, as the module writes when the person corrects only some: the intent of the outbox says the same as the event (the gate compares them). */
  const subset = async (groups: readonly HandoffGroup[]) => {
    const e = event(groups);
    for (const [key, row] of t.store.taskOutbox.rows) if (row.id === e.data.taskIntentId) t.store.taskOutbox.rows.set(key, { ...row, data: { readingId: e.data.readingId, source: e.data.source, groups: e.data.groups, runIds: e.data.runIds } });
    return e;
  };
  return { t, scope, row, event, subset, readsUsedAtStart: reading.readsUsed };
}

/** Steps memoized by id like Inngest: a step that threw is not kept and runs again on the next execution of the function. `serialize` plays Inngest handing a failure back as a plain `StepError` (the message only). */
function steps(options: { serialize?: boolean } = {}) {
  const cache = new Map<string, unknown>(); const ran: string[] = [];
  const step = { run: async <T,>(id: string, fn: () => Promise<T>): Promise<T> => {
    if (cache.has(id)) return cache.get(id) as T;
    ran.push(id);
    try { const value = await fn(); cache.set(id, value); return value; }
    catch (error) { throw options.serialize && error instanceof Error ? Object.assign(new Error(error.message), { name: "StepError" }) : error; }
  } };
  return { step, cache, ran, count: (prefix: string) => ran.filter(id => id.startsWith(prefix)).length };
}
const attempt = async (promise: Promise<unknown>) => { try { return { value: await promise }; } catch (error) { return { error }; } };
const retryEvents = async (t: Deps, scope: { workspaceId: string; accountId: string }) => (await t.deps.uow.repos.events.list(scope, { eventType: "handoff.raster_retry" })).map(e => { const { stage, attempts, reason } = e.payload as { stage: string; attempts: number; reason: string }; return { stage, attempts, reason }; });
const allEventTypes = async (t: Deps, scope: { workspaceId: string; accountId: string }) => (await t.deps.uow.repos.events.list(scope)).map(e => e.eventType);

/** The enrichment of a site whose images step fails with the failures given (one entry for each call), and whose identity makes ONE paid call to the model each time it runs. */
function siteEnrichment(plan: { images?: Array<RasterRetryError | "ok">; identity?: Array<RasterRetryError | "ok"> }) {
  const calls = { images: 0, identity: 0, model: 0 };
  const enrichment: SiteEnrichment = {
    async identity(data) {
      const n = calls.identity++, outcome = plan.identity?.[n] ?? "ok";
      if (outcome !== "ok") throw outcome;
      calls.model++; // the paid call: made once the images of the identity are in
      return { branding: { ...data.branding, colors: ["#123456"], fonts: [] }, groupErrors: {} };
    },
    async images() {
      const n = calls.images++, outcome = plan.images?.[n] ?? "ok";
      if (outcome !== "ok") throw outcome;
      return { images: [{ url: "https://r2.example/a.jpg", key: "k-a", width: 900, height: 900 }] as never };
    },
  };
  return { enrichment, calls };
}
const reader = (kind: "site" | "instagram") => { const site = new FakeSiteReader(), instagram = new FakeInstagramReader(); return { readers: { site, instagram }, read: kind === "site" ? site : instagram }; };
const retry = (reason: "capacity" | "wait_timeout" | "unavailable" = "unavailable") => new RasterRetryError(reason);

describe("a site reading whose images step fails for a reason of the system", () => {
  it("fails once, then works: the step is retried, the counter of the person is given back ONCE, and the reader, the identity and the paid call are never repeated", async () => {
    const f = await open("site");
    const { enrichment, calls } = siteEnrichment({ images: [retry("capacity"), "ok"] });
    const { readers, read } = reader("site");
    const handler = createHandoffReadHandler(f.t.deps, readers, enrichment);
    const s = steps();
    const first = await attempt(handler({ event: f.event(), step: s.step }));
    expect(first.error).toMatchObject({ reason: "capacity" }); // the function fails, the executor retries it
    expect((await f.row()).readsUsed).toBe(f.readsUsedAtStart - 1);
    expect((await f.row()).reading.images).toMatchObject({ status: "running" }); // nothing was recorded as "not found" or "failed" for the images
    const second = await attempt(handler({ event: f.event(), step: s.step }));
    expect(second.error).toBeUndefined();
    expect(read.calls).toHaveLength(1); // the reader is a memoized step
    expect(calls).toEqual({ images: 2, identity: 1, model: 1 }); // the identity and its paid call were not repeated
    expect(s.count("site-images-")).toBe(2);
    expect(s.count("site-identity-")).toBe(1);
    expect(await retryEvents(f.t, f.scope)).toEqual([{ stage: "site-images", attempts: 1, reason: "capacity" }]);
    expect((await f.row()).readsUsed).toBe(f.readsUsedAtStart - 1); // given back once, not again by the second pass
    expect((await f.row()).reading.images).toMatchObject({ status: "found" });
  });

  it("fails twice: the step ends as `raster_system_failed` (a failed group, never 'not found'), the reading finishes, nothing is asked of the model again, and the counter was given back once", async () => {
    const f = await open("site");
    const { enrichment, calls } = siteEnrichment({ images: [retry("unavailable"), retry("unavailable")] });
    const { readers } = reader("site");
    const handler = createHandoffReadHandler(f.t.deps, readers, enrichment);
    const s = steps();
    expect((await attempt(handler({ event: f.event(), step: s.step }))).error).toMatchObject({ reason: "unavailable" });
    const second = await attempt(handler({ event: f.event(), step: s.step }));
    expect(second.error).toBeUndefined();
    expect(second.value).toEqual({ recorded: HANDOFF_GROUPS.length });
    expect(calls).toEqual({ images: 2, identity: 1, model: 1 }); // no third attempt, no second paid call
    const row = await f.row();
    expect(row.reading.images).toMatchObject({ status: "failed", error: "raster_system_failed" });
    expect(row.readsUsed).toBe(f.readsUsedAtStart - 1);
    expect(await retryEvents(f.t, f.scope)).toEqual([{ stage: "site-images", attempts: 1, reason: "unavailable" }, { stage: "site-images", attempts: 2, reason: "unavailable" }]);
    // The rest of the reading is untouched by it, and the handler never reaches any ledger of the provider or of the model: only its own events were written.
    expect(row.reading.name).toMatchObject({ status: "found" });
    expect((await allEventTypes(f.t, f.scope)).filter(type => /dispatched|budget|ledger|model|ai_/i.test(type))).toEqual([]);
  });

  it("the identity and the images both fail in the same reading: still ONE refund of the counter, each stage counts its own attempts, and a stage that fails twice is terminal while the other can still succeed", async () => {
    const f = await open("site");
    const initial = await f.row();
    await f.t.deps.uow.repos.handoffs.update(f.scope, initial.id, { readsUsed: 3 }); // A double refund would leave 1: clamping zero must not hide it.
    const { enrichment, calls } = siteEnrichment({ images: [retry(), retry()], identity: [retry("wait_timeout"), "ok"] });
    const handler = createHandoffReadHandler(f.t.deps, reader("site").readers, enrichment);
    const s = steps();
    expect((await attempt(handler({ event: f.event(), step: s.step }))).error).toBeDefined();
    expect((await f.row()).readsUsed).toBe(2); // two stages failed at once: one refund
    expect((await attempt(handler({ event: f.event(), step: s.step }))).error).toBeUndefined();
    const events = await retryEvents(f.t, f.scope);
    expect(events.filter(e => e.stage === "site-images").map(e => e.attempts)).toEqual([1, 2]);
    expect(events.filter(e => e.stage === "site-identity").map(e => e.attempts)).toEqual([1]);
    expect((await f.row()).readsUsed).toBe(2);
    const row = await f.row();
    expect(row.reading.images).toMatchObject({ status: "failed", error: "raster_system_failed" });
    expect(row.reading.colors).toMatchObject({ status: "found" }); // the identity worked on its second pass
    expect(calls.model).toBe(1);
  });

  it("the identity that fails twice is terminal for logo, colors and fonts (raster_system_failed) and the model is never called", async () => {
    const f = await open("site");
    const { enrichment, calls } = siteEnrichment({ identity: [retry(), retry()] });
    const handler = createHandoffReadHandler(f.t.deps, reader("site").readers, enrichment);
    const s = steps();
    await attempt(handler({ event: f.event(), step: s.step }));
    expect((await attempt(handler({ event: f.event(), step: s.step }))).error).toBeUndefined();
    const row = await f.row();
    for (const group of ["logo", "colors", "fonts"] as const) expect(row.reading[group], group).toMatchObject({ status: "failed", error: "raster_system_failed" });
    expect(calls.model).toBe(0);
  });

  it("the failure that Inngest hands back as a plain StepError (the message only) is still the system's: the group is left unfinished for the retry, never recorded as 'reading_failed'", async () => {
    const f = await open("site");
    const { enrichment } = siteEnrichment({ images: [retry("wait_timeout"), "ok"] });
    const handler = createHandoffReadHandler(f.t.deps, reader("site").readers, enrichment);
    const s = steps({ serialize: true });
    const first = await attempt(handler({ event: f.event(), step: s.step }));
    expect(first.error).toBeInstanceOf(Error);
    expect(String((first.error as Error).message)).toBe("raster_retry:wait_timeout");
    expect((await f.row()).reading.images).toMatchObject({ status: "running" });
    expect((await attempt(handler({ event: f.event(), step: s.step }))).error).toBeUndefined();
    expect((await f.row()).reading.images).toMatchObject({ status: "found" });
  });

  it("an error that is not the system's (a plain failure of the enrichment) never refunds and never writes a raster event: it is the reading that failed, as before", async () => {
    const f = await open("site");
    const enrichment: SiteEnrichment = { identity: async data => ({ branding: data.branding }), images: async () => { throw new Error("db_down"); } };
    const handler = createHandoffReadHandler(f.t.deps, reader("site").readers, enrichment);
    await attempt(handler({ event: f.event(), step: steps().step }));
    expect(await retryEvents(f.t, f.scope)).toEqual([]);
    expect((await f.row()).readsUsed).toBe(f.readsUsedAtStart);
    expect((await f.row()).reading.images).toMatchObject({ status: "failed", error: "reading_failed" });
  });

  it("a reading that asks only for the images asks for nothing else: the identity step does not exist and the model is not called; one that asks only for the logo does not read the images", async () => {
    const f = await open("site");
    const { enrichment, calls } = siteEnrichment({});
    const handler = createHandoffReadHandler(f.t.deps, reader("site").readers, enrichment);
    const s = steps();
    await handler({ event: await f.subset(["images"]), step: s.step });
    expect(calls).toEqual({ images: 1, identity: 0, model: 0 });
    expect(s.count("site-identity-")).toBe(0);
    const g = await open("site");
    const other = siteEnrichment({});
    const s2 = steps();
    await createHandoffReadHandler(g.t.deps, reader("site").readers, other.enrichment)({ event: await g.subset(["logo"]), step: s2.step });
    expect(other.calls).toEqual({ images: 0, identity: 1, model: 1 });
    expect(s2.count("site-images-")).toBe(0);
  });
});

describe("an Instagram reading whose images step fails for a reason of the system", () => {
  const instagramEnrichment = (plan: { images?: Array<RasterRetryError | "ok"> }) => {
    const calls = { images: 0, identity: 0 };
    const enrichment: InstagramEnrichment = {
      async images(data: InstagramReadResult) {
        const n = calls.images++, outcome = plan.images?.[n] ?? "ok";
        if (outcome !== "ok") throw outcome;
        return { ...data, avatarUrl: "https://r2.example/avatar.jpg", avatarKey: "k-avatar", posts: [{ imageUrl: "https://r2.example/p1.jpg", caption: "c1", key: "k-p1" }] } as InstagramReadResult;
      },
      async identity() { calls.identity++; return { colors: ["#123456"] }; },
    };
    return { enrichment, calls };
  };
  const build = async (plan: Parameters<typeof instagramEnrichment>[0]) => {
    const f = await open("instagram"); const e = instagramEnrichment(plan); const r = reader("instagram");
    return { f, e, r, handler: createHandoffReadHandler(f.t.deps, r.readers, undefined, e.enrichment) };
  };

  it("fails once, then works: one refund, the profile is read once, and the palette (the model) is asked for once, after the images are in", async () => {
    const { f, e, r, handler } = await build({ images: [retry("capacity"), "ok"] });
    const s = steps();
    expect((await attempt(handler({ event: f.event(), step: s.step }))).error).toMatchObject({ reason: "capacity" });
    expect((await f.row()).readsUsed).toBe(f.readsUsedAtStart - 1);
    expect((await attempt(handler({ event: f.event(), step: s.step }))).error).toBeUndefined();
    expect(r.read.calls).toHaveLength(1);
    expect(e.calls).toEqual({ images: 2, identity: 1 });
    expect((await f.row()).readsUsed).toBe(f.readsUsedAtStart - 1);
    expect((await f.row()).reading.colors).toMatchObject({ status: "found" });
  });

  it("fails twice: logo, images and colors are `raster_system_failed`, the palette is never asked for (the images it would read are not there), and the reading finishes", async () => {
    const { f, e, handler } = await build({ images: [retry(), retry()] });
    const s = steps();
    await attempt(handler({ event: f.event(), step: s.step }));
    const second = await attempt(handler({ event: f.event(), step: s.step }));
    expect(second.error).toBeUndefined();
    const row = await f.row();
    for (const group of ["logo", "images", "colors"] as const) expect(row.reading[group], group).toMatchObject({ status: "failed", error: "raster_system_failed" });
    expect(e.calls.identity).toBe(0);
    expect(row.readsUsed).toBe(f.readsUsedAtStart - 1);
    expect(await retryEvents(f.t, f.scope)).toHaveLength(2);
    expect((await allEventTypes(f.t, f.scope)).filter(type => /dispatched|budget|ledger|model|ai_/i.test(type))).toEqual([]);
  });

  it("a reading that asks only for the images (no logo, no colors) never runs the identity; one that asks for the colors runs the images first and then the identity", async () => {
    const { f, e, handler } = await build({});
    const s = steps();
    await handler({ event: await f.subset(["images"]), step: s.step });
    expect(e.calls).toEqual({ images: 1, identity: 0 });
    expect(s.count("instagram-identity-")).toBe(0);
    const g = await build({}); const s2 = steps();
    await g.handler({ event: await g.f.subset(["colors"]), step: s2.step });
    expect(g.e.calls).toEqual({ images: 1, identity: 1 });
    expect(s2.ran.findIndex(id => id.startsWith("instagram-images-"))).toBeLessThan(s2.ran.findIndex(id => id.startsWith("instagram-identity-")));
  });
});

describe("the reading counter is given back by the first failure of the system of a reading and by nothing else", () => {
  it("two different readings of the same account each get their own single refund", async () => {
    const f = await open("site");
    const { enrichment } = siteEnrichment({ images: [retry(), "ok"] });
    const handler = createHandoffReadHandler(f.t.deps, reader("site").readers, enrichment);
    const s = steps();
    await attempt(handler({ event: f.event(), step: s.step }));
    await attempt(handler({ event: f.event(), step: s.step }));
    expect((await f.row()).readsUsed).toBe(f.readsUsedAtStart - 1);
    const spy = vi.spyOn(f.t.deps.uow, "run");
    await attempt(handler({ event: f.event(), step: s.step })); // a redelivery of the finished reading: nothing is given back, nothing new is written
    spy.mockRestore();
    expect((await f.row()).readsUsed).toBe(f.readsUsedAtStart - 1);
    expect(await retryEvents(f.t, f.scope)).toHaveLength(1);
  });
});
