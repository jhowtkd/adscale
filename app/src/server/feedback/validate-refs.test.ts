import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  FeedbackValidationError,
  validateDerivationOwnership,
} from "./validate-refs";

const mockLimit = vi.fn();
const mockWhere = vi.fn(() => ({ limit: mockLimit }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

vi.mock("../db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

describe("validateDerivationOwnership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects when derivation campaign does not match submitted campaign", async () => {
    mockLimit.mockResolvedValue([
      { id: "deriv-1", campaignId: "camp-a" },
    ]);

    await expect(
      validateDerivationOwnership("ws-1", "deriv-1", "camp-b")
    ).rejects.toMatchObject({
      code: "invalid_derivation_campaign",
    } satisfies Partial<FeedbackValidationError>);
  });

  it("passes when derivation belongs to submitted campaign", async () => {
    mockLimit.mockResolvedValue([
      { id: "deriv-1", campaignId: "camp-a" },
    ]);

    await expect(
      validateDerivationOwnership("ws-1", "deriv-1", "camp-a")
    ).resolves.toBeUndefined();
  });
});
