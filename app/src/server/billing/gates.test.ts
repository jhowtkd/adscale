import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./credits", () => ({
  recordUsage: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { recordUsage } from "./credits";
import { spendCreditsOrApiError } from "./gates";

const mockRecordUsage = vi.mocked(recordUsage);

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

  it("returns a payment-required response when usage is blocked", async () => {
    mockRecordUsage.mockResolvedValue({
      status: "blocked",
      check: {
        allowed: false,
        amount: 5,
        balance: 0,
        reason: "insufficient_credits",
      },
    });

    const response = await spendCreditsOrApiError({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "test-key",
    });
    const body = await response?.json();

    expect(response?.status).toBe(402);
    expect(body.code).toBe("insufficient_credits");
  });

  it("returns inactive_subscription when past_due workspace has no spend access", async () => {
    mockRecordUsage.mockResolvedValue({
      status: "blocked",
      check: {
        allowed: false,
        amount: 5,
        balance: 0,
        reason: "inactive_subscription",
      },
    });

    const response = await spendCreditsOrApiError({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "past-due-blocked",
    });
    const body = await response?.json();

    expect(response?.status).toBe(402);
    expect(body.code).toBe("inactive_subscription");
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

