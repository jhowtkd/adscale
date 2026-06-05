import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PATCH } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/derivation", () => ({
  getDerivationById: vi.fn(),
  updateDerivationStatus: vi.fn(),
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(() =>
    Promise.resolve({
      id: "campaign-id",
      name: "Campaign",
      clientProfileId: "profile-id",
    })
  ),
  refreshCampaignStatus: vi.fn(),
}));

vi.mock("@/server/memory/brand-memory-dispatch", () => ({
  recordBrandMemoryEvent: vi.fn(() => Promise.resolve()),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import {
  getDerivationById,
  updateDerivationStatus,
} from "@/server/repositories/derivation";

const mockGetDerivationById = vi.mocked(getDerivationById);
const mockUpdateDerivationStatus = vi.mocked(updateDerivationStatus);

function requestWith(body: unknown): Request {
  return new Request("http://localhost/api/derivations/derivation-id/review", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function paramsWith(id: string) {
  return Promise.resolve({ id });
}

describe("PATCH /api/derivations/[id]/review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 409 when approving derivation with invalid qualityVerdict", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "completed",
      qualityVerdict: "invalid",
      hardFailures: [
        { code: "cta_drift", message: "CTA replaced" },
      ],
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    const res = await PATCH(requestWith({ status: "approved" }), {
      params: paramsWith("derivation-id"),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("derivationHardFailures");
    expect(body.details).toMatchObject({
      qualityVerdict: "invalid",
      hardFailures: [{ code: "cta_drift", message: "CTA replaced" }],
    });
    expect(mockUpdateDerivationStatus).not.toHaveBeenCalled();
  });

  it("approves derivation when qualityVerdict is improvable", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "completed",
      qualityVerdict: "improvable",
      hardFailures: [],
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    mockUpdateDerivationStatus.mockResolvedValue({
      id: "derivation-id",
      status: "approved",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      format: "4:5",
      generationMode: "art_variation",
      ctaText: "Buy",
      qualityScore: 75,
      scoreStatus: "analyzed",
      scoreIssues: null,
      regenerationSuggestion: null,
      qaStatus: "passed",
      qaIssues: null,
      feedback: null,
      updatedAt: new Date(),
    } as Awaited<ReturnType<typeof updateDerivationStatus>>);

    const res = await PATCH(requestWith({ status: "approved" }), {
      params: paramsWith("derivation-id"),
    });

    expect(res.status).toBe(200);
    expect(mockUpdateDerivationStatus).toHaveBeenCalledWith(
      "derivation-id",
      "workspace-1",
      "approved"
    );
  });

  it("rejects without quality gate check", async () => {
    mockUpdateDerivationStatus.mockResolvedValue({
      id: "derivation-id",
      status: "rejected",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      format: "4:5",
      generationMode: "art_variation",
      ctaText: "Buy",
      qualityScore: 75,
      scoreStatus: "analyzed",
      scoreIssues: null,
      regenerationSuggestion: null,
      qaStatus: "passed",
      qaIssues: null,
      feedback: null,
      updatedAt: new Date(),
    } as Awaited<ReturnType<typeof updateDerivationStatus>>);

    const res = await PATCH(requestWith({ status: "rejected" }), {
      params: paramsWith("derivation-id"),
    });

    expect(res.status).toBe(200);
    expect(mockGetDerivationById).not.toHaveBeenCalled();
  });
});
