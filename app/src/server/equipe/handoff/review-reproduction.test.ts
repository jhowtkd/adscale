import { describe, expect, it } from "vitest";
import { claimHandoffProviderAttempt, createHandoffReadHandler } from "./read";
import { FakeInstagramReader, FakeSiteReader, type HandoffReaders, type HandoffReadingContext } from "./readers";
import { executeCommand } from "../module/commands";
import { makeTestDeps, uuid } from "../module/testing/deps";
import { HANDOFF_GROUPS, defaultNetworkSelection, hasFailedConfirmedInstagram, readingRun, type HandoffGroup, type HandoffItem } from "../domain/handoff";
import { HANDOFF_READ_EVENT, handoffAttachImageSchema, handoffAttachLogoSchema, handoffConfirmImagesSchema, handoffConfirmNetworksSchema } from "./contract";
import type { AdscaleAssetRef } from "../module/ports";

async function fixture() {
  const t = makeTestDeps();
  const workspaceId = uuid(); const userId = uuid();
  t.store.workspaceMembers.rows.set(uuid(), { id: uuid(), workspaceId, userId, name: "Ana", email: "ana@example.com", emailVerified: true, role: "owner", createdAt: new Date("2026-01-01T00:00:00.000Z") });
  const opened = await executeCommand(t.deps, { workspaceId, actor: { kind: "system", job: "free-open" } }, { type: "open_free_account", payload: { userId } });
  if (!opened.ok) throw new Error(opened.error.code);
  const scope = { workspaceId, accountId: opened.value.accountId };
  const [person] = await t.deps.uow.repos.people.list(scope);
  const actor = { kind: "client_person", role: "approver", personId: person!.id } as const;
  const row = async () => (await t.deps.uow.repos.handoffs.list(scope))[0]!;
  /** The outcome as the API returns it, for tests that read the refusal and not only its code. */
  const attempt = async (type: string, payload: Record<string, unknown> = {}) => {
    const h = await row();
    return executeCommand(t.deps, { ...scope, actor }, { type, payload: { expectedStep: h.step, expectedVersion: h.version, ...payload } });
  };
  const command = async (type: string, payload: Record<string, unknown> = {}) => {
    const out = await attempt(type, payload);
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
  return { t, scope, command, attempt, row, event, record, handoffId: (await row()).id };
}
async function runPendingRead(f: Awaited<ReturnType<typeof fixture>>, readers: HandoffReaders, group: HandoffGroup = "name") {
  const h = await f.row();
  const taskIntentId = h.reading[group]!.taskIntentId;
  const intent = await f.t.deps.uow.repos.taskOutbox.get(f.scope, taskIntentId);
  return createHandoffReadHandler(f.t.deps, readers)({ event: { data: { ...f.scope, taskIntentId, ...(intent!.data as object) } }, step: { run: async (_id, fn) => fn() } });
}
/** The real upload route records every handoff upload as an unbranded provisional asset of that handoff. */
function addHandoffUpload(f: Awaited<ReturnType<typeof fixture>>, handoffId: string, asset: { id: string; key: string }) {
  f.t.gateway.addAsset({ id: asset.id, workspaceId: f.scope.workspaceId, kind: "image/png", key: asset.key,
    clientProfileId: null, metadata: { provisional: true, handoffId } });
}
/** An image is only confirmable with a managed copy. Real readers save each image as a provisional asset of the reading and return its R2 key; the URL-only fakes return none. */
function withManagedImages(f: Awaited<ReturnType<typeof fixture>>, readers: HandoffReaders): HandoffReaders {
  const save = (context: HandoffReadingContext | undefined, origin: "site" | "instagram", index: number) => {
    if (!context) throw new Error("reading_context_required");
    const id = uuid();
    const key = `workspaces/${context.workspaceId}/handoff/${context.handoffId}/${context.readingId}/${context.taskIntentId}/${origin}-${index}.png`;
    f.t.store.workspaceAssets.rows.set(id, {
      id, workspaceId: context.workspaceId, clientProfileId: null, name: `${origin}-${index}.png`, key, type: "image/png", size: 1,
      width: null, height: null, source: `brand_${origin}`, tags: [], aiDescription: null,
      metadata: { handoffId: context.handoffId, readingId: context.readingId, provisional: true, kind: `${origin}_image` }, createdAt: new Date(), updatedAt: new Date(),
    });
    return key;
  };
  return {
    site: { read: async (url, context) => {
      const data = await readers.site.read(url, context);
      return { ...data, images: data.images.map((image, i) => ({ ...image, key: save(context, "site", i) })) };
    } },
    instagram: { profile: async (handle, context) => {
      const data = await readers.instagram.profile(handle, context);
      return { ...data, posts: data.posts.map((post, i) => ({ ...post, key: save(context, "instagram", i) })) };
    } },
  };
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
        result: { status: "found", items: [{ id: `${origin}-${group}`, value: group === "colors" ? "#222222" : `/${origin}.png`, origin, ...(group === "images" ? { key: `workspaces/${f.scope.workspaceId}/${origin}.png` } : {}) }] },
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
    await createHandoffReadHandler(f.t.deps, withManagedImages(f, { site: new FakeSiteReader(), instagram: new FakeInstagramReader() }))({ event: await f.event(), step: { run: async (_id, fn) => fn() } });
    await f.command("handoff_confirm_identity", { name: "Acme", logo: null, colors: [], fonts: [], paletteChoice: "site" });
    await f.command("handoff_confirm_networks", { kept: [], added: [] });
    const id = uuid();
    addHandoffUpload(f, (await f.row()).id, { id, key: "upload.png" });
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
    const siteImages = Array.from({ length: 30 }, (_, i) => ({ id: `site-${i}`, value: `/site-${i}.png`, key: `workspaces/${f.scope.workspaceId}/site-${i}.png`, origin: "site" as const }));
    await f.record("images", siteImages);
    await f.record("networks", [{ id: "net", value: "acme", platform: "instagram", origin: "site" }]);
    await f.command("handoff_confirm_identity", { name: "Acme", logo: null, colors: [], fonts: [], paletteChoice: "site" });
    await f.command("handoff_confirm_networks", { kept: ["net"], added: [] });
    const instagramImages = Array.from({ length: 30 }, (_, i) => ({ id: `ig-${i}`, value: `/ig-${i}.png`, key: `workspaces/${f.scope.workspaceId}/ig-${i}.png`, origin: "instagram" as const }));
    await f.record("colors", []);
    await f.record("images", instagramImages);
    const uploaded = Array.from({ length: 30 }, () => uuid());
    const handoffId = (await f.row()).id;
    for (const id of uploaded) addHandoffUpload(f, handoffId, { id, key: `${id}.png` });
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
  t.store.workspaceMembers.rows.set(uuid(), { id: uuid(), workspaceId, userId, name: "Ana", email: "ana@example.com", emailVerified: true, role: "owner", createdAt: new Date("2026-01-01T00:00:00.000Z") });
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

  it("refunds a PRE-dispatch Instagram failure (reader_unavailable/invalid_instagram before any handoff.instagram_dispatched marker was ever recorded)", async () => {
    const f = await instagramFixture();
    const h = await f.row(); const g = h.reading.name!;
    const out = await executeCommand(f.t.deps, { ...f.scope, actor: { kind: "system", job: HANDOFF_READ_EVENT } }, { type: "handoff_record_group", payload: {
      group: "name", readingId: h.readingId, runId: g.runId, taskIntentId: g.taskIntentId,
      result: { status: "failed", items: [], error: "reader_unavailable" },
    } });
    expect(out.ok).toBe(true);
    expect((await f.row()).readsUsed).toBe(0);
    expect(await f.t.deps.uow.repos.events.list(f.scope, { eventType: "handoff.read_not_billed" })).toHaveLength(1);
  });

  it("does NOT refund an Instagram failure once the run was actually dispatched to Apify — a local error after dispatch says nothing about whether the provider run itself was billed", async () => {
    const f = await instagramFixture();
    const h = await f.row(); const g = h.reading.name!;
    const context = { workspaceId: f.scope.workspaceId, accountId: f.scope.accountId, readingId: h.readingId!, taskIntentId: g.taskIntentId };
    expect(await claimHandoffProviderAttempt(f.t.deps, context, "instagram")).toBe(true);
    const out = await executeCommand(f.t.deps, { ...f.scope, actor: { kind: "system", job: HANDOFF_READ_EVENT } }, { type: "handoff_record_group", payload: {
      group: "name", readingId: h.readingId, runId: g.runId, taskIntentId: g.taskIntentId,
      result: { status: "failed", items: [], error: "reader_unavailable" },
    } });
    expect(out.ok).toBe(true);
    expect((await f.row()).readsUsed).toBe(1);
    expect(await f.t.deps.uow.repos.events.list(f.scope, { eventType: "handoff.read_not_billed" })).toEqual([]);
  });

  it("does not refund a billed/uncertain Instagram failure (e.g. reading_failed)", async () => {
    const f = await instagramFixture();
    const h = await f.row(); const g = h.reading.name!;
    const out = await executeCommand(f.t.deps, { ...f.scope, actor: { kind: "system", job: HANDOFF_READ_EVENT } }, { type: "handoff_record_group", payload: {
      group: "name", readingId: h.readingId, runId: g.runId, taskIntentId: g.taskIntentId,
      result: { status: "failed", items: [], error: "reading_failed" },
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

describe("PR608 bot review: managed logos and decisions for confirmed Instagram", () => {
  it("rejects confirming a captured logo without a managed key", async () => {
    const f = await fixture();
    await runPendingRead(f, { site: new FakeSiteReader(), instagram: new FakeInstagramReader() });
    const h = await f.row();
    await expect(f.command("handoff_confirm_identity", { name: "Acme", logo: h.captured.logo![0]!.id, colors: [], fonts: [], paletteChoice: "site" })).rejects.toThrow("invalid_command");
    expect((await f.row()).step).toBe("identity");
    expect((await f.row()).decisions.identity).toBeUndefined();
  });

  it("rejects keeping a captured image without a managed key, but lets the person remove it", async () => {
    const f = await fixture();
    await runPendingRead(f, { site: new FakeSiteReader(), instagram: new FakeInstagramReader() });
    await f.command("handoff_confirm_identity", { name: "Acme", logo: null, colors: [], fonts: [], paletteChoice: "site" });
    await f.command("handoff_confirm_networks", { kept: [], added: [] });
    const ids = (await f.row()).captured.images!.map(i => i.id);
    expect(ids).not.toHaveLength(0);
    await expect(f.command("handoff_confirm_images", { kept: ids, removed: [], uploaded: [] })).rejects.toThrow("invalid_command");
    expect((await f.row()).step).toBe("images");
    expect((await f.row()).decisions.images).toBeUndefined();
    await f.command("handoff_confirm_images", { kept: [], removed: ids, uploaded: [] });
    expect((await f.row()).step).toBe("summary");
  });

  it.each(["site", "instagram", "user"] as const)("persists the managed %s logo in the existing profile", async (origin) => {
    const f = await fixture();
    if (origin === "instagram") await f.command("handoff_set_source", { kind: "instagram", value: "acme" });
    const key = `workspaces/${f.scope.workspaceId}/${origin}-logo.png`;
    await runPendingRead(f, {
      site: new FakeSiteReader({ title: "Acme", siteName: "Acme", markdown: "", links: [], images: [], screenshotUrl: null, branding: origin === "site" ? { logo: { url: "/logo.png", key } } : undefined }),
      instagram: new FakeInstagramReader({ exists: true, isPrivate: false, name: "Acme", avatarUrl: "/logo.png", avatarKey: key, bio: "", posts: [] }),
    });
    let h = await f.row();
    const logo = origin === "user" ? uuid() : h.captured.logo![0]!.id;
    if (origin === "user") addHandoffUpload(f, h.id, { id: logo, key });
    await f.command("handoff_confirm_identity", { name: "Acme", logo, colors: [], fonts: [], paletteChoice: "user" });
    h = await f.row();
    await f.command("handoff_confirm_networks", { kept: (h.decisions.networks ?? []).map(i => i.id), added: [] });
    await f.command("handoff_confirm_images", { kept: [], removed: [], uploaded: [] });
    f.t.store.workspaceAssets.rows.set(logo, {
      id: logo, workspaceId: f.scope.workspaceId, clientProfileId: null, name: "logo.png", key, type: "image/png", size: 1,
      width: null, height: null, source: "brand_upload", tags: [], aiDescription: null,
      metadata: { provisional: true, handoffId: h.id }, createdAt: new Date(), updatedAt: new Date(),
    });
    await f.command("handoff_confirm_summary");
    h = await f.row();
    expect(h.step).toBe("done");
    expect(f.t.store.adscaleProfiles.rows.get(h.clientProfileId)).toMatchObject({ logoAssetKey: key });
  });

  it.each(["private", "missing", "provider"])("blocks diagnosis for a %s confirmed Instagram despite successful site groups, then allows removal", async (failure) => {
    const f = await fixture();
    await runPendingRead(f, withManagedImages(f, { site: new FakeSiteReader(), instagram: new FakeInstagramReader() }));
    await f.command("handoff_confirm_identity", { name: "Acme", logo: null, colors: [], fonts: [], paletteChoice: "site" });
    await f.command("handoff_confirm_networks", { kept: (await f.row()).captured.networks!.map(i => i.id), added: [] });
    await runPendingRead(f, {
      site: new FakeSiteReader(), instagram: new FakeInstagramReader(failure === "provider" ? new Error("provider_failure") : { exists: failure !== "missing", isPrivate: failure === "private", avatarUrl: null, bio: "", posts: [] }),
    }, "colors");
    let h = await f.row();
    expect(h.reading.images?.status).toBe("found"); // Site succeeded; the Instagram run still failed.
    expect(h.reading.images?.bySource?.instagram?.status).toBe("failed");
    await f.command("handoff_confirm_images", { kept: h.captured.images!.map(i => i.id), removed: [], uploaded: [] });
    await expect(f.command("handoff_confirm_summary")).rejects.toThrow("invalid_transition");
    expect([...(f.t.store.taskOutbox.rows.values())].some(i => i.eventName === "equipe.handoff.diagnose")).toBe(false);
    await f.command("handoff_back_to", { step: "networks" });
    await f.command("handoff_confirm_networks", { kept: [], added: [] });
    await f.command("handoff_confirm_summary");
    h = await f.row();
    expect(h.step).toBe("done");
    expect(h.readsUsed).toBe(2);
  });

  it.each([false, true])("reconfirms images after replacing Instagram, all old images removed=%s", async (allRemoved) => {
    const f = await fixture();
    const readers = withManagedImages(f, { site: new FakeSiteReader(), instagram: new FakeInstagramReader() });
    await runPendingRead(f, readers);
    await f.command("handoff_confirm_identity", { name: "Acme", logo: null, colors: [], fonts: [], paletteChoice: "site" });
    await f.command("handoff_confirm_networks", { kept: (await f.row()).captured.networks!.map(i => i.id), added: [] });
    await runPendingRead(f, readers, "colors");
    let h = await f.row();
    const siteIds = h.captured.images!.filter(i => i.origin === "site").map(i => i.id);
    const oldIds = h.captured.images!.filter(i => i.origin === "instagram").map(i => i.id);
    await f.command("handoff_confirm_images", { kept: allRemoved ? siteIds : [...siteIds, ...oldIds], removed: allRemoved ? oldIds : [], uploaded: [] });
    await f.command("handoff_back_to", { step: "networks" });
    await f.command("handoff_confirm_networks", { kept: [], added: [{ platform: "instagram", value: "new.profile" }] });
    h = await f.row();
    expect(h.step).toBe("images");
    expect(h.decisions.needsConfirmation).toContain("images");
    expect(h.decisions.images?.kept).toEqual(siteIds);
    expect(h.decisions.images?.removed).toEqual([]);
    await runPendingRead(f, readers, "colors");
    await expect(f.command("handoff_confirm_summary")).rejects.toThrow("invalid_transition");
    h = await f.row();
    await f.command("handoff_confirm_images", { kept: h.captured.images!.map(i => i.id), removed: [], uploaded: [] });
    await f.command("handoff_confirm_summary");
    expect((await f.row()).step).toBe("done");
  });
});

type Fixture = Awaited<ReturnType<typeof fixture>>;
/** The fakes with managed copies of the images they capture: a kept image is only confirmable with one. */
const readers = (f: Fixture) => withManagedImages(f, { site: new FakeSiteReader(), instagram: new FakeInstagramReader() });
async function atIdentity() {
  const f = await fixture();
  await runPendingRead(f, readers(f));
  expect((await f.row()).step).toBe("identity");
  return f;
}
async function atNetworks() {
  const f = await atIdentity();
  await f.command("handoff_confirm_identity", { name: "Acme", logo: null, colors: [], fonts: [], paletteChoice: "site" });
  expect((await f.row()).step).toBe("networks");
  return f;
}
async function atImages() {
  const f = await atNetworks();
  await f.command("handoff_confirm_networks", { kept: [], added: [] });
  expect((await f.row()).step).toBe("images");
  return f;
}
async function atSummary() {
  const f = await atImages();
  await f.command("handoff_confirm_images", { kept: (await f.row()).captured.images!.map(i => i.id), removed: [], uploaded: [] });
  expect((await f.row()).step).toBe("summary");
  return f;
}
/** The account has already requested `count` readings (a reading is charged when it is requested, not when it ends). */
async function withReadsUsed(f: Fixture, count: number) {
  await f.t.deps.uow.repos.handoffs.update(f.scope, (await f.row()).id, { readsUsed: count });
}
/** An upload the workspace already stores (the upload endpoint ran, recording it as this handoff's provisional asset), as the gateway sees it. */
function upload(f: Fixture, extra: Partial<AdscaleAssetRef> = {}) {
  const id = uuid();
  const key = `workspaces/${f.scope.workspaceId}/${id}.png`;
  f.t.gateway.addAsset({ id, workspaceId: f.scope.workspaceId, kind: "image/png", key,
    clientProfileId: null, metadata: { provisional: true, handoffId: f.handoffId }, ...extra });
  return { id, key };
}

describe("PR610 bot review: an uploaded logo is persisted before identity is confirmed", () => {
  it("keeps the managed upload as the provisional logo without advancing, bumping or deciding anything", async () => {
    const f = await atIdentity(); const before = await f.row();
    const { id, key } = upload(f);
    const out = await f.command("handoff_attach_logo", { logo: id });
    const after = await f.row();
    expect(after.decisions.uploadedLogo).toEqual({ id, value: `/api/workspace/assets/${id}/file`, origin: "user", key });
    expect(after.decisions.identity).toBeUndefined();
    expect([after.step, after.version]).toEqual([before.step, before.version]);
    // Recorded for audit, but nothing is posted to the conversation for a draft upload.
    expect(out.value.events.map(e => e.eventType)).toEqual(["handoff.logo_attached"]);
  });

  it("replaces the provisional logo when the person uploads another one", async () => {
    const f = await atIdentity();
    const first = upload(f); const second = upload(f);
    await f.command("handoff_attach_logo", { logo: first.id });
    await f.command("handoff_attach_logo", { logo: second.id });
    expect((await f.row()).decisions.uploadedLogo?.id).toBe(second.id);
  });

  it("confirming identity with the uploaded logo moves it into the decision and clears the draft", async () => {
    const f = await atIdentity(); const { id, key } = upload(f);
    await f.command("handoff_attach_logo", { logo: id });
    await f.command("handoff_confirm_identity", { name: "Acme", logo: id, colors: [], fonts: [], paletteChoice: "user" });
    const row = await f.row();
    expect(row.decisions.identity?.logo).toEqual({ id, value: `/api/workspace/assets/${id}/file`, origin: "user", key });
    expect(row.decisions.uploadedLogo).toBeUndefined();
  });

  it("confirming identity without the uploaded logo drops the draft instead of letting it linger", async () => {
    const f = await atIdentity(); const { id } = upload(f);
    await f.command("handoff_attach_logo", { logo: id });
    await f.command("handoff_confirm_identity", { name: "Acme", logo: null, colors: [], fonts: [], paletteChoice: "user" });
    const row = await f.row();
    expect(row.decisions.identity?.logo).toBeNull();
    expect(row.decisions.uploadedLogo).toBeUndefined();
  });

  it("a fresh reading discards the draft together with the rest of the decisions", async () => {
    const f = await atIdentity(); const { id } = upload(f);
    await f.command("handoff_attach_logo", { logo: id });
    await f.command("handoff_set_source", { kind: "site", value: "https://other.example.com" });
    const row = await f.row();
    expect(row.step).toBe("reading");
    expect(row.decisions.uploadedLogo).toBeUndefined();
  });

  it.each([
    ["an upload without a managed copy", { key: undefined }],
    ["an asset of another workspace", { workspaceId: uuid() }],
    ["an asset that is not an image", { kind: "application/pdf" }],
    ["an upload made for another handoff", { metadata: { provisional: true, handoffId: uuid() } }],
    ["a Library asset no handoff uploaded", { metadata: null }],
    ["an asset of another brand", { clientProfileId: uuid() }],
  ] as const)("refuses %s and keeps the state untouched", async (_name, extra) => {
    const f = await atIdentity(); const before = await f.row();
    const { id } = upload(f, extra);
    await expect(f.command("handoff_attach_logo", { logo: id })).rejects.toThrow("invalid_command");
    const after = await f.row();
    expect(after.decisions.uploadedLogo).toBeUndefined();
    expect(after.version).toBe(before.version);
  });

  it("refuses an asset id the gateway does not know", async () => {
    const f = await atIdentity();
    await expect(f.command("handoff_attach_logo", { logo: uuid() })).rejects.toThrow("invalid_command");
    expect((await f.row()).decisions.uploadedLogo).toBeUndefined();
  });

  it("only takes the logo while the identity step is open", async () => {
    const f = await fixture(); // still reading
    const { id } = upload(f);
    await expect(f.command("handoff_attach_logo", { logo: id })).rejects.toThrow("invalid_transition");
    expect((await f.row()).decisions.uploadedLogo).toBeUndefined();
  });

  it("refuses a card that no longer matches the step/version it saw", async () => {
    const f = await atIdentity(); const before = await f.row(); const { id } = upload(f);
    await expect(f.command("handoff_attach_logo", { logo: id, expectedVersion: before.version + 1 })).rejects.toThrow("stale_version");
    expect((await f.row()).decisions.uploadedLogo).toBeUndefined();
  });

  it.each([
    ["a system job", { kind: "system", job: "someone-else" } as const],
    ["the reading task", { kind: "system", job: HANDOFF_READ_EVENT } as const],
  ])("is reserved to the approver, not %s", async (_name, actor) => {
    const f = await atIdentity(); const before = await f.row(); const { id } = upload(f);
    const out = await executeCommand(f.t.deps, { ...f.scope, actor }, { type: "handoff_attach_logo", payload: { expectedStep: before.step, expectedVersion: before.version, logo: id } });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("forbidden_actor");
    expect((await f.row()).decisions.uploadedLogo).toBeUndefined();
  });

  it("is part of the command contract: an uploaded asset id only, with the step and version the card saw", () => {
    const expected = { expectedStep: "identity", expectedVersion: 3 };
    expect(handoffAttachLogoSchema.safeParse({ ...expected, logo: uuid() }).success).toBe(true);
    expect(handoffAttachLogoSchema.safeParse({ ...expected, logo: "not-an-asset-id" }).success).toBe(false);
    expect(handoffAttachLogoSchema.safeParse({ ...expected, logo: null }).success).toBe(false);
    expect(handoffAttachLogoSchema.safeParse({ ...expected, logo: uuid(), extra: true }).success).toBe(false);
    expect(handoffAttachLogoSchema.safeParse({ logo: uuid() }).success).toBe(false);
  });
});

describe("PR610 bot review: images uploaded before confirming are persisted too", () => {
  it("keeps each managed upload as a saved draft without advancing, bumping or deciding anything", async () => {
    const f = await atImages(); const before = await f.row();
    const first = upload(f); const second = upload(f);
    const out = await f.command("handoff_attach_image", { image: first.id });
    await f.command("handoff_attach_image", { image: second.id });
    const after = await f.row();
    expect(after.decisions.uploadedImages).toEqual([
      { id: first.id, value: `/api/workspace/assets/${first.id}/file`, origin: "user", key: first.key },
      { id: second.id, value: `/api/workspace/assets/${second.id}/file`, origin: "user", key: second.key },
    ]);
    expect(after.decisions.images).toBeUndefined();
    expect([after.step, after.version]).toEqual([before.step, before.version]);
    // Recorded for audit, but nothing is posted to the conversation for a draft upload.
    expect(out.value.events.map(e => e.eventType)).toEqual(["handoff.image_attached"]);
  });

  it("treats saving the same upload again as a no-op", async () => {
    const f = await atImages(); const { id } = upload(f);
    await f.command("handoff_attach_image", { image: id });
    const again = await f.command("handoff_attach_image", { image: id });
    expect((await f.row()).decisions.uploadedImages).toHaveLength(1);
    expect(again.value.events).toEqual([]);
  });

  it("confirming images moves the saved uploads into the decision and clears the drafts", async () => {
    const f = await atImages(); const a = upload(f); const b = upload(f);
    await f.command("handoff_attach_image", { image: a.id });
    await f.command("handoff_attach_image", { image: b.id });
    const captured = (await f.row()).captured.images!.map(i => i.id);
    await f.command("handoff_confirm_images", { kept: [...captured, a.id], removed: [b.id], uploaded: [a.id, b.id] });
    const row = await f.row();
    expect(row.decisions.images?.uploaded.map(i => i.id)).toEqual([a.id, b.id]);
    expect(row.decisions.images?.kept).toContain(a.id);
    expect(row.decisions.images?.removed).toEqual([b.id]);
    expect(row.decisions.uploadedImages).toBeUndefined();
  });

  it("drops a saved upload the confirming card did not list instead of adopting it behind the person's back", async () => {
    const f = await atImages(); const { id } = upload(f);
    await f.command("handoff_attach_image", { image: id });
    const captured = (await f.row()).captured.images!.map(i => i.id);
    await f.command("handoff_confirm_images", { kept: captured, removed: [], uploaded: [] });
    const row = await f.row();
    expect(row.decisions.images?.uploaded).toEqual([]);
    expect(row.decisions.images?.kept).not.toContain(id);
    expect(row.decisions.uploadedImages).toBeUndefined();
  });

  it("a fresh reading discards the saved uploads together with the rest of the decisions", async () => {
    const f = await atImages(); const { id } = upload(f);
    await f.command("handoff_attach_image", { image: id });
    await f.command("handoff_set_source", { kind: "site", value: "https://other.example.com" });
    const row = await f.row();
    expect(row.step).toBe("reading");
    expect(row.decisions.uploadedImages).toBeUndefined();
  });

  it("allows up to 30 uploads, counting the decided ones and the saved drafts together", async () => {
    const f = await atImages();
    const decided = Array.from({ length: 29 }, () => upload(f).id);
    const captured = (await f.row()).captured.images!.map(i => i.id);
    await f.command("handoff_confirm_images", { kept: [...captured, ...decided], removed: [], uploaded: decided });
    await f.command("handoff_back_to", { step: "images" });
    await f.command("handoff_attach_image", { image: upload(f).id }); // the 30th
    await expect(f.command("handoff_attach_image", { image: upload(f).id })).rejects.toThrow("invalid_command"); // the 31st
    expect((await f.row()).decisions.uploadedImages).toHaveLength(1);
  });

  it("does not count a saved draft twice once it was also decided", async () => {
    const f = await atImages(); const { id } = upload(f);
    const captured = (await f.row()).captured.images!.map(i => i.id);
    await f.command("handoff_confirm_images", { kept: [...captured, id], removed: [], uploaded: [id] });
    await f.command("handoff_back_to", { step: "images" });
    await f.command("handoff_attach_image", { image: id });
    expect((await f.row()).decisions.uploadedImages ?? []).toEqual([]);
    expect((await f.row()).decisions.images?.uploaded).toHaveLength(1);
  });

  it.each([
    ["an upload without a managed copy", { key: undefined }],
    ["an asset of another workspace", { workspaceId: uuid() }],
    ["an asset that is not an image", { kind: "application/pdf" }],
    ["an upload made for another handoff", { metadata: { provisional: true, handoffId: uuid() } }],
    ["a Library asset no handoff uploaded", { metadata: null }],
    ["an asset of another brand", { clientProfileId: uuid() }],
  ] as const)("refuses %s and keeps the state untouched", async (_name, extra) => {
    const f = await atImages(); const before = await f.row();
    const { id } = upload(f, extra);
    await expect(f.command("handoff_attach_image", { image: id })).rejects.toThrow("invalid_command");
    const after = await f.row();
    expect(after.decisions.uploadedImages).toBeUndefined();
    expect(after.version).toBe(before.version);
  });

  it("refuses an asset id the gateway does not know", async () => {
    const f = await atImages();
    await expect(f.command("handoff_attach_image", { image: uuid() })).rejects.toThrow("invalid_command");
    expect((await f.row()).decisions.uploadedImages).toBeUndefined();
  });

  it("only takes uploads while the images step is open", async () => {
    const f = await atIdentity(); const { id } = upload(f);
    await expect(f.command("handoff_attach_image", { image: id })).rejects.toThrow("invalid_transition");
    expect((await f.row()).decisions.uploadedImages).toBeUndefined();
  });

  it("refuses a card that no longer matches the step/version it saw", async () => {
    const f = await atImages(); const before = await f.row(); const { id } = upload(f);
    await expect(f.command("handoff_attach_image", { image: id, expectedVersion: before.version + 1 })).rejects.toThrow("stale_version");
    expect((await f.row()).decisions.uploadedImages).toBeUndefined();
  });

  it.each([
    ["a system job", { kind: "system", job: "someone-else" } as const],
    ["the reading task", { kind: "system", job: HANDOFF_READ_EVENT } as const],
  ])("is reserved to the approver, not %s", async (_name, actor) => {
    const f = await atImages(); const before = await f.row(); const { id } = upload(f);
    const out = await executeCommand(f.t.deps, { ...f.scope, actor }, { type: "handoff_attach_image", payload: { expectedStep: before.step, expectedVersion: before.version, image: id } });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("forbidden_actor");
    expect((await f.row()).decisions.uploadedImages).toBeUndefined();
  });

  it("is part of the command contract: an uploaded asset id only, with the step and version the card saw", () => {
    const expected = { expectedStep: "images", expectedVersion: 3 };
    expect(handoffAttachImageSchema.safeParse({ ...expected, image: uuid() }).success).toBe(true);
    expect(handoffAttachImageSchema.safeParse({ ...expected, image: "not-an-asset-id" }).success).toBe(false);
    expect(handoffAttachImageSchema.safeParse({ ...expected, image: null }).success).toBe(false);
    expect(handoffAttachImageSchema.safeParse({ ...expected, image: uuid(), extra: true }).success).toBe(false);
    expect(handoffAttachImageSchema.safeParse({ image: uuid() }).success).toBe(false);
  });
});

describe("PR612 bot review: a social link must belong to the platform it is saved under", () => {
  it.each([
    ["facebook", "https://www.facebook.com/acme"],
    ["facebook", "https://fb.com/acme"],
    ["tiktok", "https://www.tiktok.com/@acme"],
    ["linkedin", "https://br.linkedin.com/company/acme"],
    ["youtube", "https://youtu.be/abc123"],
  ] as const)("keeps the %s link %s the person added", async (platform, value) => {
    const f = await atNetworks();
    await f.command("handoff_confirm_networks", { kept: [], added: [{ platform, value }] });
    expect((await f.row()).decisions.networks).toEqual([expect.objectContaining({ platform, value, origin: "user" })]);
  });

  it.each([
    ["facebook", "https://unrelated.com/acme"],
    ["facebook", "https://facebook.com.evil.com/acme"],
    ["tiktok", "https://www.facebook.com/acme"],
    ["linkedin", "https://fakelinkedin.com/company/acme"],
    ["youtube", "https://youtube.evil.com/@acme"],
  ] as const)("refuses the %s link %s and saves nothing", async (platform, value) => {
    const f = await atNetworks(); const before = await f.row();
    await expect(f.command("handoff_confirm_networks", { kept: [], added: [{ platform, value }] })).rejects.toThrow("invalid_source");
    const after = await f.row();
    expect(after.decisions.networks).toBeUndefined();
    expect([after.step, after.version]).toEqual([before.step, before.version]);
  });

  it("refuses the whole command when one added link is on the wrong host, even next to valid ones", async () => {
    const f = await atNetworks();
    await expect(f.command("handoff_confirm_networks", { kept: [], added: [
      { platform: "facebook", value: "https://www.facebook.com/acme" },
      { platform: "youtube", value: "https://www.facebook.com/acme" },
    ] })).rejects.toThrow("invalid_source");
    expect((await f.row()).decisions.networks).toBeUndefined();
  });

  it("still accepts an Instagram profile next to a valid link for another platform", async () => {
    const f = await atNetworks();
    await f.command("handoff_confirm_networks", { kept: [], added: [
      { platform: "instagram", value: "@acme" },
      { platform: "facebook", value: "https://www.facebook.com/acme" },
    ] });
    expect((await f.row()).decisions.networks?.map(i => [i.platform, i.value])).toEqual([["instagram", "acme"], ["facebook", "https://www.facebook.com/acme"]]);
  });

  it.each([
    ["facebook", ["Facebook", "facebook.com", "fb.com"]],
    ["tiktok", ["TikTok", "tiktok.com"]],
    ["linkedin", ["LinkedIn", "linkedin.com"]],
    ["youtube", ["YouTube", "youtube.com", "youtu.be"]],
  ] as const)("tells the person which link the %s network expects", async (platform, expected) => {
    const f = await atNetworks(); const before = await f.row();
    const [person] = await f.t.deps.uow.repos.people.list(f.scope);
    const actor = { kind: "client_person", role: "approver", personId: person!.id } as const;
    const out = await executeCommand(f.t.deps, { ...f.scope, actor }, { type: "handoff_confirm_networks", payload: {
      expectedStep: before.step, expectedVersion: before.version, kept: [], added: [{ platform, value: "https://unrelated.com/acme" }],
    } });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe("invalid_source");
    for (const part of expected) expect(out.error.message).toContain(part);
  });
});

describe("PR608 bot review: nothing from a replaced Instagram profile stays in the identity decision", () => {
  const item = (id: string, value: string, origin: HandoffItem["origin"], extra: Partial<HandoffItem> = {}): HandoffItem => ({ id, value, origin, ...extra });

  /** Site read, Instagram confirmed (its colors/images read in), everything decided up to the summary. */
  async function atSummaryWithInstagram(identity: Record<string, unknown>, captured: Partial<Record<"name", HandoffItem[]>> = {}) {
    const f = await atIdentity();
    await f.command("handoff_confirm_identity", { name: "Acme", logo: null, colors: [], fonts: [], paletteChoice: "site" });
    const handle = (await f.row()).captured.networks!.find(i => i.platform === "instagram")!;
    await f.command("handoff_confirm_networks", { kept: [handle.id], added: [] });
    await runPendingRead(f, readers(f), "colors");
    const read = await f.row();
    await f.command("handoff_confirm_images", { kept: read.captured.images!.map(i => i.id), removed: [], uploaded: [] });
    expect((await f.row()).step).toBe("summary");
    // The identity decision as a revision could have left it, with fields that came from the Instagram profile.
    const row = await f.row();
    await f.t.deps.uow.repos.handoffs.update(f.scope, row.id, { captured: { ...row.captured, ...captured }, decisions: { ...row.decisions, identity: identity as never } });
    return f;
  }
  const replaceOrRemove = async (f: Fixture, how: "replaced" | "removed") => {
    await f.command("handoff_back_to", { step: "networks" });
    await f.command("handoff_confirm_networks", { kept: [], added: how === "replaced" ? [{ platform: "instagram", value: "new.profile" }] : [] });
  };
  const mixed = () => ({
    name: item("ig-name", "Acme Oficial", "instagram"), logo: item("ig-logo", "/ig-logo.png", "instagram", { key: "workspaces/ws/ig-logo.png" }),
    colors: [item("c-site", "#333333", "site"), item("c-ig", "#B45309", "instagram")],
    fonts: [item("f-site", "Inter", "site"), item("f-ig", "Pacifico", "instagram")], paletteChoice: "site",
  });

  it.each(["replaced", "removed"] as const)("when the profile is %s, drops the Instagram name, logo, colors and fonts and asks to reconfirm identity", async (how) => {
    const f = await atSummaryWithInstagram(mixed());
    await replaceOrRemove(f, how);
    const row = await f.row();
    expect(row.step).toBe("identity");
    expect(row.decisions.needsConfirmation).toContain("identity");
    const identity = row.decisions.identity!;
    expect(identity.name).toMatchObject({ value: "Marca de exemplo", origin: "site" }); // the next best name, to be reconfirmed
    expect(identity.logo).toBeNull();
    expect(identity.colors.map(i => i.value)).toEqual(["#333333"]);
    expect(identity.fonts.map(i => i.value)).toEqual(["Inter"]);
    expect(JSON.stringify(identity)).not.toContain('"origin":"instagram"');
  });

  it.each([
    ["name", { name: item("ig-name", "Acme Oficial", "instagram") }],
    ["logo", { logo: item("ig-logo", "/ig-logo.png", "instagram", { key: "workspaces/ws/ig-logo.png" }) }],
    ["fonts", { fonts: [item("f-ig", "Pacifico", "instagram")] }],
    ["colors", { colors: [item("c-ig", "#B45309", "instagram")] }],
  ])("a %s that came from the replaced profile is enough to ask the person to reconfirm identity", async (_field, override) => {
    const clean = { name: item("n-site", "Marca do site", "site"), logo: null, colors: [item("c-site", "#333333", "site")], fonts: [item("f-site", "Inter", "site")], paletteChoice: "site" };
    const f = await atSummaryWithInstagram({ ...clean, ...override });
    await replaceOrRemove(f, "replaced");
    const row = await f.row();
    expect(row.decisions.needsConfirmation).toContain("identity");
    expect(JSON.stringify(row.decisions.identity)).not.toContain('"origin":"instagram"');
  });

  it("falls back to a name from another source, never to one the rejected profile supplied", async () => {
    const f = await atSummaryWithInstagram(mixed(), { name: [item("cap-ig", "Acme (Instagram)", "instagram"), item("cap-site", "Marca do site", "site")] });
    await replaceOrRemove(f, "replaced");
    expect((await f.row()).decisions.identity!.name).toMatchObject({ value: "Marca do site", origin: "site" });
  });

  it("asks the person to type the name again when no other source has one", async () => {
    const f = await atSummaryWithInstagram(mixed());
    const row = await f.row();
    await f.t.deps.uow.repos.handoffs.update(f.scope, row.id, { captured: { ...row.captured, name: [] } });
    await replaceOrRemove(f, "replaced");
    const identity = (await f.row()).decisions.identity!;
    expect(identity.name).toMatchObject({ value: "", origin: "user" });
    expect((await f.row()).decisions.needsConfirmation).toContain("identity");
  });

  it("keeps what the person decided or what another source supplied", async () => {
    const f = await atSummaryWithInstagram({
      name: item("typed", "Acme Studio", "user"), logo: item("up", "/api/workspace/assets/up/file", "user", { key: "workspaces/ws/up.png" }),
      colors: [item("c-site", "#333333", "site"), item("c-user", "#112233", "user")], fonts: [item("f-site", "Inter", "site")], paletteChoice: "user",
    });
    const before = (await f.row()).decisions.identity;
    await replaceOrRemove(f, "replaced");
    const row = await f.row();
    expect(row.decisions.identity).toEqual(before);
    expect(row.decisions.needsConfirmation ?? []).not.toContain("identity");
  });
});

describe("PR608 bot review: a failed incremental Instagram read is retried with the confirmed profile", () => {
  const READER_ACTOR = { kind: "system", job: HANDOFF_READ_EVENT } as const;
  const instagramRun = (h: Awaited<ReturnType<Fixture["row"]>>, group: "colors" | "images") => readingRun(h.reading[group], "instagram")!;
  const readIntents = (f: Fixture) => [...f.t.store.taskOutbox.rows.values()].filter(i => i.eventName === HANDOFF_READ_EVENT);

  /** Site read, Instagram confirmed from the networks step, then its incremental read fails. */
  async function withFailedInstagram() {
    const f = await atIdentity();
    await f.command("handoff_confirm_identity", { name: "Acme", logo: null, colors: [], fonts: [], paletteChoice: "site" });
    const handle = (await f.row()).captured.networks!.find(i => i.platform === "instagram")!;
    await f.command("handoff_confirm_networks", { kept: [handle.id], added: [] });
    await runPendingRead(f, { site: new FakeSiteReader(), instagram: new FakeInstagramReader(new Error("provider_failure")) }, "colors");
    const failed = await f.row();
    expect(failed.step).toBe("images");
    expect(hasFailedConfirmedInstagram(failed)).toBe(true);
    return { f, handle: handle.value };
  }
  const recordInstagram = async (f: Fixture, group: "colors" | "images", result: object, runId?: string) => {
    const h = await f.row(); const run = instagramRun(h, group);
    return executeCommand(f.t.deps, { ...f.scope, actor: READER_ACTOR }, { type: "handoff_record_group", payload: {
      group, readingId: h.readingId, runId: runId ?? run.runId, taskIntentId: run.taskIntentId, result } });
  };

  it("reads the failed groups again with the confirmed handle, in place: same step, version, decisions and captured items", async () => {
    const { f, handle } = await withFailedInstagram();
    const before = await f.row();
    await f.command("handoff_retry_reading");
    const after = await f.row();
    expect([after.step, after.version, after.readingId]).toEqual([before.step, before.version, before.readingId]);
    expect(after.readsUsed).toBe(before.readsUsed + 1);
    expect(after.decisions).toEqual(before.decisions);
    expect(after.captured).toEqual(before.captured);
    for (const group of ["colors", "images"] as const) {
      expect(instagramRun(after, group)).toMatchObject({ status: "pending" });
      expect(instagramRun(after, group).runId).not.toBe(instagramRun(before, group).runId);
      expect(readingRun(after.reading[group], "site")).toEqual(readingRun(before.reading[group], "site"));
    }
    const latest = readIntents(f).at(-1)!;
    expect(latest.data).toMatchObject({ readingId: before.readingId, source: { kind: "instagram", normalized: handle }, groups: ["colors", "images"] });
    expect(handle).toBeTruthy();
  });

  it("clears the failure when the retried read succeeds, and the handoff can then be confirmed", async () => {
    const { f } = await withFailedInstagram();
    await f.command("handoff_retry_reading");
    expect(hasFailedConfirmedInstagram(await f.row())).toBe(false);
    await runPendingRead(f, readers(f), "colors");
    const read = await f.row();
    expect(hasFailedConfirmedInstagram(read)).toBe(false);
    expect(read.reading.images?.bySource?.instagram?.status).toBe("found");
    await f.command("handoff_confirm_images", { kept: read.captured.images!.map(i => i.id), removed: [], uploaded: [] });
    await f.command("handoff_confirm_summary");
    const done = await f.row();
    expect(done.step).toBe("done");
    expect(done.readsUsed).toBe(3);
  });

  it("works from the summary too: the images it brings are new to the person, so they go back to decide on them", async () => {
    const { f } = await withFailedInstagram();
    await f.command("handoff_confirm_images", { kept: (await f.row()).captured.images!.map(i => i.id), removed: [], uploaded: [] });
    await expect(f.command("handoff_confirm_summary")).rejects.toThrow("invalid_transition");
    const before = await f.row();
    await f.command("handoff_retry_reading");
    const retried = await f.row();
    expect(retried.step).toBe("images");
    expect(retried.decisions.needsConfirmation).toContain("images");
    expect(retried.decisions.images).toEqual(before.decisions.images); // what was decided stays until they reconfirm
    await runPendingRead(f, readers(f), "colors");
    const read = await f.row();
    expect(hasFailedConfirmedInstagram(read)).toBe(false);
    await expect(f.command("handoff_confirm_images", { kept: [], removed: [], uploaded: [] })).rejects.toThrow("invalid_command");
    await f.command("handoff_confirm_images", { kept: read.captured.images!.map(i => i.id), removed: [], uploaded: [] });
    await f.command("handoff_confirm_summary");
    expect((await f.row()).step).toBe("done");
  });

  it("does not ask for reconfirmation when the images were not decided yet", async () => {
    const { f } = await withFailedInstagram();
    await f.command("handoff_retry_reading");
    const row = await f.row();
    expect(row.step).toBe("images");
    expect(row.decisions.needsConfirmation ?? []).not.toContain("images");
  });

  it("retries only the groups that failed", async () => {
    const f = await atIdentity();
    await f.command("handoff_confirm_identity", { name: "Acme", logo: null, colors: [], fonts: [], paletteChoice: "site" });
    const handle = (await f.row()).captured.networks!.find(i => i.platform === "instagram")!;
    await f.command("handoff_confirm_networks", { kept: [handle.id], added: [] });
    expect((await recordInstagram(f, "colors", { status: "found", items: [{ id: "ig-color", value: "#B45309", origin: "instagram" }] })).ok).toBe(true);
    expect((await recordInstagram(f, "images", { status: "failed", items: [], error: "reading_failed" })).ok).toBe(true);
    await f.command("handoff_retry_reading");
    const after = await f.row();
    expect(readIntents(f).at(-1)!.data).toMatchObject({ groups: ["images"] });
    expect(instagramRun(after, "colors").status).toBe("found");
    expect(instagramRun(after, "images").status).toBe("pending");
    expect(after.captured.colors?.some(i => i.origin === "instagram")).toBe(true);
  });

  it("refuses when nothing failed, without changing anything", async () => {
    const f = await atIdentity();
    await f.command("handoff_confirm_identity", { name: "Acme", logo: null, colors: [], fonts: [], paletteChoice: "site" });
    const handle = (await f.row()).captured.networks!.find(i => i.platform === "instagram")!;
    await f.command("handoff_confirm_networks", { kept: [handle.id], added: [] });
    await runPendingRead(f, readers(f), "colors");
    const before = await f.row();
    await expect(f.command("handoff_retry_reading")).rejects.toThrow("invalid_transition");
    expect(await f.row()).toEqual(before);
  });

  it("counts the retry as a read and stops at the limit of three", async () => {
    const { f } = await withFailedInstagram();
    await f.command("handoff_retry_reading");
    await runPendingRead(f, { site: new FakeSiteReader(), instagram: new FakeInstagramReader(new Error("provider_failure")) }, "colors");
    const before = await f.row();
    expect([before.readsUsed, hasFailedConfirmedInstagram(before)]).toEqual([3, true]);
    await expect(f.command("handoff_retry_reading")).rejects.toThrow("reading_limit");
    expect(await f.row()).toEqual(before);
  });

  it("ignores a late result of the run that was replaced by the retry", async () => {
    const { f } = await withFailedInstagram();
    const old = instagramRun(await f.row(), "images");
    await f.command("handoff_retry_reading");
    const before = await f.row();
    const late = await recordInstagram(f, "images", { status: "found", items: [{ id: "late", value: "/late.png", origin: "instagram" }] }, old.runId);
    expect(late.ok && late.value.data).toEqual({ ignored: true });
    expect(await f.row()).toEqual(before);
  });

  it("does not turn a failed Instagram-only reading into a partial one: that retry still starts over", async () => {
    const f = await fixture();
    await f.command("handoff_set_source", { kind: "instagram", value: "acme" });
    await runPendingRead(f, { site: new FakeSiteReader(), instagram: new FakeInstagramReader({ exists: true, isPrivate: true, avatarUrl: null, bio: "", posts: [] }) });
    const failed = await f.row();
    expect(failed.step).toBe("reading");
    await f.command("handoff_retry_reading");
    const retried = await f.row();
    expect(retried.readingId).not.toBe(failed.readingId);
    expect(readIntents(f).at(-1)!.data).toMatchObject({ groups: [...HANDOFF_GROUPS], source: { kind: "instagram" } });
  });
});

describe("PR608 independent review: Instagram help pages are not profiles", () => {
  const help = "https://help.instagram.com/1896641480634370", about = "https://about.instagram.com/blog";

  it("never offers them as the Instagram profile, so keeping everything the card pre-selects confirms only the real one and costs one read", async () => {
    const f = await fixture();
    const site = new FakeSiteReader({ title: "Acme", siteName: "Acme", markdown: "Acme", statusCode: 200, screenshotUrl: null, images: [], branding: { colors: [], fonts: [] },
      links: [help, about, "https://www.instagram.com/acme.oficial/", "https://www.facebook.com/acme"] });
    await runPendingRead(f, { site, instagram: new FakeInstagramReader() });
    const row = await f.row();
    expect(row.captured.networks!.filter(i => i.platform === "instagram").map(i => i.value)).toEqual(["acme.oficial"]);
    await f.command("handoff_confirm_identity", { name: "Acme", logo: null, colors: [], fonts: [], paletteChoice: "site" });
    const before = (await f.row()).readsUsed;
    await f.command("handoff_confirm_networks", { kept: row.captured.networks!.map(i => i.id), added: [] });
    const after = await f.row();
    expect(after.decisions.networks?.map(i => i.value)).toEqual(["acme.oficial", "https://www.facebook.com/acme"]);
    expect(after.readsUsed).toBe(before + 1); // only the real profile is read
  });

  it("refuses them as a typed profile too, before any read is charged", async () => {
    const f = await atNetworks(); const before = await f.row();
    for (const link of [help, about]) {
      await expect(f.command("handoff_confirm_networks", { kept: [], added: [{ platform: "instagram", value: link }] })).rejects.toThrow("invalid_source");
    }
    expect(await f.row()).toEqual(before);
  });
});

describe("PR608 bot review: the networks the card starts from can always be confirmed", () => {
  it("a site with many social links and two Instagram profiles confirms with the default selection, which the old default could not", async () => {
    const f = await fixture();
    const links = ["https://www.instagram.com/acme.oficial/", ...Array.from({ length: 25 }, (_, i) => `https://facebook.com/marca-${i}`), "https://www.instagram.com/agencia.rodape/"];
    const site = new FakeSiteReader({ title: "Acme", siteName: "Acme", markdown: "Acme", statusCode: 200, screenshotUrl: null, images: [], branding: { colors: [], fonts: [] }, links });
    await runPendingRead(f, { site, instagram: new FakeInstagramReader() });
    await f.command("handoff_confirm_identity", { name: "Acme", logo: null, colors: [], fonts: [], paletteChoice: "site" });
    const row = await f.row();
    const everything = row.captured.networks!.map(i => i.id);
    expect(everything).toHaveLength(27);
    const base = { expectedStep: row.step, expectedVersion: row.version, added: [] };
    // What the card used to pre-select: more than ten, and two Instagram profiles.
    expect(handoffConfirmNetworksSchema.safeParse({ ...base, kept: everything }).success).toBe(false);
    const selection = defaultNetworkSelection(row.captured.networks!);
    expect(selection).toHaveLength(10);
    expect(handoffConfirmNetworksSchema.safeParse({ ...base, kept: selection }).success).toBe(true);
    await f.command("handoff_confirm_networks", { kept: selection, added: [] });
    const after = await f.row();
    expect(after.decisions.networks).toHaveLength(10);
    expect(after.decisions.networks!.filter(i => i.platform === "instagram").map(i => i.value)).toEqual(["acme.oficial"]);
  });

  it("the command keeps at most ten networks: ten are accepted, eleven are not", () => {
    const ids = (count: number) => Array.from({ length: count }, (_, i) => `net-${i}`);
    const base = { expectedStep: "networks", expectedVersion: 3, added: [] };
    expect(handoffConfirmNetworksSchema.safeParse({ ...base, kept: ids(10) }).success).toBe(true);
    expect(handoffConfirmNetworksSchema.safeParse({ ...base, kept: ids(11) }).success).toBe(false);
  });

  it("the limit counts the profiles a person types together with the networks kept", () => {
    const base = { expectedStep: "networks", expectedVersion: 3 };
    const accepts = (kept: number, added: number) => handoffConfirmNetworksSchema.safeParse({ ...base,
      kept: Array.from({ length: kept }, (_, i) => `net-${i}`), added: Array.from({ length: added }, () => ({ platform: "instagram", value: "acme.oficial" })) }).success;
    expect([accepts(9, 1), accepts(10, 0), accepts(5, 5), accepts(0, 10)]).toEqual([true, true, true, true]);
    expect([accepts(10, 1), accepts(9, 2), accepts(1, 10), accepts(0, 11)]).toEqual([false, false, false, false]);
    const refused = handoffConfirmNetworksSchema.safeParse({ ...base, kept: Array.from({ length: 10 }, (_, i) => `net-${i}`), added: [{ platform: "instagram", value: "acme.oficial" }] });
    expect(!refused.success && refused.error.issues.map(i => `${i.path.join(".")}: ${i.message}`)).toEqual(["added: Confirm at most 10 networks, counting the ones you add."]);
  });

  it("two Instagram profiles among few links are still refused by the command, so the card must not pre-select both", async () => {
    const f = await fixture();
    const site = new FakeSiteReader({ title: "Acme", siteName: "Acme", markdown: "Acme", statusCode: 200, screenshotUrl: null, images: [], branding: { colors: [], fonts: [] },
      links: ["https://www.instagram.com/acme.oficial/", "https://www.instagram.com/agencia.rodape/", "https://www.facebook.com/acme"] });
    await runPendingRead(f, { site, instagram: new FakeInstagramReader() });
    await f.command("handoff_confirm_identity", { name: "Acme", logo: null, colors: [], fonts: [], paletteChoice: "site" });
    const row = await f.row();
    await expect(f.command("handoff_confirm_networks", { kept: row.captured.networks!.map(i => i.id), added: [] })).rejects.toThrow("invalid_command");
    await f.command("handoff_confirm_networks", { kept: defaultNetworkSelection(row.captured.networks!), added: [] });
    expect((await f.row()).decisions.networks!.map(i => i.value)).toEqual(["acme.oficial", "https://www.facebook.com/acme"]);
  });
});

describe("PR608 bot review: one confirmation keeps at most ten networks, the typed profile included", () => {
  /** A brand whose site links `count` distinct Facebook pages, read and with its identity confirmed. */
  async function withNetworks(count: number) {
    const f = await fixture();
    const links = Array.from({ length: count }, (_, i) => `https://facebook.com/marca-${i}`);
    const site = new FakeSiteReader({ title: "Acme", siteName: "Acme", markdown: "Acme", statusCode: 200, screenshotUrl: null, images: [], branding: { colors: [], fonts: [] }, links });
    await runPendingRead(f, { site, instagram: new FakeInstagramReader() });
    await f.command("handoff_confirm_identity", { name: "Acme", logo: null, colors: [], fonts: [], paletteChoice: "site" });
    const captured = (await f.row()).captured.networks!;
    expect(captured).toHaveLength(count);
    return { f, ids: captured.map(i => i.id) };
  }

  it("refuses ten kept networks plus a typed profile, says why, and persists nothing", async () => {
    const { f, ids } = await withNetworks(10); const before = await f.row();
    const out = await f.attempt("handoff_confirm_networks", { kept: ids, added: [{ platform: "instagram", value: "acme.oficial" }] });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("invalid_command");
      expect(out.error.message).toContain("Confirm at most 10 networks, counting the ones you add.");
    }
    expect(await f.row()).toEqual(before);
  });

  it("accepts nine kept networks plus the typed profile: ten in all, and the read of that profile is charged", async () => {
    const { f, ids } = await withNetworks(10); const before = await f.row();
    await f.command("handoff_confirm_networks", { kept: ids.slice(0, 9), added: [{ platform: "instagram", value: "acme.oficial" }] });
    const after = await f.row();
    expect(after.decisions.networks).toHaveLength(10);
    expect(after.decisions.networks!.at(-1)).toMatchObject({ platform: "instagram", value: "acme.oficial", origin: "user" });
    expect(after.readsUsed).toBe(before.readsUsed + 1);
  });
});

describe("PR608 bot review: the summary never sends the person to a source it cannot leave", () => {
  it("refuses the way back to the source once the three readings are used, says why, and leaves the summary exactly as it was", async () => {
    const f = await atSummary(); await withReadsUsed(f, 3);
    const before = await f.row();
    const out = await f.attempt("handoff_back_to", { step: "source" });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("reading_limit");
      expect(out.error.message).toMatch(/all 3 readings/);
      expect(out.error.message).toMatch(/other steps/);
    }
    expect(await f.row()).toEqual(before);
    expect([before.step, before.decisions.revising]).toEqual(["summary", undefined]);
  });

  it("still opens the source while a reading is left, and the new source then starts the third reading", async () => {
    const f = await atSummary(); await withReadsUsed(f, 2);
    await f.command("handoff_back_to", { step: "source" });
    expect((await f.row()).step).toBe("source");
    await f.command("handoff_set_source", { kind: "site", value: "https://novo-acme.com" });
    const after = await f.row();
    expect([after.step, after.readsUsed]).toEqual(["reading", 3]);
  });

  it.each(["identity", "networks", "images"] as const)("keeps %s editable with the readings used", async (step) => {
    const f = await atSummary(); await withReadsUsed(f, 3);
    await f.command("handoff_back_to", { step });
    expect((await f.row()).step).toBe(step);
  });

  it("leaves the person able to finish from the summary", async () => {
    const f = await atSummary(); await withReadsUsed(f, 3);
    await expect(f.command("handoff_back_to", { step: "source" })).rejects.toThrow("reading_limit");
    await f.command("handoff_confirm_summary");
    expect((await f.row()).step).toBe("done");
  });
});

describe("PR610 workspace/brand name separation", () => {
  it.each(["single-default", "multiple-default", "single-edited", "single-other-default"])("memory matches the workspace rename guard: %s", async (scenario) => {
    const f = await fixture();
    const [memberId, member] = [...f.t.store.workspaceMembers.rows.entries()][0]!;
    f.t.store.workspaceMembers.rows.set(memberId, { ...member, role: "owner" });
    const originalName = scenario === "single-edited" ? "Minha agência" : scenario === "single-other-default" ? "Outra pessoa's Workspace" : "Ana's Workspace";
    f.t.store.adscaleWorkspaces.rows.set(f.scope.workspaceId, { id: f.scope.workspaceId, name: originalName });
    const row = await f.row();
    if (scenario === "multiple-default") {
      const id = uuid(); f.t.store.adscaleProfiles.rows.set(id, { id, workspaceId: f.scope.workspaceId, name: "Outra marca" });
    }
    await f.t.deps.uow.run(async (_repos, internal) => {
      await internal.saveHandoffIdentity(f.scope, row.clientProfileId, { name: "Acme", logoAssetKey: null, brandColors: [], brandFonts: [] });
    });
    expect(f.t.store.adscaleProfiles.rows.get(row.clientProfileId)?.name).toBe("Acme");
    expect(f.t.store.adscaleWorkspaces.rows.get(f.scope.workspaceId)?.name).toBe(scenario === "single-default" ? "Acme" : originalName);
  });
});

describe("PR610 bot review: an upload joins the brand only when it belongs to this handoff", () => {
  type Owner = { id: string; clientProfileId: string };
  const uploads: Array<{ name: string; adoptable: boolean; owner: (handoff: Owner) => { clientProfileId: string | null; metadata: Record<string, unknown> | null } }> = [
    { name: "an unbranded legacy asset", adoptable: false, owner: () => ({ clientProfileId: null, metadata: null }) },
    { name: "another handoff's provisional upload", adoptable: false, owner: () => ({ clientProfileId: null, metadata: { provisional: true, handoffId: uuid() } }) },
    { name: "an asset of another brand", adoptable: false, owner: () => ({ clientProfileId: uuid(), metadata: null }) },
    { name: "this handoff's provisional upload", adoptable: true, owner: handoff => ({ clientProfileId: null, metadata: { provisional: true, handoffId: handoff.id } }) },
    { name: "an asset already owned by this brand", adoptable: true, owner: handoff => ({ clientProfileId: handoff.clientProfileId, metadata: null }) },
  ];

  it.each(uploads)("images: $name is accepted=$adoptable as an upload", async ({ adoptable, owner }) => {
    const f = await fixture();
    await createHandoffReadHandler(f.t.deps, withManagedImages(f, { site: new FakeSiteReader(), instagram: new FakeInstagramReader() }))({ event: await f.event(), step: { run: async (_id, fn) => fn() } });
    await f.command("handoff_confirm_identity", { name: "Acme", logo: null, colors: [], fonts: [], paletteChoice: "site" });
    await f.command("handoff_confirm_networks", { kept: [], added: [] });
    const h = await f.row();
    const id = uuid();
    f.t.gateway.addAsset({ id, workspaceId: f.scope.workspaceId, key: `workspaces/${f.scope.workspaceId}/${id}.png`, kind: "image/png", ...owner(h) });
    const confirm = () => f.command("handoff_confirm_images", { kept: [...h.captured.images!.map(i => i.id), id], removed: [], uploaded: [id] });

    if (adoptable) {
      await confirm();
      expect((await f.row()).decisions.images?.uploaded).toEqual([expect.objectContaining({ id, origin: "user" })]);
    } else {
      await expect(confirm()).rejects.toThrow("invalid_command");
      expect((await f.row()).step).toBe("images");
      expect((await f.row()).decisions.images).toBeUndefined();
    }
  });

  it.each(uploads)("logo: $name is accepted=$adoptable as the uploaded logo", async ({ adoptable, owner }) => {
    const f = await fixture();
    await runPendingRead(f, withManagedImages(f, { site: new FakeSiteReader(), instagram: new FakeInstagramReader() }));
    const h = await f.row();
    const id = uuid();
    f.t.gateway.addAsset({ id, workspaceId: f.scope.workspaceId, key: `workspaces/${f.scope.workspaceId}/${id}.png`, kind: "image/png", ...owner(h) });
    const confirm = () => f.command("handoff_confirm_identity", { name: "Acme", logo: id, colors: [], fonts: [], paletteChoice: "site" });

    if (adoptable) {
      await confirm();
      expect((await f.row()).decisions.identity?.logo).toMatchObject({ id, origin: "user" });
    } else {
      await expect(confirm()).rejects.toThrow("invalid_command");
      expect((await f.row()).step).toBe("identity");
      expect((await f.row()).decisions.identity).toBeUndefined();
    }
  });
});
