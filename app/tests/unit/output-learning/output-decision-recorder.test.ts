import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/feedback/validate-refs", () => ({
  validateCampaignOwnership: vi.fn(() => Promise.resolve()),
  validateDerivationOwnership: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/server/repositories/output-decision-event", () => ({
  insertOutputDecisionEvent: vi.fn(),
}));

import { insertOutputDecisionEvent } from "@/server/repositories/output-decision-event";
import {
  recordOutputDecisionEvidence,
  recordOutputDecisionEvidenceBestEffort,
} from "@/server/output-learning/output-decision-recorder";

const mockInsert = vi.mocked(insertOutputDecisionEvent);

describe("output-decision-recorder", () => {
  const baseInput = {
    workspaceId: "ws-1",
    userId: "user-1",
    clientProfileId: "profile-1",
    campaignId: "camp-1",
    derivationId: "deriv-1",
    action: "approved" as const,
    source: "derivations.review.PATCH",
    snapshotInput: {
      generationMode: "art_variation",
      format: "1:1",
      qualityScore: 80,
      prompt: "must not persist",
      inputPrompt: "must not persist",
      outputKey: "r2://secret",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({
      id: "event-1",
      action: "approved",
    } as Awaited<ReturnType<typeof insertOutputDecisionEvent>>);
  });

  it("records canonical evidence with semantics", async () => {
    await recordOutputDecisionEvidence(baseInput);

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "approved",
        direction: "positive",
        strength: "strong",
        contextSnapshot: expect.objectContaining({
          generationMode: "art_variation",
          format: "1:1",
          qualityScore: 80,
        }),
      })
    );

    const snapshot = mockInsert.mock.calls[0][0].contextSnapshot;
    expect(snapshot).not.toHaveProperty("prompt");
    expect(snapshot).not.toHaveProperty("inputPrompt");
    expect(snapshot).not.toHaveProperty("outputKey");
  });

  it("best-effort mode returns null without throwing on insert failure", async () => {
    mockInsert.mockRejectedValue(new Error("db down"));

    const result = await recordOutputDecisionEvidenceBestEffort(baseInput);

    expect(result).toBeNull();
  });

  it("best-effort mode returns event on success", async () => {
    const result = await recordOutputDecisionEvidenceBestEffort(baseInput);
    expect(result).toMatchObject({ id: "event-1" });
  });
});
