// The plate of a logo through the handoff's decisions (ticket 16): the upload carries what its ASSET says, a captured logo keeps what it was read with,
// and nothing the client sends (or confirms again) changes it in silence.
import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { makeTestDeps, uuid } from "./testing/deps";
import { handoffAttachLogoSchema, handoffConfirmIdentitySchema, HANDOFF_READ_EVENT } from "../handoff/contract";
import { HANDOFF_GROUPS, type HandoffGroup, type HandoffItem } from "../domain/handoff";
import { handoffAssetMetadata } from "../handoff/library";
import type { AdscaleAssetRef } from "./ports";

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
  const attempt = async (type: string, payload: Record<string, unknown> = {}) => {
    const h = await row();
    return executeCommand(t.deps, { ...scope, actor }, { type, payload: { expectedStep: h.step, expectedVersion: h.version, ...payload } } as never);
  };
  const command = async (type: string, payload: Record<string, unknown> = {}) => { const out = await attempt(type, payload); if (!out.ok) throw new Error(out.error.code); return out; };
  await command("handoff_set_source", { kind: "site", value: "https://acme.com" });
  const record = async (group: HandoffGroup, items: HandoffItem[]) => {
    const h = await row(); const g = h.reading[group]!;
    return executeCommand(t.deps, { ...scope, actor: { kind: "system", job: HANDOFF_READ_EVENT } }, { type: "handoff_record_group", payload: { group, readingId: h.readingId, runId: g.runId, taskIntentId: g.taskIntentId, result: { status: items.length ? "found" : "not_found", items } } });
  };
  return { t, scope, command, attempt, row, record, handoffId: (await row()).id };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

const CAPTURED_ID = "captured-logo";
/** The reading is done: a captured logo (managed copy, with the surface the reader gave it) and the rest. */
async function atIdentity(captured: Partial<HandoffItem> = { surface: "dark" }) {
  const f = await fixture();
  await f.record("name", [{ id: "n", value: "Acme", origin: "site" }]);
  await f.record("logo", [{ id: CAPTURED_ID, value: "https://acme.com/logo.png", origin: "site", key: "workspaces/x/captured-logo.png", ...captured }]);
  for (const group of HANDOFF_GROUPS.filter(g => !["name", "logo"].includes(g))) await f.record(group, []);
  expect((await f.row()).step).toBe("identity");
  return f;
}
/** What the upload route stores: an unbranded provisional asset of this handoff, with the plate measured at upload. */
function upload(f: Fixture, metadata: Record<string, unknown> | null = { provisional: true }, extra: Partial<AdscaleAssetRef> = {}) {
  const id = uuid();
  const key = `workspaces/${f.scope.workspaceId}/${id}.png`;
  const meta = metadata === null ? null : { handoffId: f.handoffId, ...metadata };
  f.t.gateway.addAsset({ id, workspaceId: f.scope.workspaceId, kind: "image/png", key, clientProfileId: null, metadata: meta, ...extra });
  f.t.store.workspaceAssets.rows.set(id, { id, workspaceId: f.scope.workspaceId, clientProfileId: null, name: "logo.png", key, type: "image/png", size: 1, width: null, height: null,
    source: "upload", tags: [], aiDescription: null, metadata: meta, createdAt: new Date(), updatedAt: new Date() });
  return { id, key };
}
/** Past networks and images, at the summary, from where the person can go back to the identity. */
async function toSummary(f: Fixture) {
  await f.command("handoff_confirm_networks", { kept: [], added: [] });
  await f.command("handoff_confirm_images", { kept: [], removed: [], uploaded: [] });
  expect((await f.row()).step).toBe("summary");
}
const identity = (logo: string | null) => ({ name: "Acme", logo, colors: [], fonts: [], paletteChoice: "site" });

describe("handoff_attach_logo: the surface is the asset's", () => {
  it.each(["dark", "light"] as const)("an upload whose asset says %s is the provisional logo with that surface", async surface => {
    const f = await atIdentity(); const { id, key } = upload(f, { provisional: true, surface });
    await f.command("handoff_attach_logo", { logo: id });
    expect((await f.row()).decisions.uploadedLogo).toEqual({ id, value: `/api/workspace/assets/${id}/file`, origin: "user", key, surface });
  });
  it.each([["purple"], ["DARK"], [""], [null], [1], [{ a: 1 }]] as unknown[][])("an asset whose metadata says %j gives an item without surface", async surface => {
    const f = await atIdentity(); const { id } = upload(f, { provisional: true, surface });
    await f.command("handoff_attach_logo", { logo: id });
    const logo = (await f.row()).decisions.uploadedLogo!;
    expect(logo.id).toBe(id);
    expect("surface" in logo).toBe(false);
  });
  it("an asset with no surface in its metadata (an old upload) gives an item without surface, in the shape it always had", async () => {
    const f = await atIdentity(); const { id, key } = upload(f);
    await f.command("handoff_attach_logo", { logo: id });
    expect((await f.row()).decisions.uploadedLogo).toEqual({ id, value: `/api/workspace/assets/${id}/file`, origin: "user", key });
  });
  it("a draft that is replaced by another upload takes the new asset's surface", async () => {
    const f = await atIdentity();
    const first = upload(f, { provisional: true, surface: "dark" }); const second = upload(f, { provisional: true });
    await f.command("handoff_attach_logo", { logo: first.id });
    await f.command("handoff_attach_logo", { logo: second.id });
    const logo = (await f.row()).decisions.uploadedLogo!;
    expect(logo.id).toBe(second.id);
    expect("surface" in logo).toBe(false);
  });
  it("the payload cannot inject a surface: the schemas are strict, and the command refuses the extra key", async () => {
    expect(handoffAttachLogoSchema.safeParse({ expectedStep: "identity", expectedVersion: 1, logo: uuid(), surface: "dark" }).success).toBe(false);
    expect(handoffConfirmIdentitySchema.safeParse({ expectedStep: "identity", expectedVersion: 1, ...identity(null), surface: "dark" }).success).toBe(false);
    const f = await atIdentity(); const { id } = upload(f, { provisional: true });
    const out = await f.attempt("handoff_attach_logo", { logo: id, surface: "dark" });
    expect(out.ok).toBe(false);
    expect((await f.row()).decisions.uploadedLogo).toBeUndefined();
  });
});

describe("handoff_confirm_identity", () => {
  it("with the uploaded logo, the decision carries the surface of its asset and the draft is cleared", async () => {
    const f = await atIdentity(); const { id, key } = upload(f, { provisional: true, surface: "dark" });
    await f.command("handoff_attach_logo", { logo: id });
    await f.command("handoff_confirm_identity", identity(id));
    const row = await f.row();
    expect(row.decisions.identity?.logo).toEqual({ id, value: `/api/workspace/assets/${id}/file`, origin: "user", key, surface: "dark" });
    expect(row.decisions.uploadedLogo).toBeUndefined();
  });
  it("confirming an upload that was never attached reads the surface from the asset all the same", async () => {
    const f = await atIdentity(); const { id } = upload(f, { provisional: true, surface: "light" });
    await f.command("handoff_confirm_identity", identity(id));
    expect((await f.row()).decisions.identity?.logo).toMatchObject({ id, surface: "light" });
  });
  it("with the captured logo, the decision keeps the surface the reading gave it (dark and light)", async () => {
    for (const surface of ["dark", "light"] as const) {
      const f = await atIdentity({ surface });
      await f.command("handoff_confirm_identity", identity(CAPTURED_ID));
      expect((await f.row()).decisions.identity?.logo).toMatchObject({ id: CAPTURED_ID, origin: "site", surface });
    }
  });
  it("a captured logo that has no surface stays without it", async () => {
    const f = await atIdentity({});
    await f.command("handoff_confirm_identity", identity(CAPTURED_ID));
    expect("surface" in (await f.row()).decisions.identity!.logo!).toBe(false);
  });
  it("skipping the logo (null) stays null, whatever was captured or uploaded", async () => {
    const f = await atIdentity(); const { id } = upload(f, { provisional: true, surface: "dark" });
    await f.command("handoff_attach_logo", { logo: id });
    await f.command("handoff_confirm_identity", identity(null));
    expect((await f.row()).decisions.identity?.logo).toBeNull();
  });
  it("confirming again the logo already decided does not change its surface, even if the asset's metadata changed in the meantime", async () => {
    const f = await atIdentity(); const { id } = upload(f, { provisional: true, surface: "dark" });
    await f.command("handoff_confirm_identity", identity(id));
    await toSummary(f);
    const decided = (await f.row()).decisions.identity!.logo;
    expect(decided?.surface).toBe("dark");
    // Another measure (or an edit) of the asset later: the decision the person confirmed is theirs until they confirm it again.
    f.t.gateway.assets.set(id, { ...f.t.gateway.assets.get(id)!, metadata: { provisional: true, handoffId: f.handoffId, surface: "light" } });
    expect((await f.row()).decisions.identity!.logo).toEqual(decided);
    await f.command("handoff_back_to", { step: "identity" });
    expect((await f.row()).decisions.identity!.logo).toEqual(decided);
  });
  it("reconfirming the captured logo after going back keeps the captured surface and never takes another from anywhere", async () => {
    const f = await atIdentity({ surface: "dark" });
    await f.command("handoff_confirm_identity", identity(CAPTURED_ID));
    await toSummary(f);
    await f.command("handoff_back_to", { step: "identity" });
    await f.command("handoff_confirm_identity", identity(CAPTURED_ID));
    expect((await f.row()).decisions.identity?.logo).toMatchObject({ id: CAPTURED_ID, surface: "dark" });
  });
});

describe("handoff_confirm_summary (É isso): the asset's metadata is merged, not replaced", () => {
  it("the logo's asset keeps its surface next to provisional false and the handoff id", async () => {
    const f = await atIdentity(); const { id } = upload(f, { provisional: true, surface: "dark", kind: "brand_logo" });
    await f.command("handoff_attach_logo", { logo: id });
    await f.command("handoff_confirm_identity", identity(id));
    await f.command("handoff_confirm_networks", { kept: [], added: [] });
    await f.command("handoff_confirm_images", { kept: [], removed: [], uploaded: [] });
    await f.command("handoff_confirm_summary");
    expect((await f.row()).step).toBe("done");
    const asset = f.t.store.workspaceAssets.rows.get(id)!;
    expect(asset.metadata).toMatchObject({ surface: "dark", provisional: false, handoffId: f.handoffId, kind: "brand_logo" });
    expect(asset.clientProfileId).not.toBeNull();
  });
  it("a logo with no surface stays without it after the summary", async () => {
    const f = await atIdentity(); const { id } = upload(f);
    await f.command("handoff_confirm_identity", identity(id));
    await f.command("handoff_confirm_networks", { kept: [], added: [] });
    await f.command("handoff_confirm_images", { kept: [], removed: [], uploaded: [] });
    await f.command("handoff_confirm_summary");
    expect(f.t.store.workspaceAssets.rows.get(id)!.metadata).not.toHaveProperty("surface");
  });
});

describe("handoffAssetMetadata: what the handoff tells the asset it adopts", () => {
  it("a logo item with a surface hands it over, next to the handoff id and provisional false", () => {
    expect(handoffAssetMetadata("h-1", { id: "l", value: "https://x/logo.png", origin: "site", key: "k", surface: "dark" })).toEqual({ handoffId: "h-1", provisional: false, originUrl: "https://x/logo.png", surface: "dark" });
    expect(handoffAssetMetadata("h-1", { id: "l", value: "/api/x", origin: "user", key: "k", surface: "light" })).toEqual({ handoffId: "h-1", provisional: false, surface: "light" });
  });
  it("an item without a surface (an image, an old logo) hands over no key for it", () => {
    const metadata = handoffAssetMetadata("h-1", { id: "i", value: "https://x/i.png", origin: "site", key: "k", caption: "legenda" });
    expect(metadata).toEqual({ handoffId: "h-1", provisional: false, originUrl: "https://x/i.png", caption: "legenda" });
    expect("surface" in metadata).toBe(false);
  });
});

describe("handoff_confirm_summary: the surface the person saw goes to the adopted asset", () => {
  const assetRow = (f: Fixture, key: string, metadata: Record<string, unknown>) => {
    const id = uuid();
    f.t.store.workspaceAssets.rows.set(id, { id, workspaceId: f.scope.workspaceId, clientProfileId: null, name: "x.png", key, type: "image/png", size: 1, width: null, height: null,
      source: "brand_site", tags: [], aiDescription: null, metadata: { handoffId: f.handoffId, provisional: true, ...metadata }, createdAt: new Date(), updatedAt: new Date() });
    return id;
  };
  async function through(f: Fixture, logoId: string, imageId: string) {
    await f.command("handoff_confirm_identity", identity(logoId));
    await f.command("handoff_confirm_networks", { kept: [], added: [] });
    await f.command("handoff_confirm_images", { kept: [imageId], removed: [], uploaded: [] });
    await f.command("handoff_confirm_summary");
    expect((await f.row()).step).toBe("done");
  }
  /** The reading found a logo (with the surface given) and one image, both stored as provisional assets of this handoff. */
  async function atIdentityWithImage(logo: Partial<HandoffItem>) {
    const f = await fixture();
    await f.record("name", [{ id: "n", value: "Acme", origin: "site" }]);
    await f.record("logo", [{ id: CAPTURED_ID, value: "https://acme.com/logo.png", origin: "site", key: "workspaces/x/captured-logo.png", ...logo }]);
    await f.record("images", [{ id: IMAGE_ID, value: "https://acme.com/a.png", origin: "site", key: "workspaces/x/a.png" }]);
    for (const group of HANDOFF_GROUPS.filter(g => !["name", "logo", "images"].includes(g))) await f.record(group, []);
    return f;
  }
  const IMAGE_ID = "00000000-0000-4000-8000-0000000000aa";

  it("an asset stored without a surface gets the one the item has; the image next to it gets none", async () => {
    const f = await atIdentityWithImage({ surface: "dark" });
    const logoAsset = assetRow(f, "workspaces/x/captured-logo.png", { kind: "site_logo" });
    const imageAsset = assetRow(f, "workspaces/x/a.png", { kind: "site_image" });
    await through(f, CAPTURED_ID, IMAGE_ID);
    expect(f.t.store.workspaceAssets.rows.get(logoAsset)!.metadata).toMatchObject({ surface: "dark", provisional: false, handoffId: f.handoffId, kind: "site_logo" });
    const image = f.t.store.workspaceAssets.rows.get(imageAsset)!.metadata as Record<string, unknown>;
    expect(image).toMatchObject({ provisional: false, kind: "site_image" });
    expect(image).not.toHaveProperty("surface");
  });
  it("an asset that has a surface keeps it when the item says nothing: the merge never takes a key away", async () => {
    const f = await atIdentityWithImage({});
    const logoAsset = assetRow(f, "workspaces/x/captured-logo.png", { kind: "site_logo", surface: "light" });
    const imageAsset = assetRow(f, "workspaces/x/a.png", { kind: "site_image" });
    await through(f, CAPTURED_ID, IMAGE_ID);
    expect(f.t.store.workspaceAssets.rows.get(logoAsset)!.metadata).toMatchObject({ surface: "light", provisional: false, kind: "site_logo" });
    expect(f.t.store.workspaceAssets.rows.get(imageAsset)!.metadata).not.toHaveProperty("surface");
  });
  it("the item's surface is the one the person saw, so it wins over what the asset held", async () => {
    const f = await atIdentityWithImage({ surface: "dark" });
    const logoAsset = assetRow(f, "workspaces/x/captured-logo.png", { kind: "site_logo", surface: "light" });
    assetRow(f, "workspaces/x/a.png", { kind: "site_image" });
    await through(f, CAPTURED_ID, IMAGE_ID);
    expect(f.t.store.workspaceAssets.rows.get(logoAsset)!.metadata).toMatchObject({ surface: "dark" });
  });
});
