import { beforeEach, describe, expect, it, vi } from "vitest";

import { createHash } from "node:crypto";
import { objectStorage } from "@/server/storage";
import { POST } from "./route";
import { normalizeTrainingUpload } from "@/server/brand-training/upload";
import { RasterRetryError } from "@/server/equipe/handoff/raster-image";

const PROFILE_ID = "00000000-0000-4000-8000-000000000001";
const objectStoragePut = vi.mocked(objectStorage.put);

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    }),
  ),
}));

vi.mock("@/lib/with-rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/lib/upload-config", () => ({
  isAllowedImageType: vi.fn(() => true),
  validateImageMagicBytes: vi.fn(() => Promise.resolve(true)),
  sanitizeStorageFilename: vi.fn((name: string) => name),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    put: vi.fn(() => Promise.resolve()),
    publicUrl: vi.fn((key: string) => `https://cdn.example/${key}`),
  },
}));

const extractBrandKitFromImage = vi.fn();
vi.mock("@/server/ai/brand-kit-extractor", () => ({
  extractBrandKitFromImage: (...args: unknown[]) => extractBrandKitFromImage(...args),
}));

const spendOrApiError = vi.fn();
vi.mock("@/server/billing/paywall", () => ({
  spendOrApiError: (...args: unknown[]) => spendOrApiError(...args),
}));

const resolveBrandKitProfileId = vi.fn();
const upsertBrandKit = vi.fn();
vi.mock("@/server/repositories/brand-kit", () => ({
  BrandKitAmbiguityError: class BrandKitAmbiguityError extends Error {
    name = "BrandKitAmbiguityError";
  },
  BrandKitProfileNotFoundError: class BrandKitProfileNotFoundError extends Error {
    name = "BrandKitProfileNotFoundError";
  },
  resolveBrandKitProfileId: (...args: unknown[]) => resolveBrandKitProfileId(...args),
  upsertBrandKit: (...args: unknown[]) => upsertBrandKit(...args),
}));

const createTrainingReference = vi.fn();
const createClientReference = vi.fn();
const getTrainingReferenceByAssetKey = vi.fn();
vi.mock("@/server/repositories/client-reference", () => ({
  createClientReference: (...args: unknown[]) => createClientReference(...args),
  createTrainingReference: (...args: unknown[]) => createTrainingReference(...args),
  getTrainingReferenceByAssetKey: (...args: unknown[]) => getTrainingReferenceByAssetKey(...args),
}));

const createBrandKnowledgeCandidates = vi.fn();
vi.mock("@/server/repositories/brand-knowledge", () => ({
  createBrandKnowledgeCandidates: (...args: unknown[]) => createBrandKnowledgeCandidates(...args),
}));

vi.mock("@/server/brand-training/upload", () => ({
  normalizeTrainingUpload: vi.fn(async (file: File) => ({
    buffer: Buffer.from(await file.arrayBuffer()),
    type: "image/png",
    extension: "png",
    hasAlpha: true,
  })),
}));

const createWorkspaceAsset = vi.fn();
const getWorkspaceAssetByKey = vi.fn();
vi.mock("@/server/repositories/workspace-asset", () => ({
  createWorkspaceAsset: (...args: unknown[]) => createWorkspaceAsset(...args),
  getWorkspaceAssetByKey: (...args: unknown[]) => getWorkspaceAssetByKey(...args),
}));

const inngestSend = vi.fn(() => Promise.resolve());
vi.mock("@/server/jobs/client", () => ({
  inngest: { send: (...args: unknown[]) => inngestSend(...args) },
}));

function makeFile(name: string) {
  return new File([new Uint8Array([137, 80, 78, 71])], name, { type: "image/png" });
}

function multiRequest(entries: Array<{ fileName: string; kind: string }>, files: Record<string, File>) {
  const req = new Request("http://localhost/api/workspace/brand-kit/extract-multi", {
    method: "POST",
  });
  vi.spyOn(req, "formData").mockResolvedValue({
    get: (name: string) => (name === "entries" ? JSON.stringify(entries) : (files[name] ?? null)),
    append: vi.fn(),
    delete: vi.fn(),
    getAll: vi.fn(() => []),
    has: vi.fn(() => true),
    forEach: vi.fn(),
    set: vi.fn(),
    [Symbol.iterator]: vi.fn(),
    entries: vi.fn(),
    keys: vi.fn(),
    values: vi.fn(),
  } as unknown as FormData);
  return req;
}

describe("POST /api/workspace/brand-kit/extract-multi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spendOrApiError.mockResolvedValue(null);
    resolveBrandKitProfileId.mockResolvedValue(PROFILE_ID);
    upsertBrandKit.mockResolvedValue({ id: PROFILE_ID });
    createTrainingReference.mockResolvedValue({ id: "ref-1" });
    createClientReference.mockResolvedValue({ id: "guide-ref-1" });
    createBrandKnowledgeCandidates.mockResolvedValue([]);
    getTrainingReferenceByAssetKey.mockResolvedValue(null);
    createWorkspaceAsset.mockResolvedValue({ id: "asset-1", key: "k" });
    getWorkspaceAssetByKey.mockResolvedValue(null);
    extractBrandKitFromImage.mockResolvedValue({
      colors: ["#000000"],
      fonts: ["Inter"],
      logoDescription: "x",
      toneOfVoice: "Direct",
      prohibitedElements: "none",
      requiredElements: "logo",
    });
  });

  it("extracts and charges for a guide, accumulating into the brandKit draft", async () => {
    const file = makeFile("guide.png");
    const res = await POST(
      multiRequest([{ fileName: "guide-0-guide.png", kind: "guide" }], {
        "guide-0-guide.png": file,
      }),
    );

    expect(res.status).toBe(201);
    expect(spendOrApiError).toHaveBeenCalledTimes(1);
    expect(spendOrApiError).toHaveBeenCalledWith(
      expect.objectContaining({ action: "creative_qa" }),
    );
    expect(extractBrandKitFromImage).toHaveBeenCalledTimes(1);

    const body = await res.json();
    expect(body.result.brandKit.colors).toEqual(["#000000"]);
    expect(body.result.brandKit.fonts).toEqual(["Inter"]);
    expect(body.result.charges).toEqual([
      { fileName: "guide-0-guide.png", kind: "guide", charged: true },
    ]);
    expect(createClientReference).toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({ clientProfileId: PROFILE_ID, kind: "brand_guide" }),
    );
    expect(createBrandKnowledgeCandidates).toHaveBeenCalledWith(
      "workspace-1",
      PROFILE_ID,
      expect.arrayContaining([
        expect.objectContaining({ claimKey: "palette.colors", status: "candidate" }),
        expect.objectContaining({ claimKey: "typography.families", status: "candidate" }),
      ]),
    );
    expect(body.result.assets[0]).toEqual(expect.objectContaining({ kind: "guide" }));
  });

  it("persists a logo without charging and registers it on the profile", async () => {
    const file = makeFile("logo.png");
    const res = await POST(
      multiRequest([{ fileName: "logo-0-logo.png", kind: "logo" }], {
        "logo-0-logo.png": file,
      }),
    );

    expect(res.status).toBe(201);
    expect(spendOrApiError).not.toHaveBeenCalled();
    expect(extractBrandKitFromImage).not.toHaveBeenCalled();
    expect(resolveBrandKitProfileId).toHaveBeenCalledWith("workspace-1", null);
    // Ticket 07: every producer of workspace_assets tags the brand.
    expect(createWorkspaceAsset).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1", clientProfileId: PROFILE_ID }),
    );
    expect(upsertBrandKit).toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({ logoAssetKey: expect.any(String) }),
      PROFILE_ID,
    );
    expect(createTrainingReference).toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({ clientProfileId: PROFILE_ID, label: "logo.png" }),
    );
    expect(inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({ name: "brand.training.analyze" }),
    );

    const body = await res.json();
    expect(body.result.assets).toHaveLength(1);
    expect(body.result.assets[0].kind).toBe("logo");
    expect(body.result.charges[0].charged).toBe(false);
  });

  it("persists a creative as a workspace asset and dispatches analysis", async () => {
    const file = makeFile("creative.png");
    const res = await POST(
      multiRequest([{ fileName: "creative-0-creative.png", kind: "creative" }], {
        "creative-0-creative.png": file,
      }),
    );

    expect(res.status).toBe(201);
    expect(spendOrApiError).not.toHaveBeenCalled();
    expect(createWorkspaceAsset).toHaveBeenCalledWith(
      // Ticket 07: every producer of workspace_assets tags the brand.
      expect.objectContaining({ workspaceId: "workspace-1", clientProfileId: PROFILE_ID, name: "creative.png" }),
    );
    expect(createTrainingReference).toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({ clientProfileId: PROFILE_ID, label: "creative.png" }),
    );
    expect(inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({ name: "brand.training.analyze" }),
    );

    const body = await res.json();
    expect(body.result.assets[0].kind).toBe("creative");
  });

  it("accumulates multiple guides into a deduped brandKit draft", async () => {
    extractBrandKitFromImage
      .mockResolvedValueOnce({
        colors: ["#000000", "#FF0000"],
        fonts: ["Inter"],
        logoDescription: "",
        toneOfVoice: "First",
        prohibitedElements: "",
        requiredElements: "",
      })
      .mockResolvedValueOnce({
        colors: ["#000000", "#00FF00"],
        fonts: ["Merriweather"],
        logoDescription: "",
        toneOfVoice: "Second",
        prohibitedElements: "neon",
        requiredElements: "",
      });

    const res = await POST(
      multiRequest(
        [
          { fileName: "guide-0-a.png", kind: "guide" },
          { fileName: "guide-1-b.png", kind: "guide" },
        ],
        {
          "guide-0-a.png": makeFile("a.png"),
          "guide-1-b.png": makeFile("b.png"),
        },
      ),
    );

    const body = await res.json();
    // #000000 appears in both → deduped.
    expect(body.result.brandKit.colors).toEqual(["#000000", "#FF0000", "#00FF00"]);
    // Fonts concatenated.
    expect(body.result.brandKit.fonts).toEqual(["Inter", "Merriweather"]);
    // Last non-empty scalar wins.
    expect(body.result.brandKit.toneOfVoice).toBe("Second");
    expect(body.result.brandKit.prohibitedElements).toBe("neon");
    expect(spendOrApiError).toHaveBeenCalledTimes(2);
  });

  it("returns 400 when entries payload is missing", async () => {
    const req = new Request("http://localhost/api/workspace/brand-kit/extract-multi", {
      method: "POST",
    });
    vi.spyOn(req, "formData").mockResolvedValue({
      get: () => null,
    } as unknown as FormData);

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
  it("passes the workspace's raster key to the upload, and a full raster line is a 503 with Retry-After, not an unknown 500", async () => {
    const response = await POST(multiRequest([{ fileName: "logo-0-logo.png", kind: "logo" }], { "logo-0-logo.png": makeFile("logo.png") }));
    expect(response.status).toBe(201);
    expect(vi.mocked(normalizeTrainingUpload)).toHaveBeenCalledWith(expect.any(File), "classic:workspace-1");

    vi.mocked(normalizeTrainingUpload).mockRejectedValueOnce(new RasterRetryError("capacity"));
    const busy = await POST(multiRequest([{ fileName: "logo-0-logo.png", kind: "logo" }], { "logo-0-logo.png": makeFile("logo.png") }));
    expect(busy.status).toBe(503);
    expect(busy.headers.get("Retry-After")).toBe("1");
    expect(await busy.json()).toMatchObject({ code: "internalError" });
  });

  describe("every guide is admitted before any charge, vendor call or storage write", () => {
    const guideRequest = (names: string[], bytes: Record<string, number[]> = {}) =>
      multiRequest(
        names.map((name, index) => ({ fileName: `guide-${index}-${name}`, kind: "guide" })),
        Object.fromEntries(names.map((name, index) => [`guide-${index}-${name}`, new File([new Uint8Array(bytes[name] ?? [137, 80, 78, 71, index])], name, { type: "image/png" })])),
      );
    const normalize = vi.mocked(normalizeTrainingUpload);
    const untouched = () => {
      expect(spendOrApiError).not.toHaveBeenCalled();
      expect(extractBrandKitFromImage).not.toHaveBeenCalled();
      expect(objectStoragePut).not.toHaveBeenCalled();
      expect(createWorkspaceAsset).not.toHaveBeenCalled();
      expect(createClientReference).not.toHaveBeenCalled();
      expect(upsertBrandKit).not.toHaveBeenCalled();
    };
    const refuse = (reason: string) => new Error(reason);

    it("a refused first guide: nothing is charged, extracted or stored", async () => {
      normalize.mockRejectedValueOnce(refuse("invalid_type"));
      const res = await POST(guideRequest(["a.png", "b.png"]));
      expect(res.status).toBeGreaterThanOrEqual(400);
      untouched();
    });
    it("a refused SECOND guide after a valid first one: still nothing is charged, extracted or stored (the first is not paid for)", async () => {
      normalize.mockResolvedValueOnce({ buffer: Buffer.from("ok"), type: "image/png", extension: "png", hasAlpha: false });
      normalize.mockRejectedValueOnce(refuse("invalid_type"));
      const res = await POST(guideRequest(["a.png", "b.png"]));
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(normalize).toHaveBeenCalledTimes(2);
      untouched();
    });
    it("a full raster line on the second guide is a 503 with Retry-After 1 and nothing is charged, extracted or stored", async () => {
      normalize.mockResolvedValueOnce({ buffer: Buffer.from("ok"), type: "image/png", extension: "png", hasAlpha: false });
      normalize.mockRejectedValueOnce(new RasterRetryError("capacity"));
      const res = await POST(guideRequest(["a.png", "b.png", "c.png"]));
      expect(res.status).toBe(503);
      expect(res.headers.get("Retry-After")).toBe("1");
      expect(normalize).toHaveBeenCalledTimes(2);
      untouched();
    });
    it("the refusal answers with the same status as a refusal of a logo does today (the codes did not change)", async () => {
      normalize.mockRejectedValueOnce(refuse("invalid_type"));
      const guide = await POST(guideRequest(["a.png"]));
      normalize.mockRejectedValueOnce(refuse("invalid_type"));
      const logo = await POST(multiRequest([{ fileName: "logo-0-logo.png", kind: "logo" }], { "logo-0-logo.png": makeFile("logo.png") }));
      expect(guide.status).toBe(logo.status);
    });
    it("valid guides: each is admitted once and before the first charge; same debits (same count, action, idempotency key and metadata), same vendor payload (the ORIGINAL bytes and type), and storage reuses the original prepared buffer under the same hash keys", async () => {
      const order: string[] = [];
      const admit = async (file: File) => { order.push(`normalize:${file.name}`); return { buffer: Buffer.from(await file.arrayBuffer()), type: "image/png" as const, extension: "png" as const, hasAlpha: false }; };
      normalize.mockImplementationOnce(admit).mockImplementationOnce(admit);
      const record = async (input: { idempotencyKey: string }) => { order.push(`spend:${input.idempotencyKey}`); return null; };
      spendOrApiError.mockImplementationOnce(record).mockImplementationOnce(record);
      const res = await POST(guideRequest(["a.png", "b.png"], { "a.png": [1, 2, 3], "b.png": [4, 5, 6, 7] }));
      expect(res.status).toBe(201);
      // Both admitted before any debit; then the debits in order.
      expect(order).toEqual(["normalize:a.png", "normalize:b.png", "spend:brand-kit-extract:workspace-1:a.png:3", "spend:brand-kit-extract:workspace-1:b.png:4"]);
      expect(spendOrApiError).toHaveBeenCalledTimes(2);
      expect(spendOrApiError).toHaveBeenNthCalledWith(1, { workspaceId: "workspace-1", action: "creative_qa", idempotencyKey: "brand-kit-extract:workspace-1:a.png:3", metadata: { workspaceId: "workspace-1" } });
      expect(extractBrandKitFromImage).toHaveBeenCalledTimes(2);
      const payloads = extractBrandKitFromImage.mock.calls.map(([buffer, type]) => [Array.from(buffer as Buffer), type]);
      expect(payloads).toEqual([[[1, 2, 3], "image/png"], [[4, 5, 6, 7], "image/png"]]);
      expect(objectStoragePut).toHaveBeenCalledTimes(2);
      const hashOf = (text: string) => createHash("sha256").update(Buffer.from(text)).digest("hex");
      const stored = objectStoragePut.mock.calls.map(([key, body, type]) => [key as string, Buffer.from(body as Buffer).subarray(0, 2).toString(), type]);
      for (const [index, [, storedBuffer]] of objectStoragePut.mock.calls.entries()) {
        expect(storedBuffer).toBe(extractBrandKitFromImage.mock.calls[index][0]);
      }
      expect(stored.map(item => item[2])).toEqual(["image/png", "image/png"]);
      const keys = objectStoragePut.mock.calls.map(([key]) => key as string);
      for (const [index, bytes] of [[1, 2, 3], [4, 5, 6, 7]].entries()) {
        const admitted = Buffer.from(bytes);
        expect(keys[index]).toBe(`workspaces/workspace-1/brand-guides/${PROFILE_ID}/${createHash("sha256").update(admitted).digest("hex").slice(0, 24)}.png`);
      }
      expect(hashOf("x")).toHaveLength(64);
      expect(createWorkspaceAsset).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ ingestionKind: "guide", originalMimeType: "image/png" }) }));
      const body = await res.json();
      expect(body.result.charges).toEqual([{ fileName: "guide-0-a.png", kind: "guide", charged: true }, { fileName: "guide-1-b.png", kind: "guide", charged: true }]);
    });
    it("insufficient credit answers exactly what the paywall answered, and neither the vendor nor the storage is touched (the admission already happened)", async () => {
      const paywall = new Response(JSON.stringify({ code: "insufficientCredits" }), { status: 402 });
      spendOrApiError.mockResolvedValueOnce(paywall);
      const res = await POST(guideRequest(["a.png", "b.png"]));
      expect(res).toBe(paywall);
      expect(normalize).toHaveBeenCalledTimes(2);
      expect(extractBrandKitFromImage).not.toHaveBeenCalled();
      expect(objectStoragePut).not.toHaveBeenCalled();
      expect(createWorkspaceAsset).not.toHaveBeenCalled();
    });
    it("a second guide with insufficient credit stops after the first debit as before: the vendor and the storage are not reached for either", async () => {
      const paywall = new Response(JSON.stringify({ code: "insufficientCredits" }), { status: 402 });
      spendOrApiError.mockResolvedValueOnce(null).mockResolvedValueOnce(paywall);
      const res = await POST(guideRequest(["a.png", "b.png"]));
      expect(res).toBe(paywall);
      expect(spendOrApiError).toHaveBeenCalledTimes(2);
      expect(extractBrandKitFromImage).not.toHaveBeenCalled();
      expect(objectStoragePut).not.toHaveBeenCalled();
    });
  });
});
