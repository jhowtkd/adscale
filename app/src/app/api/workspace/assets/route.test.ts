import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import sharp from "sharp";
import { GET, POST } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/workspace-asset", () => ({
  createWorkspaceAsset: vi.fn(),
  getWorkspaceAssets: vi.fn(),
  getWorkspaceAssetsCount: vi.fn(() => Promise.resolve(0)),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    put: vi.fn(),
    delete: vi.fn(),
    publicUrl: vi.fn((key: string) => `https://cdn.example.com/${key}`),
    signedDownloadUrl: vi.fn((key: string) =>
      Promise.resolve(`https://signed.example.com/${key}`)
    ),
  },
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: { send: vi.fn() },
}));

vi.mock("@/lib/upload-config", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/upload-config")>()),
  isAllowedImageType: vi.fn((type: string) => type === "image/png"),
  validateImageMagicBytes: vi.fn(() => Promise.resolve(true)),
  sanitizeStorageFilename: vi.fn((name: string) => name),
}));

// The test runner turns the real limiter off (E2E_DISABLE_RATE_LIMIT), so the 429 is proved with this one.
vi.mock("@/lib/with-rate-limit", () => ({ checkRateLimit: vi.fn(() => Promise.resolve(null)) }));

// The real drawing, behind a spy: a test can make it refuse (a full queue) or fail, and can see that it was not asked.
vi.mock("@/server/equipe/handoff/svg-logo", async importOriginal => {
  const actual = await importOriginal<typeof import("@/server/equipe/handoff/svg-logo")>();
  return { ...actual, rasterizeSvgLogo: vi.fn(actual.rasterizeSvgLogo) };
});

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/server/equipe/handoff/assets", () => ({
  shouldAnalyzeWorkspaceAssets: vi.fn(() => Promise.resolve(true)),
  getHandoffAssetScope: vi.fn(() => Promise.resolve(null)),
  createHandoffWorkspaceAsset: vi.fn(),
}));

vi.mock("@/server/repositories/brand-kit", () => ({
  resolveBrandKitProfileId: vi.fn(),
}));

vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: vi.fn(),
}));

import { getWorkspaceAssets, createWorkspaceAsset } from "@/server/repositories/workspace-asset";
import { objectStorage } from "@/server/storage";
import { inngest } from "@/server/jobs/client";
import { shouldAnalyzeWorkspaceAssets, getHandoffAssetScope, createHandoffWorkspaceAsset } from "@/server/equipe/handoff/assets";
import { resolveBrandKitProfileId } from "@/server/repositories/brand-kit";
import { getClientProfile } from "@/server/repositories/client-reference";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { SvgLogoError, rasterizeSvgLogo, type SvgRejection } from "@/server/equipe/handoff/svg-logo";

const mockGetWorkspaceAssets = vi.mocked(getWorkspaceAssets);
const mockCreateWorkspaceAsset = vi.mocked(createWorkspaceAsset);
const mockShouldAnalyzeWorkspaceAssets = vi.mocked(shouldAnalyzeWorkspaceAssets);
const mockGetHandoffAssetScope = vi.mocked(getHandoffAssetScope);
const mockCreateHandoffWorkspaceAsset = vi.mocked(createHandoffWorkspaceAsset);
const mockResolveBrandKitProfileId = vi.mocked(resolveBrandKitProfileId);
const mockGetClientProfile = vi.mocked(getClientProfile);
const PROFILE_ID = "00000000-0000-4000-8000-000000000001";

describe("GET /api/workspace/assets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns workspace assets with defaults", async () => {
    const assets = [{ id: "wa-1", name: "logo.png", key: "assets/logo.png" }];
    mockGetWorkspaceAssets.mockResolvedValue(assets as Awaited<ReturnType<typeof getWorkspaceAssets>>);

    const res = await GET(new Request("http://localhost/api/workspace/assets"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.assets).toEqual([
      {
        id: "wa-1",
        name: "logo.png",
        key: "assets/logo.png",
        url: "/api/workspace/assets/wa-1/file",
      },
    ]);
    expect(mockGetWorkspaceAssets).toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({ limit: 24, offset: 0 })
    );
  });

  it("passes query params to repository", async () => {
    mockGetWorkspaceAssets.mockResolvedValue([]);

    await GET(new Request("http://localhost/api/workspace/assets?q=logo&tags=brand&type=image/png&source=upload&page=2&limit=12"));

    expect(mockGetWorkspaceAssets).toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({
        query: "logo",
        tags: ["brand"],
        type: "image/png",
        source: "upload",
        limit: 12,
        offset: 12,
      })
    );
  });

  it("lets the library exclude inspiration assets", async () => {
    mockGetWorkspaceAssets.mockResolvedValue([]);

    await GET(new Request("http://localhost/api/workspace/assets?excludeSources=curated_inspiration,curated_inspiration_copy"));

    expect(mockGetWorkspaceAssets).toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({ excludeSources: ["curated_inspiration", "curated_inspiration_copy"] }),
    );
  });

  it("ticket 07: filters by clientProfileId once it resolves against the workspace, accepting any of the workspace's brands", async () => {
    mockGetWorkspaceAssets.mockResolvedValue([]);
    mockGetClientProfile.mockResolvedValue({ id: PROFILE_ID, workspaceId: "workspace-1" } as never);

    await GET(new Request(`http://localhost/api/workspace/assets?clientProfileId=${PROFILE_ID}`));

    expect(mockGetClientProfile).toHaveBeenCalledWith("workspace-1", PROFILE_ID);
    expect(mockGetWorkspaceAssets).toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({ clientProfileId: PROFILE_ID }),
    );
  });

  it("ticket 07: 404s a clientProfileId that does not belong to this workspace, instead of trusting a client-held id", async () => {
    mockGetClientProfile.mockResolvedValue(null);

    const res = await GET(new Request(`http://localhost/api/workspace/assets?clientProfileId=${PROFILE_ID}`));

    expect(res.status).toBe(404);
    expect(mockGetWorkspaceAssets).not.toHaveBeenCalled();
  });

  it("ticket 07: passes the server-side kind filter through to the repository", async () => {
    mockGetWorkspaceAssets.mockResolvedValue([]);

    await GET(new Request("http://localhost/api/workspace/assets?kind=identity"));

    expect(mockGetWorkspaceAssets).toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({ kind: "identity" }),
    );
  });

  it("ticket 07: rejects a kind outside the server enum", async () => {
    const res = await GET(new Request("http://localhost/api/workspace/assets?kind=bogus"));

    expect(res.status).toBe(400);
    expect(mockGetWorkspaceAssets).not.toHaveBeenCalled();
  });

  it.each(["upload", "brand_upload", "brand_site", "brand_instagram", "brand_training", "brand_font", "curated_inspiration", "curated_inspiration_copy", "creative_work"])(
    "review: accepts the known asset source %s as a filter", async source => {
      mockGetWorkspaceAssets.mockResolvedValue([]);

      const res = await GET(new Request(`http://localhost/api/workspace/assets?source=${source}`));

      expect(res.status).toBe(200);
      expect(mockGetWorkspaceAssets).toHaveBeenCalledWith("workspace-1", expect.objectContaining({ source }));
    });

  it.each(["constructor", "toString", "__proto__", "hasOwnProperty", "bogus"])(
    "review: rejects the unknown asset source %s with 400, never reaching the repository", async source => {
      const res = await GET(new Request(`http://localhost/api/workspace/assets?source=${source}`));

      expect(res.status).toBe(400);
      expect(mockGetWorkspaceAssets).not.toHaveBeenCalled();
    });
});

describe("POST /api/workspace/assets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockShouldAnalyzeWorkspaceAssets.mockResolvedValue(true);
    mockResolveBrandKitProfileId.mockResolvedValue(PROFILE_ID);
    mockGetHandoffAssetScope.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects non-file upload", async () => {
    const form = new FormData();
    form.append("file", "not-a-file");

    const res = await POST(
      new Request("http://localhost/api/workspace/assets", {
        method: "POST",
        body: form,
      })
    );

    expect(res.status).toBe(400);
  });

  it("rejects disallowed file type", async () => {
    const { isAllowedImageType } = await import("@/lib/upload-config");
    vi.mocked(isAllowedImageType).mockReturnValueOnce(false);

    const request = new Request("http://localhost/api/workspace/assets", {
      method: "POST",
    });
    vi.spyOn(request, "formData").mockResolvedValue({
      get: (name: string) =>
        name === "file"
          ? new File(["x"], "test.exe", { type: "application/exe" })
          : null,
    } as unknown as FormData);

    const res = await POST(request);

    expect(res.status).toBe(400);
  });

  function uploadRequest(handoffId?: string) {
    const form = new FormData();
    form.append("file", new File([new Uint8Array([137, 80, 78, 71])], "logo.png", { type: "image/png" }));
    if (handoffId) form.append("handoffId", handoffId);
    return new Request("http://localhost/api/workspace/assets", { method: "POST", body: form });
  }

  it("paid workspace: creates the asset and triggers the analysis job (ticket 04: default, unchanged behavior)", async () => {
    mockShouldAnalyzeWorkspaceAssets.mockResolvedValue(true);
    mockCreateWorkspaceAsset.mockResolvedValue({ id: "wa-1", workspaceId: "workspace-1", name: "logo.png", key: "assets/logo.png" } as Awaited<ReturnType<typeof createWorkspaceAsset>>);

    const res = await POST(uploadRequest());
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.asset).toMatchObject({ id: "wa-1", url: "/api/workspace/assets/wa-1/file" });
    expect(mockShouldAnalyzeWorkspaceAssets).toHaveBeenCalledWith("workspace-1", PROFILE_ID);
    expect(vi.mocked(inngest.send)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(inngest.send)).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ assetId: "wa-1", workspaceId: "workspace-1" }),
    }));
    // Ticket 07: a plain upload (no handoffId) resolves the workspace's brand via resolveBrandKitProfileId.
    expect(mockResolveBrandKitProfileId).toHaveBeenCalledWith("workspace-1", undefined);
    expect(mockCreateWorkspaceAsset).toHaveBeenCalledWith(expect.objectContaining({
      clientProfileId: PROFILE_ID, source: "brand_upload",
    }));
  });

  it("free workspace (ticket 04, handoff logo/image upload): creates the asset but never triggers the analysis job", async () => {
    mockShouldAnalyzeWorkspaceAssets.mockResolvedValue(false);
    mockCreateWorkspaceAsset.mockResolvedValue({ id: "wa-2", workspaceId: "workspace-1", name: "logo.png", key: "assets/logo.png" } as Awaited<ReturnType<typeof createWorkspaceAsset>>);

    const res = await POST(uploadRequest());
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.asset).toMatchObject({ id: "wa-2" });
    expect(mockShouldAnalyzeWorkspaceAssets).toHaveBeenCalledWith("workspace-1", PROFILE_ID);
    expect(vi.mocked(inngest.send)).not.toHaveBeenCalled();
    // The upload itself still ran — the ledger guard only skips the AI job.
    expect(mockCreateWorkspaceAsset).toHaveBeenCalledWith(expect.objectContaining({
      name: "logo.png", type: "image/png", clientProfileId: PROFILE_ID, source: "brand_upload",
    }));
    expect(vi.mocked(objectStorage.put)).toHaveBeenCalledTimes(1);
  });

  const HANDOFF_ID = "00000000-0000-4000-8000-000000000002";

  it.each([false, true])("mixed workspace: ordinary upload uses its selected brand's account, paid=%s", async paid => {
    mockShouldAnalyzeWorkspaceAssets.mockImplementation(async (_workspaceId, clientProfileId) => clientProfileId ? paid : true);
    mockCreateWorkspaceAsset.mockResolvedValue({ id: "wa-mixed" } as Awaited<ReturnType<typeof createWorkspaceAsset>>);
    expect((await POST(uploadRequest())).status).toBe(201);
    expect(mockShouldAnalyzeWorkspaceAssets).toHaveBeenCalledWith("workspace-1", PROFILE_ID);
    expect(inngest.send).toHaveBeenCalledTimes(paid ? 1 : 0);
  });

  it("ticket 07: a handoff-scoped upload (handoffId) is unbranded and marked provisional, never analyzed even on a paid workspace", async () => {
    mockShouldAnalyzeWorkspaceAssets.mockResolvedValue(true);
    mockGetHandoffAssetScope.mockResolvedValue({ id: HANDOFF_ID, readingId: "reading-1", step: "images" } as never);
    mockCreateHandoffWorkspaceAsset.mockResolvedValue({ id: "wa-4", workspaceId: "workspace-1", name: "logo.png", key: "assets/logo.png" } as Awaited<ReturnType<typeof createHandoffWorkspaceAsset>>);

    const form = new FormData();
    form.append("file", new File([new Uint8Array([137, 80, 78, 71])], "logo.png", { type: "image/png" }));
    form.append("handoffId", HANDOFF_ID);
    const res = await POST(new Request("http://localhost/api/workspace/assets", { method: "POST", body: form }));

    expect(res.status).toBe(201);
    expect(mockGetHandoffAssetScope).toHaveBeenCalledWith("workspace-1", HANDOFF_ID);
    expect(mockResolveBrandKitProfileId).not.toHaveBeenCalled();
    expect(mockShouldAnalyzeWorkspaceAssets).not.toHaveBeenCalled();
    // The handoff path locks the SAME account row "É isso" locks, via the
    // dedicated helper — never the plain createWorkspaceAsset.
    expect(mockCreateWorkspaceAsset).not.toHaveBeenCalled();
    expect(mockCreateHandoffWorkspaceAsset).toHaveBeenCalledWith(expect.objectContaining({
      clientProfileId: null, source: "brand_upload",
      metadata: { handoffId: HANDOFF_ID, readingId: "reading-1", provisional: true },
    }), HANDOFF_ID);
    // Provisional handoff uploads are never analyzed, paid workspace or not —
    // the handoff confirmation step (not this route) decides what survives.
    expect(vi.mocked(inngest.send)).not.toHaveBeenCalled();
  });

  it("ticket 07: rejects a handoffId that does not resolve to an open handoff in this workspace", async () => {
    mockGetHandoffAssetScope.mockResolvedValue(null);

    const form = new FormData();
    form.append("file", new File([new Uint8Array([137, 80, 78, 71])], "logo.png", { type: "image/png" }));
    form.append("handoffId", "00000000-0000-4000-8000-000000000099");
    const res = await POST(new Request("http://localhost/api/workspace/assets", { method: "POST", body: form }));

    expect(res.status).toBe(400);
    expect(mockCreateWorkspaceAsset).not.toHaveBeenCalled();
    expect(vi.mocked(objectStorage.put)).not.toHaveBeenCalled();
  });

  it("ticket 07: rejects handoffId combined with an explicit clientProfileId (mutually exclusive)", async () => {
    mockGetHandoffAssetScope.mockResolvedValue({ id: HANDOFF_ID, readingId: "reading-1", step: "images" } as never);

    const form = new FormData();
    form.append("file", new File([new Uint8Array([137, 80, 78, 71])], "logo.png", { type: "image/png" }));
    form.append("handoffId", HANDOFF_ID);
    form.append("clientProfileId", PROFILE_ID);
    const res = await POST(new Request("http://localhost/api/workspace/assets", { method: "POST", body: form }));

    expect(res.status).toBe(400);
    expect(mockCreateWorkspaceAsset).not.toHaveBeenCalled();
  });

  it("still fails closed when shouldAnalyzeWorkspaceAssets itself rejects, and — since it's checked BEFORE creating the asset — nothing is left orphaned", async () => {
    mockShouldAnalyzeWorkspaceAssets.mockRejectedValue(new Error("db down"));
    mockCreateWorkspaceAsset.mockResolvedValue({ id: "wa-3", workspaceId: "workspace-1", name: "logo.png", key: "assets/logo.png" } as Awaited<ReturnType<typeof createWorkspaceAsset>>);

    const res = await POST(uploadRequest());

    expect(res.status).toBe(500);
    expect(vi.mocked(inngest.send)).not.toHaveBeenCalled();
    // No asset row, no object storage write: the free-workspace check runs
    // before either, so a failure here never leaves an orphaned upload.
    expect(mockCreateWorkspaceAsset).not.toHaveBeenCalled();
    expect(vi.mocked(objectStorage.put)).not.toHaveBeenCalled();
  });
});

// Independent review (PR 610, R3): a slow upload's transaction can still be
// mid-flight when "É isso" confirms the summary and cleans up every
// provisional row it saw. Reproduced against the REAL route contract:
// createHandoffWorkspaceAsset takes the same account lock "É isso" takes, so
// by the time it resumes and re-reads the handoff, it must see "done" and
// return null — no row inserted, and the route must compensate the R2 put.
it("review: a late handoff upload whose transaction loses the account-lock race to É isso is rejected and its R2 object is compensated", async () => {
  vi.clearAllMocks();
  const handoffId = crypto.randomUUID();
  let closed = false;
  let resumeHelper!: () => void;
  let entered!: () => void;
  const helperStarted = new Promise<void>(resolve => { entered = resolve; });
  mockGetHandoffAssetScope.mockResolvedValue({ id: handoffId, readingId: "reading-1", step: "images" } as never);
  mockCreateHandoffWorkspaceAsset.mockImplementation(async () => {
    entered();
    await new Promise<void>(resolve => { resumeHelper = resolve; });
    // By the time this transaction acquires the account lock, "É isso" has
    // already committed and closed the handoff — the helper re-reads that
    // inside its own lock and returns null, inserting nothing.
    return closed ? null : { id: "late-upload" } as never;
  });

  const form = new FormData();
  form.append("handoffId", handoffId);
  form.append("file", new File([new Uint8Array([137, 80, 78, 71])], "late.png", { type: "image/png" }));
  const pending = POST(new Request("http://localhost/api/workspace/assets", { method: "POST", body: form }));
  await helperStarted;
  // Another tab commits "É isso" and its cleanup while this upload is
  // blocked on the account lock inside createHandoffWorkspaceAsset.
  closed = true;
  resumeHelper();
  const res = await pending;

  expect(res.status).toBe(400);
  expect(mockCreateWorkspaceAsset).not.toHaveBeenCalled();
  // The R2 object this route already put() must be cleaned up — never an orphan.
  expect(vi.mocked(objectStorage.delete)).toHaveBeenCalledTimes(1);
  expect(vi.mocked(objectStorage.delete)).toHaveBeenCalledWith(vi.mocked(objectStorage.put).mock.calls[0]![0]);
});

it("review (R3): when the R2 compensation delete itself fails, the route still fails closed instead of pretending the upload succeeded", async () => {
  vi.clearAllMocks();
  const handoffId = "00000000-0000-4000-8000-000000000003";
  mockGetHandoffAssetScope.mockResolvedValue({ id: handoffId, readingId: "reading-1", step: "summary" } as never);
  mockCreateHandoffWorkspaceAsset.mockResolvedValue(null);
  vi.mocked(objectStorage.delete).mockRejectedValueOnce(new Error("R2 unavailable"));

  const form = new FormData();
  form.append("handoffId", handoffId);
  form.append("file", new File([new Uint8Array([137, 80, 78, 71])], "late.png", { type: "image/png" }));
  const res = await POST(new Request("http://localhost/api/workspace/assets", { method: "POST", body: form }));

  // The compensating delete was attempted (and rejected) — the route must
  // never report 201/2xx for an upload whose asset row was never created.
  expect(vi.mocked(objectStorage.delete)).toHaveBeenCalledTimes(1);
  expect(res.status).toBeGreaterThanOrEqual(400);
  expect(mockCreateWorkspaceAsset).not.toHaveBeenCalled();
});

// Ticket 15, item 2: the brand logo of a handoff may be an SVG. It is hostile input: it is sanitized and drawn as a PNG, and only that PNG is stored.
describe("POST /api/workspace/assets: an SVG logo", () => {
  const HANDOFF_ID = "00000000-0000-4000-8000-000000000002";
  const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80" viewBox="0 0 240 80"><circle cx="40" cy="40" r="30" fill="#c9573a"/><rect x="86" y="25" width="132" height="11" fill="#2b1a10"/></svg>`;
  const SCRIPT_ONLY = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>`;
  const MAX_SVG_BYTES = 1024 * 1024;
  const put = vi.mocked(objectStorage.put);

  beforeEach(() => {
    vi.clearAllMocks();
    mockShouldAnalyzeWorkspaceAssets.mockResolvedValue(true);
    mockResolveBrandKitProfileId.mockResolvedValue(PROFILE_ID);
    mockGetHandoffAssetScope.mockResolvedValue({ id: HANDOFF_ID, readingId: "reading-1", step: "identity" } as never);
    mockCreateHandoffWorkspaceAsset.mockImplementation((async (input: Record<string, unknown>) => ({ id: "wa-svg", workspaceId: "workspace-1", ...input })) as never);
    mockCreateWorkspaceAsset.mockImplementation((async (input: Record<string, unknown>) => ({ id: "wa-plain", ...input })) as never);
  });
  afterEach(() => vi.restoreAllMocks());

  function send(file: File, fields: Record<string, string> = { handoffId: HANDOFF_ID, purpose: "logo" }) {
    const form = new FormData();
    form.append("file", file);
    for (const [name, value] of Object.entries(fields)) form.append(name, value);
    return POST(new Request("http://localhost/api/workspace/assets", { method: "POST", body: form }));
  }
  const svgFile = (content: string | Uint8Array = LOGO, name = "logo.svg", type = "image/svg+xml") => new File([content as BlobPart], name, { type });

  /** Whatever the file was, what reached storage is never an SVG. */
  function expectNoSvgStored() {
    for (const [key, bytes, contentType] of put.mock.calls as Array<[string, Buffer, string]>) {
      expect(key).not.toMatch(/\.svg$/i);
      expect(contentType).not.toBe("image/svg+xml");
      expect(Buffer.from(bytes).subarray(0, 200).toString("latin1")).not.toMatch(/<svg|<\?xml/i);
    }
    for (const [input] of mockCreateHandoffWorkspaceAsset.mock.calls as Array<[{ type: string; name: string }]>) {
      expect(input.type).not.toBe("image/svg+xml");
      expect(input.name).not.toMatch(/\.svg$/i);
    }
  }
  const refused = async (res: Response, status: number, code: string) => {
    expect(res.status).toBe(status);
    expect((await res.json()).code).toBe(code);
    expect(put).not.toHaveBeenCalled();
    expect(mockCreateHandoffWorkspaceAsset).not.toHaveBeenCalled();
    expect(mockCreateWorkspaceAsset).not.toHaveBeenCalled();
    expect(vi.mocked(inngest.send)).not.toHaveBeenCalled();
  };

  it("a legitimate SVG with a handoff and purpose=logo is stored as a PNG: put gets PNG bytes as image/png, and the asset says so", async () => {
    const res = await send(svgFile());
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(put).toHaveBeenCalledTimes(1);
    const [key, bytes, contentType] = put.mock.calls[0] as [string, Buffer, string];
    expect(contentType).toBe("image/png");
    expect(Buffer.from(bytes).subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(key).toMatch(/^workspaces\/workspace-1\/assets\/[0-9a-f-]{36}-logo\.png$/);
    const meta = await sharp(bytes).metadata();
    expect({ width: meta.width, height: meta.height, format: meta.format }).toEqual({ width: 1024, height: 341, format: "png" });

    expect(mockCreateHandoffWorkspaceAsset).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1", clientProfileId: null, name: "logo.png", key, type: "image/png", size: bytes.length, width: 1024, height: 341, source: "brand_upload",
      metadata: { handoffId: HANDOFF_ID, readingId: "reading-1", provisional: true },
    }), HANDOFF_ID);
    expect(body.asset).toMatchObject({ id: "wa-svg", type: "image/png", name: "logo.png", width: 1024, height: 341, url: "/api/workspace/assets/wa-svg/file" });
    // Same as any handoff upload: no brand, never analyzed.
    expect(mockCreateWorkspaceAsset).not.toHaveBeenCalled();
    expect(vi.mocked(inngest.send)).not.toHaveBeenCalled();
    expectNoSvgStored();
  });

  it("the stored name is the file's name with .png in place of .svg, in any case, and logo.png when nothing is left", async () => {
    const names: Array<[string, string]> = [["Logo.SVG", "Logo.png"], ["my.brand.mark.svg", "my.brand.mark.png"], [".svg", "logo.png"], ["marca", "marca.png"], ["marca.svgz", "marca.svgz.png"]];
    for (const [name, expected] of names) {
      mockCreateHandoffWorkspaceAsset.mockClear();
      expect((await send(svgFile(LOGO, name))).status, name).toBe(201);
      expect(mockCreateHandoffWorkspaceAsset.mock.calls[0]![0], name).toMatchObject({ name: expected, type: "image/png" });
    }
    expectNoSvgStored();
  });

  it("the size is the PNG's, not what the form says", async () => {
    const res = await send(svgFile(), { handoffId: HANDOFF_ID, purpose: "logo", width: "7", height: "9" });
    expect(res.status).toBe(201);
    expect(mockCreateHandoffWorkspaceAsset.mock.calls[0]![0]).toMatchObject({ width: 1024, height: 341 });
  });

  it("an SVG with scripts and external references is cleaned, drawn and stored as a PNG: the PNG has the shape, nothing else", async () => {
    const hostile = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="100" onload="alert(1)"><script>fetch("http://127.0.0.1:1/x")</script><image href="http://127.0.0.1:1/x.png" width="100" height="100"/><rect width="60" height="100" fill="#1f4fd8"/></svg>`;
    const res = await send(svgFile(hostile));
    expect(res.status).toBe(201);
    const bytes = (put.mock.calls[0] as [string, Buffer, string])[1];
    const { data } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([...data.subarray(0, 4)]).toEqual([0x1f, 0x4f, 0xd8, 255]);
    expectNoSvgStored();
  });

  it("an SVG without purpose=logo is refused (invalidFileType), before anything is read, drawn or stored", async () => {
    await refused(await send(svgFile(), { handoffId: HANDOFF_ID }), 400, "invalidFileType");
    expect(mockGetHandoffAssetScope).not.toHaveBeenCalled();
  });

  it("an SVG with purpose=logo but no handoffId is refused (invalidFileType)", async () => {
    await refused(await send(svgFile(), { purpose: "logo" }), 400, "invalidFileType");
  });

  it("an SVG with neither is refused, and so is one sent with an empty purpose or handoffId", async () => {
    await refused(await send(svgFile(), {}), 400, "invalidFileType");
    await refused(await send(svgFile(), { handoffId: "", purpose: "" }), 400, "invalidFileType");
  });

  it("a purpose other than logo is no purpose: an SVG with it is refused as without one, and a PNG with it is uploaded as it always was", async () => {
    await refused(await send(svgFile(), { handoffId: HANDOFF_ID, purpose: "image" }), 400, "invalidFileType");
    const { isAllowedImageType } = await import("@/lib/upload-config");
    vi.mocked(isAllowedImageType).mockReturnValueOnce(true);
    const png = new File([new Uint8Array([137, 80, 78, 71])], "a.png", { type: "image/png" });
    const res = await send(png, { handoffId: HANDOFF_ID, purpose: "avatar" });
    expect(res.status).toBe(201);
    expect(put).toHaveBeenCalledWith(expect.stringMatching(/-a\.png$/), Buffer.from([137, 80, 78, 71]), "image/png");
  });

  it("an SVG together with a clientProfileId is invalid input: a handoff upload has no brand yet", async () => {
    await refused(await send(svgFile(), { handoffId: HANDOFF_ID, purpose: "logo", clientProfileId: PROFILE_ID }), 400, "invalidInput");
    expect(mockResolveBrandKitProfileId).not.toHaveBeenCalled();
  });

  it("an SVG for a handoff that is not open in this workspace is invalid input", async () => {
    mockGetHandoffAssetScope.mockResolvedValue(null);
    await refused(await send(svgFile()), 400, "invalidInput");
  });

  it("an SVG that cannot be read is svgUnreadable (400), and nothing is stored or created", async () => {
    const unreadable: Array<[string, string | Uint8Array]> = [
      ["nothing to draw", SCRIPT_ONLY],
      ["malformed", `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><g>`],
      ["not an svg", "<html><body>hello</body></html>"],
      ["an external entity", `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg" width="300" height="60"><text x="0" y="30">&xxe;</text></svg>`],
      ["no size", `<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>`],
      ["too deep", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${"<g>".repeat(200)}</svg>`],
      ["not UTF-8", new Uint8Array([0x3c, 0x73, 0x76, 0x67, 0xff, 0xfe, 0x3e])],
    ];
    for (const [name, content] of unreadable) {
      vi.clearAllMocks();
      mockGetHandoffAssetScope.mockResolvedValue({ id: HANDOFF_ID, readingId: "reading-1", step: "identity" } as never);
      await refused(await send(svgFile(content)), 400, "svgUnreadable").catch(error => { throw new Error(`${name}: ${error.message}`); });
    }
  });

  it("an SVG over 1 MiB is fileTooLarge (400), and one of exactly 1 MiB is not too large", async () => {
    await refused(await send(svgFile(Buffer.alloc(MAX_SVG_BYTES + 1, 0x20))), 400, "fileTooLarge");
    await refused(await send(svgFile(Buffer.alloc(3 * 1024 * 1024, 0x20))), 400, "fileTooLarge");
    // At the limit it is read (and found unreadable: blanks), not refused for its size.
    await refused(await send(svgFile(Buffer.alloc(MAX_SVG_BYTES, 0x20))), 400, "svgUnreadable");
  });

  it("an empty SVG file is fileTooLarge, as an empty file always was", async () => {
    await refused(await send(svgFile("")), 400, "fileTooLarge");
  });

  it("a type with parameters is not an SVG for this route: it is not an allowed image type at all", async () => {
    await refused(await send(svgFile(LOGO, "logo.svg", "image/svg+xml; charset=utf-8")), 400, "invalidFileType");
    await refused(await send(svgFile(LOGO, "logo.svg", "text/xml")), 400, "invalidFileType");
    await refused(await send(svgFile(LOGO, "logo.svg", "")), 400, "invalidFileType");
  });

  it("a PNG, JPEG or WebP is stored as it came (bytes and type), unchanged: purpose=logo does not turn them into anything", async () => {
    const { isAllowedImageType } = await import("@/lib/upload-config");
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      vi.mocked(put).mockClear();
      mockCreateHandoffWorkspaceAsset.mockClear();
      vi.mocked(isAllowedImageType).mockReturnValueOnce(true);
      const bytes = new Uint8Array([1, 2, 3, 4, 5, 6]);
      const res = await send(new File([bytes], "photo.bin", { type }), { handoffId: HANDOFF_ID, purpose: "logo", width: "640", height: "480" });
      expect(res.status, type).toBe(201);
      expect(put).toHaveBeenCalledWith(expect.stringMatching(/-photo\.bin$/), Buffer.from(bytes), type);
      expect(mockCreateHandoffWorkspaceAsset.mock.calls[0]![0], type).toMatchObject({ name: "photo.bin", type, size: 6, width: 640, height: 480 });
    }
  });

  it("a plain PNG upload without a handoff is as before (resolved brand, analyzed), and its limit is still 10 MB, not 1 MiB", async () => {
    const big = new Uint8Array(2 * 1024 * 1024);
    const res = await send(new File([big], "big.png", { type: "image/png" }), {});
    expect(res.status).toBe(201);
    expect(mockCreateWorkspaceAsset).toHaveBeenCalledWith(expect.objectContaining({ clientProfileId: PROFILE_ID, type: "image/png", size: big.length }));
    expect(vi.mocked(inngest.send)).toHaveBeenCalledTimes(1);
    const over = await send(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "huge.png", { type: "image/png" }), {});
    expect(over.status).toBe(400);
    expect((await over.json()).code).toBe("fileTooLarge");
  });

  it("an image whose bytes do not match its type, and a type that is not an image, are still refused", async () => {
    const { validateImageMagicBytes, isAllowedImageType } = await import("@/lib/upload-config");
    vi.mocked(validateImageMagicBytes).mockResolvedValueOnce(false);
    await refused(await send(new File([new Uint8Array([1, 2, 3])], "fake.png", { type: "image/png" })), 400, "invalidFileType");
    vi.mocked(isAllowedImageType).mockReturnValueOnce(false);
    await refused(await send(new File(["x"], "evil.exe", { type: "application/exe" })), 400, "invalidFileType");
    await refused(await send(new File([LOGO], "logo.html", { type: "text/html" })), 400, "invalidFileType");
  });

  it("an SVG's bytes are never put under a type of an image the route takes as it is: SVG content sent as a PNG is refused by its magic bytes", async () => {
    const { validateImageMagicBytes } = await import("@/lib/upload-config");
    vi.mocked(validateImageMagicBytes).mockResolvedValueOnce(false); // The real one reads the first bytes and finds no PNG.
    await refused(await send(svgFile(LOGO, "logo.png", "image/png")), 400, "invalidFileType");
  });

  it("when the asset row cannot be created (the handoff was closed meanwhile) the stored PNG is deleted, and the answer is invalid input", async () => {
    mockCreateHandoffWorkspaceAsset.mockResolvedValue(null);
    const res = await send(svgFile());
    expect(res.status).toBe(400);
    expect(vi.mocked(objectStorage.delete)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(objectStorage.delete)).toHaveBeenCalledWith(put.mock.calls[0]![0]);
    expect(vi.mocked(inngest.send)).not.toHaveBeenCalled();
    expectNoSvgStored();
  });
});

// An SVG is drawn on this server, one at a time: its upload is rate limited, and a full drawing queue is a 429, not a failed file.
describe("POST /api/workspace/assets: the SVG logo is rate limited and the drawing queue is bounded", () => {
  const HANDOFF_ID = "00000000-0000-4000-8000-000000000002";
  const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80" viewBox="0 0 240 80"><circle cx="40" cy="40" r="30" fill="#c9573a"/></svg>`;
  const put = vi.mocked(objectStorage.put);
  const limiter = vi.mocked(checkRateLimit);
  const draw = vi.mocked(rasterizeSvgLogo);

  beforeEach(() => {
    vi.clearAllMocks();
    limiter.mockResolvedValue(null);
    mockShouldAnalyzeWorkspaceAssets.mockResolvedValue(true);
    mockResolveBrandKitProfileId.mockResolvedValue(PROFILE_ID);
    mockGetHandoffAssetScope.mockResolvedValue({ id: HANDOFF_ID, readingId: "reading-1", step: "identity" } as never);
    mockCreateHandoffWorkspaceAsset.mockImplementation((async (input: Record<string, unknown>) => ({ id: "wa-svg", ...input })) as never);
    mockCreateWorkspaceAsset.mockImplementation((async (input: Record<string, unknown>) => ({ id: "wa-plain", ...input })) as never);
  });

  function send(file: File, fields: Record<string, string> = { handoffId: HANDOFF_ID, purpose: "logo" }) {
    const form = new FormData();
    form.append("file", file);
    for (const [name, value] of Object.entries(fields)) form.append(name, value);
    return POST(new Request("http://localhost/api/workspace/assets", { method: "POST", body: form }));
  }
  const svgFile = (content = LOGO) => new File([content], "logo.svg", { type: "image/svg+xml" });
  const nothingDrawnOrStored = () => {
    expect(draw).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(mockCreateHandoffWorkspaceAsset).not.toHaveBeenCalled();
    expect(mockCreateWorkspaceAsset).not.toHaveBeenCalled();
    expect(vi.mocked(inngest.send)).not.toHaveBeenCalled();
  };

  it("an SVG upload is checked against the limiter, per workspace, in the general category, before anything is drawn", async () => {
    const res = await send(svgFile());
    expect(res.status).toBe(201);
    expect(limiter).toHaveBeenCalledTimes(1);
    expect(limiter).toHaveBeenCalledWith(expect.any(Request), { category: "general", identifier: "svg-logo:workspace-1" });
    expect(limiter.mock.invocationCallOrder[0]).toBeLessThan(draw.mock.invocationCallOrder[0]!);
  });

  it("when the limiter answers, the route answers the same (429) and nothing is drawn, stored or created", async () => {
    limiter.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Muitas requisições", code: "rateLimitExceeded" }), { status: 429, headers: { "retry-after": "30" } }) as never);
    const res = await send(svgFile());
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
    expect((await res.json()).code).toBe("rateLimitExceeded");
    nothingDrawnOrStored();
  });

  it("an SVG that is refused before the drawing (no purpose, no handoff, too large, a brand with it) never touches the limiter", async () => {
    expect((await send(svgFile(), { handoffId: HANDOFF_ID })).status).toBe(400);
    expect((await send(svgFile(), { purpose: "logo" })).status).toBe(400);
    expect((await send(svgFile(" ".repeat(1024 * 1024 + 1)))).status).toBe(400);
    expect((await send(svgFile(), { handoffId: HANDOFF_ID, purpose: "logo", clientProfileId: PROFILE_ID })).status).toBe(400);
    expect(limiter).not.toHaveBeenCalled();
    nothingDrawnOrStored();
  });

  it("PNG, JPEG and WebP uploads never call the limiter (the classic path is as it was), with or without a handoff or purpose", async () => {
    const { isAllowedImageType } = await import("@/lib/upload-config");
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      for (const fields of [{}, { handoffId: HANDOFF_ID }, { handoffId: HANDOFF_ID, purpose: "logo" }] as Array<Record<string, string>>) {
        vi.mocked(isAllowedImageType).mockReturnValueOnce(true);
        const res = await send(new File([new Uint8Array([1, 2, 3, 4])], "a.bin", { type }), fields);
        expect(res.status, `${type} ${JSON.stringify(fields)}`).toBe(201);
      }
    }
    expect(limiter).not.toHaveBeenCalled();
    expect(draw).not.toHaveBeenCalled();
  });

  it("a full drawing queue (svg_busy) is a 429 rateLimitExceeded, and nothing is stored or created", async () => {
    draw.mockRejectedValueOnce(new SvgLogoError("svg_busy"));
    const res = await send(svgFile());
    const body = await res.json();
    expect(res.status).toBe(429);
    expect(body.code).toBe("rateLimitExceeded");
    expect(draw).toHaveBeenCalledTimes(1);
    expect(put).not.toHaveBeenCalled();
    expect(mockCreateHandoffWorkspaceAsset).not.toHaveBeenCalled();
    expect(vi.mocked(objectStorage.delete)).not.toHaveBeenCalled();
  });

  it.each<SvgRejection>(["svg_timeout", "svg_malformed", "svg_unsupported", "svg_too_complex", "svg_empty", "svg_render_failed", "svg_too_large"])(
    "%s is still a file that cannot be read: 400 svgUnreadable, not a rate limit", async code => {
      draw.mockRejectedValueOnce(new SvgLogoError(code));
      const res = await send(svgFile());
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("svgUnreadable");
      expect(put).not.toHaveBeenCalled();
      expect(mockCreateHandoffWorkspaceAsset).not.toHaveBeenCalled();
    });

  it("an error that is not an SvgLogoError is not hidden as a bad file: it is a server error, and nothing is stored", async () => {
    draw.mockRejectedValueOnce(new Error("boom"));
    const res = await send(svgFile());
    expect(res.status).toBe(500);
    expect(put).not.toHaveBeenCalled();
  });

  it("after a refusal the next upload goes through (the limiter and the queue hold no state in the route)", async () => {
    draw.mockRejectedValueOnce(new SvgLogoError("svg_busy"));
    expect((await send(svgFile())).status).toBe(429);
    expect((await send(svgFile())).status).toBe(201);
    expect(put).toHaveBeenCalledTimes(1);
  });
});
