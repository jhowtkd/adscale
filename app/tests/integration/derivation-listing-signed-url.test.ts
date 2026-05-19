import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));

vi.mock("@/server/db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: {
    send: vi.fn().mockResolvedValue(undefined),
    createFunction: vi.fn().mockReturnValue({}),
  },
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(),
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(),
  refreshCampaignStatus: vi.fn(),
}));

vi.mock("@/server/repositories/derivation", () => ({
  failStaleActiveDerivations: vi.fn().mockResolvedValue([]),
  getDerivationsByCampaign: vi.fn(),
}));

vi.mock("@/server/storage/r2", () => ({
  getPresignedDownloadUrl: vi.fn().mockResolvedValue("https://r2.example.com/signed?X-Amz-Signature=abc123"),
}));

import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaignById } from "@/server/repositories/campaign";
import { getDerivationsByCampaign } from "@/server/repositories/derivation";
import { getPresignedDownloadUrl } from "@/server/storage/r2";
import { GET } from "@/app/api/campaigns/[id]/derivations/route";

describe("GET /api/campaigns/[id]/derivations", () => {
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

  it("returns signed download URLs for derivations with outputKey", async () => {
    (getDerivationsByCampaign as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "deriv-1", outputKey: "derivations/deriv-1/123.png", status: "completed" },
      { id: "deriv-2", outputKey: null, status: "failed" },
    ]);

    const request = new Request("http://localhost/api/campaigns/camp-456/derivations");
    const response = await GET(request, { params: Promise.resolve({ id: campaignId }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.derivations).toHaveLength(2);
    expect(body.derivations[0].imageUrl).toBe("https://r2.example.com/signed?X-Amz-Signature=abc123");
    expect(getPresignedDownloadUrl).toHaveBeenCalledWith("derivations/deriv-1/123.png");
    expect(body.derivations[1].imageUrl).toBeNull();
  });
});
