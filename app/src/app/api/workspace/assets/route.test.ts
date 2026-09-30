import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
    publicUrl: vi.fn((key: string) => `https://cdn.example.com/${key}`),
    signedDownloadUrl: vi.fn((key: string) =>
      Promise.resolve(`https://signed.example.com/${key}`)
    ),
  },
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: { send: vi.fn() },
}));

vi.mock("@/lib/upload-config", () => ({
  isAllowedImageType: vi.fn((type: string) => type === "image/png"),
  validateImageMagicBytes: vi.fn(() => Promise.resolve(true)),
  sanitizeStorageFilename: vi.fn((name: string) => name),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/server/equipe/handoff/assets", () => ({
  shouldAnalyzeWorkspaceAssets: vi.fn(() => Promise.resolve(true)),
  getHandoffAssetScope: vi.fn(() => Promise.resolve(null)),
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
import { shouldAnalyzeWorkspaceAssets, getHandoffAssetScope } from "@/server/equipe/handoff/assets";
import { resolveBrandKitProfileId } from "@/server/repositories/brand-kit";
import { getClientProfile } from "@/server/repositories/client-reference";

const mockGetWorkspaceAssets = vi.mocked(getWorkspaceAssets);
const mockCreateWorkspaceAsset = vi.mocked(createWorkspaceAsset);
const mockShouldAnalyzeWorkspaceAssets = vi.mocked(shouldAnalyzeWorkspaceAssets);
const mockGetHandoffAssetScope = vi.mocked(getHandoffAssetScope);
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
    mockCreateWorkspaceAsset.mockResolvedValue({ id: "wa-4", workspaceId: "workspace-1", name: "logo.png", key: "assets/logo.png" } as Awaited<ReturnType<typeof createWorkspaceAsset>>);

    const form = new FormData();
    form.append("file", new File([new Uint8Array([137, 80, 78, 71])], "logo.png", { type: "image/png" }));
    form.append("handoffId", HANDOFF_ID);
    const res = await POST(new Request("http://localhost/api/workspace/assets", { method: "POST", body: form }));

    expect(res.status).toBe(201);
    expect(mockGetHandoffAssetScope).toHaveBeenCalledWith("workspace-1", HANDOFF_ID);
    expect(mockResolveBrandKitProfileId).not.toHaveBeenCalled();
    expect(mockShouldAnalyzeWorkspaceAssets).not.toHaveBeenCalled();
    expect(mockCreateWorkspaceAsset).toHaveBeenCalledWith(expect.objectContaining({
      clientProfileId: null, source: "brand_upload",
      metadata: { handoffId: HANDOFF_ID, readingId: "reading-1", provisional: true },
    }));
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
