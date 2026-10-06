import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

const freePlan = vi.hoisted(() => ({ find: vi.fn(async (): Promise<{ accountId: string } | null> => null) }));
vi.mock("@/server/equipe/module/free-plan", () => ({
  findFreePlanAccount: (...args: unknown[]) => (freePlan.find as (...a: unknown[]) => unknown)(...args),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: vi.fn(),
}));

vi.mock("@/server/assistant/guided-conversation/service", () => ({
  applyGuidedConversationCommand: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/server/repositories/guided-flow", () => ({
  GuidedFlowValidationError: class GuidedFlowValidationError extends Error {
    name = "GuidedFlowValidationError";
  },
  GuidedFlowRevisionConflictError: class GuidedFlowRevisionConflictError extends Error {
    name = "GuidedFlowRevisionConflictError";
    presentation = null;
    constructor(message: string, presentation: unknown) {
      super(message);
      this.presentation = presentation;
    }
  },
}));

import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { applyGuidedConversationCommand } from "@/server/assistant/guided-conversation/service";
import {
  GuidedFlowRevisionConflictError,
  GuidedFlowValidationError,
} from "@/server/repositories/guided-flow";

const mockGetThread = vi.mocked(getAssistantThreadById);
const mockApply = vi.mocked(applyGuidedConversationCommand);

const thread = {
  id: "t1",
  workspaceId: "workspace-1",
  clientProfileId: "profile-1",
  name: "Main",
};

describe("POST /api/assistant/threads/[threadId]/guided-flow/commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetThread.mockResolvedValue(thread as Awaited<ReturnType<typeof getAssistantThreadById>>);
  });

  it("applies a valid command envelope", async () => {
    mockApply.mockResolvedValue({
      presentation: {
        path: "from_zero",
        status: "active",
        currentStep: "collect_brief",
        revision: 1,
        schemaVersion: 1,
        missingFields: [],
        assetIds: [],
        referenceIds: [],
        campaignId: null,
        recoverableError: null,
        slots: {},
        navigationHistory: ["collect_brief"],
        allowedCommands: ["back"],
      },
      guidedFlow: { id: "flow-1" },
      noop: false,
    });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          commandId: "cmd-1",
          expectedRevision: 0,
          command: { type: "select_path", path: "from_zero" },
        }),
      }),
      { params: Promise.resolve({ threadId: "t1" }) }
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.presentation.currentStep).toBe("collect_brief");
  });

  it("returns 409 on revision conflict", async () => {
    mockApply.mockRejectedValue(
      new GuidedFlowRevisionConflictError("Journey revision conflict", {
        path: "from_zero",
        revision: 3,
      } as never)
    );

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          commandId: "cmd-2",
          expectedRevision: 1,
          command: { type: "back" },
        }),
      }),
      { params: Promise.resolve({ threadId: "t1" }) }
    );

    expect(response.status).toBe(409);
  });

  it("returns 400 on invalid transition", async () => {
    mockApply.mockRejectedValue(new GuidedFlowValidationError("Cannot go back"));

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          commandId: "cmd-3",
          expectedRevision: 2,
          command: { type: "back" },
        }),
      }),
      { params: Promise.resolve({ threadId: "t1" }) }
    );

    expect(response.status).toBe(400);
  });
});

describe("POST /api/assistant/threads/[threadId]/guided-flow/commands on the free plan (ticket 11, part 2)", () => {
  const validEnvelope = { commandId: "cmd-1", expectedRevision: 0, command: { type: "select_path", path: "from_zero" } };
  const post = (body: unknown) =>
    POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
      { params: Promise.resolve({ threadId: "t1" }) }
    );

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetThread.mockReset();
    mockGetThread.mockResolvedValue(thread as Awaited<ReturnType<typeof getAssistantThreadById>>);
    mockApply.mockReset();
    freePlan.find.mockReset();
    freePlan.find.mockResolvedValue(null);
  });

  afterEach(() => {
    freePlan.find.mockReset();
    freePlan.find.mockResolvedValue(null);
  });

  it.each([
    ["a valid command", validEnvelope],
    ["an invalid envelope", { nope: true }],
    ["a body that is not JSON", "{not json"],
  ])("refuses with 402 free_plan, before reading the thread or applying the command, with %s", async (_label, body) => {
    freePlan.find.mockResolvedValue({ accountId: "acc-free" });

    const response = await post(body);
    const json = await response.json();

    expect(response.status).toBe(402);
    expect(json.code).toBe("free_plan");
    expect(json.details).toMatchObject({ recommendedAction: "plan_request", reason: "free_plan", accountId: "acc-free" });
    expect(freePlan.find).toHaveBeenCalledTimes(1);
    expect(freePlan.find).toHaveBeenCalledWith("workspace-1");
    expect(mockGetThread).not.toHaveBeenCalled();
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("does not refuse outside the free plan: asks the rule with the workspace id and applies the command", async () => {
    mockApply.mockResolvedValue({ presentation: { currentStep: "collect_brief" }, guidedFlow: { id: "flow-1" }, noop: false } as never);

    const response = await post(validEnvelope);

    expect(response.status).toBe(200);
    expect(freePlan.find).toHaveBeenCalledTimes(1);
    expect(freePlan.find).toHaveBeenCalledWith("workspace-1");
    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(mockApply).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "workspace-1", threadId: "t1" }));
  });
});
