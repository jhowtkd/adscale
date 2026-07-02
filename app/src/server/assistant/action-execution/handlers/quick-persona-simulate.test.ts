import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/ai/persona-simulator", () => ({
  simulatePersonas: vi.fn(() =>
    Promise.resolve({
      skeptical_buyer: { understands: "u", rejects: "r", wants: "w", wouldClick: false, rationale: "ra" },
      warm_lead: { understands: "u", rejects: "r", wants: "w", wouldClick: true, rationale: "ra" },
      financial_decision_maker: { understands: "u", rejects: "r", wants: "w", wouldClick: false, rationale: "ra" },
      beginner: { understands: "u", rejects: "r", wants: "w", wouldClick: true, rationale: "ra" },
    })
  ),
}));
vi.mock("@/server/memory/brand-memory-dispatch", () => ({
  recordBrandMemoryEvent: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/server/repositories/campaign", () => ({ getCampaignById: vi.fn() }));
vi.mock("@/server/repositories/derivation", () => ({ getDerivationById: vi.fn() }));
vi.mock("@/server/repositories/persona-simulation", () => ({
  createPersonaSimulation: vi.fn(),
  getPersonaSimulationBySource: vi.fn(),
  isCacheValid: vi.fn(),
  updatePersonaSimulation: vi.fn(),
}));

import { simulatePersonas } from "@/server/ai/persona-simulator";
import { recordBrandMemoryEvent } from "@/server/memory/brand-memory-dispatch";
import { getCampaignById } from "@/server/repositories/campaign";
import { getDerivationById } from "@/server/repositories/derivation";
import {
  createPersonaSimulation,
  getPersonaSimulationBySource,
} from "@/server/repositories/persona-simulation";
import "@/server/assistant/action-contracts/contracts";
import { executeQuickPersonaSimulate } from "./quick-persona-simulate";

const CREATIVE_ID = "550e8400-e29b-41d4-a716-446655440000";

const ctx = {
  workspaceId: "ws-1",
  actionId: "action-1",
  threadId: "thread-1",
  clientProfileId: "profile-1",
  userId: "user-1",
  locale: "pt-BR",
  actionType: "quick_persona_simulate",
  inputSnapshot: { baseCreativeId: CREATIVE_ID },
};

describe("executeQuickPersonaSimulate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDerivationById).mockResolvedValue({
      id: CREATIVE_ID,
      campaignId: "campaign-1",
      status: "approved",
      outputKey: "outputs/creative.png",
      prompt: "A bold ad",
    } as Awaited<ReturnType<typeof getDerivationById>>);
    vi.mocked(getCampaignById).mockResolvedValue({
      id: "campaign-1",
      name: "Summer sale",
      clientProfileId: "profile-1",
      objective: "Sales",
      audience: "Runners",
      offer: "20% off",
      tone: "Bold",
      constraints: null,
      client: "Acme",
      product: "Shoes",
      ctaVariants: ["Buy now"],
    } as Awaited<ReturnType<typeof getCampaignById>>);
    vi.mocked(getPersonaSimulationBySource).mockResolvedValue(undefined);
    vi.mocked(createPersonaSimulation).mockResolvedValue({
      id: "sim-1",
      createdAt: new Date("2026-01-01"),
    } as Awaited<ReturnType<typeof createPersonaSimulation>>);
  });

  it("runs the persona simulator and persists the result synchronously", async () => {
    const result = await executeQuickPersonaSimulate(ctx);

    expect(simulatePersonas).toHaveBeenCalledWith(expect.objectContaining({
      creative: { type: "derivation", description: "A bold ad" },
    }));
    expect(createPersonaSimulation).toHaveBeenCalledWith(
      "ws-1",
      "campaign-1",
      "derivation",
      CREATIVE_ID,
      expect.any(Object)
    );
    expect(recordBrandMemoryEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: "persona_test_completed",
      workspaceId: "ws-1",
    }));
    expect(result.mode).toBe("sync");
    expect(result.resultSummary).toContain("sim-1");
  });

  it("reuses a valid cached simulation without calling the simulator", async () => {
    const { isCacheValid } = await import("@/server/repositories/persona-simulation");
    vi.mocked(getPersonaSimulationBySource).mockResolvedValue({
      id: "sim-cached",
      createdAt: new Date("2026-01-01"),
    } as Awaited<ReturnType<typeof getPersonaSimulationBySource>>);
    vi.mocked(isCacheValid).mockReturnValue(true);

    const result = await executeQuickPersonaSimulate(ctx);

    expect(simulatePersonas).not.toHaveBeenCalled();
    expect(createPersonaSimulation).not.toHaveBeenCalled();
    expect(result.resultSummary).toContain("cache");
  });

  it("rejects an unapproved creative", async () => {
    vi.mocked(getDerivationById).mockResolvedValue({
      id: CREATIVE_ID,
      campaignId: "campaign-1",
      status: "pending",
      outputKey: null,
      prompt: null,
    } as Awaited<ReturnType<typeof getDerivationById>>);

    await expect(executeQuickPersonaSimulate(ctx)).rejects.toThrow(/approved/);
    expect(simulatePersonas).not.toHaveBeenCalled();
  });

  it("rejects an unknown creative id", async () => {
    vi.mocked(getDerivationById).mockResolvedValue(null);
    await expect(executeQuickPersonaSimulate(ctx)).rejects.toThrow(/not found/);
  });
});
