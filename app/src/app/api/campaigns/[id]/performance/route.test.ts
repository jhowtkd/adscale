import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/workspace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/workspace")>();
  return {
    ...actual,
    requireWorkspaceAccess: vi.fn(() =>
      Promise.resolve({
        user: { id: "user-1" },
        workspace: { id: "workspace-1" },
      })
    ),
  };
});

vi.mock("@/server/performance/service", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/server/performance/service")
  >();
  return {
    ...actual,
    getCampaignPerformanceSnapshots: vi.fn(),
    recordPerformanceSnapshot: vi.fn(),
  };
});

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import {
  getCampaignPerformanceSnapshots,
  PerformanceDomainError,
  recordPerformanceSnapshot,
} from "@/server/performance/service";
import { GET, POST } from "./route";

const campaignId = "550e8400-e29b-41d4-a716-446655440000";
const body = {
  campaignId,
  derivationId: "550e8400-e29b-41d4-a716-446655440001",
  platform: "meta",
  placementRaw: "Instagram Feed",
  startDate: "2026-06-01",
  endDate: "2026-06-07",
  sourceTimezone: "America/Sao_Paulo",
  currency: "BRL",
  sourceType: "manual",
  scope: { kind: "total" },
  metrics: {
    impressions: "1000",
    clicks: "25",
    spend: "50.25",
    conversions: "2.5",
    conversionValue: "201",
  },
};
const context = { params: Promise.resolve({ id: campaignId }) };

describe("/api/campaigns/[id]/performance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a validated workspace snapshot", async () => {
    vi.mocked(recordPerformanceSnapshot).mockResolvedValue({
      id: "snapshot-1",
      derivedMetrics: { ctr: "0.025", cpc: "2.01", cpa: "20.1", roas: "4" },
    } as never);

    const response = await POST(
      new Request(`http://localhost/api/campaigns/${campaignId}/performance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      context
    );

    expect(response.status).toBe(201);
    expect(recordPerformanceSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1", userId: "user-1" })
    );
  });

  it("lists only the authenticated workspace campaign", async () => {
    vi.mocked(getCampaignPerformanceSnapshots).mockResolvedValue([]);

    const response = await GET(
      new Request(`http://localhost/api/campaigns/${campaignId}/performance`),
      context
    );

    expect(response.status).toBe(200);
    expect(getCampaignPerformanceSnapshots).toHaveBeenCalledWith({
      campaignId,
      workspaceId: "workspace-1",
    });
  });

  it("rejects a body campaign that differs from the route", async () => {
    const response = await POST(
      new Request(`http://localhost/api/campaigns/${campaignId}/performance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...body,
          campaignId: "550e8400-e29b-41d4-a716-446655440099",
        }),
      }),
      context
    );

    expect(response.status).toBe(400);
    expect(recordPerformanceSnapshot).not.toHaveBeenCalled();
  });

  it("maps domain errors to their public status", async () => {
    vi.mocked(getCampaignPerformanceSnapshots).mockRejectedValue(
      new PerformanceDomainError("performanceCampaignNotFound", 404)
    );

    const response = await GET(
      new Request(`http://localhost/api/campaigns/${campaignId}/performance`),
      context
    );
    const result = await response.json();

    expect(response.status).toBe(404);
    expect(result.code).toBe("performanceCampaignNotFound");
  });
});
