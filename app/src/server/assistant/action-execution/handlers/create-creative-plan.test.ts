import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/ai/prompt-builder", () => ({ buildPlanPrompt: vi.fn(() => "plan prompt") }));
vi.mock("@/server/ai/utils", () => ({
  getOpenAI: vi.fn(() => ({
    chat: { completions: { create: vi.fn(() => Promise.resolve({ choices: [{ message: { content: JSON.stringify({ strategy: "S", angles: ["A"], hooks: ["H"], ctas: ["Buy"] }) } }] })) } },
  })),
}));
vi.mock("@/server/billing/gates", () => ({ spendCreditsOrApiError: vi.fn(() => Promise.resolve(null)) }));
vi.mock("@/server/validation/env", () => ({ env: { OPENAI_TEXT_MODEL: "test-model" } }));
vi.mock("@/server/repositories/campaign", () => ({ createCampaign: vi.fn() }));
vi.mock("@/server/repositories/plan", () => ({ createPlan: vi.fn() }));
vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: vi.fn(), getClientReferencesByIds: vi.fn(),
}));
vi.mock("@/server/repositories/workspace-asset", () => ({ getWorkspaceAssetById: vi.fn() }));
vi.mock("@/server/repositories/assistant-thread", () => ({ linkThreadToCampaign: vi.fn() }));

import "@/server/assistant/action-contracts/contracts";
import { createCampaign } from "@/server/repositories/campaign";
import { createPlan } from "@/server/repositories/plan";
import { getClientProfile, getClientReferencesByIds } from "@/server/repositories/client-reference";
import { getWorkspaceAssetById } from "@/server/repositories/workspace-asset";
import { linkThreadToCampaign } from "@/server/repositories/assistant-thread";
import { executeCreateCreativePlan } from "./create-creative-plan";

const references = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
];
const context = {
  workspaceId: "ws-1", clientProfileId: "profile-1", threadId: "thread-1",
  userId: "user-1", actionId: "action-1", actionType: "create_creative_plan",
  locale: "pt-BR",
  inputSnapshot: {
    productOffer: "Shoes - 20% off", audience: "Runners", objective: "Sales",
    cta: "Buy now", platformOrFormat: "Instagram 4:5", constraints: "Keep logo",
    referenceIds: references,
  },
};

describe("executeCreateCreativePlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getClientReferencesByIds).mockResolvedValue([]);
    vi.mocked(getWorkspaceAssetById).mockImplementation(async (id) => ({ id } as Awaited<ReturnType<typeof getWorkspaceAssetById>>));
    vi.mocked(getClientProfile).mockResolvedValue({ id: "profile-1", name: "Acme" } as Awaited<ReturnType<typeof getClientProfile>>);
    vi.mocked(createCampaign).mockResolvedValue({ id: "campaign-1" } as Awaited<ReturnType<typeof createCampaign>>);
    vi.mocked(createPlan).mockResolvedValue({ id: "plan-1" } as Awaited<ReturnType<typeof createPlan>>);
  });

  it("creates and links a campaign after validation and plan generation", async () => {
    const result = await executeCreateCreativePlan(context);
    expect(createCampaign).toHaveBeenCalledWith("ws-1", expect.objectContaining({ selectedReferenceIds: references, ctaVariants: ["Buy now"] }));
    expect(createPlan).toHaveBeenCalledWith("campaign-1", "ws-1", expect.objectContaining({ strategy: "S" }));
    expect(linkThreadToCampaign).toHaveBeenCalledWith("ws-1", "thread-1", "campaign-1");
    expect(result).toEqual(expect.objectContaining({ mode: "sync", campaignId: "campaign-1" }));
  });

  it("does not create a campaign when a reference is out of scope", async () => {
    vi.mocked(getWorkspaceAssetById).mockResolvedValue(null);
    await expect(executeCreateCreativePlan(context)).rejects.toThrow("Visual reference not found");
    expect(createCampaign).not.toHaveBeenCalled();
  });
});
