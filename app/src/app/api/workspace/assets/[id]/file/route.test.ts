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
});
