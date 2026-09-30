import { describe, expect, it } from "vitest";
import { createHandoffReadHandler } from "./read";
import { FakeInstagramReader, FakeSiteReader, type HandoffReaders } from "./readers";
import { executeCommand } from "../module/commands";
import { makeTestDeps, uuid } from "../module/testing/deps";
import { HANDOFF_GROUPS, readingRun, type HandoffGroup, type HandoffItem } from "../domain/handoff";
import { HANDOFF_READ_EVENT, handoffAttachImageSchema, handoffAttachLogoSchema, handoffConfirmImagesSchema } from "./contract";
import type { AdscaleAssetRef } from "../module/ports";

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
async function runPendingRead(f: Awaited<ReturnType<typeof fixture>>, readers: HandoffReaders, group: HandoffGroup = "name") {
  const h = await f.row();
  const taskIntentId = h.reading[group]!.taskIntentId;
  const intent = await f.t.deps.uow.repos.taskOutbox.get(f.scope, taskIntentId);
  return createHandoffReadHandler(f.t.deps, readers)({ event: { data: { ...f.scope, taskIntentId, ...(intent!.data as object) } }, step: { run: async (_id, fn) => fn() } });
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

describe("PR608 bot review: managed logos and decisions for confirmed Instagram", () => {
  it("rejects confirming a captured logo without a managed key", async () => {
    const f = await fixture();
    await runPendingRead(f, { site: new FakeSiteReader(), instagram: new FakeInstagramReader() });
    const h = await f.row();
    await expect(f.command("handoff_confirm_identity", { name: "Acme", logo: h.captured.logo![0]!.id, colors: [], fonts: [], paletteChoice: "site" })).rejects.toThrow("invalid_command");
    expect((await f.row()).step).toBe("identity");
    expect((await f.row()).decisions.identity).toBeUndefined();
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
    if (origin === "user") f.t.gateway.addAsset({ id: logo, workspaceId: f.scope.workspaceId, kind: "image/png", key });
    await f.command("handoff_confirm_identity", { name: "Acme", logo, colors: [], fonts: [], paletteChoice: "user" });
    h = await f.row();
    await f.command("handoff_confirm_networks", { kept: (h.decisions.networks ?? []).map(i => i.id), added: [] });
    await f.command("handoff_confirm_images", { kept: [], removed: [], uploaded: [] });
    await f.command("handoff_confirm_summary");
    h = await f.row();
    expect(h.step).toBe("done");
    expect(f.t.store.adscaleProfiles.rows.get(h.clientProfileId)).toMatchObject({ logoAssetKey: key });
  });

  it.each(["private", "missing", "provider"])("blocks diagnosis for a %s confirmed Instagram despite successful site groups, then allows removal", async (failure) => {
    const f = await fixture();
    await runPendingRead(f, { site: new FakeSiteReader(), instagram: new FakeInstagramReader() });
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
    const readers = { site: new FakeSiteReader(), instagram: new FakeInstagramReader() };
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
const readers = () => ({ site: new FakeSiteReader(), instagram: new FakeInstagramReader() });
async function atIdentity() {
  const f = await fixture();
  await runPendingRead(f, readers());
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
/** An upload the workspace already stores (the upload endpoint ran), as the gateway sees it. */
function upload(f: Fixture, extra: Partial<AdscaleAssetRef> = {}) {
  const id = uuid();
  const key = `workspaces/${f.scope.workspaceId}/${id}.png`;
  f.t.gateway.addAsset({ id, workspaceId: f.scope.workspaceId, kind: "image/png", key, ...extra });
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
