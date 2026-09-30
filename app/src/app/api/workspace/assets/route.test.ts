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
  isHandoffInWorkspace: vi.fn(() => Promise.resolve(true)),
}));

import { getWorkspaceAssets, createWorkspaceAsset } from "@/server/repositories/workspace-asset";
import { objectStorage } from "@/server/storage";
import { inngest } from "@/server/jobs/client";
import { shouldAnalyzeWorkspaceAssets, isHandoffInWorkspace } from "@/server/equipe/handoff/assets";

const mockGetWorkspaceAssets = vi.mocked(getWorkspaceAssets);
const mockCreateWorkspaceAsset = vi.mocked(createWorkspaceAsset);
const mockShouldAnalyzeWorkspaceAssets = vi.mocked(shouldAnalyzeWorkspaceAssets);

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
});

describe("POST /api/workspace/assets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockShouldAnalyzeWorkspaceAssets.mockResolvedValue(true);
    vi.mocked(isHandoffInWorkspace).mockResolvedValue(true);
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
    expect(mockShouldAnalyzeWorkspaceAssets).toHaveBeenCalledWith("workspace-1");
    expect(vi.mocked(inngest.send)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(inngest.send)).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ assetId: "wa-1", workspaceId: "workspace-1" }),
    }));
  });

  it("free workspace (ticket 04, handoff logo/image upload): creates the asset but never triggers the analysis job", async () => {
    mockShouldAnalyzeWorkspaceAssets.mockResolvedValue(false);
    mockCreateWorkspaceAsset.mockResolvedValue({ id: "wa-2", workspaceId: "workspace-1", name: "logo.png", key: "assets/logo.png" } as Awaited<ReturnType<typeof createWorkspaceAsset>>);

    const res = await POST(uploadRequest());
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.asset).toMatchObject({ id: "wa-2" });
    expect(mockShouldAnalyzeWorkspaceAssets).toHaveBeenCalledWith("workspace-1");
    expect(vi.mocked(inngest.send)).not.toHaveBeenCalled();
    // The upload itself still ran — the ledger guard only skips the AI job.
    expect(mockCreateWorkspaceAsset).toHaveBeenCalledWith(expect.objectContaining({ name: "logo.png", type: "image/png" }));
    expect(vi.mocked(objectStorage.put)).toHaveBeenCalledTimes(1);
  });

  it("mixed workspace: a handoff upload is saved with its scoped ID and never analyzed", async () => {
    mockCreateWorkspaceAsset.mockResolvedValue({ id: "wa-handoff" } as Awaited<ReturnType<typeof createWorkspaceAsset>>);
    const handoffId = crypto.randomUUID();
    const res = await POST(uploadRequest(handoffId));
    expect(res.status).toBe(201);
    expect(isHandoffInWorkspace).toHaveBeenCalledWith("workspace-1", handoffId);
    expect(mockShouldAnalyzeWorkspaceAssets).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();
    expect(mockCreateWorkspaceAsset).toHaveBeenCalledWith(expect.objectContaining({ metadata: { handoffId } }));
  });

  it("workspace without Equipe accounts: an ordinary upload preserves automatic analysis", async () => {
    mockShouldAnalyzeWorkspaceAssets.mockResolvedValue(true);
    mockCreateWorkspaceAsset.mockResolvedValue({ id: "wa-no-equipe" } as Awaited<ReturnType<typeof createWorkspaceAsset>>);
    expect((await POST(uploadRequest())).status).toBe(201);
    expect(inngest.send).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ assetId: "wa-no-equipe", workspaceId: "workspace-1" }) }));
  });

  it("mixed workspace: an ordinary upload keeps the paid analysis event", async () => {
    mockShouldAnalyzeWorkspaceAssets.mockResolvedValue(true);
    mockCreateWorkspaceAsset.mockResolvedValue({ id: "wa-paid" } as Awaited<ReturnType<typeof createWorkspaceAsset>>);
    expect((await POST(uploadRequest())).status).toBe(201);
    expect(inngest.send).toHaveBeenCalledTimes(1);
  });

  it("rejects an unknown or foreign-workspace handoff before asset/storage writes", async () => {
    vi.mocked(isHandoffInWorkspace).mockResolvedValue(false);
    expect((await POST(uploadRequest(crypto.randomUUID()))).status).toBe(400);
    expect(mockCreateWorkspaceAsset).not.toHaveBeenCalled();
    expect(objectStorage.put).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();
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
