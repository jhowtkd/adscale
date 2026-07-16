import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/billing/paywall", () => ({
  spend: vi.fn(),
}));

vi.mock("@/server/repositories/derivation", () => ({
  getDerivationById: vi.fn(),
  createDerivation: vi.fn(),
  updateDerivationStatus: vi.fn(),
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(),
  refreshCampaignStatus: vi.fn(),
  updateCampaign: vi.fn(),
}));

vi.mock("@/server/repositories/feedback", () => ({
  getLatestOpenFeedbackReportForDerivation: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: { send: vi.fn() },
}));

vi.mock("@/server/memory/campaign-memory-context", () => ({
  recordCampaignMemoryEntry: vi.fn(() =>
    Promise.resolve({ schemaVersion: 1, entries: [] })
  ),
}));

vi.mock("@/server/output-learning/output-decision-recorder", () => ({
  recordOutputDecisionEvidenceBestEffort: vi.fn(() =>
    Promise.resolve({ id: "e1" })
  ),
}));

import { spend } from "@/server/billing/paywall";
import {
  createDerivation,
  getDerivationById,
} from "@/server/repositories/derivation";
import { inngest } from "@/server/jobs/client";
import { regenerateDerivation } from "./regenerate-derivation";

const mockSpend = vi.mocked(spend);
const mockGet = vi.mocked(getDerivationById);
const mockCreate = vi.mocked(createDerivation);
const mockSend = vi.mocked(inngest.send);

const source = {
  id: "d1",
  campaignId: "c1",
  workspaceId: "ws-1",
  planId: null,
  generationMode: "art_variation",
  variantIndex: 0,
  ctaText: "Buy",
  format: "1:1",
  creativeContract: null,
  hardFailures: [],
  scoreIssues: [],
  qaChecklist: null,
  regenerationSuggestion: null,
  outputLearningApplication: null,
};

describe("regenerateDerivation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpend.mockResolvedValue({ ok: true, creditsSpent: 5 });
    mockGet.mockResolvedValue(source as never);
    mockCreate.mockResolvedValue({ id: "d2", status: "queued" } as never);
    mockSend.mockResolvedValue({ ids: ["evt"] } as never);
  });

  it("charges once then creates child and dispatches job", async () => {
    const result = await regenerateDerivation({
      workspaceId: "ws-1",
      derivationId: "d1",
      feedback: "make bolder",
      userId: "u1",
      locale: "pt-BR",
      billingIdempotencyKey: "regen:d1:1",
      actorUserId: "u1",
      evidenceSource: "test",
    });

    expect(result.ok).toBe(true);
    expect(mockSpend).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "regeneration",
        idempotencyKey: "regen:d1:1",
      })
    );
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: "d1",
        status: "queued",
      })
    );
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "derivation.generate",
        data: expect.objectContaining({ derivationId: "d2" }),
      })
    );
  });

  it("returns credit_blocked without creating derivation", async () => {
    mockSpend.mockResolvedValue({
      ok: false,
      status: 402,
      conversionPayload: { reason: "insufficient_credits" } as never,
    });

    const result = await regenerateDerivation({
      workspaceId: "ws-1",
      derivationId: "d1",
      userId: "u1",
      billingIdempotencyKey: "regen:d1:blocked",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("credit_blocked");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
