// The plate of an Instagram avatar (ticket 16): measured like a site logo; the posts never are; the Instagram vision is left as it was.
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { CreateWorkspaceAssetInput } from "@/server/repositories/workspace-asset";
import { InMemoryObjectStorage } from "@/server/storage/in-memory-object-storage";
import * as measurer from "./logo-surface";
import { BLACK, WHITE, block } from "./logo-surface.fixtures";
import { createInstagramEnrichment } from "./instagram-enrichment";
import type { InstagramReadResult } from "./readers";
import type { InstagramVision } from "./site-vision";
import type { SiteReadingContext } from "./site-enrichment";

vi.mock("./logo-surface", async importOriginal => {
  const actual = await importOriginal<typeof import("./logo-surface")>();
  return { ...actual, measureLogoSurface: vi.fn(actual.measureLogoSurface) };
});
const actualMeasure = (await vi.importActual<typeof import("./logo-surface")>("./logo-surface")).measureLogoSurface;
const measureSpy = vi.mocked(measurer.measureLogoSurface);
afterEach(() => { vi.restoreAllMocks(); measureSpy.mockReset(); measureSpy.mockImplementation(actualMeasure); });

const context: SiteReadingContext = { workspaceId: "ws-1", accountId: "acc-1", handoffId: "handoff-1", readingId: "reading-1", taskIntentId: "intent-1" };
const AVATAR = "https://instagram.fcdn.net/avatar.png";
const POST = "https://instagram.fcdn.net/p1.png";
type Entry = { bytes: Buffer; contentType: string };
const data = (overrides: Partial<InstagramReadResult> = {}): InstagramReadResult => ({
  exists: true, isPrivate: false, name: "Marca", avatarUrl: AVATAR, bio: "Bio", posts: [{ imageUrl: POST, caption: "c" }], ...overrides,
});
const png = async (pipeline: sharp.Sharp): Promise<Entry> => ({ bytes: await pipeline.png().toBuffer(), contentType: "image/png" });
const jpegEntry = async (): Promise<Entry> => ({ bytes: await sharp({ create: { width: 200, height: 200, channels: 3, background: "#2244cc" } }).jpeg().toBuffer(), contentType: "image/jpeg" });
const keyOf = (url: string) => `workspaces/ws-1/handoff/handoff-1/reading-1/intent-1/instagram_avatar/${createHash("sha256").update(url).digest("hex")}`;

function setup(entries: Record<string, Entry>) {
  const rows = new Map<string, { id: string; key: string; width: number | null; height: number | null; metadata?: unknown }>();
  const saved: CreateWorkspaceAssetInput[] = [];
  const storage = new InMemoryObjectStorage();
  const inputs: Array<Parameters<InstagramVision>[0]> = [];
  const enrichment = createInstagramEnrichment({
    storage, download: (async (url: string) => { const e = entries[url]; if (!e) throw new Error("404"); return e; }) as never,
    saveAsset: async d => { saved.push(d); const row = { id: `a-${rows.size + 1}`, key: d.key, width: d.width ?? null, height: d.height ?? null, metadata: d.metadata }; rows.set(`${d.workspaceId}:${d.key}`, row); return row; },
    findAsset: async (workspaceId, key) => rows.get(`${workspaceId}:${key}`) ?? null,
    vision: () => async input => { inputs.push(input); return ["#111111"]; },
  });
  return { enrichment, storage, saved, rows, inputs };
}

describe("images(): the avatar", () => {
  it("a transparent PNG with light ink: avatarSurface dark and the asset keeps it", async () => {
    const t = setup({ [AVATAR]: await png(block(300, 300, WHITE)), [POST]: await jpegEntry() });
    const result = await t.enrichment.images(data(), context);
    expect(result.avatarSurface).toBe("dark");
    expect(t.saved.find(a => a.name === "instagram_avatar")!.metadata).toMatchObject({ surface: "dark", provisional: true, kind: "instagram_avatar" });
  });
  it("dark ink: light", async () => {
    const t = setup({ [AVATAR]: await png(block(300, 300, BLACK)), [POST]: await jpegEntry() });
    expect((await t.enrichment.images(data(), context)).avatarSurface).toBe("light");
  });
  it("a JPEG avatar (a profile photo) has no avatarSurface and no key for it in the result or the metadata", async () => {
    const t = setup({ [AVATAR]: await jpegEntry(), [POST]: await jpegEntry() });
    const result = await t.enrichment.images(data(), context);
    expect(result.avatarKey).toBeDefined();
    expect("avatarSurface" in result).toBe(false);
    expect(t.saved.find(a => a.name === "instagram_avatar")!.metadata).not.toHaveProperty("surface");
  });
  it("a measure that fails keeps the avatar, without avatarSurface", async () => {
    measureSpy.mockRejectedValue(new Error("nope"));
    const t = setup({ [AVATAR]: await png(block(300, 300, WHITE)), [POST]: await jpegEntry() });
    const result = await t.enrichment.images(data(), context);
    expect(result.avatarKey).toBeDefined();
    expect("avatarSurface" in result).toBe(false);
  });
  it("an avatar already in storage gives back the surface it carries and is not measured again", async () => {
    const t = setup({ [POST]: await jpegEntry() });
    t.rows.set(`ws-1:${keyOf(AVATAR)}`, { id: "cached", key: keyOf(AVATAR), width: 300, height: 300, metadata: { surface: "dark" } });
    const result = await t.enrichment.images(data(), context);
    expect(result).toMatchObject({ avatarAssetId: "cached", avatarSurface: "dark" });
    expect(measureSpy).not.toHaveBeenCalled();
  });
  it("without an avatar there is nothing to report", async () => {
    const t = setup({ [POST]: await jpegEntry() });
    const result = await t.enrichment.images(data({ avatarUrl: null }), context);
    expect("avatarSurface" in result).toBe(false);
  });
});

describe("images(): the posts", () => {
  it("are never measured, even a transparent light PNG, and carry no surface", async () => {
    const t = setup({ [AVATAR]: await jpegEntry(), [POST]: await png(block(600, 600, WHITE)) });
    const result = await t.enrichment.images(data(), context);
    expect(result.posts).toHaveLength(1);
    // Only the avatar (a JPEG here) went to the measure; the bytes of the post never did.
    expect(measureSpy).toHaveBeenCalledTimes(1);
    expect((await sharp(measureSpy.mock.calls[0]![0]).metadata()).format).toBe("jpeg");
    expect(result.posts[0]).not.toHaveProperty("surface");
    expect(t.saved.find(a => a.name === "instagram_post")!.metadata).not.toHaveProperty("surface");
  });
});

describe("identity(): the Instagram vision is the one it always was", () => {
  it("copies of a light avatar are still flattened on white, and the vision input has no backdrop", async () => {
    const t = setup({ [AVATAR]: await png(block(300, 300, WHITE)), [POST]: await jpegEntry() });
    const read = await t.enrichment.images(data(), context);
    expect(read.avatarSurface).toBe("dark");
    const result = await t.enrichment.identity(read, context);
    expect(result.colors).toEqual(["#111111"]);
    const copy = await t.storage.get(`${read.avatarKey}-vision.jpg`);
    const { data: px } = await sharp(copy).raw().toBuffer({ resolveWithObject: true });
    for (const v of [px[0]!, px[1]!, px[2]!]) expect(v).toBeGreaterThanOrEqual(252);
    expect(Object.keys(t.inputs[0]!).sort()).toEqual(["imageKeys", "signal"]);
  });
});
