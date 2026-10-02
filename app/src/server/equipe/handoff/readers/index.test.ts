import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockReadFile = vi.hoisted(() => vi.fn());
const mockPut = vi.hoisted(() => vi.fn());
const mockCreateIfAbsent = vi.hoisted(() => vi.fn());
const mockGetByKey = vi.hoisted(() => vi.fn());

vi.mock("node:fs/promises", () => ({ readFile: (...args: unknown[]) => mockReadFile(...args) }));
vi.mock("@/server/storage", () => ({ objectStorage: { put: (...args: unknown[]) => mockPut(...args) } }));
vi.mock("@/server/repositories/workspace-asset", () => ({
  createWorkspaceAssetIfKeyAbsent: (...args: unknown[]) => mockCreateIfAbsent(...args),
  getWorkspaceAssetByKey: (...args: unknown[]) => mockGetByKey(...args),
}));

import sharp from "sharp";
import { createHandoffReaders, type HandoffReadingContext } from "./index";
import { sanitizeSvg } from "../svg-sanitize";

const context: HandoffReadingContext = {
  workspaceId: "ws-1", accountId: "acc-1", handoffId: "handoff-1", readingId: "reading-1", taskIntentId: "intent-1",
};
const base = `workspaces/ws-1/handoff/handoff-1/reading-1/intent-1`;
const originalEnv = { ...process.env };
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** What was stored, and as what: an SVG must never be among it (the vector fixtures are drawn as PNG first, like a real logo). */
function expectNoSvgStored() {
  for (const [key, bytes, contentType] of mockPut.mock.calls as Array<[string, Buffer, string]>) {
    expect(key).not.toMatch(/\.svg$/i);
    expect(contentType).not.toBe("image/svg+xml");
    expect(bytes.subarray(0, 100).toString("latin1")).not.toMatch(/<svg|<\?xml/i);
  }
  for (const [input] of mockCreateIfAbsent.mock.calls as Array<[{ key: string; type: string }]>) {
    expect(input.key).not.toMatch(/\.svg$/i);
    expect(input.type).not.toBe("image/svg+xml");
  }
}

describe("createHandoffReaders: fake provider materializes real local fixtures into R2 + provisional workspace assets", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // The raster fixtures are opaque bytes here; the vector one is the real file, because it is really drawn.
    const { readFile } = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    mockReadFile.mockImplementation(async (path: string) => String(path).endsWith(".svg") ? readFile(path) : Buffer.from("fake-bytes"));
    mockGetByKey.mockResolvedValue(null);
    mockCreateIfAbsent.mockImplementation(async (input: { key: string }) => ({ id: `asset-for-${input.key}`, ...input }));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("materializes every site image and the logo as a real R2 put + provisional workspace_assets row", async () => {
    process.env.SITE_READER_PROVIDER = "fake";
    delete process.env.INSTAGRAM_READER_PROVIDER;
    const readers = createHandoffReaders();

    const data = await readers.site.read("https://acme.com", context);

    expect(mockPut).toHaveBeenCalledWith(`${base}/site_image_0.png`, Buffer.from("fake-bytes"), "image/png");
    expect(mockCreateIfAbsent).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "ws-1", clientProfileId: null, key: `${base}/site_image_0.png`, source: "brand_site",
      metadata: expect.objectContaining({ handoffId: "handoff-1", readingId: "reading-1", provisional: true, kind: "site_image" }),
    }));
    expect(data.images[0]).toMatchObject({ key: `${base}/site_image_0.png`, assetId: `asset-for-${base}/site_image_0.png` });

    // The logo fixture is an .svg (/e2e/logo.svg): it is drawn as a PNG, so the key is always .png and the type image/png.
    const logoPut = mockPut.mock.calls.find(([key]) => key === `${base}/site_logo.png`) as [string, Buffer, string] | undefined;
    expect(logoPut).toBeDefined();
    expect(logoPut![2]).toBe("image/png");
    expect(logoPut![1].subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(await sharp(logoPut![1]).metadata()).toMatchObject({ format: "png", width: 1024, height: 341 });
    expect(mockCreateIfAbsent).toHaveBeenCalledWith(expect.objectContaining({
      key: `${base}/site_logo.png`, type: "image/png", size: logoPut![1].length, metadata: expect.objectContaining({ kind: "site_logo" }),
    }));
    expect(data.branding?.logo).toMatchObject({ key: `${base}/site_logo.png` });
    expectNoSvgStored();
  });

  it("the vector fixture is drawn, not copied: a raster fixture is stored exactly as read", async () => {
    process.env.SITE_READER_PROVIDER = "fake";
    await createHandoffReaders().site.read("https://acme.com", context);
    expect(mockPut).toHaveBeenCalledWith(`${base}/site_image_0.png`, Buffer.from("fake-bytes"), "image/png");
    expect(mockReadFile.mock.calls.map(([path]) => String(path))).toEqual(expect.arrayContaining([expect.stringMatching(/public\/e2e\/logo\.svg$/)]));
  });

  it("the fixture is a plain drawing the sanitizer takes as it is: shapes only, no text, nothing that leaves the file", async () => {
    const { readFile } = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const { svg } = sanitizeSvg(await readFile(`${process.cwd()}/public/e2e/logo.svg`));
    expect(svg).not.toMatch(/<text|<image|<script|href=|@import/i);
    expect(svg).toMatch(/<circle/);
  });

  it("requires a reading context — refuses to materialize (or guess a key) without one", async () => {
    process.env.SITE_READER_PROVIDER = "fake";
    const readers = createHandoffReaders();

    await expect(readers.site.read("https://acme.com")).rejects.toThrow("fake_reading_context_required");
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("reuses an already-materialized asset instead of re-uploading on a retried reading", async () => {
    process.env.SITE_READER_PROVIDER = "fake";
    mockGetByKey.mockResolvedValue({ id: "existing-asset", key: `${base}/site_image_0.png` });
    const readers = createHandoffReaders();

    const data = await readers.site.read("https://acme.com", context);

    expect(mockPut).not.toHaveBeenCalledWith(`${base}/site_image_0.png`, expect.anything(), expect.anything());
    expect(mockCreateIfAbsent).not.toHaveBeenCalledWith(expect.objectContaining({ key: `${base}/site_image_0.png` }));
    expect(data.images[0]).toMatchObject({ key: `${base}/site_image_0.png`, assetId: "existing-asset" });
  });

  it("materializes the Instagram avatar under its own explicit kind (instagram_avatar), distinct from posts", async () => {
    process.env.INSTAGRAM_READER_PROVIDER = "fake";
    delete process.env.SITE_READER_PROVIDER;
    const readers = createHandoffReaders();

    const data = await readers.instagram.profile("acme.oficial", context);

    expect(mockCreateIfAbsent).toHaveBeenCalledWith(expect.objectContaining({
      key: `${base}/instagram_avatar.png`, type: "image/png", source: "brand_instagram",
      metadata: expect.objectContaining({ kind: "instagram_avatar" }),
    }));
    const avatarPut = mockPut.mock.calls.find(([key]) => key === `${base}/instagram_avatar.png`) as [string, Buffer, string] | undefined;
    expect(avatarPut?.[2]).toBe("image/png");
    expect(avatarPut?.[1].subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(mockCreateIfAbsent).toHaveBeenCalledWith(expect.objectContaining({
      key: `${base}/instagram_post_0.png`, source: "brand_instagram",
      metadata: expect.objectContaining({ kind: "instagram_post" }),
    }));
    expect(data.avatarKey).toBe(`${base}/instagram_avatar.png`);
    expect(data.avatarAssetId).toBeTruthy();
    expect(data.posts[0]).toMatchObject({ key: `${base}/instagram_post_0.png` });
    expectNoSvgStored();
  });

  it("without the fake-provider env var, the real provider still fails closed (unchanged)", async () => {
    delete process.env.SITE_READER_PROVIDER;
    delete process.env.INSTAGRAM_READER_PROVIDER;
    const readers = createHandoffReaders();

    await expect(readers.site.read("https://acme.com", context)).rejects.toThrow("reader_unavailable");
    await expect(readers.instagram.profile("acme.oficial", context)).rejects.toThrow("reader_unavailable");
    expect(mockPut).not.toHaveBeenCalled();
  });
});
