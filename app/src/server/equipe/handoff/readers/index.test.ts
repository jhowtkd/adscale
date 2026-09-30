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

import { createHandoffReaders, type HandoffReadingContext } from "./index";

const context: HandoffReadingContext = {
  workspaceId: "ws-1", accountId: "acc-1", handoffId: "handoff-1", readingId: "reading-1", taskIntentId: "intent-1",
};
const base = `workspaces/ws-1/handoff/handoff-1/reading-1/intent-1`;
const originalEnv = { ...process.env };

describe("createHandoffReaders: fake provider materializes real local fixtures into R2 + provisional workspace assets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFile.mockResolvedValue(Buffer.from("fake-bytes"));
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

    // The logo fixture is an .svg — extension and MIME type derived from it, not hardcoded to png.
    expect(mockPut).toHaveBeenCalledWith(`${base}/site_logo.svg`, expect.any(Buffer), "image/svg+xml");
    expect(mockCreateIfAbsent).toHaveBeenCalledWith(expect.objectContaining({
      key: `${base}/site_logo.svg`, metadata: expect.objectContaining({ kind: "site_logo" }),
    }));
    expect(data.branding?.logo).toMatchObject({ key: `${base}/site_logo.svg` });
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
      key: `${base}/instagram_avatar.svg`, source: "brand_instagram",
      metadata: expect.objectContaining({ kind: "instagram_avatar" }),
    }));
    expect(mockCreateIfAbsent).toHaveBeenCalledWith(expect.objectContaining({
      key: `${base}/instagram_post_0.png`, source: "brand_instagram",
      metadata: expect.objectContaining({ kind: "instagram_post" }),
    }));
    expect(data.avatarKey).toBe(`${base}/instagram_avatar.svg`);
    expect(data.avatarAssetId).toBeTruthy();
    expect(data.posts[0]).toMatchObject({ key: `${base}/instagram_post_0.png` });
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
