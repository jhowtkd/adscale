import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./credits", () => ({
  recordUsage: vi.fn(),
}));

vi.mock("./conversion", () => ({
  buildConversionErrorPayloadForWorkspace: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { recordUsage } from "./credits";
import { buildConversionErrorPayloadForWorkspace } from "./conversion";
import { spendCreditsOrApiError } from "./gates";

const mockRecordUsage = vi.mocked(recordUsage);
const mockBuildPayload = vi.mocked(buildConversionErrorPayloadForWorkspace);

describe("spendCreditsOrApiError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows requests when usage is recorded", async () => {
    mockRecordUsage.mockResolvedValue({
      status: "recorded",
      usage: {},
      check: { allowed: true, amount: 5, balance: 20 },
    } as Awaited<ReturnType<typeof recordUsage>>);

    await expect(
      spendCreditsOrApiError({
        workspaceId: "workspace-1",
        action: "image_derivation",
        idempotencyKey: "test-key",
      })
    ).resolves.toBeNull();
  });

  it("returns structured conversion payload when usage is blocked", async () => {
    mockRecordUsage.mockResolvedValue({
      status: "blocked",
      check: {
        allowed: false,
        amount: 5,
        balance: 0,
        reason: "insufficient_credits",
      },
    });

    mockBuildPayload.mockResolvedValue({
      reason: "beta_exhausted",
      recommendedAction: "checkout",
      suggestedPlan: "starter",
      amount: 5,
      balance: 0,
      returnPath: "/campaigns/c1",
      analytics: {
        reasonCode: "beta_exhausted",
        estimateCredits: 5,
        operation: "image_derivation",
      },
    });

    const response = await spendCreditsOrApiError({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "test-key",
      returnPath: "/campaigns/c1",
    });
    const body = await response?.json();

    expect(response?.status).toBe(402);
    expect(body.code).toBe("beta_exhausted");
    expect(body.details).toMatchObject({
      reason: "beta_exhausted",
      recommendedAction: "checkout",
      returnPath: "/campaigns/c1",
    });
    expect(mockBuildPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        returnPath: "/campaigns/c1",
        operation: "image_derivation",
      })
    );
  });

  it("forwards userId to recordUsage for analytics emission", async () => {
    mockRecordUsage.mockResolvedValue({
      status: "blocked",
      check: {
        allowed: false,
        amount: 5,
        balance: 0,
        reason: "insufficient_credits",
      },
    });
    mockBuildPayload.mockResolvedValue({
      reason: "insufficient_credits",
      recommendedAction: "checkout",
      suggestedPlan: "starter",
      amount: 5,
      balance: 0,
      analytics: { reasonCode: "insufficient_credits", estimateCredits: 5 },
    });

    await spendCreditsOrApiError({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "test-key",
      userId: "user-1",
    });

    expect(mockRecordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
      })
    );
  });
});
