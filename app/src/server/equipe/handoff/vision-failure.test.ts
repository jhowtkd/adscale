// A palette the vision could not read does not fail the reading (ticket 13, D-2).
//
// Real test of 01/10: every vision call was refused by Anthropic. For @bauducco (Instagram only) the profile, the photo and 12 posts were
// read, yet the failed palette group made the card say "a leitura do Instagram confirmado falhou", disable "É isso" and offer a retry that
// charged another reading and failed the same way. These tests walk the whole handoff, through the commands, to the confirmed summary.

import { describe, expect, it } from "vitest";
import { createHandoffReadHandler } from "./read";
import { FakeInstagramReader, FakeSiteReader, type HandoffReaders, type InstagramReadResult, type SiteReadResult } from "./readers";
import type { InstagramEnrichment } from "./instagram-enrichment";
import type { SiteEnrichment, SiteReadingContext } from "./site-enrichment";
import { executeCommand } from "../module/commands";
import { makeTestDeps, uuid } from "../module/testing/deps";
import { hasFailedConfirmedInstagram, identityReady, type HandoffGroup } from "../domain/handoff";

async function openAccount(source: { kind: "site" | "instagram"; value: string }) {
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
  await command("handoff_set_source", source);
  /** Runs the reading task for the pending intent of one group, as the Inngest job would. */
  const read = async (readers: HandoffReaders, enrichment: { site?: SiteEnrichment; instagram?: InstagramEnrichment } = {}, group: HandoffGroup = "name") => {
    const h = await row();
    const taskIntentId = h.reading[group]!.taskIntentId;
    const intent = await t.deps.uow.repos.taskOutbox.get(scope, taskIntentId);
    return createHandoffReadHandler(t.deps, readers, enrichment.site, enrichment.instagram)({ event: { data: { ...scope, taskIntentId, ...(intent!.data as object) } }, step: { run: async (_id, fn) => fn() } });
  };
  return { t, scope, row, command, read };
}

const profile: InstagramReadResult = { exists: true, isPrivate: false, name: "Bauducco", avatarUrl: "https://cdn.example/avatar.jpg", bio: "Panettones e biscoitos desde 1952.",
  posts: [{ imageUrl: "https://cdn.example/p1.jpg", caption: "Chocottone para a família" }] };
/** Saves an image the way the real importer does: a provisional asset of the reading, with the R2 key the card and "É isso" need. */
function saveImage(t: ReturnType<typeof makeTestDeps>, context: SiteReadingContext, origin: "site" | "instagram", name: string) {
  const id = uuid();
  const key = `workspaces/${context.workspaceId}/handoff/${context.handoffId}/${context.readingId}/${context.taskIntentId}/${origin}-${name}.png`;
  t.store.workspaceAssets.rows.set(id, { id, workspaceId: context.workspaceId, clientProfileId: null, name, key, type: "image/png", size: 1, width: null, height: null,
    source: `brand_${origin}`, tags: [], aiDescription: null, metadata: { handoffId: context.handoffId, readingId: context.readingId, provisional: true, kind: `${origin}_image` },
    createdAt: new Date(), updatedAt: new Date() });
  return { id, key };
}
/** The Instagram enrichment as the job runs it: the photos were saved, the vision call was refused. */
const instagramVisionRefused = (t: ReturnType<typeof makeTestDeps>): InstagramEnrichment => ({
  images: async (data, context) => {
    const avatar = saveImage(t, context, "instagram", "avatar");
    return { ...data, avatarUrl: "https://r2.example/avatar.jpg", avatarKey: avatar.key, avatarAssetId: avatar.id,
      posts: data.posts.map((post, i) => { const saved = saveImage(t, context, "instagram", `post-${i}`); return { ...post, key: saved.key, assetId: saved.id }; }) };
  },
  identity: async () => ({ colors: [], groupErrors: { colors: "instagram_vision_failed" } }),
});
const siteVisionRefused = (t: ReturnType<typeof makeTestDeps>): SiteEnrichment => ({
  identity: async (data: SiteReadResult) => ({ branding: { ...data.branding, colors: [], fonts: data.branding?.fonts ?? [] }, groupErrors: { colors: "site_vision_failed" } }),
  images: async (data: SiteReadResult, context) => ({ images: data.images.map((image, i) => { const saved = saveImage(t, context, "site", `image-${i}`); return { ...image, key: saved.key, assetId: saved.id }; }) }),
});

describe("Instagram only, vision refused (@bauducco)", () => {
  it("reads the palette as not found, opens identity at once, and the summary can be confirmed", async () => {
    const f = await openAccount({ kind: "instagram", value: "bauducco" });
    await f.read({ site: new FakeSiteReader(), instagram: new FakeInstagramReader(profile) }, { instagram: instagramVisionRefused(f.t) });
    let h = await f.row();
    expect(h.reading).toMatchObject({ name: { status: "found" }, logo: { status: "found" }, networks: { status: "found" }, images: { status: "found" },
      colors: { status: "not_found", error: "instagram_vision_failed" } });
    expect(Object.values(h.reading).some(g => g?.status === "failed")).toBe(false);
    expect(identityReady(h)).toBe(true);
    expect(h.step).toBe("identity");
    expect(hasFailedConfirmedInstagram(h)).toBe(false);
    // An Instagram-only source is already the person's own choice: the profile is confirmed as soon as its networks group is read, so the identity
    // card (whose palette choice starts on "instagram") is not waiting for a later step before "Confirmar" works.
    expect(h.decisions.networks).toEqual([expect.objectContaining({ platform: "instagram", value: "bauducco", origin: "instagram" })]);

    // The person chooses what the vision could not: here, no palette (they could also type one).
    await f.command("handoff_confirm_identity", { name: "Bauducco", logo: h.captured.logo![0]!.id, colors: [], fonts: [], paletteChoice: "instagram" });
    await f.command("handoff_confirm_networks", { kept: (await f.row()).captured.networks!.map(i => i.id), added: [] });
    h = await f.row();
    await f.command("handoff_confirm_images", { kept: h.captured.images!.map(i => i.id), removed: [], uploaded: [] });
    h = await f.row();
    expect(h.step).toBe("summary");
    expect(hasFailedConfirmedInstagram(h)).toBe(false);
    await f.command("handoff_confirm_summary");
    h = await f.row();
    expect(h.step).toBe("done");
    expect(h.readsUsed).toBe(1); // No retry was needed, so no second reading was charged.
    expect([...f.t.store.taskOutbox.rows.values()].some(i => i.eventName === "equipe.handoff.diagnose")).toBe(true);
  });

  it("the person can type the palette themselves instead", async () => {
    const f = await openAccount({ kind: "instagram", value: "bauducco" });
    await f.read({ site: new FakeSiteReader(), instagram: new FakeInstagramReader(profile) }, { instagram: instagramVisionRefused(f.t) });
    await f.command("handoff_confirm_identity", { name: "Bauducco", logo: null, colors: ["#E30613", "#FFD100", "#FFFFFF"], fonts: [], paletteChoice: "user" });
    expect((await f.row()).decisions.identity?.colors.map(c => c.value)).toEqual(["#E30613", "#FFD100", "#FFFFFF"]);
  });

  it("control: a failed photo download still blocks the summary (only the palette is exempt)", async () => {
    const f = await openAccount({ kind: "instagram", value: "bauducco" });
    const photosFailed: InstagramEnrichment = {
      images: async (data) => ({ ...data, avatarUrl: null, avatarKey: undefined, posts: [], groupErrors: { logo: "logo_download_failed", images: "image_download_failed" } }),
      identity: async () => ({ colors: [], groupErrors: { colors: "instagram_vision_failed" } }),
    };
    await f.read({ site: new FakeSiteReader(), instagram: new FakeInstagramReader(profile) }, { instagram: photosFailed });
    let h = await f.row();
    expect(h.reading).toMatchObject({ logo: { status: "failed" }, images: { status: "failed" }, colors: { status: "not_found" } });
    expect(hasFailedConfirmedInstagram(h)).toBe(true);
    await f.command("handoff_confirm_identity", { name: "Bauducco", logo: null, colors: [], fonts: [], paletteChoice: "instagram" });
    await f.command("handoff_confirm_networks", { kept: (await f.row()).captured.networks!.map(i => i.id), added: [] });
    await f.command("handoff_confirm_images", { kept: [], removed: [], uploaded: [] });
    await expect(f.command("handoff_confirm_summary")).rejects.toThrow("invalid_transition");
    h = await f.row();
    expect(h.step).toBe("summary");
  });

  it("control: a profile that really failed (private) still fails every group and keeps blocking", async () => {
    const f = await openAccount({ kind: "instagram", value: "bauducco" });
    await f.read({ site: new FakeSiteReader(), instagram: new FakeInstagramReader({ exists: true, isPrivate: true, avatarUrl: null, bio: "", posts: [] }) }, { instagram: instagramVisionRefused(f.t) });
    const h = await f.row();
    expect(Object.values(h.reading).every(g => g?.status === "failed")).toBe(true);
    expect(h.reading.colors?.error).toBe("instagram_private");
    expect(h.step).toBe("reading");
  });
});

describe("site read, then the confirmed Instagram, vision refused on both", () => {
  it("never shows a failed reading, and the Instagram partial read does not block the summary", async () => {
    const f = await openAccount({ kind: "site", value: "https://conteudomartech.com.br" });
    const readers: HandoffReaders = {
      site: new FakeSiteReader({ title: "Conteúdo Martech", siteName: "Conteúdo Martech", markdown: "Agência de marketing educacional.", links: ["https://www.instagram.com/conteudomartech/"],
        images: [{ url: "https://cdn.example/s1.png" }], screenshotUrl: null, statusCode: 200, branding: { colors: ["#0178E6"], fonts: ["Inter"] } }),
      instagram: new FakeInstagramReader(profile),
    };
    await f.read(readers, { site: siteVisionRefused(f.t) });
    let h = await f.row();
    expect(h.reading.colors).toMatchObject({ status: "not_found", error: "site_vision_failed" });
    expect(Object.values(h.reading).some(g => g?.status === "failed")).toBe(false);
    expect(h.step).toBe("identity");

    await f.command("handoff_confirm_identity", { name: "Conteúdo Martech", logo: null, colors: [], fonts: ["Inter"], paletteChoice: "site" });
    await f.command("handoff_confirm_networks", { kept: (await f.row()).captured.networks!.map(i => i.id), added: [] });
    await f.read(readers, { site: siteVisionRefused(f.t), instagram: instagramVisionRefused(f.t) }, "colors");
    h = await f.row();
    expect(h.reading.colors?.bySource?.instagram).toMatchObject({ status: "not_found", error: "instagram_vision_failed" });
    expect(hasFailedConfirmedInstagram(h)).toBe(false);
    await f.command("handoff_confirm_images", { kept: [], removed: h.captured.images!.map(i => i.id), uploaded: [] });
    await f.command("handoff_confirm_summary");
    expect((await f.row()).step).toBe("done");
  });
});
