import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() =>
    Promise.resolve((key: string) => key)
  ),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(),
}));

vi.mock("@/lib/with-rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/server/repositories/assistant-thread", () => ({
  createAssistantThread: vi.fn(),
  getOrCreateDefaultCampaignThread: vi.fn(),
  listAssistantThreads: vi.fn(),
  AssistantThreadValidationError: class AssistantThreadValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AssistantThreadValidationError";
    }
  },
}));

vi.mock("@/server/assistant/goal/pilot", () => ({
  resolveAssistantExperience: vi.fn(),
  AssistantGoalPilotError: class AssistantGoalPilotError extends Error {
    constructor(message: string, public code: string) {
      super(message);
      this.name = "AssistantGoalPilotError";
    }
  },
}));

vi.mock("@/server/repositories/assistant-goal", () => ({
  createGoalRun: vi.fn(),
}));

import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { createAssistantThread } from "@/server/repositories/assistant-thread";
import { resolveAssistantExperience } from "@/server/assistant/goal/pilot";
import { createGoalRun } from "@/server/repositories/assistant-goal";

const mockRequireAccess = vi.mocked(requireWorkspaceAccess);
const mockCreateThread = vi.mocked(createAssistantThread);
const mockResolveExperience = vi.mocked(resolveAssistantExperience);
const mockCreateGoalRun = vi.mocked(createGoalRun);

const workspace = { id: "ws-1" };
const user = { id: "user-1", email: "owner@adscale.com" };

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/assistant/threads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/assistant/threads experience routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAccess.mockResolvedValue({ user, workspace } as never);
    mockCreateThread.mockResolvedValue({ id: "thread-1" } as never);
    mockCreateGoalRun.mockResolvedValue({ id: "goal-1" } as never);
  });

  it("creates a goal run when experience=agent and caller is eligible", async () => {
    mockResolveExperience.mockResolvedValue("agent");

    const response = await POST(jsonRequest({
      clientProfileId: "00000000-0000-4000-8000-000000000001",
      experience: "agent",
    }));

    expect(response.status).toBe(201);
    expect(mockCreateGoalRun).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      clientProfileId: "00000000-0000-4000-8000-000000000001",
      threadId: "thread-1",
      userId: "user-1",
    });
  });

  it("rejects experience=agent for an ineligible caller", async () => {
    const { AssistantGoalPilotError } = await import("@/server/assistant/goal/pilot");
    mockResolveExperience.mockImplementation(() => {
      throw new AssistantGoalPilotError("not enabled", "goal_agent_not_enabled");
    });

    const response = await POST(jsonRequest({
      clientProfileId: "00000000-0000-4000-8000-000000000001",
      experience: "agent",
    }));

    expect(response.status).toBe(403);
    expect(mockCreateGoalRun).not.toHaveBeenCalled();
  });

  it("creates a classic thread without a goal run when experience=classic", async () => {
    mockResolveExperience.mockResolvedValue("classic");

    const response = await POST(jsonRequest({
      clientProfileId: "00000000-0000-4000-8000-000000000001",
      experience: "classic",
    }));

    expect(response.status).toBe(201);
    expect(mockCreateGoalRun).not.toHaveBeenCalled();
  });

  it("defaults to the resolved experience when experience is omitted", async () => {
    mockResolveExperience.mockResolvedValue("classic");

    const response = await POST(jsonRequest({ clientProfileId: "00000000-0000-4000-8000-000000000001" }));

    expect(response.status).toBe(201);
    expect(mockResolveExperience).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", userEmail: user.email })
    );
  });
});
