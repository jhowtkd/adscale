import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireWorkspaceAccess: vi.fn(),
  getClientProfile: vi.fn(),
  addBrandFontAsset: vi.fn(),
  createWorkspaceAsset: vi.fn(),
  deleteWorkspaceAsset: vi.fn(),
  normalizeBrandFontUpload: vi.fn(),
  put: vi.fn(),
  deleteObject: vi.fn(),
}));

vi.mock("@/lib/api-response", () => ({
  apiError: (code: string, status: number) => Response.json({ error: code }, { status }),
  handleApiError: () => Response.json({ error: "internal" }, { status: 500 }),
}));
vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: (...args: unknown[]) => mocks.requireWorkspaceAccess(...args),
}));
vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: (...args: unknown[]) => mocks.getClientProfile(...args),
  addBrandFontAsset: (...args: unknown[]) => mocks.addBrandFontAsset(...args),
}));
vi.mock("@/server/repositories/workspace-asset", () => ({
  createWorkspaceAsset: (...args: unknown[]) => mocks.createWorkspaceAsset(...args),
  deleteWorkspaceAsset: (...args: unknown[]) => mocks.deleteWorkspaceAsset(...args),
}));
vi.mock("@/server/brand-training/font-assets", () => ({
  normalizeBrandFontUpload: (...args: unknown[]) => mocks.normalizeBrandFontUpload(...args),
}));
vi.mock("@/server/storage", () => ({
  objectStorage: {
    put: (...args: unknown[]) => mocks.put(...args),
    delete: (...args: unknown[]) => mocks.deleteObject(...args),
  },
}));

import { POST } from "./route";

describe("brand font upload route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireWorkspaceAccess.mockResolvedValue({
      workspace: { id: "workspace-1" },
      user: { id: "user-1" },
    });
    mocks.getClientProfile.mockResolvedValue({ id: "profile-1", brandFontAssets: null });
    mocks.normalizeBrandFontUpload.mockResolvedValue({
      buffer: Buffer.from("font"),
      mimeType: "font/ttf",
      extension: "ttf",
      sha256: "a".repeat(64),
    });
    mocks.createWorkspaceAsset.mockResolvedValue({ id: "asset-1" });
    mocks.addBrandFontAsset.mockImplementation(async (_workspaceId, _profileId, font) => font);
  });

  it("stores an approved font under the authenticated workspace and profile", async () => {
    const form = new FormData();
    form.set("file", new File(["font"], "Brand.ttf", { type: "font/ttf" }));
    form.set("family", "Brand Sans");
    form.set("weight", "700");
    form.set("style", "normal");
    form.set("rightsConfirmed", "true");

    const response = await POST(new Request("http://localhost/api", { method: "POST", body: form }), {
      params: Promise.resolve({ id: "profile-1" }),
    });

    expect(response.status).toBe(201);
    expect(mocks.put).toHaveBeenCalledWith(
      expect.stringMatching(/^workspaces\/workspace-1\/brand-fonts\/.+\.ttf$/),
      Buffer.from("font"),
      "font/ttf",
    );
    expect(mocks.addBrandFontAsset).toHaveBeenCalledWith("workspace-1", "profile-1", expect.objectContaining({
      family: "Brand Sans",
      weight: 700,
      style: "normal",
      approvedByUserId: "user-1",
      sha256: "a".repeat(64),
    }));
  });

  it("rejects upload without an explicit rights confirmation", async () => {
    const form = new FormData();
    form.set("file", new File(["font"], "Brand.ttf", { type: "font/ttf" }));
    form.set("family", "Brand Sans");
    form.set("weight", "700");
    form.set("style", "normal");

    const response = await POST(new Request("http://localhost/api", { method: "POST", body: form }), {
      params: Promise.resolve({ id: "profile-1" }),
    });

    expect(response.status).toBe(400);
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.addBrandFontAsset).not.toHaveBeenCalled();
  });
});
