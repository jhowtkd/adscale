import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/billing/gates", () => ({
  spendCreditsOrApiError: vi.fn(),
}));

vi.mock("@/server/assistant/creative-iteration/proposal", () => ({
  confirmCreativeRevision: vi.fn(),
}));

vi.mock("@/server/repositories/derivation", () => ({
  createDerivation: vi.fn(),
  updateDerivationStatus: vi.fn(),
}));

vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: vi.fn(() =>
    Promise.resolve({
      id: "thread-1",
      clientProfileId: "client-1",
      campaignId: "campaign-1",
    })
  ),
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: {
    send: vi.fn(() => Promise.resolve({ ids: ["event-1"] })),
  },
}));

import "@/server/assistant/action-contracts/contracts";
import { spendCreditsOrApiError } from "@/server/billing/gates";
import { confirmCreativeRevision } from "@/server/assistant/creative-iteration/proposal";
import { createDerivation } from "@/server/repositories/derivation";
import { inngest } from "@/server/jobs/client";
import { reviseCreativeInputSchema } from "@/server/assistant/action-contracts/contracts/revise-creative";
import { getActionContract } from "@/server/assistant/action-contracts/registry";

describe("revise_creative contract", () => {
  it("registers revise_creative in the action contract registry", () => {
    const contract = getActionContract("revise_creative");
    expect(contract).toBeDefined();
    expect(contract?.actionType).toBe("revise_creative");
    expect(contract?.intentFamily).toBe("complete_campaign");
    expect(contract?.riskLabel).toBe("medium");
    expect(contract?.confirmationPolicy).toBe("required");
    expect(contract?.requiredFields).toContain("planVersionId");
  });

  it("uses creditAction credit impact with image_derivation action", () => {
    const contract = getActionContract("revise_creative");
    expect(contract?.creditImpact).toEqual({
      kind: "creditAction",
      action: "image_derivation",
      label: "5 créditos",
    });
  });

  it("validates a fully-populated input snapshot including planVersionId", () => {
    const result = reviseCreativeInputSchema.safeParse({
      proposalId: "00000000-0000-4000-8000-000000000301",
      lineageId: "00000000-0000-4000-8000-000000000101",
      sourceVersionId: "00000000-0000-4000-8000-000000000201",
      payloadDigest: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      planVersionId: "00000000-0000-4000-8000-000000000401",
      lineageHeadRevision: 3,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing planVersionId", () => {
    const result = reviseCreativeInputSchema.safeParse({
      proposalId: "00000000-0000-4000-8000-000000000301",
      lineageId: "00000000-0000-4000-8000-000000000101",
      sourceVersionId: "00000000-0000-4000-8000-000000000201",
      payloadDigest: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing payloadDigest", () => {
    const result = reviseCreativeInputSchema.safeParse({
      proposalId: "00000000-0000-4000-8000-000000000301",
      lineageId: "00000000-0000-4000-8000-000000000101",
      sourceVersionId: "00000000-0000-4000-8000-000000000201",
      planVersionId: "00000000-0000-4000-8000-000000000401",
    });
    expect(result.success).toBe(false);
  });

  it("rejects payload digest that is not exactly 64 characters", () => {
    const result = reviseCreativeInputSchema.safeParse({
      proposalId: "00000000-0000-4000-8000-000000000301",
      lineageId: "00000000-0000-4000-8000-000000000101",
      sourceVersionId: "00000000-0000-4000-8000-000000000201",
      payloadDigest: "short-digest",
      planVersionId: "00000000-0000-4000-8000-000000000401",
    });
    expect(result.success).toBe(false);
  });
});

describe("executeReviseCreative", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(spendCreditsOrApiError).mockResolvedValue(null);
    vi.mocked(confirmCreativeRevision).mockResolvedValue({
      proposal: { id: "proposal-1", status: "confirmed" },
      head: { revision: 0, workingVersionId: "v-1", approvedCurrentVersionId: null },
      idempotent: false,
      version: null,
    } as never);
    vi.mocked(createDerivation).mockResolvedValue({
      id: "derivation-1",
      campaignId: "campaign-1",
      workspaceId: "ws-1",
      status: "queued",
      generationMode: "creative_revision",
      format: "1:1",
      variantIndex: 0,
    } as never);
  });

  const context = {
    workspaceId: "ws-1",
    clientProfileId: "client-1",
    threadId: "thread-1",
    userId: "user-1",
    actionId: "action-1",
    actionType: "revise_creative",
    locale: "pt-BR",
    inputSnapshot: {
      proposalId: "00000000-0000-4000-8000-000000000301",
      lineageId: "00000000-0000-4000-8000-000000000101",
      sourceVersionId: "00000000-0000-4000-8000-000000000201",
      payloadDigest: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      planVersionId: "00000000-0000-4000-8000-000000000401",
    },
  };

  it.todo("charges credits with idempotency key");
  it.todo("enqueues derivation.generate job");
  it.todo("returns async mode");
  it.todo("duplicate confirm is idempotent");
  it.todo("retry charges again with new attempt key");
  it.todo("insufficient credits throws credit_blocked");
  it.todo("one active generation per lineage blocks concurrent confirm");
});
