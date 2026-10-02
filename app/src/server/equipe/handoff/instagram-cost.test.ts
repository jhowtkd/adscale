import { describe, expect, it, vi } from "vitest";
import { createInstagramCostHandler } from "./instagram-cost";
import { claimHandoffProviderAttempt, loadHandoffInstagramRun, recordHandoffInstagramRun } from "./read";
import { FakeInstagramReader } from "./readers";
import { HANDOFF_INSTAGRAM_COST_EVENT, handoffInstagramCostEventSchema } from "./contract";
import { executeCommand } from "../module/commands";
import { makeTestDeps, uuid } from "../module/testing/deps";
import { HANDOFF_GROUPS } from "../domain/handoff";

const step = { run: async <T>(_id: string, fn: () => Promise<T>) => fn() };
const eventData = () => ({ workspaceId: uuid(), accountId: uuid(), handoffId: uuid(), readingId: uuid(), taskIntentId: uuid() });
const readerWith = (measureCost?: (context?: unknown) => Promise<void>) => ({ instagram: { profile: (handle: string) => new FakeInstagramReader().profile(handle), ...(measureCost ? { measureCost } : {}) } });

describe("createInstagramCostHandler: the function that reads the provider's cost after a reading (ticket 13, D-4)", () => {
  it("measures the run of the reading it was told about, in one step named after the reading's intent", async () => {
    const data = eventData();
    const measured: unknown[] = []; const steps: string[] = [];
    const handler = createInstagramCostHandler(readerWith(async (context) => { measured.push(context); }));

    const outcome = await handler({ event: { data }, step: { run: async (id, fn) => { steps.push(id); return fn(); } } });

    expect(outcome).toEqual({ measured: true });
    expect(measured).toEqual([data]);
    expect(steps).toEqual([`instagram-cost-${data.taskIntentId}`]);
  });

  it("does nothing, and says so, when the reader has no cost to measure (the fake)", async () => {
    const run = vi.fn(async <T>(_id: string, fn: () => Promise<T>) => fn());
    expect(await createInstagramCostHandler(readerWith())({ event: { data: eventData() }, step: { run } })).toEqual({ measured: false });
    expect(run).not.toHaveBeenCalled();
  });

  it("never fails, even if the measuring does: a cost that cannot be read stays unknown, and no recorded reading is touched", async () => {
    const handler = createInstagramCostHandler(readerWith(async () => { throw new Error("provider down"); }));
    expect(await handler({ event: { data: eventData() }, step })).toEqual({ measured: false });
  });

  it.each([
    ["a missing intent", (d: ReturnType<typeof eventData>) => Object.fromEntries(Object.entries(d).filter(([key]) => key !== "taskIntentId"))],
    ["an id that is not a uuid", (d: ReturnType<typeof eventData>) => ({ ...d, readingId: "reading-1" })],
    ["a field it does not know", (d: ReturnType<typeof eventData>) => ({ ...d, token: "secret" })],
  ])("refuses an event with %s, before measuring anything", async (_label, mutate) => {
    const measure = vi.fn(async () => {});
    await expect(createInstagramCostHandler(readerWith(measure))({ event: { data: mutate(eventData()) }, step })).rejects.toThrow();
    expect(measure).not.toHaveBeenCalled();
  });

  it("the event is what the reading sends and only that: ids, never content", () => {
    expect(HANDOFF_INSTAGRAM_COST_EVENT).toBe("equipe.handoff.instagram_cost");
    expect(Object.keys(handoffInstagramCostEventSchema.shape).sort()).toEqual(["accountId", "handoffId", "readingId", "taskIntentId", "workspaceId"]);
  });

  it("records the usage once per reading, however many times it is delivered, with the run the reading's own events saved", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid(); const userId = `user-${uuid()}`;
    t.store.workspaceMembers.rows.set(uuid(), { id: uuid(), workspaceId, userId, name: "Ana", email: "ana@example.com", emailVerified: true, role: "owner", createdAt: new Date("2026-01-01T00:00:00.000Z") });
    const opened = await executeCommand(t.deps, { actor: { kind: "system", job: "free-open" }, workspaceId }, { type: "open_free_account", payload: { userId } });
    if (!opened.ok) throw new Error(opened.error.code);
    const accountId = opened.value.accountId!;
    const scope = { workspaceId, accountId };
    const people = await t.deps.uow.repos.people.list(scope);
    const [row] = await t.deps.uow.repos.handoffs.list(scope);
    const set = await executeCommand(t.deps, { actor: { kind: "client_person", role: "approver", personId: people[0]!.id }, workspaceId, accountId }, { type: "handoff_set_source", payload: { expectedStep: row!.step, expectedVersion: row!.version, kind: "instagram", value: "acme.oficial" } });
    if (!set.ok) throw new Error(set.error.code);
    const reading = (await t.deps.uow.repos.handoffs.list(scope))[0]!;
    const taskIntentId = reading.reading[HANDOFF_GROUPS[0]]!.taskIntentId;
    const context = { workspaceId, accountId, handoffId: reading.id, readingId: reading.readingId, taskIntentId };
    expect(await claimHandoffProviderAttempt(t.deps, context, "instagram")).toBe(true);
    await recordHandoffInstagramRun(t.deps, context, "run-1");
    // What the Apify reader does: the run the reading saved, and what the provider charged for it.
    const handler = createInstagramCostHandler(readerWith(async () => { await recordHandoffInstagramRun(t.deps, context, (await loadHandoffInstagramRun(t.deps, context))!, 0.0123); }));

    await handler({ event: { data: context }, step });
    await handler({ event: { data: context }, step });

    const usage = (await t.deps.uow.repos.events.list(scope, { eventType: "handoff.instagram_usage" })).filter((e) => (e.payload as { taskIntentId?: string }).taskIntentId === taskIntentId);
    expect(usage).toHaveLength(1);
    expect(usage[0]!.payload).toMatchObject({ providerRunId: "run-1", usageTotalUsd: 0.0123, costPending: false });
  });
});
