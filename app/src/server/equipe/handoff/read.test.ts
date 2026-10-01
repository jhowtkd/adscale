import { describe, expect, it, vi } from "vitest";
import { claimHandoffProviderAttempt, createHandoffReadHandler, loadHandoffInstagramRun, recordHandoffInstagramRun, recordHandoffSiteUsage } from "./read";
import { FakeInstagramReader, FakeSiteReader, type InstagramReadResult, type SiteReader, type SiteReadResult } from "./readers";
import { SiteReaderError } from "./readers/firecrawl";
import { executeCommand } from "../module/commands";
import { makeTestDeps, uuid } from "../module/testing/deps";
import { HANDOFF_GROUPS, type HandoffState } from "../domain/handoff";

type Deps = ReturnType<typeof makeTestDeps>;

const SYSTEM_OPEN = { kind: "system", job: "free-open" } as const;

/** Pass-through step: fine for these tests, which don't exercise Inngest retries. */
const step = { run: async <T>(_id: string, fn: () => Promise<T>) => fn() };

function seedMember(t: Deps, workspaceId: string) {
  const userId = `user-${uuid()}`;
  t.store.workspaceMembers.rows.set(uuid(), {
    id: uuid(), workspaceId, userId, name: "Ana Souza",
    email: "ana@example.com", emailVerified: true,
    role: "owner", createdAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  return userId;
}

async function openHandoff(t: Deps) {
  const workspaceId = uuid();
  const userId = seedMember(t, workspaceId);
  const outcome = await executeCommand(t.deps, { actor: SYSTEM_OPEN, workspaceId }, { type: "open_free_account", payload: { userId } });
  if (!outcome.ok) throw new Error(`openHandoff failed: ${outcome.error.code}`);
  const accountId = outcome.value.accountId!;
  const people = await t.deps.uow.repos.people.list({ workspaceId, accountId });
  const approver = { kind: "client_person", role: "approver", personId: people[0]!.id } as const;
  return { workspaceId, accountId, approver, scope: { workspaceId, accountId } };
}

async function currentHandoff(t: Deps, scope: { workspaceId: string; accountId: string }): Promise<HandoffState & { id: string }> {
  const [row] = await t.deps.uow.repos.handoffs.list(scope);
  if (!row) throw new Error("no handoff row");
  return row;
}

async function setSource(t: Deps, scope: { workspaceId: string; accountId: string }, approver: { kind: "client_person"; role: "approver"; personId: string }, kind: "site" | "instagram", value: string) {
  const row = await currentHandoff(t, scope);
  const outcome = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
    type: "handoff_set_source",
    payload: { expectedStep: row.step, expectedVersion: row.version, kind, value },
  });
  if (!outcome.ok) throw new Error(`setSource failed: ${outcome.error.code}`);
}

/** Builds the Inngest-shaped event the module's requestTask wrote for the current reading. */
async function readEvent(t: Deps, scope: { workspaceId: string; accountId: string }) {
  const row = await currentHandoff(t, scope);
  const taskIntentId = row.reading[HANDOFF_GROUPS[0]]!.taskIntentId;
  const runIds = Object.fromEntries(HANDOFF_GROUPS.map((g) => [g, row.reading[g]!.runId]));
  return {
    event: {
      data: {
        workspaceId: scope.workspaceId, accountId: scope.accountId, taskIntentId,
        readingId: row.readingId, source: row.source, groups: [...HANDOFF_GROUPS], runIds,
      },
    },
    step,
  };
}

describe("createHandoffReadHandler: site", () => {
  it("claims the run, reads the site, and records every group from the fake result", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const reader = new FakeSiteReader();
    const handler = createHandoffReadHandler(t.deps, { site: reader, instagram: new FakeInstagramReader() });

    const { event } = await readEvent(t, scope);
    const outcome = await handler({ event, step });
    expect(outcome).toEqual({ recorded: HANDOFF_GROUPS.length });
    expect(reader.calls).toEqual(["https://acme.com/"]);

    const row = await currentHandoff(t, scope);
    expect(row.reading.name).toMatchObject({ status: "found" });
    expect(row.captured.name?.[0]).toMatchObject({ value: "Marca de exemplo", origin: "site" });
    expect(row.reading.logo).toMatchObject({ status: "found" });
    expect(row.reading.colors).toMatchObject({ status: "found" });
    expect(row.captured.colors).toEqual([
      expect.objectContaining({ value: "#333333" }), expect.objectContaining({ value: "#FFFFFF" }), expect.objectContaining({ value: "#6B46C1" }),
    ]);
    expect(row.reading.networks).toMatchObject({ status: "found" });
    expect(row.captured.networks?.[0]).toMatchObject({ origin: "site", platform: "instagram", value: "marca_exemplo" });
    // The Instagram link found on the site is captured but not yet decided.
    expect(row.decisions.networks).toBeUndefined();
    expect(row.reading.images).toMatchObject({ status: "found" });
    expect(row.step).toBe("identity");
  });

  it("marks every requested group failed, with the mapped error code, when the site is unavailable", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const reader = new FakeSiteReader({ title: null, siteName: null, markdown: "", links: [], images: [], screenshotUrl: null, statusCode: 500 });
    const handler = createHandoffReadHandler(t.deps, { site: reader, instagram: new FakeInstagramReader() });
    const { event } = await readEvent(t, scope);
    await handler({ event, step });

    const row = await currentHandoff(t, scope);
    for (const group of HANDOFF_GROUPS) expect(row.reading[group]).toMatchObject({ status: "failed", error: "site_unavailable" });
    expect(row.step).toBe("reading");
  });

  it("skips groups that come back empty as not_found rather than inventing anything", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const bare: SiteReadResult = { title: null, siteName: null, markdown: "", links: [], images: [], screenshotUrl: null, statusCode: 200 };
    const reader = new FakeSiteReader(bare);
    const handler = createHandoffReadHandler(t.deps, { site: reader, instagram: new FakeInstagramReader() });
    const { event } = await readEvent(t, scope);
    await handler({ event, step });

    const row = await currentHandoff(t, scope);
    for (const group of HANDOFF_GROUPS) {
      expect(row.reading[group]).toMatchObject({ status: "not_found" });
      expect(row.captured[group] ?? []).toEqual([]);
    }
  });
});

describe("createHandoffReadHandler: SiteEnrichment (identity/images) wiring", () => {
  it("feeds identity() into logo/colors/fonts and images() into images, on top of the reader's own capture", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const reader = new FakeSiteReader();
    const enrichment = {
      identity: async () => ({ branding: { logo: { url: "https://r2.example/logo.jpg", key: "k-logo" }, colors: ["#123456"], fonts: ["Vision Font"] } }),
      images: async () => ({ images: [{ url: "https://r2.example/a.jpg", key: "k-a", width: 10, height: 10 }] }),
    };
    const handler = createHandoffReadHandler(t.deps, { site: reader, instagram: new FakeInstagramReader() }, enrichment);
    const { event } = await readEvent(t, scope);
    await handler({ event, step });

    const row = await currentHandoff(t, scope);
    expect(row.captured.colors).toEqual([expect.objectContaining({ value: "#123456" })]);
    expect(row.captured.fonts).toEqual([expect.objectContaining({ value: "Vision Font" })]);
    expect(row.captured.logo?.[0]).toMatchObject({ value: "https://r2.example/logo.jpg", key: "k-logo" });
    expect(row.captured.images).toEqual([expect.objectContaining({ value: "https://r2.example/a.jpg", key: "k-a" })]);
  });

  it("fails the logo with the reported groupError, and reads a palette the vision could not open as not found, leaving name/networks/images untouched", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const reader = new FakeSiteReader();
    const enrichment = {
      identity: async () => ({ branding: { colors: [], fonts: [] }, groupErrors: { logo: "logo_download_failed", colors: "site_vision_failed" } }),
      images: async () => ({ images: [{ url: "https://r2.example/a.jpg", key: "k-a" }] }),
    };
    const handler = createHandoffReadHandler(t.deps, { site: reader, instagram: new FakeInstagramReader() }, enrichment);
    const { event } = await readEvent(t, scope);
    await handler({ event, step });

    const row = await currentHandoff(t, scope);
    expect(row.reading.logo).toMatchObject({ status: "failed", error: "logo_download_failed" });
    // A palette the vision could not read is a palette not found (the person picks it), never a failed reading (ticket 13, D-2).
    expect(row.reading.colors).toMatchObject({ status: "not_found", error: "site_vision_failed" });
    // fonts has no groupError of its own: it just comes back empty.
    expect(row.reading.fonts).toMatchObject({ status: "not_found" });
    expect(row.reading.name).toMatchObject({ status: "found" });
    expect(row.reading.images).toMatchObject({ status: "found" });
  });

  it("records the independent name/networks groups before the still-pending identity/images groups settle", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const reader = new FakeSiteReader();
    let resolveIdentity!: (v: { branding: { colors: string[]; fonts: string[] } }) => void;
    let resolveImages!: (v: { images: [] }) => void;
    const enrichment = {
      identity: () => new Promise<{ branding: { colors: string[]; fonts: string[] } }>((r) => { resolveIdentity = r; }),
      images: () => new Promise<{ images: [] }>((r) => { resolveImages = r; }),
    };
    const handler = createHandoffReadHandler(t.deps, { site: reader, instagram: new FakeInstagramReader() }, enrichment);
    const { event } = await readEvent(t, scope);
    const done = handler({ event, step });

    // Give the synchronous name/networks groups a chance to complete while identity/images stay pending.
    await new Promise((r) => setTimeout(r, 10));
    const mid = await currentHandoff(t, scope);
    expect(mid.reading.name?.status).toBe("found");
    expect(mid.reading.networks?.status).toBe("found");
    expect(mid.reading.logo?.status).toBe("running");
    expect(mid.reading.images?.status).toBe("running");

    resolveIdentity({ branding: { colors: [], fonts: [] } });
    resolveImages({ images: [] });
    await done;
    const finished = await currentHandoff(t, scope);
    expect(finished.reading.logo?.status).toBe("not_found");
    expect(finished.reading.images?.status).toBe("not_found");
  });
});

class ThrowingSiteReader implements SiteReader {
  readonly calls: string[] = [];
  constructor(private readonly error: Error) {}
  async read(url: string): Promise<SiteReadResult> { this.calls.push(url); throw this.error; }
}

describe("createHandoffReadHandler: billed vs unbilled site reader failures", () => {
  it("refunds readsUsed and records handoff.read_not_billed exactly once when the site fails for a free reason (DNS)", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://nowhere.example.com");
    expect((await currentHandoff(t, scope)).readsUsed).toBe(1);
    const reader = new ThrowingSiteReader(new SiteReaderError("site_dns_or_address", true));
    const handler = createHandoffReadHandler(t.deps, { site: reader, instagram: new FakeInstagramReader() });
    const { event } = await readEvent(t, scope);
    await handler({ event, step });

    const row = await currentHandoff(t, scope);
    expect(row.readsUsed).toBe(0);
    for (const group of HANDOFF_GROUPS) expect(row.reading[group]).toMatchObject({ status: "failed", error: "site_dns_or_address" });
    const events = await t.deps.uow.repos.events.list(scope, { eventType: "handoff.read_not_billed" });
    expect(events).toHaveLength(1);
  });

  it("refunds readsUsed when the site reader is unavailable (no Firecrawl key configured)", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const reader = new ThrowingSiteReader(new SiteReaderError("reader_unavailable", true));
    const handler = createHandoffReadHandler(t.deps, { site: reader, instagram: new FakeInstagramReader() });
    const { event } = await readEvent(t, scope);
    await handler({ event, step });

    expect((await currentHandoff(t, scope)).readsUsed).toBe(0);
  });

  it("does NOT refund readsUsed when the site is reachable but unavailable (billed/uncertain, e.g. a 404 the supplier charged for)", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com/404");
    const reader = new ThrowingSiteReader(new SiteReaderError("site_unavailable"));
    const handler = createHandoffReadHandler(t.deps, { site: reader, instagram: new FakeInstagramReader() });
    const { event } = await readEvent(t, scope);
    await handler({ event, step });

    const row = await currentHandoff(t, scope);
    expect(row.readsUsed).toBe(1);
    for (const group of HANDOFF_GROUPS) expect(row.reading[group]).toMatchObject({ status: "failed", error: "site_unavailable" });
    expect(await t.deps.uow.repos.events.list(scope, { eventType: "handoff.read_not_billed" })).toEqual([]);
  });

  it("does NOT refund readsUsed for a generic reading_failed (unmapped/uncertain transport error)", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const reader = new ThrowingSiteReader(new Error("boom"));
    const handler = createHandoffReadHandler(t.deps, { site: reader, instagram: new FakeInstagramReader() });
    const { event } = await readEvent(t, scope);
    await handler({ event, step });

    expect((await currentHandoff(t, scope)).readsUsed).toBe(1);
  });
});

describe("createHandoffReadHandler: capturing groups caps at 30 and never duplicates a value", () => {
  it("dedupes repeated links and caps a large link list at 30 captured networks", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const distinctLinks = Array.from({ length: 35 }, (_, i) => `https://facebook.com/marca-${i}`);
    const links = [...distinctLinks, distinctLinks[0]!, distinctLinks[0]!, distinctLinks[1]!]; // duplicates mixed in
    const reader = new FakeSiteReader({
      title: "Marca", siteName: "Marca", markdown: "Marca de exemplo.", links,
      images: [], screenshotUrl: null, statusCode: 200,
    });
    const handler = createHandoffReadHandler(t.deps, { site: reader, instagram: new FakeInstagramReader() });
    const { event } = await readEvent(t, scope);
    await handler({ event, step });

    const row = await currentHandoff(t, scope);
    expect(row.captured.networks).toHaveLength(30);
    const values = row.captured.networks!.map((i) => i.value);
    expect(new Set(values).size).toBe(30);
    expect(values).toEqual(distinctLinks.slice(0, 30));
  });

  it("extracts the clean @ from an Instagram link carrying tracking query params and a hash fragment", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const reader = new FakeSiteReader({
      title: "Marca", siteName: "Marca", markdown: "Marca de exemplo.",
      links: ["https://www.instagram.com/marca_exemplo/?utm_source=footer&igshid=abc123#comments"],
      images: [], screenshotUrl: null, statusCode: 200,
    });
    const handler = createHandoffReadHandler(t.deps, { site: reader, instagram: new FakeInstagramReader() });
    const { event } = await readEvent(t, scope);
    await handler({ event, step });

    const row = await currentHandoff(t, scope);
    expect(row.reading.networks).toMatchObject({ status: "found" });
    // Still only PROVISIONAL: the site-found @ is never read/confirmed here.
    expect(row.captured.networks?.[0]).toMatchObject({ origin: "site", platform: "instagram", value: "marca_exemplo" });
    expect(row.decisions.networks).toBeUndefined();
  });
});

describe("createHandoffReadHandler: a site's social links on supported host variants", () => {
  async function readLinks(links: string[]) {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const reader = new FakeSiteReader({ title: "Marca", siteName: "Marca", markdown: "Marca de exemplo.", links, images: [], screenshotUrl: null, statusCode: 200 });
    const handler = createHandoffReadHandler(t.deps, { site: reader, instagram: new FakeInstagramReader() });
    const { event } = await readEvent(t, scope);
    await handler({ event, step });
    return (await currentHandoff(t, scope)).captured.networks ?? [];
  }

  it("captures subdomains and short domains of each platform, and the Instagram link with share parameters", async () => {
    const networks = await readLinks([
      "https://m.facebook.com/acme", "https://fb.com/acme2", "https://br.linkedin.com/company/acme", "https://youtu.be/abc123",
      "https://www.tiktok.com/@acme", "https://www.youtube.com/@acme", "https://www.instagram.com/acme.oficial/?igsh=abc",
    ]);
    expect(networks.map(i => [i.platform, i.value])).toEqual([
      ["facebook", "https://m.facebook.com/acme"], ["facebook", "https://fb.com/acme2"], ["linkedin", "https://br.linkedin.com/company/acme"],
      ["youtube", "https://youtu.be/abc123"], ["tiktok", "https://www.tiktok.com/@acme"], ["youtube", "https://www.youtube.com/@acme"],
      ["instagram", "acme.oficial"],
    ]);
    expect(networks.every(i => i.origin === "site")).toBe(true);
  });

  it("captures the real links of the owner's site clean: no lead identifier, no utm, one link per profile (ticket 13, D-9)", async () => {
    const lead = "mlid=lead_20261001_bj34rr068tp&utm_mlid=lead_20261001_bj34rr068tp&src=lead_20261001_bj34rr068tp&sck=lead_20261001_bj34rr068tp&utm_source=lead_20261001_bj34rr068tp";
    const networks = await readLinks([
      `https://www.instagram.com/conteudomartech?${lead}`, `https://www.youtube.com/@conteudomartech?${lead}`, `https://www.linkedin.com/company/conteudomartech?${lead}`,
      "https://www.youtube.com/@conteudomartech?utm_source=newsletter#videos",
    ]);
    expect(networks.map(i => [i.platform, i.value])).toEqual([
      ["instagram", "conteudomartech"], ["youtube", "https://www.youtube.com/@conteudomartech"], ["linkedin", "https://www.linkedin.com/company/conteudomartech"],
    ]);
    expect(JSON.stringify(networks)).not.toMatch(/lead_|mlid|utm_|sck|src=/);
  });

  it("still ignores lookalike hosts, links with credentials, other protocols and unrelated sites", async () => {
    const networks = await readLinks([
      "https://facebook.com.evil.com/acme", "https://evilyoutu.be/x", "https://unrelated.com/acme", "https://facebook.com@evil.com/acme",
      "ftp://facebook.com/acme", "https://youtube.com:8443/@acme", "https://www.instagram.com/p/ABC123/", "not a link",
    ]);
    expect(networks).toEqual([]);
  });

  it("does not take the Instagram help, about or business pages for a profile", async () => {
    const networks = await readLinks([
      "https://help.instagram.com/1896641480634370", "https://about.instagram.com/blog", "https://business.instagram.com/ads",
      "https://l.instagram.com/?u=https%3A%2F%2Facme.com", "https://www.instagram.com/acme.oficial/",
    ]);
    expect(networks.map(i => [i.platform, i.value])).toEqual([["instagram", "acme.oficial"]]);
  });

  it("still captures a profile on each host that serves profiles", async () => {
    const networks = await readLinks(["https://instagram.com/a.one/", "https://www.instagram.com/b.two/?igsh=x", "https://m.instagram.com/c.three"]);
    expect(networks.map(i => i.value)).toEqual(["a.one", "b.two", "c.three"]);
  });

  it("drops the fragment of a captured link, like every other public address", async () => {
    const networks = await readLinks(["https://www.facebook.com/acme#about"]);
    expect(networks.map(i => i.value)).toEqual(["https://www.facebook.com/acme"]);
  });
});

describe("createHandoffReadHandler: instagram", () => {
  it("reads the profile and auto-decides the network the person chose as their source", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "instagram", "acme.oficial");
    const reader = new FakeInstagramReader();
    const handler = createHandoffReadHandler(t.deps, { site: new FakeSiteReader(), instagram: reader });
    const { event } = await readEvent(t, scope);
    const outcome = await handler({ event, step });
    expect(outcome).toEqual({ recorded: HANDOFF_GROUPS.length });
    expect(reader.calls).toEqual(["acme.oficial"]);

    const row = await currentHandoff(t, scope);
    expect(row.reading.name).toMatchObject({ status: "found" });
    expect(row.reading.networks).toMatchObject({ status: "found" });
    expect(row.captured.networks?.[0]).toMatchObject({ origin: "instagram", platform: "instagram", value: "acme.oficial" });
    // Unlike the site case, the person already chose this exact profile as their source.
    expect(row.decisions.networks).toEqual([expect.objectContaining({ platform: "instagram", value: "acme.oficial" })]);
  });

  it("fails every group with instagram_private for a private profile, and instagram_not_found for a missing one", async () => {
    for (const [result, code] of [
      [{ exists: true, isPrivate: true, avatarUrl: null, bio: "", posts: [] }, "instagram_private"],
      [{ exists: false, isPrivate: false, avatarUrl: null, bio: "", posts: [] }, "instagram_not_found"],
    ] as [InstagramReadResult, string][]) {
      const t = makeTestDeps();
      const { scope, approver } = await openHandoff(t);
      await setSource(t, scope, approver, "instagram", "acme.oficial");
      const handler = createHandoffReadHandler(t.deps, { site: new FakeSiteReader(), instagram: new FakeInstagramReader(result) });
      const { event } = await readEvent(t, scope);
      await handler({ event, step });
      const row = await currentHandoff(t, scope);
      for (const group of HANDOFF_GROUPS) expect(row.reading[group]).toMatchObject({ status: "failed", error: code });
    }
  });
});

describe("createHandoffReadHandler: what Firecrawl charged is recorded as an event (ticket 13, D-5)", () => {
  const usageEvents = async (t: Deps, scope: { workspaceId: string; accountId: string }) => t.deps.uow.repos.events.list(scope, { eventType: "handoff.site_usage" });
  const siteReading = async (reader: SiteReader) => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const handler = createHandoffReadHandler(t.deps, { site: reader, instagram: new FakeInstagramReader() });
    const { event } = await readEvent(t, scope);
    return { t, scope, event, handler, row: () => currentHandoff(t, scope) };
  };
  const page: SiteReadResult = { title: "Acme", siteName: "Acme", markdown: "Acme vende café.", links: [], images: [], screenshotUrl: null, statusCode: 200, creditsUsed: 1 };

  it("records one handoff.site_usage with the taskIntentId, the readingId and the credits, whatever else the reading does", async () => {
    const { t, scope, event, handler, row } = await siteReading(new FakeSiteReader(page));
    await handler({ event, step });
    const events = await usageEvents(t, scope);
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toEqual({ taskIntentId: event.data.taskIntentId, readingId: (await row()).readingId, creditsUsed: 1 });
    expect(events[0]).toMatchObject({ actorType: "system", eventType: "handoff.site_usage" });
  });

  it("a redelivery of the same reading records nothing new, and recording one reading twice writes one event", async () => {
    const { t, scope, event, handler, row } = await siteReading(new FakeSiteReader(page));
    await handler({ event, step });
    await handler({ event, step });
    expect(await usageEvents(t, scope)).toHaveLength(1);
    // The recorder itself is idempotent per reading (a resumed step can run it twice).
    const context = { ...scope, readingId: (await row()).readingId!, taskIntentId: event.data.taskIntentId };
    await recordHandoffSiteUsage(t.deps, context, 1);
    await recordHandoffSiteUsage(t.deps, context, 1);
    expect(await usageEvents(t, scope)).toHaveLength(1);
    // Another reading of the same account is a new record.
    await recordHandoffSiteUsage(t.deps, { ...context, taskIntentId: uuid() }, 2);
    expect((await usageEvents(t, scope)).map((e) => (e.payload as { creditsUsed: number }).creditsUsed).sort()).toEqual([1, 2]);
  });

  it("a charged 404 records its credit too, with the reading failing as site_unavailable", async () => {
    const { t, scope, event, handler, row } = await siteReading(new FakeSiteReader(new SiteReaderError("site_unavailable", false, 1)));
    await handler({ event, step });
    expect((await row()).reading.name).toMatchObject({ status: "failed", error: "site_unavailable" });
    expect((await usageEvents(t, scope)).map((e) => e.payload)).toEqual([expect.objectContaining({ creditsUsed: 1 })]);
  });

  it("records nothing when the supplier did not say what it charged, and nothing for a failure that was not charged", async () => {
    const unknown = await siteReading(new FakeSiteReader({ ...page, creditsUsed: undefined }));
    await unknown.handler({ event: unknown.event, step });
    expect(await usageEvents(unknown.t, unknown.scope)).toHaveLength(0);
    const dns = await siteReading(new FakeSiteReader(new SiteReaderError("site_dns_or_address", true)));
    await dns.handler({ event: dns.event, step });
    expect(await usageEvents(dns.t, dns.scope)).toHaveLength(0);
  });

  it("records zero credits when the supplier says it charged none", async () => {
    const { t, scope, event, handler } = await siteReading(new FakeSiteReader({ ...page, creditsUsed: 0 }));
    await handler({ event, step });
    expect((await usageEvents(t, scope)).map((e) => (e.payload as { creditsUsed: number }).creditsUsed)).toEqual([0]);
  });

  it("an Instagram reading has its own cost record and never a site one", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "instagram", "acme.oficial");
    const { event } = await readEvent(t, scope);
    // Even an Instagram result that carried a credit count (it never does) is not a Firecrawl charge.
    const instagram = new FakeInstagramReader({ exists: true, isPrivate: false, name: "Acme", avatarUrl: null, bio: "Café.", posts: [], creditsUsed: 9 } as never);
    await createHandoffReadHandler(t.deps, { site: new FakeSiteReader({ ...page, creditsUsed: 7 }), instagram })({ event, step });
    expect(await usageEvents(t, scope)).toHaveLength(0);
  });

  it("a credit count that cannot be written never turns a read page into a failure", async () => {
    const { t, scope, event, handler, row } = await siteReading(new FakeSiteReader(page));
    // The usage is written inside a unit of work: make exactly its event fail there.
    const run = t.deps.uow.run.bind(t.deps.uow);
    vi.spyOn(t.deps.uow, "run").mockImplementation((fn) => run((repos, internal) => fn({ ...repos, events: Object.assign(Object.create(repos.events), {
      create: async (scope: Parameters<typeof repos.events.create>[0], input: Parameters<typeof repos.events.create>[1]) => {
        if (input.eventType === "handoff.site_usage") throw new Error("events down");
        return repos.events.create(scope, input);
      },
    }) }, internal)));
    expect(await handler({ event, step })).toEqual({ recorded: HANDOFF_GROUPS.length });
    expect((await row()).reading.name).toMatchObject({ status: "found" });
    expect(await usageEvents(t, scope)).toHaveLength(0);
  });
});

describe("createHandoffReadHandler: the provider's cost is read AFTER the result, never holding the screen (ticket 13, D-4)", () => {
  /** An Instagram reader whose cost step waits on a gate, so the test sees what the screen would see while it is pending. */
  function costReader(profile: InstagramReadResult | Error = new FakeInstagramReader().profile("x") as never) {
    const gate: { release: () => void } = { release: () => {} };
    const waiting = new Promise<void>((resolve) => { gate.release = resolve; });
    const calls: unknown[] = [];
    const base = new FakeInstagramReader(profile instanceof Error ? profile : undefined);
    const reader = { profile: (handle: string) => base.profile(handle), measureCost: vi.fn(async (context?: unknown) => { calls.push(context); await waiting; }) };
    return { reader, gate, calls };
  }

  it("records every group while the cost step is still pending, then waits for it before the function ends", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "instagram", "acme.oficial");
    const { reader, gate, calls } = costReader();
    const handler = createHandoffReadHandler(t.deps, { site: new FakeSiteReader(), instagram: reader });
    const { event } = await readEvent(t, scope);
    let finished = false;
    const done = handler({ event, step }).then((outcome) => { finished = true; return outcome; });
    // The result is recorded and the identity card can open while the cost has not been measured: the screen does not wait for it.
    await vi.waitFor(async () => expect((await currentHandoff(t, scope)).step).toBe("identity"));
    const row = await currentHandoff(t, scope);
    expect(row.reading.name).toMatchObject({ status: "found" });
    expect(row.reading.images).toMatchObject({ status: "found" });
    expect(reader.measureCost).toHaveBeenCalledTimes(1);
    expect(finished).toBe(false);
    gate.release();
    expect(await done).toEqual({ recorded: HANDOFF_GROUPS.length });
    expect(calls).toEqual([expect.objectContaining({ taskIntentId: expect.any(String), readingId: row.readingId, accountId: scope.accountId })]);
  });

  it("measures a run that was dispatched whatever the outcome: a private profile was billed too", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "instagram", "acme.oficial");
    const { reader, gate } = costReader(new Error("provider_failure"));
    gate.release();
    await createHandoffReadHandler(t.deps, { site: new FakeSiteReader(), instagram: reader })((await readEvent(t, scope)));
    expect((await currentHandoff(t, scope)).reading.name).toMatchObject({ status: "failed" });
    expect(reader.measureCost).toHaveBeenCalledTimes(1);
  });

  it("never measures for a site source (Firecrawl answers with its own credits)", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const { reader, gate } = costReader();
    gate.release();
    await createHandoffReadHandler(t.deps, { site: new FakeSiteReader(), instagram: reader })((await readEvent(t, scope)));
    expect(reader.measureCost).not.toHaveBeenCalled();
  });

  it("a cost step that fails never turns a recorded reading into a failure", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "instagram", "acme.oficial");
    const reader = { profile: (handle: string) => new FakeInstagramReader().profile(handle), measureCost: vi.fn(async () => { throw new Error("db down"); }) };
    const outcome = await createHandoffReadHandler(t.deps, { site: new FakeSiteReader(), instagram: reader })((await readEvent(t, scope)));
    expect(outcome).toEqual({ recorded: HANDOFF_GROUPS.length });
    expect((await currentHandoff(t, scope)).reading.name).toMatchObject({ status: "found" });
  });

  it("a reader with no cost to measure (the fake) reads exactly as before", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "instagram", "acme.oficial");
    const outcome = await createHandoffReadHandler(t.deps, { site: new FakeSiteReader(), instagram: new FakeInstagramReader() })((await readEvent(t, scope)));
    expect(outcome).toEqual({ recorded: HANDOFF_GROUPS.length });
  });
});

describe("createHandoffReadHandler: a partial Instagram re-read still preserves the bio", () => {
  it("captures the profile bio into captured.publicContent even when only colors/images are requested (no name group)", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    let row = await currentHandoff(t, scope);
    const netGroup = row.reading.networks!;
    const netId = uuid();
    // The site reading finds a provisional Instagram link.
    const recorded = await executeCommand(t.deps, { actor: { kind: "system", job: "equipe.handoff.read" }, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_record_group",
      payload: {
        readingId: row.readingId!, runId: netGroup.runId, taskIntentId: netGroup.taskIntentId, group: "networks",
        result: { status: "found", items: [{ id: netId, value: "acme.oficial", origin: "site", platform: "instagram" }] },
      },
    });
    if (!recorded.ok) throw new Error(recorded.error.code);

    // Finish the identity groups so the step reaches identity, then networks.
    const record = (group: "name" | "logo" | "colors" | "fonts", status: "found" | "not_found", items: Array<{ id: string; value: string; origin: "site" }> = []) => {
      const g = row.reading[group]!;
      return executeCommand(t.deps, { actor: { kind: "system", job: "equipe.handoff.read" }, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
        type: "handoff_record_group",
        payload: { readingId: row.readingId!, runId: g.runId, taskIntentId: g.taskIntentId, group, result: { status, items } },
      });
    };
    for (const [group, item] of [
      ["name", { id: uuid(), value: "Acme", origin: "site" as const }],
      ["logo", undefined],
      ["colors", { id: uuid(), value: "#111111", origin: "site" as const }],
      ["fonts", { id: uuid(), value: "Inter", origin: "site" as const }],
    ] as const) {
      const out = await record(group, item ? "found" : "not_found", item ? [item] : []);
      if (!out.ok) throw new Error(out.error.code);
    }
    row = await currentHandoff(t, scope);
    expect(row.step).toBe("identity");
    const confirmIdentity = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_confirm_identity",
      payload: { expectedStep: row.step, expectedVersion: row.version, name: "Acme", logo: null, colors: ["#111111"], fonts: ["Inter"], paletteChoice: "site" },
    });
    if (!confirmIdentity.ok) throw new Error(confirmIdentity.error.code);

    // Confirming the Instagram profile for the first time dispatches a NEW, partial Instagram read for colors/images only.
    row = await currentHandoff(t, scope);
    expect(row.step).toBe("networks");
    const confirm = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_confirm_networks", payload: { expectedStep: row.step, expectedVersion: row.version, kept: [netId], added: [] },
    });
    if (!confirm.ok) throw new Error(confirm.error.code);
    row = await currentHandoff(t, scope);
    expect(row.reading.colors?.status).toBe("pending");
    expect(row.reading.images?.status).toBe("pending");

    const bio = "Loja de streetwear independente, feita a mao no Brasil.";
    const handler = createHandoffReadHandler(t.deps, {
      site: new FakeSiteReader(),
      instagram: new FakeInstagramReader({ exists: true, isPrivate: false, avatarUrl: "/logo.svg", bio, posts: [], colors: ["#445566"] }),
    });
    // The dispatched read's own source is the Instagram profile just confirmed
    // (not the handoff's overall site source, which stays unchanged here).
    const intent = await t.deps.uow.repos.taskOutbox.get(scope, row.reading.colors!.taskIntentId);
    const event = {
      data: {
        workspaceId: scope.workspaceId, accountId: scope.accountId, taskIntentId: row.reading.colors!.taskIntentId,
        readingId: row.readingId, source: (intent!.data as { source: unknown }).source, groups: ["colors", "images"],
        runIds: { colors: row.reading.colors!.runId, images: row.reading.images!.runId },
      },
    };
    const outcome = await handler({ event, step });
    expect(outcome).toEqual({ recorded: 2 });

    const after = await currentHandoff(t, scope);
    expect(after.captured.publicContent).toEqual([expect.objectContaining({ value: bio, origin: "instagram" })]);
  });
});

describe("createHandoffReadHandler: claim guards a stale or duplicate delivery", () => {
  it("ignores a redelivery of an event whose readingId is no longer current", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const stale = await readEvent(t, scope);

    // The person corrects the address before the reading finishes: a new readingId is minted.
    await setSource(t, scope, approver, "site", "https://acme-novo.com");
    const before = await currentHandoff(t, scope);

    const reader = new FakeSiteReader();
    const handler = createHandoffReadHandler(t.deps, { site: reader, instagram: new FakeInstagramReader() });
    const outcome = await handler({ event: stale.event, step });
    expect(outcome).toEqual({ ignored: true });
    expect(reader.calls).toEqual([]);
    const after = await currentHandoff(t, scope);
    expect(after).toEqual(before);
  });

  it("claims the run only once: a redelivered event with matching data is ignored the second time", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const { event } = await readEvent(t, scope);
    const reader = new FakeSiteReader();
    const handler = createHandoffReadHandler(t.deps, { site: reader, instagram: new FakeInstagramReader() });
    const first = await handler({ event, step });
    expect(first).toEqual({ recorded: HANDOFF_GROUPS.length });
    const second = await handler({ event, step });
    expect(second).toEqual({ ignored: true });
    expect(reader.calls).toEqual(["https://acme.com/"]);
  });

  it("ignores an event for a handoff that has already been completed", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const { event } = await readEvent(t, scope);
    // Fast-forward the row straight to done without going through the read handler.
    const row = await currentHandoff(t, scope);
    await t.deps.uow.repos.handoffs.update(scope, row.id, { step: "done" });
    const handler = createHandoffReadHandler(t.deps, { site: new FakeSiteReader(), instagram: new FakeInstagramReader() });
    const outcome = await handler({ event, step });
    expect(outcome).toEqual({ ignored: true });
  });
});

describe("createHandoffReadHandler: a gate that closes after the event was sent does not swallow it", () => {
  /** Inngest memoizes a step only once it succeeded: a step that throws runs again on the retry. */
  const memoStep = () => {
    const cache = new Map<string, unknown>();
    return { async run<T>(id: string, fn: () => Promise<T>): Promise<T> { if (cache.has(id)) return cache.get(id) as T; const value = await fn(); cache.set(id, value); return value; } };
  };
  async function dispatched() {
    const gate = { enabled: true };
    const t = makeTestDeps({ isEnabledForWorkspace: () => gate.enabled });
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const { event } = await readEvent(t, scope);
    const reader = new FakeSiteReader();
    const handler = createHandoffReadHandler(t.deps, { site: reader, instagram: new FakeInstagramReader() });
    return { gate, t, scope, event, reader, handler, before: await currentHandoff(t, scope) };
  }
  const claimEvents = async (t: Deps, scope: { workspaceId: string; accountId: string }) =>
    (await t.deps.uow.repos.events.list(scope)).filter(e => e.eventType === "handoff.read_claimed");

  it("fails instead of acknowledging while the rollout is off, touching nothing, and processes the same event once it is back on", async () => {
    const { gate, t, scope, event, reader, handler, before } = await dispatched();
    const retrying = memoStep();
    gate.enabled = false;
    await expect(handler({ event, step: retrying })).rejects.toThrow("handoff_read_gated");
    expect(reader.calls).toEqual([]);
    expect(await currentHandoff(t, scope)).toEqual(before); // groups still pending, no read lost
    expect(await claimEvents(t, scope)).toEqual([]);
    gate.enabled = true;
    expect(await handler({ event, step: retrying })).toEqual({ recorded: HANDOFF_GROUPS.length });
    expect(reader.calls).toEqual(["https://acme.com/"]);
    const row = await currentHandoff(t, scope);
    expect(row.readsUsed).toBe(1);
    expect(row.reading.name).toMatchObject({ status: "found" });
  });

  it("does the same while the account execution is suspended", async () => {
    const { t, scope, event, reader, handler, before } = await dispatched();
    const pause = await t.deps.uow.repos.pauses.create(scope, { level: "execution", scope: "account", origin: "security", resumableBy: "staff", status: "active" } as never);
    await expect(handler({ event, step })).rejects.toThrow("handoff_read_gated");
    expect(reader.calls).toEqual([]);
    expect(await currentHandoff(t, scope)).toEqual(before);
    await t.deps.uow.repos.pauses.update(scope, pause.id, { status: "lifted" });
    expect(await handler({ event, step })).toEqual({ recorded: HANDOFF_GROUPS.length });
  });

  it("keeps failing for as long as the gate stays closed, without ever reading", async () => {
    const { gate, event, reader, handler } = await dispatched();
    gate.enabled = false;
    for (let attempt = 0; attempt < 3; attempt++) await expect(handler({ event, step })).rejects.toThrow("handoff_read_gated");
    expect(reader.calls).toEqual([]);
  });

  it("still ignores an obsolete event, gate or no gate, so it is not retried for nothing", async () => {
    const { gate, t, scope, event, handler } = await dispatched();
    const approver = { kind: "client_person", role: "approver", personId: (await t.deps.uow.repos.people.list(scope))[0]!.id } as const;
    await setSource(t, scope, approver, "site", "https://acme-novo.com"); // the first reading is replaced
    gate.enabled = false;
    expect(await handler({ event, step })).toEqual({ ignored: true });
  });

  it("does not turn a claimed or finished event into a failure when the gate closes later", async () => {
    const { gate, event, handler } = await dispatched();
    expect(await handler({ event, step })).toEqual({ recorded: HANDOFF_GROUPS.length });
    gate.enabled = false;
    expect(await handler({ event, step })).toEqual({ ignored: true });
  });
});

describe("createHandoffReadHandler: only handoff_record_group ever writes the reading state", () => {
  it("marks every requested group running (via the command, for the H2 progress card) before recording its final result", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const { event } = await readEvent(t, scope);
    const handler = createHandoffReadHandler(t.deps, { site: new FakeSiteReader(), instagram: new FakeInstagramReader() });

    const snapshotsByStep: Record<string, HandoffState> = {};
    const instrumented = {
      run: async <T>(id: string, fn: () => Promise<T>) => {
        const out = await fn();
        snapshotsByStep[id] = await currentHandoff(t, scope);
        return out;
      },
    };
    await handler({ event, step: instrumented });

    const afterNameRunning = snapshotsByStep[`start-${event.data.taskIntentId}-name`];
    expect(afterNameRunning?.reading.name).toMatchObject({ status: "running" });
    // Marking running never invents captured items.
    expect(afterNameRunning?.captured.name ?? []).toEqual([]);

    const afterNameRecorded = snapshotsByStep[`record-${event.data.taskIntentId}-name`];
    expect(afterNameRecorded?.reading.name).toMatchObject({ status: "found" });
    expect(afterNameRecorded?.captured.name?.[0]).toMatchObject({ value: "Marca de exemplo" });
  });

  it("the running transition is itself just a handoff_record_group call: a non-system actor could never produce it", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const row = await currentHandoff(t, scope);
    const attempt = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_record_group",
      payload: { readingId: row.readingId!, runId: row.reading.name!.runId, taskIntentId: row.reading.name!.taskIntentId, group: "name", result: { status: "running", items: [] } },
    });
    expect(attempt.ok).toBe(false);
    expect((await currentHandoff(t, scope)).reading.name?.status).toBe("pending");
  });
});

describe("claimHandoffProviderAttempt: guards a lost ACK from a synchronous, non-resumable provider call", () => {
  it("claims true the first time; a resend for the SAME taskIntentId (the ACK got lost) claims false and never adds a second event", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const { event } = await readEvent(t, scope);
    const context = { workspaceId: scope.workspaceId, accountId: scope.accountId, readingId: event.data.readingId, taskIntentId: event.data.taskIntentId };

    const first = await claimHandoffProviderAttempt(t.deps, context, "site");
    expect(first).toBe(true);
    const events = await t.deps.uow.repos.events.list(scope, { eventType: "handoff.site_dispatched" });
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({ taskIntentId: context.taskIntentId, readingId: context.readingId });

    // The caller lost the true ACK and retries the exact same attempt: must never dispatch twice.
    const second = await claimHandoffProviderAttempt(t.deps, context, "site");
    expect(second).toBe(false);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: "handoff.site_dispatched" })).toHaveLength(1);
  });

  it("a NEW reading (fresh taskIntentId, e.g. after handoff_retry_reading) is free to claim again", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const first = await readEvent(t, scope);
    const firstContext = { workspaceId: scope.workspaceId, accountId: scope.accountId, readingId: first.event.data.readingId, taskIntentId: first.event.data.taskIntentId };
    expect(await claimHandoffProviderAttempt(t.deps, firstContext, "site")).toBe(true);

    // Fail the reading (billed reason, so a retry is legitimate) and start a fresh one.
    const row = await currentHandoff(t, scope);
    await executeCommand(t.deps, { ...scope, actor: { kind: "system", job: "equipe.handoff.read" } }, { type: "handoff_record_group",
      payload: { readingId: row.readingId!, runId: row.reading.name!.runId, taskIntentId: row.reading.name!.taskIntentId, group: "name", result: { status: "failed", items: [], error: "site_unavailable" } } });
    await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_retry_reading", payload: { expectedStep: (await currentHandoff(t, scope)).step, expectedVersion: (await currentHandoff(t, scope)).version },
    });
    const second = await readEvent(t, scope);
    const secondContext = { workspaceId: scope.workspaceId, accountId: scope.accountId, readingId: second.event.data.readingId, taskIntentId: second.event.data.taskIntentId };
    expect(secondContext.taskIntentId).not.toBe(firstContext.taskIntentId);

    expect(await claimHandoffProviderAttempt(t.deps, secondContext, "site")).toBe(true);
    const events = await t.deps.uow.repos.events.list(scope, { eventType: "handoff.site_dispatched" });
    expect(events).toHaveLength(2);
  });

  it("site and vision claims are independent: claiming one does not block the other for the SAME taskIntentId", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const { event } = await readEvent(t, scope);
    const context = { workspaceId: scope.workspaceId, accountId: scope.accountId, readingId: event.data.readingId, taskIntentId: event.data.taskIntentId };

    expect(await claimHandoffProviderAttempt(t.deps, context, "site")).toBe(true);
    expect(await claimHandoffProviderAttempt(t.deps, context, "vision")).toBe(true);
    expect(await claimHandoffProviderAttempt(t.deps, context, "site")).toBe(false);
    expect(await claimHandoffProviderAttempt(t.deps, context, "vision")).toBe(false);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: "handoff.site_dispatched" })).toHaveLength(1);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: "handoff.vision_dispatched" })).toHaveLength(1);
  });

  it("claims false once the reading has moved on (readingId no longer current)", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const { event } = await readEvent(t, scope);
    const staleContext = { workspaceId: scope.workspaceId, accountId: scope.accountId, readingId: event.data.readingId, taskIntentId: event.data.taskIntentId };

    const row = await currentHandoff(t, scope);
    await executeCommand(t.deps, { ...scope, actor: { kind: "system", job: "equipe.handoff.read" } }, { type: "handoff_record_group",
      payload: { readingId: row.readingId!, runId: row.reading.name!.runId, taskIntentId: row.reading.name!.taskIntentId, group: "name", result: { status: "failed", items: [], error: "site_unavailable" } } });
    await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_retry_reading", payload: { expectedStep: (await currentHandoff(t, scope)).step, expectedVersion: (await currentHandoff(t, scope)).version },
    });

    expect(await claimHandoffProviderAttempt(t.deps, staleContext, "site")).toBe(false);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: "handoff.site_dispatched" })).toEqual([]);
  });

  it("claimHandoffProviderAttempt now also dispatches an instagram provider, independent of site/vision claims for the same taskIntentId", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "instagram", "acme.oficial");
    const { event } = await readEvent(t, scope);
    const context = { workspaceId: scope.workspaceId, accountId: scope.accountId, readingId: event.data.readingId, taskIntentId: event.data.taskIntentId };

    expect(await claimHandoffProviderAttempt(t.deps, context, "instagram")).toBe(true);
    expect(await claimHandoffProviderAttempt(t.deps, context, "vision")).toBe(true);
    expect(await claimHandoffProviderAttempt(t.deps, context, "instagram")).toBe(false);
    expect(await claimHandoffProviderAttempt(t.deps, context, "vision")).toBe(false);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: "handoff.instagram_dispatched" })).toHaveLength(1);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: "handoff.vision_dispatched" })).toHaveLength(1);
  });

  it("claimHandoffProviderAttempt('instagram') never claims for a SITE source (provider must match the reading's own source kind)", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const { event } = await readEvent(t, scope);
    const context = { workspaceId: scope.workspaceId, accountId: scope.accountId, readingId: event.data.readingId, taskIntentId: event.data.taskIntentId };
    expect(await claimHandoffProviderAttempt(t.deps, context, "instagram")).toBe(false);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: "handoff.instagram_dispatched" })).toEqual([]);
  });
});

describe("createHandoffReadHandler: InstagramEnrichment (images/identity) wiring", () => {
  it("feeds images() into logo/images and identity() into colors, on top of the reader's own raw capture for name/networks", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "instagram", "acme.oficial");
    const reader = new FakeInstagramReader();
    const enrichment = {
      images: async (data: InstagramReadResult) => ({ ...data, avatarUrl: "https://r2.example/avatar.jpg", avatarKey: "k-avatar",
        posts: [{ imageUrl: "https://r2.example/p1.jpg", caption: "c1", key: "k-p1" }] }),
      identity: async () => ({ colors: ["#123456"] }),
    };
    const handler = createHandoffReadHandler(t.deps, { site: new FakeSiteReader(), instagram: reader }, undefined, enrichment);
    const { event } = await readEvent(t, scope);
    const outcome = await handler({ event, step });
    expect(outcome).toEqual({ recorded: HANDOFF_GROUPS.length });

    const row = await currentHandoff(t, scope);
    expect(row.captured.logo?.[0]).toMatchObject({ value: "https://r2.example/avatar.jpg", key: "k-avatar" });
    expect(row.captured.images).toEqual([expect.objectContaining({ value: "https://r2.example/p1.jpg", key: "k-p1" })]);
    expect(row.captured.colors).toEqual([expect.objectContaining({ value: "#123456" })]);
    // name/networks are NOT touched by images()/identity(): they still come from the raw reader result.
    expect(row.captured.name?.[0]).toMatchObject({ value: "Marca de exemplo", origin: "instagram" });
    expect(row.captured.networks?.[0]).toMatchObject({ value: "acme.oficial", origin: "instagram" });
  });

  it("fails the logo and the images with the reported groupError, reads an unreadable palette as not found, and leaves name/networks untouched", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "instagram", "acme.oficial");
    const reader = new FakeInstagramReader();
    const enrichment = {
      images: async (data: InstagramReadResult) => ({ ...data, avatarUrl: null, avatarKey: undefined, posts: [],
        groupErrors: { logo: "logo_download_failed", images: "image_download_failed" } }),
      identity: async () => ({ colors: [], groupErrors: { colors: "instagram_vision_failed" } }),
    };
    const handler = createHandoffReadHandler(t.deps, { site: new FakeSiteReader(), instagram: reader }, undefined, enrichment);
    const { event } = await readEvent(t, scope);
    await handler({ event, step });

    const row = await currentHandoff(t, scope);
    expect(row.reading.logo).toMatchObject({ status: "failed", error: "logo_download_failed" });
    expect(row.reading.images).toMatchObject({ status: "failed", error: "image_download_failed" });
    expect(row.reading.colors).toMatchObject({ status: "not_found", error: "instagram_vision_failed" });
    expect(row.reading.name).toMatchObject({ status: "found" });
    expect(row.reading.networks).toMatchObject({ status: "found" });
  });

  it("calls identity() with the images()-enriched data (so it sees the stored avatarKey/post keys), never the raw reader result", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "instagram", "acme.oficial");
    const reader = new FakeInstagramReader();
    const capturedIdentityInput: InstagramReadResult[] = [];
    const enrichment = {
      images: async (data: InstagramReadResult) => ({ ...data, avatarUrl: "https://r2.example/avatar.jpg", avatarKey: "k-avatar", posts: [] }),
      identity: async (data: InstagramReadResult) => { capturedIdentityInput.push(data); return { colors: ["#111111"] }; },
    };
    const handler = createHandoffReadHandler(t.deps, { site: new FakeSiteReader(), instagram: reader }, undefined, enrichment);
    const { event } = await readEvent(t, scope);
    await handler({ event, step });
    expect(capturedIdentityInput).toHaveLength(1);
    expect(capturedIdentityInput[0]?.avatarKey).toBe("k-avatar");
  });

  it("works without an instagramEnrichment configured (no 4th argument): the handler still records every group from the raw reader result", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "instagram", "acme.oficial");
    const reader = new FakeInstagramReader();
    const handler = createHandoffReadHandler(t.deps, { site: new FakeSiteReader(), instagram: reader });
    const { event } = await readEvent(t, scope);
    const outcome = await handler({ event, step });
    expect(outcome).toEqual({ recorded: HANDOFF_GROUPS.length });
    const row = await currentHandoff(t, scope);
    expect(row.reading.logo).toMatchObject({ status: "found" });
  });
});

describe("loadHandoffInstagramRun / recordHandoffInstagramRun: durable run-id + usage markers for the Apify reader", () => {
  it("loadHandoffInstagramRun returns null when no run was ever recorded", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "instagram", "acme.oficial");
    const { event } = await readEvent(t, scope);
    const context = { workspaceId: scope.workspaceId, accountId: scope.accountId, readingId: event.data.readingId, taskIntentId: event.data.taskIntentId };
    expect(await loadHandoffInstagramRun(t.deps, context)).toBeNull();
  });

  it("recordHandoffInstagramRun refuses without a prior handoff.instagram_dispatched marker (the lost-ACK guard)", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "instagram", "acme.oficial");
    const { event } = await readEvent(t, scope);
    const context = { workspaceId: scope.workspaceId, accountId: scope.accountId, readingId: event.data.readingId, taskIntentId: event.data.taskIntentId };
    await expect(recordHandoffInstagramRun(t.deps, context, "run-1")).rejects.toThrow("reading_failed");
    expect(await loadHandoffInstagramRun(t.deps, context)).toBeNull();
  });

  it("saves the run id right after dispatch; loadHandoffInstagramRun then resumes it (the lost-ACK case)", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "instagram", "acme.oficial");
    const { event } = await readEvent(t, scope);
    const context = { workspaceId: scope.workspaceId, accountId: scope.accountId, readingId: event.data.readingId, taskIntentId: event.data.taskIntentId };
    expect(await claimHandoffProviderAttempt(t.deps, context, "instagram")).toBe(true);

    await recordHandoffInstagramRun(t.deps, context, "run-1");
    expect(await loadHandoffInstagramRun(t.deps, context)).toBe("run-1");
    // Idempotent: recording the SAME run id again never throws and stays resolvable.
    await recordHandoffInstagramRun(t.deps, context, "run-1");
    expect(await loadHandoffInstagramRun(t.deps, context)).toBe("run-1");
  });

  it("rejects recording a DIFFERENT run id for the same taskIntentId once one is already saved (never silently switches runs)", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "instagram", "acme.oficial");
    const { event } = await readEvent(t, scope);
    const context = { workspaceId: scope.workspaceId, accountId: scope.accountId, readingId: event.data.readingId, taskIntentId: event.data.taskIntentId };
    expect(await claimHandoffProviderAttempt(t.deps, context, "instagram")).toBe(true);
    await recordHandoffInstagramRun(t.deps, context, "run-1");

    await expect(recordHandoffInstagramRun(t.deps, context, "run-2")).rejects.toThrow("reading_failed");
    expect(await loadHandoffInstagramRun(t.deps, context)).toBe("run-1");
  });

  it("records usage null as pending, then a later measured (non-null) value is accepted for the SAME run", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "instagram", "acme.oficial");
    const { event } = await readEvent(t, scope);
    const context = { workspaceId: scope.workspaceId, accountId: scope.accountId, readingId: event.data.readingId, taskIntentId: event.data.taskIntentId };
    expect(await claimHandoffProviderAttempt(t.deps, context, "instagram")).toBe(true);
    await recordHandoffInstagramRun(t.deps, context, "run-1");

    await recordHandoffInstagramRun(t.deps, context, "run-1", null);
    let usageEvents = await t.deps.uow.repos.events.list(scope, { eventType: "handoff.instagram_usage" });
    expect(usageEvents).toHaveLength(1);
    expect(usageEvents[0]!.payload).toMatchObject({ providerRunId: "run-1", usageTotalUsd: null, costPending: true });

    await recordHandoffInstagramRun(t.deps, context, "run-1", 0.0032);
    usageEvents = await t.deps.uow.repos.events.list(scope, { eventType: "handoff.instagram_usage" });
    expect(usageEvents).toHaveLength(2);
    expect(usageEvents[1]!.payload).toMatchObject({ providerRunId: "run-1", usageTotalUsd: 0.0032, costPending: false });
  });

  it("a measured (non-null) usage value is never overwritten by a later null/duplicate call", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "instagram", "acme.oficial");
    const { event } = await readEvent(t, scope);
    const context = { workspaceId: scope.workspaceId, accountId: scope.accountId, readingId: event.data.readingId, taskIntentId: event.data.taskIntentId };
    expect(await claimHandoffProviderAttempt(t.deps, context, "instagram")).toBe(true);
    await recordHandoffInstagramRun(t.deps, context, "run-1");

    await recordHandoffInstagramRun(t.deps, context, "run-1", 0.0032);
    await recordHandoffInstagramRun(t.deps, context, "run-1", null);
    await recordHandoffInstagramRun(t.deps, context, "run-1", 0.0099);

    const usageEvents = await t.deps.uow.repos.events.list(scope, { eventType: "handoff.instagram_usage" });
    expect(usageEvents).toHaveLength(1);
    expect(usageEvents[0]!.payload).toMatchObject({ providerRunId: "run-1", usageTotalUsd: 0.0032 });
  });

  it("recording the run marker again after it was already saved is a harmless no-op (never appends a second handoff.instagram_run event)", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "instagram", "acme.oficial");
    const { event } = await readEvent(t, scope);
    const context = { workspaceId: scope.workspaceId, accountId: scope.accountId, readingId: event.data.readingId, taskIntentId: event.data.taskIntentId };
    expect(await claimHandoffProviderAttempt(t.deps, context, "instagram")).toBe(true);

    await recordHandoffInstagramRun(t.deps, context, "run-1");
    await recordHandoffInstagramRun(t.deps, context, "run-1");
    const runEvents = await t.deps.uow.repos.events.list(scope, { eventType: "handoff.instagram_run" });
    expect(runEvents).toHaveLength(1);
  });
});
