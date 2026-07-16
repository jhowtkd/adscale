import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/billing/paywall", () => ({
  spend: vi.fn(),
  spendOrApiError: vi.fn(),
}));

vi.mock("@/lib/api-response", () => ({
  apiError: vi.fn((reason: string, status: number, payload: unknown) =>
    ({ reason, status, payload })
  ),
}));

import { spend } from "@/server/billing/paywall";
import {
  chargeForBatchOrApiError,
  chargeForGeneration,
  chargeForGenerationBatch,
} from "./charge";
import {
  GENERATION_CREDIT_COSTS,
  type GenerationBatchCharge,
  type GenerationRequest,
} from "./types";

const mockSpend = vi.mocked(spend);

function unitRequest(): GenerationRequest {
  return {
    authorship: { workspaceId: "ws-1", userId: "u-1" },
    origin: "campaign",
    surface: "campaign",
    intent: { mode: "art_variation", objective: null },
    identity: {
      clientProfileId: null,
      referenceImages: [],
      brandConstraints: null,
    },
    format: {
      targetFormat: "1:1",
      dimensions: { width: 1024, height: 1024 },
      constraints: null,
    },
    source: {
      parentId: null,
      sourceVersionId: null,
      lineageId: null,
      packageSource: null,
    },
    prompt: { text: "prompt" },
    cost: {
      chargeAmount: GENERATION_CREDIT_COSTS.singleDerivation,
      refundPolicy: "default",
    },
    idempotency: {
      billingKey: "derivation:d1:generate",
      skipWhenOutputExists: true,
    },
    destination: {
      kind: "derivation",
      id: "d1",
      storagePrefix: "derivations/d1",
    },
  };
}

function batchCharge(): GenerationBatchCharge {
  return {
    kind: "batch",
    authorship: { workspaceId: "ws-1", userId: "u-1" },
    origin: "quick_tool",
    surface: "quick_tool",
    intent: { mode: "social_post", objective: "Engajamento" },
    parentId: "work-1",
    unitCount: 3,
    chargeAmount: GENERATION_CREDIT_COSTS.creativeWorkTriplet,
    unitChargeAmount: GENERATION_CREDIT_COSTS.creativeWorkOutput,
    billingKey: "creative-work:work-1:triplet",
    refundPolicy: "default",
  };
}

describe("chargeForGeneration", () => {
  beforeEach(() => {
    mockSpend.mockReset();
    mockSpend.mockResolvedValue({ ok: true, creditsSpent: 5 });
  });

  it("spends using unit GenerationRequest cost and billing key", async () => {
    const req = unitRequest();
    await chargeForGeneration(req);
    expect(mockSpend).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 5,
        idempotencyKey: "derivation:d1:generate",
        metadata: expect.objectContaining({ chargeKind: "unit" }),
      })
    );
  });
});

describe("chargeForGenerationBatch", () => {
  beforeEach(() => {
    mockSpend.mockReset();
    mockSpend.mockResolvedValue({ ok: true, creditsSpent: 15 });
  });

  it("spends batch total and records unit economics in metadata", async () => {
    await chargeForGenerationBatch(batchCharge(), {
      metadata: { creativeWorkId: "work-1" },
    });
    expect(mockSpend).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 15,
        idempotencyKey: "creative-work:work-1:triplet",
        metadata: expect.objectContaining({
          chargeKind: "batch",
          unitCount: 3,
          unitChargeAmount: 5,
          creativeWorkId: "work-1",
        }),
      })
    );
  });

  it("rejects inconsistent batch amounts before spend", async () => {
    await expect(
      chargeForGenerationBatch({
        ...batchCharge(),
        chargeAmount: 14,
      })
    ).rejects.toThrow(/unitChargeAmount \* unitCount/);
    expect(mockSpend).not.toHaveBeenCalled();
  });
});

describe("chargeForBatchOrApiError", () => {
  beforeEach(() => {
    mockSpend.mockReset();
  });

  it("returns null when spend succeeds", async () => {
    mockSpend.mockResolvedValue({ ok: true, creditsSpent: 15 });
    await expect(chargeForBatchOrApiError(batchCharge())).resolves.toBeNull();
  });
});
