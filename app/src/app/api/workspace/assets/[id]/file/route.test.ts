import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/workspace-asset", () => ({
  getWorkspaceAssetById: vi.fn(),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    signedDownloadUrl: vi.fn(() =>
      Promise.resolve("https://signed.example/creative-work/out.png")
    ),
  },
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { getWorkspaceAssetById } from "@/server/repositories/workspace-asset";
import { objectStorage } from "@/server/storage";

const mockGet = vi.mocked(getWorkspaceAssetById);
const mockSigned = vi.mocked(objectStorage.signedDownloadUrl);

describe("GET /api/workspace/assets/[id]/file", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.VISUAL_FOUNDATIONS_SKIP_STORAGE;
  });

  it("redirects to a signed URL for workspace assets", async () => {
    mockGet.mockResolvedValue({
      id: "asset-1",
      workspaceId: "workspace-1",
      key: "creative-work/out.png",
    } as never);

    const res = await GET(
      new Request("http://localhost/api/workspace/assets/asset-1/file"),
      { params: Promise.resolve({ id: "asset-1" }) }
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://signed.example/creative-work/out.png"
    );
    expect(mockSigned).toHaveBeenCalledWith("creative-work/out.png");
  });

  it("returns 404 when asset is missing", async () => {
    mockGet.mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api/workspace/assets/missing/file"),
      { params: Promise.resolve({ id: "missing" }) }
    );
    expect(res.status).toBe(404);
  });

  it("serves synthetic visual fixtures without storage", async () => {
    process.env.VISUAL_FOUNDATIONS_SKIP_STORAGE = "true";
    mockGet.mockResolvedValue({
      id: "asset-1",
      workspaceId: "workspace-1",
      key: "e2e/visual-foundations/workspace/vf-variation-square-240x240.svg",
      width: 240,
      height: 240,
    } as never);

    const res = await GET(
      new Request("http://localhost/api/workspace/assets/asset-1/file"),
      { params: Promise.resolve({ id: "asset-1" }) }
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    expect(await res.text()).toContain('width="240" height="240"');
    expect(mockSigned).not.toHaveBeenCalled();
  });
});
