import { describe, expect, it } from "vitest";
import { createHandoffReadHandler } from "./read";
import { FakeInstagramReader, FakeSiteReader } from "./readers";
import { executeCommand } from "../module/commands";
import { makeTestDeps, uuid } from "../module/testing/deps";
import { HANDOFF_GROUPS, readingRun, type HandoffGroup, type HandoffItem } from "../domain/handoff";
import { HANDOFF_READ_EVENT, handoffConfirmImagesSchema } from "./contract";

async function fixture() {
  const t = makeTestDeps();
  const workspaceId = uuid(); const userId = uuid();
  t.store.workspaceMembers.rows.set(uuid(), { id: uuid(), workspaceId, userId, name: "Ana", email: "ana@example.com", emailVerified: true });
  const opened = await executeCommand(t.deps, { workspaceId, actor: { kind: "system", job: "free-open" } }, { type: "open_free_account", payload: { userId } });
  if (!opened.ok) throw new Error(opened.error.code);
  const scope = { workspaceId, accountId: opened.value.accountId };
  const [person] = await t.deps.uow.repos.people.list(scope);
  const actor = { kind: "client_person", role: "approver", personId: person!.id } as const;
  const row = async () => (await t.deps.uow.repos.handoffs.list(scope))[0]!;
  const command = async (type: string, payload: Record<string, unknown> = {}) => {
    const h = await row();
    const out = await executeCommand(t.deps, { ...scope, actor }, { type, payload: { expectedStep: h.step, expectedVersion: h.version, ...payload } });
    if (!out.ok) throw new Error(out.error.code);
    return out;
  };
  await command("handoff_set_source", { kind: "site", value: "https://acme.com" });
  const event = async () => {
    const h = await row();
    const taskIntentId = h.reading.name!.taskIntentId;
    return { data: { ...scope, taskIntentId, readingId: h.readingId, source: h.source, groups: [...HANDOFF_GROUPS], runIds: Object.fromEntries(HANDOFF_GROUPS.map(g => [g, h.reading[g]!.runId])) } };
  };
  const record = async (group: HandoffGroup, items: HandoffItem[]) => {
    const h = await row(); const g = h.reading[group]!;
    return executeCommand(t.deps, { ...scope, actor: { kind: "system", job: HANDOFF_READ_EVENT } }, { type: "handoff_record_group", payload: { group, readingId: h.readingId, runId: g.runId, taskIntentId: g.taskIntentId, result: { status: items.length ? "found" : "not_found", items } } });
  };
  return { t, scope, command, row, event, record };
}

describe("review PR608: uncovered concurrency and recovery paths", () => {
  it("keeps a late SITE image when the approver has already started the Instagram partial reading", async () => {
    const f = await fixture();
    await f.record("name", [{ id: "name-site", value: "Acme", origin: "site" }]);
    await f.record("logo", []); await f.record("colors", []); await f.record("fonts", []);
    await f.record("networks", [{ id: "net-site", value: "acme.oficial", platform: "instagram", origin: "site" }]);
    const before = await f.row(); const siteImageRun = before.reading.images!;
    await f.command("handoff_confirm_identity", { name: "Acme", logo: null, colors: [], fonts: [], paletteChoice: "site" });
    await f.command("handoff_confirm_networks", { kept: ["net-site"], added: [] });
    const out = await executeCommand(f.t.deps, { ...f.scope, actor: { kind: "system", job: HANDOFF_READ_EVENT } }, { type: "handoff_record_group", payload: { group: "images", readingId: before.readingId, runId: siteImageRun.runId, taskIntentId: siteImageRun.taskIntentId, result: { status: "found", items: [{ id: "site-image", value: "/site-image.png", origin: "site" }] } } });
    expect(out.ok).toBe(true);
    expect((await f.row()).captured.images).toEqual(expect.arrayContaining([expect.objectContaining({ id: "site-image", origin: "site" })]));
  });

  it("resumes the SAME task intent if claim commits but its durable step result is lost", async () => {
    const f = await fixture(); const event = await f.event();
    const site = new FakeSiteReader();
    const handler = createHandoffReadHandler(f.t.deps, { site, instagram: new FakeInstagramReader() });
    const cache = new Map<string, unknown>(); let loseClaimResult = true;
    const step = { async run<T>(id: string, fn: () => Promise<T>): Promise<T> {
      if (cache.has(id)) return cache.get(id) as T;
      const value = await fn();
      if (id.startsWith("claim-") && loseClaimResult) { loseClaimResult = false; throw new Error("simulated loss after database commit, before step acknowledgement"); }
      cache.set(id, value); return value;
    } };
    await expect(handler({ event, step })).rejects.toThrow("simulated loss");
    expect(await handler({ event, step })).toEqual({ recorded: HANDOFF_GROUPS.length });
    expect(site.calls).toEqual(["https://acme.com/"]);
    expect((await f.row()).reading.name?.status).toBe("found");
    expect((await f.row()).readsUsed).toBe(1);
  });

  it("control: a retry with an acknowledged claim resumes without an extra reader call", async () => {
    const f = await fixture(); const event = await f.event(); const site = new FakeSiteReader();
    const handler = createHandoffReadHandler(f.t.deps, { site, instagram: new FakeInstagramReader() });
    const cache = new Map<string, unknown>(); let failOnce = true;
    const step = { async run<T>(id: string, fn: () => Promise<T>): Promise<T> {
      if (cache.has(id)) return cache.get(id) as T;
      if (id.startsWith("start-") && failOnce) { failOnce = false; throw new Error("simulated transient failure"); }
      const value = await fn(); cache.set(id, value); return value;
    } };
    await expect(handler({ event, step })).rejects.toThrow("transient");
    expect(await handler({ event, step })).toEqual({ recorded: HANDOFF_GROUPS.length });
    expect(site.calls).toHaveLength(1);
    expect((await f.row()).readsUsed).toBe(1);
  });

  it.each(["site", "instagram"] as const)("waits for both image sources, with %s returning first, and rejects the replaced Instagram run", async (first) => {
    const f = await fixture();
    await f.record("name", [{ id: "name-site", value: "Acme", origin: "site" }]);
    for (const group of ["logo", "colors", "fonts"] as const) await f.record(group, []);
    await f.record("networks", [{ id: "net-site", value: "acme.oficial", platform: "instagram", origin: "site" }]);
    await f.command("handoff_confirm_identity", { name: "Acme", logo: null, colors: [], fonts: [], paletteChoice: "site" });
    await f.command("handoff_confirm_networks", { kept: ["net-site"], added: [] });
    const active = await f.row();
    const record = async (origin: "site" | "instagram", group: "colors" | "images") => {
      const run = readingRun(active.reading[group], origin)!;
      return executeCommand(f.t.deps, { ...f.scope, actor: { kind: "system", job: HANDOFF_READ_EVENT } }, { type: "handoff_record_group", payload: {
        group, readingId: active.readingId, runId: run.runId, taskIntentId: run.taskIntentId,
        result: { status: "found", items: [{ id: `${origin}-${group}`, value: group === "colors" ? "#222222" : `/${origin}.png`, origin }] },
      } });
    };
    expect((await record(first, "images")).ok).toBe(true);
    expect((await f.row()).reading.images?.status).toBe("pending");
    await expect(f.command("handoff_confirm_images", { kept: [`${first}-images`], removed: [], uploaded: [] })).rejects.toThrow("invalid_transition");
    expect((await record(first === "site" ? "instagram" : "site", "images")).ok).toBe(true);
    await record("instagram", "colors");
    expect((await f.row()).reading.images?.status).toBe("found");
    await f.command("handoff_confirm_images", { kept: ["site-images", "instagram-images"], removed: [], uploaded: [] });
    await f.command("handoff_back_to", { step: "networks" });
    await f.command("handoff_confirm_networks", { kept: [], added: [{ platform: "instagram", value: "new.profile" }] });
    expect((await f.row()).captured.images).toEqual([expect.objectContaining({ id: "site-images" })]);
    const late = await record("instagram", "images");
    expect(late.ok && late.value.data).toEqual({ ignored: true });
    expect((await f.row()).captured.images).toEqual([expect.objectContaining({ id: "site-images" })]);
    expect((await f.row()).readsUsed).toBe(3);
  });

  it("keeps removed uploaded items across summary and return, then restores their selection", async () => {
    const f = await fixture();
    await createHandoffReadHandler(f.t.deps, { site: new FakeSiteReader(), instagram: new FakeInstagramReader() })({ event: await f.event(), step: { run: async (_id, fn) => fn() } });
    await f.command("handoff_confirm_identity", { name: "Acme", logo: null, colors: [], fonts: [], paletteChoice: "site" });
    await f.command("handoff_confirm_networks", { kept: [], added: [] });
    const id = uuid();
    f.t.gateway.addAsset({ id, workspaceId: f.scope.workspaceId, key: "upload.png", kind: "image/png" });
    const captured = (await f.row()).captured.images!.map(i => i.id);
    await f.command("handoff_confirm_images", { kept: captured, removed: [id], uploaded: [id] });
    let row = await f.row();
    expect(row.decisions.images?.uploaded).toEqual([expect.objectContaining({ id, origin: "user" })]);
    expect(row.decisions.images?.removed).toContain(id);
    await f.command("handoff_back_to", { step: "images" });
    await f.command("handoff_confirm_images", { kept: [...captured, id], removed: [], uploaded: [id] });
    row = await f.row();
    expect(row.decisions.images?.kept).toContain(id);
    expect(row.decisions.images?.removed).not.toContain(id);
  });

  it("decides up to 90 available images, rejecting overlap, unknown IDs and more than 90", async () => {
    const f = await fixture();
    await f.record("name", [{ id: "name", value: "Acme", origin: "site" }]);
    for (const group of ["logo", "colors", "fonts"] as const) await f.record(group, []);
    const siteImages = Array.from({ length: 30 }, (_, i) => ({ id: `site-${i}`, value: `/site-${i}.png`, origin: "site" as const }));
    await f.record("images", siteImages);
    await f.record("networks", [{ id: "net", value: "acme", platform: "instagram", origin: "site" }]);
    await f.command("handoff_confirm_identity", { name: "Acme", logo: null, colors: [], fonts: [], paletteChoice: "site" });
    await f.command("handoff_confirm_networks", { kept: ["net"], added: [] });
    const instagramImages = Array.from({ length: 30 }, (_, i) => ({ id: `ig-${i}`, value: `/ig-${i}.png`, origin: "instagram" as const }));
    await f.record("colors", []);
    await f.record("images", instagramImages);
    const uploaded = Array.from({ length: 30 }, () => uuid());
    for (const id of uploaded) f.t.gateway.addAsset({ id, workspaceId: f.scope.workspaceId, key: `${id}.png`, kind: "image/png" });
    const ids = [...siteImages, ...instagramImages].map(i => i.id).concat(uploaded);
    await expect(f.command("handoff_confirm_images", { kept: ids, removed: [ids[0]], uploaded })).rejects.toThrow("invalid_command");
    await expect(f.command("handoff_confirm_images", { kept: [...ids.slice(0, -1), "unknown"], removed: [], uploaded })).rejects.toThrow("invalid_command");
    const expected = { expectedStep: "images", expectedVersion: (await f.row()).version, uploaded };
    expect(handoffConfirmImagesSchema.safeParse({ ...expected, kept: [...ids, "extra"], removed: [] }).success).toBe(false);
    expect(handoffConfirmImagesSchema.safeParse({ ...expected, kept: [], removed: [...ids, "extra"] }).success).toBe(false);
    await f.command("handoff_confirm_images", { kept: ids, removed: [], uploaded });
    expect((await f.row()).decisions.images?.kept).toHaveLength(90);
    await f.command("handoff_back_to", { step: "images" });
    await f.command("handoff_confirm_images", { kept: [], removed: ids, uploaded });
    expect((await f.row()).decisions.images).toMatchObject({ kept: [], removed: ids });
    expect((await f.row()).decisions.images?.uploaded).toHaveLength(30);
  });
});

async function instagramFixture() {
  const t = makeTestDeps();
  const workspaceId = uuid(); const userId = uuid();
  t.store.workspaceMembers.rows.set(uuid(), { id: uuid(), workspaceId, userId, name: "Ana", email: "ana@example.com", emailVerified: true });
  const opened = await executeCommand(t.deps, { workspaceId, actor: { kind: "system", job: "free-open" } }, { type: "open_free_account", payload: { userId } });
  if (!opened.ok) throw new Error(opened.error.code);
  const scope = { workspaceId, accountId: opened.value.accountId };
  const [person] = await t.deps.uow.repos.people.list(scope);
  const actor = { kind: "client_person", role: "approver", personId: person!.id } as const;
  const row = async () => (await t.deps.uow.repos.handoffs.list(scope))[0]!;
  const command = async (type: string, payload: Record<string, unknown> = {}) => {
    const h = await row();
    const out = await executeCommand(t.deps, { ...scope, actor }, { type, payload: { expectedStep: h.step, expectedVersion: h.version, ...payload } });
    if (!out.ok) throw new Error(out.error.code);
    return out;
  };
  await command("handoff_set_source", { kind: "instagram", value: "marca_exemplo" });
  return { t, scope, row };
}

async function recordFailed(f: Awaited<ReturnType<typeof fixture>>, group: HandoffGroup, error: string, overrides: Partial<{ readingId: string; runId: string; taskIntentId: string }> = {}) {
  const h = await f.row(); const g = h.reading[group]!;
  return executeCommand(f.t.deps, { ...f.scope, actor: { kind: "system", job: HANDOFF_READ_EVENT } }, { type: "handoff_record_group", payload: {
    group, readingId: overrides.readingId ?? h.readingId, runId: overrides.runId ?? g.runId, taskIntentId: overrides.taskIntentId ?? g.taskIntentId,
    result: { status: "failed", items: [], error },
  } });
}

describe("readsUsed refund on an unbilled site failure (handoff.read_not_billed)", () => {
  it("refunds readsUsed once for an unbilled failure, and never again for a second group under the same taskIntentId", async () => {
    const f = await fixture();
    expect((await f.row()).readsUsed).toBe(1);
    const first = await recordFailed(f, "name", "site_dns_or_address");
    expect(first.ok).toBe(true);
    expect((await f.row()).readsUsed).toBe(0);
    expect(await f.t.deps.uow.repos.events.list(f.scope, { eventType: "handoff.read_not_billed" })).toHaveLength(1);
    // "logo" shares the SAME taskIntentId (one reading dispatch, one intent) — must not refund a second time.
    const second = await recordFailed(f, "logo", "site_dns_or_address");
    expect(second.ok).toBe(true);
    expect((await f.row()).readsUsed).toBe(0);
    expect(await f.t.deps.uow.repos.events.list(f.scope, { eventType: "handoff.read_not_billed" })).toHaveLength(1);
  });

  it("does not refund a billed/charged failure (e.g. site_unavailable)", async () => {
    const f = await fixture();
    await recordFailed(f, "name", "site_unavailable");
    expect((await f.row()).readsUsed).toBe(1);
    expect(await f.t.deps.uow.repos.events.list(f.scope, { eventType: "handoff.read_not_billed" })).toEqual([]);
  });

  it("never refunds an Instagram source failure, even with a free-looking error code (the refund is site-only)", async () => {
    const f = await instagramFixture();
    const h = await f.row(); const g = h.reading.name!;
    const out = await executeCommand(f.t.deps, { ...f.scope, actor: { kind: "system", job: HANDOFF_READ_EVENT } }, { type: "handoff_record_group", payload: {
      group: "name", readingId: h.readingId, runId: g.runId, taskIntentId: g.taskIntentId,
      result: { status: "failed", items: [], error: "reader_unavailable" },
    } });
    expect(out.ok).toBe(true);
    expect((await f.row()).readsUsed).toBe(1);
    expect(await f.t.deps.uow.repos.events.list(f.scope, { eventType: "handoff.read_not_billed" })).toEqual([]);
  });

  it("an unbilled failure for an OBSOLETE reading still refunds readsUsed, even though the group update itself is ignored", async () => {
    const f = await fixture();
    const stale = await f.row();
    const staleGroup = stale.reading.colors!;
    const staleReadingId = stale.readingId; const staleRunId = staleGroup.runId; const staleTaskIntentId = staleGroup.taskIntentId;

    // A billed failure on "name" makes the retry legitimate (some group failed).
    await recordFailed(f, "name", "site_unavailable");
    await f.command("handoff_retry_reading");
    const fresh = await f.row();
    expect(fresh.readsUsed).toBe(2);
    expect(fresh.readingId).not.toBe(staleReadingId);
    expect(fresh.reading.colors!.taskIntentId).not.toBe(staleTaskIntentId);

    // A late, unbilled result for the OLD reading's "colors" group arrives after the retry.
    const late = await executeCommand(f.t.deps, { ...f.scope, actor: { kind: "system", job: HANDOFF_READ_EVENT } }, { type: "handoff_record_group", payload: {
      group: "colors", readingId: staleReadingId, runId: staleRunId, taskIntentId: staleTaskIntentId,
      result: { status: "failed", items: [], error: "site_dns_or_address" },
    } });
    expect(late.ok && late.value.data).toEqual({ ignored: true });

    const after = await f.row();
    // The stale reading's proven-free failure still released its admission...
    expect(after.readsUsed).toBe(1);
    const events = await f.t.deps.uow.repos.events.list(f.scope, { eventType: "handoff.read_not_billed" });
    expect(events).toEqual([expect.objectContaining({ payload: expect.objectContaining({ taskIntentId: staleTaskIntentId, reason: "site_dns_or_address" }) })]);
    // ...but the CURRENT reading's "colors" group itself was not touched by the stale delivery.
    expect(after.reading.colors).toEqual(fresh.reading.colors);
  });
});
