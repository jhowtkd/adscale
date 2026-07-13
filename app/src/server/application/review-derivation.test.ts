import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/derivation", () => ({
  getDerivationById: vi.fn(),
  updateDerivationStatus: vi.fn(),
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(),
  refreshCampaignStatus: vi.fn(),
}));

vi.mock("@/server/memory/brand-memory-dispatch", () => ({
  recordBrandMemoryEvent: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/server/memory/campaign-memory-context", () => ({
  recordCampaignMemoryEntry: vi.fn(() =>
    Promise.resolve({ schemaVersion: 1, entries: [] })
  ),
}));

vi.mock("@/server/output-learning/output-decision-recorder", () => ({
  recordOutputDecisionEvidenceBestEffort: vi.fn(() =>
    Promise.resolve({ id: "evidence-1" })
  ),
}));

import {
  getDerivationById,
  updateDerivationStatus,
} from "@/server/repositories/derivation";
import {
  getCampaignById,
  refreshCampaignStatus,
} from "@/server/repositories/campaign";
import { recordBrandMemoryEvent } from "@/server/memory/brand-memory-dispatch";
import { reviewDerivation } from "./review-derivation";

const mockGet = vi.mocked(getDerivationById);
const mockUpdate = vi.mocked(updateDerivationStatus);
const mockCampaign = vi.mocked(getCampaignById);
const mockRefresh = vi.mocked(refreshCampaignStatus);
const mockMemory = vi.mocked(recordBrandMemoryEvent);

const cleanDerivation = {
  id: "d1",
  status: "completed",
  campaignId: "c1",
  workspaceId: "ws-1",
  qualityVerdict: "acceptable",
  hardFailures: [],
  ctaText: "Buy now",
  format: "1:1",
  generationMode: "art_variation",
  qualityScore: 80,
  scoreStatus: "analyzed",
  scoreIssues: [],
  regenerationSuggestion: null,
  qaStatus: null,
  qaIssues: null,
  feedback: null,
  updatedAt: new Date("2026-07-13T00:00:00.000Z"),
};

describe("reviewDerivation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCampaign.mockResolvedValue({
      id: "c1",
      name: "Camp",
      clientProfileId: "p1",
    } as never);
    mockRefresh.mockResolvedValue(undefined as never);
  });

  it("rejects approval when hard failures and no override", async () => {
    mockGet.mockResolvedValue({
      ...cleanDerivation,
      qualityVerdict: "invalid",
      hardFailures: [{ code: "cta_drift", message: "bad" }],
    } as never);

    const result = await reviewDerivation({
      workspaceId: "ws-1",
      derivationId: "d1",
      decision: "entra",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("derivation_hard_failures");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("approves clean derivation and records brand memory", async () => {
    mockGet.mockResolvedValue(cleanDerivation as never);
    mockUpdate.mockResolvedValue({
      ...cleanDerivation,
      status: "approved",
    } as never);

    const result = await reviewDerivation({
      workspaceId: "ws-1",
      derivationId: "d1",
      decision: "entra",
      actorUserId: "u1",
      evidenceSource: "test",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.effectiveStatus).toBe("approved");
      expect(result.value.isOverrideApproval).toBe(false);
    }
    expect(mockUpdate).toHaveBeenCalledWith("d1", "ws-1", "approved");
    expect(mockMemory).toHaveBeenCalledWith(
      expect.objectContaining({ type: "creative_approved" })
    );
  });

  it("requires direction reason for nao_entra", async () => {
    const result = await reviewDerivation({
      workspaceId: "ws-1",
      derivationId: "d1",
      decision: "nao_entra",
      directionReason: "no",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid_direction_reason");
  });
});
