// POST /api/workspace/assets: the plate of the logo a person uploads in a handoff (ticket 16). Measured once, here, only for purpose=logo with a handoff.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import sharp from "sharp";
import { POST } from "./route";

// How many times the measure's module was loaded (its factory runs on the first import): an upload that is not a handoff logo must never load it.
const loads = vi.hoisted(() => ({ count: 0, measure: undefined as undefined | ((bytes: Uint8Array) => Promise<unknown>) & import("vitest").Mock }));
vi.mock("@/server/equipe/handoff/logo-surface", async importOriginal => {
  loads.count++;
  const actual = await importOriginal<typeof import("@/server/equipe/handoff/logo-surface")>();
  loads.measure = vi.fn(actual.measureLogoSurface) as never;
  return { ...actual, measureLogoSurface: loads.measure };
});

vi.mock("@/server/auth/workspace", () => ({ requireWorkspaceAccess: vi.fn(() => Promise.resolve({ user: { id: "user-1" }, workspace: { id: "workspace-1" } })) }));
vi.mock("@/server/repositories/workspace-asset", () => ({ createWorkspaceAsset: vi.fn(), getWorkspaceAssets: vi.fn(), getWorkspaceAssetsCount: vi.fn(() => Promise.resolve(0)) }));
vi.mock("@/server/storage", () => ({ objectStorage: { put: vi.fn(), delete: vi.fn(), publicUrl: vi.fn(), signedDownloadUrl: vi.fn() } }));
vi.mock("@/server/jobs/client", () => ({ inngest: { send: vi.fn() } }));
vi.mock("@/lib/upload-config", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/upload-config")>()),
  isAllowedImageType: vi.fn((type: string) => ["image/png", "image/jpeg", "image/webp"].includes(type)),
  validateImageMagicBytes: vi.fn(() => Promise.resolve(true)),
  sanitizeStorageFilename: vi.fn((name: string) => name),
}));
vi.mock("@/lib/with-rate-limit", () => ({ checkRateLimit: vi.fn(() => Promise.resolve(null)) }));
vi.mock("@/server/equipe/handoff/svg-logo", async importOriginal => {
  const actual = await importOriginal<typeof import("@/server/equipe/handoff/svg-logo")>();
  return { ...actual, rasterizeSvgLogo: vi.fn(actual.rasterizeSvgLogo) };
});
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(() => Promise.resolve((key: string) => key)) }));
vi.mock("@/server/equipe/handoff/assets", () => ({
  shouldAnalyzeWorkspaceAssets: vi.fn(() => Promise.resolve(true)), getHandoffAssetScope: vi.fn(() => Promise.resolve(null)), createHandoffWorkspaceAsset: vi.fn(),
}));
vi.mock("@/server/repositories/brand-kit", () => ({ resolveBrandKitProfileId: vi.fn() }));
vi.mock("@/server/repositories/client-reference", () => ({ getClientProfile: vi.fn() }));

import { createWorkspaceAsset } from "@/server/repositories/workspace-asset";
import { getHandoffAssetScope, createHandoffWorkspaceAsset } from "@/server/equipe/handoff/assets";
import { resolveBrandKitProfileId } from "@/server/repositories/brand-kit";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { rasterizeSvgLogo } from "@/server/equipe/handoff/svg-logo";
import { logger } from "@/lib/logger";
import { animatedBlankWebp, blankLosslessWebp, forgedPng } from "@/server/equipe/handoff/logo-surface.fixtures";
import { objectStorage } from "@/server/storage";

const HANDOFF_ID = "00000000-0000-4000-8000-000000000002";
const PROFILE_ID = "00000000-0000-4000-8000-000000000001";
const mockHandoffCreate = vi.mocked(createHandoffWorkspaceAsset);
const mockPlainCreate = vi.mocked(createWorkspaceAsset);
// The module is imported lazily by the route; the test must not import it itself, or "never loaded" could not be seen.
const measureSpy = () => loads.measure!;

const inkPng = (ink: string, alpha = 1) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect x="30" y="20" width="240" height="160" fill="${ink}" fill-opacity="${alpha}"/></svg>`)).png().toBuffer();
const file = (bytes: Uint8Array, type: string, name = "logo.png") => new File([bytes as BlobPart], name, { type });
const svgLogo = (ink: string) => new File([`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80" viewBox="0 0 240 80"><rect x="20" y="20" width="200" height="40" fill="${ink}"/></svg>`], "logo.svg", { type: "image/svg+xml" });
function send(f: File, fields: Record<string, string> = { handoffId: HANDOFF_ID, purpose: "logo" }) {
  const form = new FormData();
  form.append("file", f);
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  return POST(new Request("http://localhost/api/workspace/assets", { method: "POST", body: form }));
}
const createdMetadata = () => (mockHandoffCreate.mock.calls[0]![0] as { metadata?: Record<string, unknown> }).metadata;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveBrandKitProfileId).mockResolvedValue(PROFILE_ID);
  vi.mocked(getHandoffAssetScope).mockResolvedValue({ id: HANDOFF_ID, readingId: "reading-1", step: "identity" } as never);
  mockHandoffCreate.mockImplementation((async (input: Record<string, unknown>) => ({ id: "wa-handoff", workspaceId: "workspace-1", ...input })) as never);
  mockPlainCreate.mockImplementation((async (input: Record<string, unknown>) => ({ id: "wa-plain", ...input })) as never);
});
afterEach(() => vi.restoreAllMocks());

// Runs first on purpose: nothing above has asked for the measure yet, so the module is still unloaded.
describe("an upload that is not a handoff logo never loads the measure", () => {
  it("no purpose, with a handoff", async () => {
    const res = await send(file(await inkPng("#ffffff"), "image/png"), { handoffId: HANDOFF_ID });
    expect(res.status).toBe(201);
    expect(createdMetadata()).toEqual({ handoffId: HANDOFF_ID, readingId: "reading-1", provisional: true });
  });
  it("purpose=logo without a handoff: the classic path, nothing about the plate, nothing of the limiter", async () => {
    vi.mocked(getHandoffAssetScope).mockClear();
    const res = await send(file(await inkPng("#ffffff"), "image/png"), { purpose: "logo" });
    expect(res.status).toBe(201);
    expect(mockPlainCreate).toHaveBeenCalledTimes(1);
    expect(mockPlainCreate.mock.calls[0]![0]).not.toHaveProperty("metadata");
    expect(mockHandoffCreate).not.toHaveBeenCalled();
    expect(vi.mocked(checkRateLimit)).not.toHaveBeenCalled();
    expect(vi.mocked(rasterizeSvgLogo)).not.toHaveBeenCalled();
  });
  it.each(["LOGO", "avatar", "Logo ", ""])("purpose %j is no purpose", async purpose => {
    const res = await send(file(await inkPng("#ffffff"), "image/png"), { handoffId: HANDOFF_ID, purpose });
    expect(res.status).toBe(201);
    expect(createdMetadata()).not.toHaveProperty("surface");
  });
  it("nobody has loaded the module so far", () => {
    expect(loads.count).toBe(0);
    expect(loads.measure).toBeUndefined();
  });
  it("PNG, JPEG and WebP uploads still never call the limiter nor the SVG drawing", async () => {
    for (const [bytes, type] of [[await inkPng("#ffffff"), "image/png"], [await sharp({ create: { width: 50, height: 50, channels: 3, background: "#fff" } }).jpeg().toBuffer(), "image/jpeg"]] as const) {
      expect((await send(file(bytes, type), { handoffId: HANDOFF_ID })).status).toBe(201);
    }
    expect(vi.mocked(checkRateLimit)).not.toHaveBeenCalled();
    expect(vi.mocked(rasterizeSvgLogo)).not.toHaveBeenCalled();
  });
});

describe("purpose=logo with a handoff", () => {
  it("a PNG with white ink is stored with surface dark next to handoffId, readingId and provisional", async () => {
    const res = await send(file(await inkPng("#ffffff"), "image/png"));
    expect(res.status).toBe(201);
    expect(createdMetadata()).toEqual({ handoffId: HANDOFF_ID, readingId: "reading-1", provisional: true, surface: "dark" });
    expect(mockHandoffCreate.mock.calls[0]![1]).toBe(HANDOFF_ID);
    expect((await res.json()).asset).toMatchObject({ id: "wa-handoff", url: "/api/workspace/assets/wa-handoff/file" });
  });
  it("a PNG with dark ink is light", async () => {
    await send(file(await inkPng("#000000"), "image/png"));
    expect(createdMetadata()).toMatchObject({ surface: "light" });
  });
  it("a semi-transparent white PNG is dark", async () => {
    await send(file(await inkPng("#ffffff", 0.4), "image/png"));
    expect(createdMetadata()).toMatchObject({ surface: "dark" });
  });
  it("a JPEG has nothing to measure: no surface, stored as it came", async () => {
    const bytes = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();
    const res = await send(file(bytes, "image/jpeg", "logo.jpg"));
    expect(res.status).toBe(201);
    expect(createdMetadata()).toEqual({ handoffId: HANDOFF_ID, readingId: "reading-1", provisional: true });
    expect(vi.mocked(objectStorage.put)).toHaveBeenCalledWith(expect.stringMatching(/-logo\.jpg$/), Buffer.from(bytes), "image/jpeg");
  });
  it("an opaque PNG (it brings its own background) has no surface", async () => {
    const bytes = await sharp({ create: { width: 80, height: 60, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
    await send(file(bytes, "image/png"));
    expect(createdMetadata()).not.toHaveProperty("surface");
  });
  it("an SVG with white ink is drawn as a PNG, and that PNG is measured: dark", async () => {
    const res = await send(svgLogo("#ffffff"));
    expect(res.status).toBe(201);
    expect(createdMetadata()).toMatchObject({ surface: "dark" });
    expect(mockHandoffCreate.mock.calls[0]![0]).toMatchObject({ type: "image/png", name: "logo.png" });
    // The bytes that were judged are the bytes that were stored.
    const stored = vi.mocked(objectStorage.put).mock.calls[0]![1] as Buffer;
    expect(measureSpy().mock.calls[0]![0]).toEqual(stored);
  });
  it("an SVG with dark ink is light", async () => {
    await send(svgLogo("#111111"));
    expect(createdMetadata()).toMatchObject({ surface: "light" });
  });
  it("the measure is asked once per upload", async () => {
    await send(file(await inkPng("#ffffff"), "image/png"));
    expect(measureSpy()).toHaveBeenCalledTimes(1);
  });
});

describe("a logo that cannot be measured is stored all the same", () => {
  it("a PNG whose stream ends after the header: 201, no surface, and a warning that names the reason and nothing of the file", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const noisy = await sharp({ create: { width: 400, height: 300, channels: 4, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 60 } } }).png().toBuffer();
    const res = await send(file(noisy.subarray(0, 100), "image/png", "secret-name.png"));
    expect(res.status).toBe(201);
    expect(createdMetadata()).toEqual({ handoffId: HANDOFF_ID, readingId: "reading-1", provisional: true });
    expect(warn).toHaveBeenCalledWith("[equipe-handoff] logo surface not measured", { reason: expect.any(String) });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret-name");
    expect(vi.mocked(objectStorage.put)).toHaveBeenCalledTimes(1);
  });
  it("a measure that throws something that is not an Error is reported as unknown", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    measureSpy().mockRejectedValueOnce("boom");
    const res = await send(file(await inkPng("#ffffff"), "image/png"));
    expect(res.status).toBe(201);
    expect(warn).toHaveBeenCalledWith("[equipe-handoff] logo surface not measured", { reason: "unknown" });
  });
});

describe("a logo too big to decode here is accepted all the same", () => {
  it("a PNG whose header claims 40 MP in 16 bits, interlaced: 201, no surface, an info line with the reason, no warning, and no pixel is decoded", async () => {
    const info = vi.spyOn(logger, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const forged = await forgedPng({ width: 8000, height: 5001, depth: 16, interlace: 1 });
    const pixelWork = [vi.spyOn(sharp.prototype, "resize"), vi.spyOn(sharp.prototype, "toBuffer"), vi.spyOn(sharp.prototype, "raw")];
    const res = await send(file(forged, "image/png", "big.png"));
    expect(res.status).toBe(201);
    expect(createdMetadata()).toEqual({ handoffId: HANDOFF_ID, readingId: "reading-1", provisional: true });
    expect(info).toHaveBeenCalledWith("[equipe-handoff] logo surface skipped", { reason: "too_large" });
    expect(warn.mock.calls.some(call => String(call[0]).includes("logo surface"))).toBe(false);
    for (const spy of pixelWork) expect(spy).not.toHaveBeenCalled();
    expect(vi.mocked(objectStorage.put)).toHaveBeenCalledTimes(1);
  });
  it("a lossless WebP of 16383 x 16383 (28 bytes, a canvas of a gigabyte for libvips) is accepted all the same: 201, no surface, an info line, and `sharp` is not asked for anything", async () => {
    const info = vi.spyOn(logger, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const forged = blankLosslessWebp(16383, 16383);
    const sharpWork = [vi.spyOn(sharp.prototype, "metadata"), vi.spyOn(sharp.prototype, "resize"), vi.spyOn(sharp.prototype, "toBuffer"), vi.spyOn(sharp.prototype, "raw")];
    for (let upload = 0; upload < 3; upload++) {
      const res = await send(file(forged, "image/webp", "big.webp"));
      expect(res.status).toBe(201);
    }
    expect(mockHandoffCreate).toHaveBeenCalledTimes(3);
    for (const call of mockHandoffCreate.mock.calls) expect((call[0] as { metadata?: Record<string, unknown> }).metadata).toEqual({ handoffId: HANDOFF_ID, readingId: "reading-1", provisional: true });
    expect(info.mock.calls.filter(call => call[0] === "[equipe-handoff] logo surface skipped" && (call[1] as { reason: string }).reason === "too_large")).toHaveLength(3);
    expect(warn.mock.calls.some(call => String(call[0]).includes("logo surface"))).toBe(false);
    for (const spy of sharpWork) expect(spy).not.toHaveBeenCalled();
  });
  it("a PNG of 8388608 x 1 (the longest side is 8192; 600 MB for one measure without the limit) is accepted all the same: 201, no surface, an info line, and `sharp` is not asked for anything", async () => {
    const info = vi.spyOn(logger, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const wide = await forgedPng({ width: 8_388_608, height: 1 }), tall = await forgedPng({ width: 1, height: 8_388_608 });
    const sharpWork = [vi.spyOn(sharp.prototype, "metadata"), vi.spyOn(sharp.prototype, "resize"), vi.spyOn(sharp.prototype, "toBuffer"), vi.spyOn(sharp.prototype, "raw")];
    for (const bytes of [wide, tall]) expect((await send(file(bytes, "image/png", "strip.png"))).status).toBe(201);
    expect(mockHandoffCreate).toHaveBeenCalledTimes(2);
    for (const call of mockHandoffCreate.mock.calls) expect((call[0] as { metadata?: Record<string, unknown> }).metadata).toEqual({ handoffId: HANDOFF_ID, readingId: "reading-1", provisional: true });
    expect(info.mock.calls.filter(call => call[0] === "[equipe-handoff] logo surface skipped" && (call[1] as { reason: string }).reason === "too_large")).toHaveLength(2);
    expect(warn.mock.calls.some(call => String(call[0]).includes("logo surface"))).toBe(false);
    for (const spy of sharpWork) expect(spy).not.toHaveBeenCalled();
  });
  it("a WebP with animation is accepted all the same, as unsupported: info with that reason, 201, no surface", async () => {
    const info = vi.spyOn(logger, "info").mockImplementation(() => undefined);
    const res = await send(file(animatedBlankWebp(64, 64), "image/webp", "moving.webp"));
    expect(res.status).toBe(201);
    expect(createdMetadata()).not.toHaveProperty("surface");
    expect(info).toHaveBeenCalledWith("[equipe-handoff] logo surface skipped", { reason: "unsupported" });
  });
  it("a measure that is busy is the same: info with reason busy, 201, no surface", async () => {
    const info = vi.spyOn(logger, "info").mockImplementation(() => undefined);
    const { LogoSurfaceSkipped } = await import("@/server/equipe/handoff/logo-surface");
    measureSpy().mockRejectedValueOnce(new LogoSurfaceSkipped("busy"));
    const res = await send(file(await inkPng("#ffffff"), "image/png"));
    expect(res.status).toBe(201);
    expect(createdMetadata()).not.toHaveProperty("surface");
    expect(info).toHaveBeenCalledWith("[equipe-handoff] logo surface skipped", { reason: "busy" });
  });
  it("a PNG that ends right after its header is still a warning, not a skip", async () => {
    const info = vi.spyOn(logger, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const noisy = await sharp({ create: { width: 400, height: 300, channels: 4, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 60 } } }).png().toBuffer();
    const res = await send(file(noisy.subarray(0, 100), "image/png"));
    expect(res.status).toBe(201);
    expect(warn).toHaveBeenCalledWith("[equipe-handoff] logo surface not measured", { reason: expect.any(String) });
    expect(info.mock.calls.some(call => String(call[0]).includes("logo surface"))).toBe(false);
  });
});
