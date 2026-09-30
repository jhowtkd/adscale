import { describe, expect, it } from "vitest";
import { claimHandoffProviderAttempt, createHandoffReadHandler } from "./read";
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

  it("fails only logo/colors/fonts with the reported groupError when identity() reports one, leaving name/networks/images untouched", async () => {
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
    expect(row.reading.colors).toMatchObject({ status: "failed", error: "site_vision_failed" });
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
});
