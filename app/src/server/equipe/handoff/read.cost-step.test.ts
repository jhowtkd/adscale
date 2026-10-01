// The Apify cost step under Inngest-style re-execution (ticket 13, D-4): steps are memoized by id, so a function that dies and runs again repeats only
// what did not finish. The reading is read once, its groups are recorded once, and the cost is measured once; a cost that had not finished is measured on the re-run.
import { describe, expect, it, vi } from "vitest";
import { createHandoffReadHandler } from "./read";
import { FakeInstagramReader, FakeSiteReader } from "./readers";
import { executeCommand } from "../module/commands";
import { makeTestDeps, uuid } from "../module/testing/deps";
import { HANDOFF_GROUPS } from "../domain/handoff";

async function instagramReading() {
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
  const set = await executeCommand(t.deps, { ...scope, actor: approver }, { type: "handoff_set_source", payload: { expectedStep: h.step, expectedVersion: h.version, kind: "instagram", value: "acme.oficial" } });
  if (!set.ok) throw new Error(set.error.code);
  const reading = await row();
  const event = { data: { ...scope, taskIntentId: reading.reading[HANDOFF_GROUPS[0]]!.taskIntentId, readingId: reading.readingId, source: reading.source, groups: [...HANDOFF_GROUPS],
    runIds: Object.fromEntries(HANDOFF_GROUPS.map(g => [g, reading.reading[g]!.runId])) } };
  return { t, scope, row, event };
}

/** A step runner that memoizes by id like Inngest and can be killed: once dead no new step starts, and a step that was running still saves its result. */
function durableSteps() {
  const cache = new Map<string, unknown>();
  const executed: string[] = [];
  const state = { dead: false, crashAfter: null as string | ((id: string) => boolean) | null };
  const crash = new Error("process_died");
  const step = { run: async <T,>(id: string, fn: () => Promise<T>): Promise<T> => {
    if (cache.has(id)) return cache.get(id) as T;
    if (state.dead) throw crash;
    executed.push(id);
    const value = await fn();
    cache.set(id, value);
    const hit = typeof state.crashAfter === "function" ? state.crashAfter(id) : state.crashAfter === id;
    if (hit && !state.dead) { state.dead = true; throw crash; }
    return value;
  } };
  return { step, cache, executed, state, revive: () => { state.dead = false; state.crashAfter = null; } };
}

function readers(options: { gate?: Promise<void> } = {}) {
  const base = new FakeInstagramReader();
  const profile = vi.fn((handle: string) => base.profile(handle));
  const measureCost = vi.fn(async () => { await options.gate; });
  return { profile, measureCost, readers: { site: new FakeSiteReader(), instagram: { profile, measureCost } } };
}
const costId = (executed: string[]) => executed.filter(id => id.startsWith("instagram-cost-"));
/** Step ids carry the task intent of their handoff: compare them without it. */
const generic = (id: string) => id.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<id>");
const once = (ids: string[]) => ids.every(id => ids.indexOf(id) === ids.lastIndexOf(id));

describe("the handler under re-execution", () => {
  it("dies AFTER the groups were recorded and the cost was measured: the re-run reads nothing, records nothing twice and measures nothing again", async () => {
    const f = await instagramReading();
    const r = readers();
    const d = durableSteps();
    const lastRecord = (id: string) => id.startsWith("record-") && d.executed.filter(x => x.startsWith("record-")).length === HANDOFF_GROUPS.length;
    d.state.crashAfter = lastRecord;
    const handler = createHandoffReadHandler(f.t.deps, r.readers);
    await expect(handler({ event: f.event, step: d.step })).rejects.toThrow("process_died");
    await vi.waitFor(() => expect([...d.cache.keys()].some(id => id.startsWith("instagram-cost-"))).toBe(true));
    const afterFirst = await f.row();
    expect(afterFirst.reading.name).toMatchObject({ status: "found" });
    const executedBefore = [...d.executed];
    d.revive();
    await expect(handler({ event: f.event, step: d.step })).resolves.toEqual({ recorded: HANDOFF_GROUPS.length });
    expect(d.executed).toEqual(executedBefore); // The re-run executed no step at all: everything was memoized.
    expect(once(d.executed)).toBe(true);
    expect(r.profile).toHaveBeenCalledTimes(1);
    expect(r.measureCost).toHaveBeenCalledTimes(1);
    const after = await f.row();
    expect(after.version).toBe(afterFirst.version); // No group was written a second time.
    expect(after.reading).toEqual(afterFirst.reading);
  });

  it("dies BEFORE the cost step finished: the groups and the reading stay as they were, and the cost is measured on the re-run", async () => {
    const f = await instagramReading();
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    const first = readers({ gate });
    const d = durableSteps();
    const handler = createHandoffReadHandler(f.t.deps, first.readers);
    // The first run is still waiting for the cost (it would be killed here): abandon it once every group is recorded.
    const running = handler({ event: f.event, step: d.step }).catch(() => undefined);
    void running;
    await vi.waitFor(async () => expect((await f.row()).step).toBe("identity"));
    expect(first.measureCost).toHaveBeenCalledTimes(1);
    expect(d.cache.has(`instagram-cost-${f.event.data.taskIntentId}`)).toBe(false);
    d.state.dead = true; // The process died: nothing started by the first run counts any more.
    const savedCache = new Map([...d.cache].filter(([id]) => !id.startsWith("instagram-cost-")));
    const executedBefore = d.executed.filter(id => !id.startsWith("instagram-cost-"));
    const afterFirst = await f.row();

    const second = readers();
    const again = durableSteps();
    for (const [id, value] of savedCache) again.cache.set(id, value);
    await createHandoffReadHandler(f.t.deps, second.readers)({ event: f.event, step: again.step });
    expect(again.executed).toEqual([`instagram-cost-${f.event.data.taskIntentId}`]); // Only the cost step ran again.
    expect(second.profile).not.toHaveBeenCalled();
    expect(second.measureCost).toHaveBeenCalledTimes(1);
    expect(await f.row()).toEqual(afterFirst);
    expect(executedBefore.length).toBeGreaterThan(HANDOFF_GROUPS.length);
    release();
  });

  it("whichever step the process dies after, the re-run finishes the same reading, reading once, recording each group once and measuring the cost once", async () => {
    const baseline = await instagramReading();
    const probe = durableSteps();
    await createHandoffReadHandler(baseline.t.deps, readers().readers)({ event: baseline.event, step: probe.step });
    const expectedReading = (await baseline.row()).reading;
    const ids = [...probe.executed];
    expect(ids.length).toBeGreaterThan(HANDOFF_GROUPS.length * 2);
    for (const crashId of ids) {
      const f = await instagramReading();
      const r = readers();
      const d = durableSteps();
      d.state.crashAfter = (id: string) => generic(id) === generic(crashId);
      const handler = createHandoffReadHandler(f.t.deps, r.readers);
      await handler({ event: f.event, step: d.step }).catch(() => undefined);
      await new Promise(resolve => setTimeout(resolve, 20)); // Let anything that was already running finish and save.
      d.revive();
      const outcome = await handler({ event: f.event, step: d.step });
      expect(outcome, crashId).toMatchObject({ recorded: HANDOFF_GROUPS.length });
      expect(once(d.executed), `${crashId}: ${d.executed.join(",")}`).toBe(true);
      expect(r.profile, crashId).toHaveBeenCalledTimes(1);
      expect(r.measureCost, crashId).toHaveBeenCalledTimes(1);
      expect(costId(d.executed), crashId).toHaveLength(1);
      expect((await f.row()).reading, crashId).toMatchObject(Object.fromEntries(Object.entries(expectedReading).map(([g, run]) => [g, { status: run!.status }])));
    }
  });
});
