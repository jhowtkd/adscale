import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/assistant/plan-iteration/proposal", () => ({
  confirmPlanRevision: vi.fn(),
}));

import "@/server/assistant/action-contracts/contracts";
import { confirmPlanRevision } from "@/server/assistant/plan-iteration/proposal";
import { executeReviseCreativePlan } from "./revise-creative-plan";

const context = {
  workspaceId: "ws-1",
  clientProfileId: "client-1",
  threadId: "thread-1",
  userId: "user-1",
  actionId: "action-1",
  actionType: "revise_creative_plan",
  locale: "pt-BR",
  inputSnapshot: {
    proposalId: "00000000-0000-4000-8000-000000000301",
    lineageId: "00000000-0000-4000-8000-000000000101",
    sourceVersionId: "00000000-0000-4000-8000-000000000201",
    payloadDigest: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
  },
};

vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: vi.fn(() =>
    Promise.resolve({
      id: "thread-1",
      clientProfileId: "client-1",
      campaignId: "campaign-1",
    })
  ),
}));

describe("executeReviseCreativePlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates ready child version via confirmPlanRevision", async () => {
    vi.mocked(confirmPlanRevision).mockResolvedValue({
      version: { id: "v-3", versionNumber: 3, status: "ready" },
      head: { workingVersionId: "v-3" },
      proposal: { status: "confirmed" },
      idempotent: false,
    } as never);

    const result = await executeReviseCreativePlan(context);
    expect(confirmPlanRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        proposalId: context.inputSnapshot.proposalId,
        actionId: "action-1",
      })
    );
    expect(result.resultSummary).toContain("3");
  });
});
