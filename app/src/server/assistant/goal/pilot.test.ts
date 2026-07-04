import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/platform-owner", () => ({
  isPlatformOwnerEmail: (email: string) =>
    email === "owner@adscale.com" || email === "Owner@Example.com",
}));

vi.mock("@/server/repositories/entitlements", () => ({
  getActiveTesterEntitlementByWorkspace: vi.fn(),
}));

import { getActiveTesterEntitlementByWorkspace } from "@/server/repositories/entitlements";
import {
  AssistantGoalPilotError,
  resolveAssistantExperience,
} from "./pilot";

const mockEntitlement = vi.mocked(getActiveTesterEntitlementByWorkspace);

describe("resolveAssistantExperience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enables goal-agent for a platform owner", async () => {
    const result = await resolveAssistantExperience({
      workspaceId: "ws-1",
      userEmail: "owner@adscale.com",
    });
    expect(result).toBe("agent");
  });

  it("enables goal-agent for a tester-entitled workspace", async () => {
    mockEntitlement.mockResolvedValue({ id: "ent-1" } as Awaited<
      ReturnType<typeof getActiveTesterEntitlementByWorkspace>
    >);

    const result = await resolveAssistantExperience({
      workspaceId: "ws-1",
      userEmail: "tester@example.com",
    });
    expect(result).toBe("agent");
  });

  it("keeps non-eligible workspaces on classic experience", async () => {
    mockEntitlement.mockResolvedValue(null);

    const result = await resolveAssistantExperience({
      workspaceId: "ws-1",
      userEmail: "regular@example.com",
    });
    expect(result).toBe("classic");
  });

  it("respects an explicit classic request even when eligible", async () => {
    const result = await resolveAssistantExperience({
      workspaceId: "ws-1",
      userEmail: "owner@adscale.com",
      requested: "classic",
    });
    expect(result).toBe("classic");
  });

  it("rejects experience=agent for an ineligible caller", async () => {
    mockEntitlement.mockResolvedValue(null);

    await expect(
      resolveAssistantExperience({
        workspaceId: "ws-1",
        userEmail: "regular@example.com",
        requested: "agent",
      })
    ).rejects.toBeInstanceOf(AssistantGoalPilotError);
  });

  it("allows experience=agent for an eligible caller", async () => {
    mockEntitlement.mockResolvedValue({ id: "ent-1" } as Awaited<
      ReturnType<typeof getActiveTesterEntitlementByWorkspace>
    >);

    const result = await resolveAssistantExperience({
      workspaceId: "ws-1",
      userEmail: "tester@example.com",
      requested: "agent",
    });
    expect(result).toBe("agent");
  });
});
