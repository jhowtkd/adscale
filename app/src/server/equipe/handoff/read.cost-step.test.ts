// The reading, and the step that tells the cost function which Apify run to measure, under Inngest-style re-execution (ticket 13, D-4): steps are memoized by id, so a
// function that dies and runs again repeats only what did not finish. The reading is read once, its groups are recorded once, and the cost function is told once;
// a reading that died before telling it tells it on the re-run. The reading itself never measures anything.
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

function readers() {
  const base = new FakeInstagramReader();
  const profile = vi.fn((handle: string) => base.profile(handle));
  const measureCost = vi.fn(async () => {});
  const dispatchInstagramCost = vi.fn(async () => {});
  return { profile, measureCost, dispatchInstagramCost, readers: { site: new FakeSiteReader(), instagram: { profile, measureCost } } };
}
const costId = (executed: string[]) => executed.filter(id => id.startsWith("instagram-cost-"));
/** Step ids carry the task intent of their handoff: compare them without it. */
const generic = (id: string) => id.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<id>");
const once = (ids: string[]) => ids.every(id => ids.indexOf(id) === ids.lastIndexOf(id));

describe("the handler under re-execution", () => {
  it("dies AFTER the last group was recorded, before the cost function was told: the re-run reads nothing, records nothing twice and only tells it", async () => {
    const f = await instagramReading();
    const r = readers();
    const d = durableSteps();
    d.state.crashAfter = id => id.startsWith("record-") && d.executed.filter(x => x.startsWith("record-")).length === HANDOFF_GROUPS.length;
    const handler = createHandoffReadHandler(f.t.deps, r.readers, undefined, undefined, { dispatchInstagramCost: r.dispatchInstagramCost });
    await expect(handler({ event: f.event, step: d.step })).rejects.toThrow("process_died");
    const afterFirst = await f.row();
    expect(afterFirst.reading.name).toMatchObject({ status: "found" });
    expect(r.dispatchInstagramCost).not.toHaveBeenCalled();
    const executedBefore = [...d.executed];
    d.revive();

    await expect(handler({ event: f.event, step: d.step })).resolves.toEqual({ recorded: HANDOFF_GROUPS.length });

    expect(d.executed.slice(executedBefore.length)).toEqual([`instagram-cost-dispatch-${f.event.data.taskIntentId}`]); // Only the dispatch ran again.
    expect(once(d.executed)).toBe(true);
    expect(r.profile).toHaveBeenCalledTimes(1);
    expect(r.dispatchInstagramCost).toHaveBeenCalledTimes(1);
    expect(r.measureCost).not.toHaveBeenCalled();
    const after = await f.row();
    expect(after.version).toBe(afterFirst.version); // No group was written a second time.
    expect(after.reading).toEqual(afterFirst.reading);
  });

  it("runs again after everything finished (a redelivery): it executes no step at all, reads nothing and tells nothing again", async () => {
    const f = await instagramReading();
    const r = readers();
    const d = durableSteps();
    const handler = createHandoffReadHandler(f.t.deps, r.readers, undefined, undefined, { dispatchInstagramCost: r.dispatchInstagramCost });
    await expect(handler({ event: f.event, step: d.step })).resolves.toEqual({ recorded: HANDOFF_GROUPS.length });
    const executedBefore = [...d.executed];
    const afterFirst = await f.row();

    await expect(handler({ event: f.event, step: d.step })).resolves.toEqual({ recorded: HANDOFF_GROUPS.length });

    expect(d.executed).toEqual(executedBefore); // Everything was memoized.
    expect(r.profile).toHaveBeenCalledTimes(1);
    expect(r.dispatchInstagramCost).toHaveBeenCalledTimes(1);
    expect(await f.row()).toEqual(afterFirst);
  });

  it("tells the cost function the same thing however many times it is asked: the event carries the reading's ids, so one event id covers a redelivery", async () => {
    const f = await instagramReading();
    const sent: unknown[] = [];
    const handler = createHandoffReadHandler(f.t.deps, readers().readers, undefined, undefined, { dispatchInstagramCost: async data => { sent.push(data); } });
    await handler({ event: f.event, step: durableSteps().step });
    await handler({ event: f.event, step: durableSteps().step }).catch(() => undefined); // a second delivery of the same reading, with no memory of the first
    expect(new Set(sent.map(data => JSON.stringify(data))).size).toBeLessThanOrEqual(1);
    expect(sent[0]).toMatchObject({ taskIntentId: f.event.data.taskIntentId, readingId: f.event.data.readingId });
  });

  it("whichever step the process dies after, the re-run finishes the same reading, reading once, recording each group once and telling the cost function once", async () => {
    const baseline = await instagramReading();
    const probe = durableSteps();
    await createHandoffReadHandler(baseline.t.deps, readers().readers, undefined, undefined, { dispatchInstagramCost: async () => {} })({ event: baseline.event, step: probe.step });
    const expectedReading = (await baseline.row()).reading;
    const ids = [...probe.executed];
    expect(ids.length).toBeGreaterThan(HANDOFF_GROUPS.length * 2);
    for (const crashId of ids) {
      const f = await instagramReading();
      const r = readers();
      const d = durableSteps();
      d.state.crashAfter = (id: string) => generic(id) === generic(crashId);
      const handler = createHandoffReadHandler(f.t.deps, r.readers, undefined, undefined, { dispatchInstagramCost: r.dispatchInstagramCost });
      await handler({ event: f.event, step: d.step }).catch(() => undefined);
      await new Promise(resolve => setTimeout(resolve, 20)); // Let anything that was already running finish and save.
      d.revive();
      const outcome = await handler({ event: f.event, step: d.step });
      expect(outcome, crashId).toMatchObject({ recorded: HANDOFF_GROUPS.length });
      expect(once(d.executed), `${crashId}: ${d.executed.join(",")}`).toBe(true);
      expect(r.profile, crashId).toHaveBeenCalledTimes(1);
      expect(r.dispatchInstagramCost, crashId).toHaveBeenCalledTimes(1);
      expect(r.measureCost, crashId).not.toHaveBeenCalled();
      expect(costId(d.executed), crashId).toEqual([expect.stringMatching(/^instagram-cost-dispatch-/)]);
      expect((await f.row()).reading, crashId).toMatchObject(Object.fromEntries(Object.entries(expectedReading).map(([g, run]) => [g, { status: run!.status }])));
    }
  });
});
