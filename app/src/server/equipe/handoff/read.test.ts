import { describe, expect, it } from "vitest";
import { createHandoffReadHandler } from "./read";
import { FakeInstagramReader, FakeSiteReader, type InstagramReadResult, type SiteReadResult } from "./readers";
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
