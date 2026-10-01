// The Firecrawl credits as account events, over random readings (ticket 13, D-5): one `handoff.site_usage` per reading at most, with the credits the provider
// reported, none when they are unknown or the failure was not charged, never for Instagram, and never a reason for a reading to fail.
import { describe, expect, it, vi } from "vitest";
import { createHandoffReadHandler, recordHandoffSiteUsage } from "./read";
import { FakeInstagramReader, FakeSiteReader, type SiteReader, type SiteReadResult } from "./readers";
import { SiteReaderError } from "./readers/firecrawl";
import { executeCommand } from "../module/commands";
import { makeTestDeps, uuid } from "../module/testing/deps";
import { HANDOFF_GROUPS } from "../domain/handoff";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = <T,>(r: () => number, items: readonly T[]): T => items[Math.floor(r() * items.length)]!;
const step = { run: async <T,>(_id: string, fn: () => Promise<T>) => fn() };

const page = (creditsUsed?: number): SiteReadResult => ({ title: "Acme", siteName: "Acme", markdown: "Acme vende café.", links: [], images: [], screenshotUrl: null, statusCode: 200,
  ...(creditsUsed !== undefined ? { creditsUsed } : {}) });

type Outcome = { name: string; result: SiteReadResult | Error; charged: number | null };
const OUTCOMES = (r: () => number): Outcome[] => {
  const credits = pick(r, [0, 1, 1, 2, 5, 12]);
  return [
    { name: "page with credits", result: page(credits), charged: credits },
    { name: "page without credits", result: page(), charged: null },
    { name: "charged 404 with credits", result: new SiteReaderError("site_unavailable", false, credits), charged: credits },
    { name: "charged 404 without credits", result: new SiteReaderError("site_unavailable", false), charged: null },
    { name: "DNS, not charged", result: new SiteReaderError("site_dns_or_address", true), charged: null },
    { name: "provider DNS, not charged", result: new SiteReaderError("site_provider_dns", true), charged: null },
    { name: "transient failure", result: new SiteReaderError("reading_failed"), charged: null },
    { name: "unknown error", result: new Error("boom"), charged: null },
  ];
};

async function account(source: "site" | "instagram") {
  const t = makeTestDeps();
  const workspaceId = uuid(), userId = `user-${uuid()}`;
  t.store.workspaceMembers.rows.set(uuid(), { id: uuid(), workspaceId, userId, name: "Ana", email: "a@x.com", emailVerified: true, role: "owner", createdAt: new Date("2026-01-01T00:00:00.000Z") });
  const opened = await executeCommand(t.deps, { actor: { kind: "system", job: "free-open" }, workspaceId }, { type: "open_free_account", payload: { userId } });
  if (!opened.ok) throw new Error(opened.error.code);
  const scope = { workspaceId, accountId: opened.value.accountId! };
  const [person] = await t.deps.uow.repos.people.list(scope);
  const approver = { kind: "client_person", role: "approver", personId: person!.id } as const;
  const row = async () => (await t.deps.uow.repos.handoffs.list(scope))[0]!;
  const setSource = async (value: string) => {
    const h = await row();
    const out = await executeCommand(t.deps, { ...scope, actor: approver }, { type: "handoff_set_source", payload: { expectedStep: h.step, expectedVersion: h.version, kind: source, value } });
    if (!out.ok) throw new Error(out.error.code);
    const reading = await row();
    return { data: { ...scope, taskIntentId: reading.reading[HANDOFF_GROUPS[0]]!.taskIntentId, readingId: reading.readingId, source: reading.source, groups: [...HANDOFF_GROUPS],
      runIds: Object.fromEntries(HANDOFF_GROUPS.map(g => [g, reading.reading[g]!.runId])) } };
  };
  const usage = async () => t.deps.uow.repos.events.list(scope, { eventType: "handoff.site_usage" });
  return { t, scope, row, setSource, usage };
}

describe("handoff.site_usage over random readings", () => {
  it("records at most one event per reading, with the credits the provider reported, for 150 random accounts", async () => {
    const r = rng(2026);
    let recorded = 0, skipped = 0, redelivered = 0;
    for (let i = 0; i < 150; i++) {
      const a = await account("site");
      const expectedByIntent = new Map<string, number | null>();
      const readings = 1 + Math.floor(r() * 3); // The account allows three readings.
      for (let n = 0; n < readings; n++) {
        const outcome = pick(r, OUTCOMES(r));
        const event = await a.setSource(`https://acme${n}.com`);
        const handler = createHandoffReadHandler(a.t.deps, { site: new FakeSiteReader(outcome.result), instagram: new FakeInstagramReader() });
        const result = await handler({ event, step });
        // A reading never fails because of how its credits were recorded.
        expect(result, outcome.name).toEqual({ recorded: HANDOFF_GROUPS.length });
        expectedByIntent.set(event.data.taskIntentId, outcome.charged);
        if (r() < 0.4) { await handler({ event, step }); redelivered++; } // The same event delivered again.
        const events = await a.usage();
        for (const [intent, charged] of expectedByIntent) {
          const mine = events.filter(e => (e.payload as { taskIntentId: string }).taskIntentId === intent);
          expect(mine.length, `${outcome.name} ${intent}`).toBe(charged === null ? 0 : 1);
          if (charged !== null) {
            expect(mine[0]!.payload).toEqual({ taskIntentId: intent, readingId: expect.any(String), creditsUsed: charged });
            expect(mine[0]).toMatchObject({ actorType: "system", eventType: "handoff.site_usage" });
          }
        }
        if (outcome.charged === null) skipped++; else recorded++;
      }
      // No event belongs to a reading that was not read, and the total is exactly the charged readings.
      expect((await a.usage()).length).toBe([...expectedByIntent.values()].filter(c => c !== null).length);
    }
    expect(recorded).toBeGreaterThan(80);
    expect(skipped).toBeGreaterThan(80);
    expect(redelivered).toBeGreaterThan(30);
  }, 60_000);

  it("the recorder is idempotent per reading under any repetition: the first credits win, one event per reading (80 random sequences)", async () => {
    const r = rng(3);
    for (let i = 0; i < 80; i++) {
      const a = await account("site");
      const intents = Array.from({ length: 1 + Math.floor(r() * 3) }, () => uuid());
      const first = new Map<string, number>();
      for (let n = 0; n < 12; n++) {
        const intent = pick(r, intents), credits = Math.floor(r() * 20);
        if (!first.has(intent)) first.set(intent, credits);
        await recordHandoffSiteUsage(a.t.deps, { ...a.scope, readingId: uuid(), taskIntentId: intent }, credits);
      }
      const events = await a.usage();
      expect(events).toHaveLength(first.size);
      for (const [intent, credits] of first) expect(events.find(e => (e.payload as { taskIntentId: string }).taskIntentId === intent)!.payload).toMatchObject({ creditsUsed: credits });
    }
  });

  it("never records a site charge for an Instagram source, whatever the site reader would say", async () => {
    const r = rng(5);
    for (let i = 0; i < 40; i++) {
      const a = await account("instagram");
      const event = await a.setSource("acme.oficial");
      const reader: SiteReader = { read: vi.fn(async () => page(pick(r, [0, 1, 7]))) };
      await createHandoffReadHandler(a.t.deps, { site: reader, instagram: new FakeInstagramReader() })({ event, step });
      expect(await a.usage()).toHaveLength(0);
      expect(reader.read).not.toHaveBeenCalled();
    }
  });

  it("an event that cannot be written never turns the reading into a failure, whatever the outcome, and the groups are still recorded (60 random)", async () => {
    const r = rng(91);
    for (let i = 0; i < 60; i++) {
      const a = await account("site");
      const outcome = pick(r, OUTCOMES(r).filter(o => o.charged !== null));
      const event = await a.setSource("https://acme.com");
      const run = a.t.deps.uow.run.bind(a.t.deps.uow);
      vi.spyOn(a.t.deps.uow, "run").mockImplementation(fn => run((repos, internal) => fn({ ...repos, events: Object.assign(Object.create(repos.events), {
        create: async (scope: Parameters<typeof repos.events.create>[0], input: Parameters<typeof repos.events.create>[1]) => {
          if (input.eventType === "handoff.site_usage") throw new Error("events down");
          return repos.events.create(scope, input);
        } }) }, internal)));
      const result = await createHandoffReadHandler(a.t.deps, { site: new FakeSiteReader(outcome.result), instagram: new FakeInstagramReader() })({ event, step });
      expect(result).toEqual({ recorded: HANDOFF_GROUPS.length });
      const h = await a.row();
      expect(HANDOFF_GROUPS.every(g => h.reading[g]!.status !== "running" && h.reading[g]!.status !== "pending")).toBe(true);
      expect(await a.usage()).toHaveLength(0);
      vi.restoreAllMocks();
    }
  }, 60_000);
});
