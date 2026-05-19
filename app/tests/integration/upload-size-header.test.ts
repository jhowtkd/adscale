import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(),
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(),
}));

vi.mock("@/server/repositories/asset", () => ({
  createAsset: vi.fn(),
}));

vi.mock("@/server/storage/r2", () => ({
  uploadBuffer: vi.fn().mockResolvedValue(undefined),
}));

import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaignById } from "@/server/repositories/campaign";
import { uploadBuffer } from "@/server/storage/r2";
import { POST } from "@/app/api/campaigns/[id]/assets/upload/route";

describe("POST /api/campaigns/[id]/assets/upload", () => {
  const workspaceId = "ws-123";
  const campaignId = "camp-456";

  beforeEach(() => {
    vi.clearAllMocks();
    (requireWorkspaceAccess as ReturnType<typeof vi.fn>).mockResolvedValue({
      workspace: { id: workspaceId },
    });
    (getCampaignById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: campaignId,
      workspaceId,
    });
  });

  it("rejects upload when Content-Length header exceeds max size", async () => {
    const formData = new FormData();
    formData.append("file", new Blob([""], { type: "image/png" }), "test.png");

    const request = new Request("http://localhost/api/campaigns/camp-456/assets/upload", {
      method: "POST",
      headers: {
        "Content-Length": String(60 * 1024 * 1024), // 60MB
      },
      body: formData,
    });

    const response = await POST(request, { params: Promise.resolve({ id: campaignId }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("fileTooLarge");
    expect(uploadBuffer).not.toHaveBeenCalled();
  });
});
