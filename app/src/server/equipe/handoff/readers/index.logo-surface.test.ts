// The development readers (SITE_READER_PROVIDER / INSTAGRAM_READER_PROVIDER = fake) judge a logo the way the real import does (ticket 16).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

const context: HandoffReadingContext = { workspaceId: "ws-1", accountId: "acc-1", handoffId: "handoff-1", readingId: "reading-1", taskIntentId: "intent-1" };
const base = "workspaces/ws-1/handoff/handoff-1/reading-1/intent-1";
const originalEnv = { ...process.env };
const inkSvg = (ink: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80" viewBox="0 0 240 80"><rect x="20" y="20" width="200" height="40" fill="${ink}"/></svg>`);
type Created = { key: string; metadata: Record<string, unknown> };
const created = (key: string) => (mockCreateIfAbsent.mock.calls as Array<[Created]>).find(([input]) => input.key === key)?.[0];

/** The logo fixture (an .svg) reads as `logoBytes`; every raster fixture is opaque bytes, as in the other tests of the readers. */
/** The raster fixtures are transparent PNGs with white ink here: if anything but a logo were measured, it would be "dark". */
let rasterBytes: Buffer = Buffer.from("fake-bytes");
beforeAll(async () => { rasterBytes = await sharp(inkSvg("#ffffff")).png().toBuffer(); });
async function stub(logoBytes?: Buffer | "real") {
  const { readFile } = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  mockReadFile.mockImplementation(async (path: string) => !String(path).endsWith(".svg") ? rasterBytes : logoBytes && logoBytes !== "real" ? logoBytes : readFile(path));
}

describe("fake readers: the plate of the logo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetByKey.mockResolvedValue(null);
    mockCreateIfAbsent.mockImplementation(async (input: { key: string }) => ({ id: `asset-for-${input.key}`, ...input }));
  });
  afterEach(() => { process.env = { ...originalEnv }; });

  describe("site", () => {
    beforeEach(() => { process.env.SITE_READER_PROVIDER = "fake"; delete process.env.INSTAGRAM_READER_PROVIDER; });

    it("the real fixture (/e2e/logo.svg, dark and colored ink) is measured light: the asset says so and so does the result", async () => {
      await stub("real");
      const data = await createHandoffReaders().site.read("https://acme.com", context);
      expect(created(`${base}/site_logo.png`)!.metadata).toMatchObject({ kind: "site_logo", surface: "light" });
      expect(data.branding?.logo).toMatchObject({ key: `${base}/site_logo.png`, surface: "light" });
    });
    it("a fixture with white ink is measured dark, and the stored bytes are the PNG that was judged", async () => {
      await stub(inkSvg("#ffffff"));
      const data = await createHandoffReaders().site.read("https://acme.com", context);
      expect(created(`${base}/site_logo.png`)!.metadata).toMatchObject({ surface: "dark" });
      expect(data.branding?.logo?.surface).toBe("dark");
      const put = mockPut.mock.calls.find(([key]) => key === `${base}/site_logo.png`) as [string, Buffer, string];
      expect((await sharp(put[1]).metadata()).format).toBe("png");
    });
    it("the images are never measured: no surface in their metadata nor in the result", async () => {
      await stub(inkSvg("#ffffff"));
      const data = await createHandoffReaders().site.read("https://acme.com", context);
      expect(created(`${base}/site_image_0.png`)!.metadata).not.toHaveProperty("surface");
      expect("surface" in data.images[0]!).toBe(false);
    });
    it("a logo already stored gives back the surface its asset carries, and is neither stored nor measured again", async () => {
      await stub(inkSvg("#ffffff"));
      mockGetByKey.mockImplementation(async (_ws: string, key: string) => key === `${base}/site_logo.png` ? { id: "existing-logo", key, metadata: { surface: "dark" } } : null);
      const data = await createHandoffReaders().site.read("https://acme.com", context);
      expect(data.branding?.logo).toMatchObject({ assetId: "existing-logo", surface: "dark" });
      expect(created(`${base}/site_logo.png`)).toBeUndefined();
    });
    it.each([[undefined], [null], [{}], [{ surface: "purple" }]] as unknown[][])("an old stored logo with metadata %j gives back no surface", async metadata => {
      await stub("real");
      mockGetByKey.mockImplementation(async (_ws: string, key: string) => key === `${base}/site_logo.png` ? { id: "old-logo", key, metadata } : null);
      const data = await createHandoffReaders().site.read("https://acme.com", context);
      expect("surface" in data.branding!.logo!).toBe(false);
    });
  });

  describe("instagram", () => {
    beforeEach(() => { process.env.INSTAGRAM_READER_PROVIDER = "fake"; delete process.env.SITE_READER_PROVIDER; });

    it("the avatar is measured: white ink asks for the dark plate, in the asset and in avatarSurface", async () => {
      await stub(inkSvg("#ffffff"));
      const data = await createHandoffReaders().instagram.profile("acme.oficial", context);
      expect(created(`${base}/instagram_avatar.png`)!.metadata).toMatchObject({ kind: "instagram_avatar", surface: "dark" });
      expect(data.avatarSurface).toBe("dark");
    });
    it("the real fixture is light", async () => {
      await stub("real");
      expect((await createHandoffReaders().instagram.profile("acme.oficial", context)).avatarSurface).toBe("light");
    });
    it("the posts are never measured", async () => {
      await stub(inkSvg("#ffffff"));
      const data = await createHandoffReaders().instagram.profile("acme.oficial", context);
      expect(created(`${base}/instagram_post_0.png`)!.metadata).not.toHaveProperty("surface");
      expect(data.posts[0]).not.toHaveProperty("surface");
    });
    it("an avatar already stored gives back its surface", async () => {
      await stub("real");
      mockGetByKey.mockImplementation(async (_ws: string, key: string) => key === `${base}/instagram_avatar.png` ? { id: "existing-avatar", key, metadata: { surface: "dark" } } : null);
      expect(await createHandoffReaders().instagram.profile("acme.oficial", context)).toMatchObject({ avatarAssetId: "existing-avatar", avatarSurface: "dark" });
    });
  });
});
