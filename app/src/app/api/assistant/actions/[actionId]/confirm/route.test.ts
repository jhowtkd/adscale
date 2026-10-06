import { beforeEach, describe, expect, it, vi } from "vitest";

const freePlan = vi.hoisted(() => ({ find: vi.fn(async (): Promise<{ accountId: string } | null> => null) }));
vi.mock("@/server/equipe/module/free-plan", () => ({ findFreePlanAccount: (...args: unknown[]) => (freePlan.find as (...a: unknown[]) => unknown)(...args) }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1", name: "Workspace" },
    })
  ),
  WorkspaceAuthError: class WorkspaceAuthError extends Error {
    constructor(public code: string, message: string) {
      super(message);
      this.name = "WorkspaceAuthError";
    }
  },
}));

vi.mock("@/server/assistant/action-contracts/validate", () => ({
  revalidateOnConfirm: vi.fn(),
}));

vi.mock("@/server/repositories/user", () => ({
  getUserLocale: vi.fn(() => Promise.resolve("pt-BR")),
}));

vi.mock("@/server/assistant/action-execution/execute", () => ({
  executeConfirmedAssistantAction: vi.fn(),
  AssistantActionExecutionError: class AssistantActionExecutionError extends Error {
    constructor(message: string, public code: string) {
      super(message);
      this.name = "AssistantActionExecutionError";
    }
  },
}));

vi.mock("@/server/repositories/assistant-action", () => ({
  confirmAssistantAction: vi.fn(),
  InvalidActionTransitionError: class InvalidActionTransitionError extends Error {
    constructor(from: string, to: string) {
      super(`Invalid action transition: ${from} -> ${to}`);
      this.name = "InvalidActionTransitionError";
    }
  },
  AssistantActionValidationError: class AssistantActionValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AssistantActionValidationError";
    }
  },
}));

vi.mock("@/server/repositories/assistant-message", () => ({
  getAssistantMessageById: vi.fn(),
}));

vi.mock("@/server/repositories/guided-flow", () => ({
  getGuidedFlowByThread: vi.fn(),
}));

vi.mock("@/server/assistant/guided-flow-telemetry-lifecycle", () => ({
  emitGuidedFlowActionConfirmed: vi.fn(),
}));

import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getAssistantMessageById } from "@/server/repositories/assistant-message";
import { getGuidedFlowByThread } from "@/server/repositories/guided-flow";
import { revalidateOnConfirm } from "@/server/assistant/action-contracts/validate";
import {
  AssistantActionValidationError,
  confirmAssistantAction,
  InvalidActionTransitionError,
} from "@/server/repositories/assistant-action";
import {
  AssistantActionExecutionError,
  executeConfirmedAssistantAction,
} from "@/server/assistant/action-execution/execute";
import { POST } from "./route";

const mockRequireWorkspaceAccess = vi.mocked(requireWorkspaceAccess);
const mockRevalidateOnConfirm = vi.mocked(revalidateOnConfirm);
const mockConfirmAssistantAction = vi.mocked(confirmAssistantAction);
const mockExecuteConfirmed = vi.mocked(executeConfirmedAssistantAction);
const mockGetMessage = vi.mocked(getAssistantMessageById);
const mockGetFlow = vi.mocked(getGuidedFlowByThread);

const ACTION_ID = "action-1";

function confirmRequest() {
  return POST(
    new Request(`http://localhost/api/assistant/actions/${ACTION_ID}/confirm`, {
      method: "POST",
    }),
    { params: Promise.resolve({ actionId: ACTION_ID }) }
  );
}

describe("POST /api/assistant/actions/[actionId]/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRevalidateOnConfirm.mockResolvedValue(undefined);
    mockGetMessage.mockResolvedValue({
      payload: { display: { actionType: "quick_restyle" } },
    } as Awaited<ReturnType<typeof getAssistantMessageById>>);
    mockGetFlow.mockResolvedValue(null);
  });

  it("returns 200 with executed action when revalidation passes", async () => {
    const confirmedAction = {
      id: ACTION_ID,
      workspaceId: "workspace-1",
      threadId: "thread-1",
      messageId: "message-1",
      status: "confirmed",
    };
    const runningAction = {
      ...confirmedAction,
      status: "running",
    };
    mockConfirmAssistantAction.mockResolvedValue(
      confirmedAction as Awaited<ReturnType<typeof confirmAssistantAction>>
    );
    mockExecuteConfirmed.mockResolvedValue(
      runningAction as Awaited<ReturnType<typeof executeConfirmedAssistantAction>>
    );

    const res = await confirmRequest();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.action).toEqual(runningAction);
    expect(mockRevalidateOnConfirm).toHaveBeenCalledWith("workspace-1", ACTION_ID, "user-1");
    expect(mockConfirmAssistantAction).toHaveBeenCalledWith("workspace-1", ACTION_ID);
    expect(mockExecuteConfirmed).toHaveBeenCalledWith(
      "workspace-1",
      ACTION_ID,
      "user-1",
      "pt-BR"
    );
  });

  it("returns 400 invalidInput when snapshot fails revalidation", async () => {
    mockRevalidateOnConfirm.mockRejectedValue(
      new AssistantActionValidationError("invalid_action_inputs")
    );

    const res = await confirmRequest();
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("invalidInput");
    expect(mockConfirmAssistantAction).not.toHaveBeenCalled();
  });

  it("returns 400 invalidInput when action is already confirmed", async () => {
    mockRevalidateOnConfirm.mockRejectedValue(
      new InvalidActionTransitionError("confirmed", "confirmed")
    );

    const res = await confirmRequest();
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("invalidInput");
    expect(mockConfirmAssistantAction).not.toHaveBeenCalled();
  });

  it("returns 404 when action is not found after confirm", async () => {
    mockConfirmAssistantAction.mockResolvedValue(null);

    const res = await confirmRequest();
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe("actionNotFound");
  });

  it("enforces requireWorkspaceAccess", async () => {
    const { WorkspaceAuthError, AUTH_ERROR_CODES } = await import(
      "@/server/auth/errors"
    );
    mockRequireWorkspaceAccess.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized")
    );

    const res = await confirmRequest();
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe("unauthorized");
    expect(mockRevalidateOnConfirm).not.toHaveBeenCalled();
    expect(mockConfirmAssistantAction).not.toHaveBeenCalled();
  });
});

describe("POST /api/assistant/actions/[actionId]/confirm: the free plan (ticket 11, part 2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    freePlan.find.mockReset();
    freePlan.find.mockResolvedValue(null);
    mockRequireWorkspaceAccess.mockResolvedValue({
      user: { id: "user-1" },
      workspace: { id: "workspace-1", name: "Workspace" },
    } as Awaited<ReturnType<typeof requireWorkspaceAccess>>);
    mockRevalidateOnConfirm.mockResolvedValue(undefined);
    mockGetMessage.mockResolvedValue({ payload: { display: { actionType: "quick_restyle" } } } as never);
    mockGetFlow.mockResolvedValue(null as never);
  });

  const freeCases = [
    ["the pre-flight spend check (validation error free_plan)", () => mockRevalidateOnConfirm.mockRejectedValue(new AssistantActionValidationError("free_plan"))],
    ["the execution refused for credit (credit_blocked)", () => {
      mockConfirmAssistantAction.mockResolvedValue({ id: ACTION_ID } as never);
      mockExecuteConfirmed.mockRejectedValue(new AssistantActionExecutionError("credit_blocked", "credit_blocked"));
    }],
  ] as const;

  it.each(freeCases)("on the free plan, %s answers 402 free_plan with the plan request and the account", async (_name, arrange) => {
    arrange();
    freePlan.find.mockResolvedValue({ accountId: "acc-free" });

    const res = await confirmRequest();

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe("free_plan");
    expect(body.details).toMatchObject({ reason: "free_plan", recommendedAction: "plan_request", accountId: "acc-free" });
    expect(freePlan.find).toHaveBeenCalledWith("workspace-1");
  });

  it("paid or classic: an execution refused for credit is the same 402 insufficientCredits as before", async () => {
    freeCases[1][1]();

    const res = await confirmRequest();

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe("insufficientCredits");
    expect(body.details).toBeUndefined();
  });

  it("paid or classic: the other validation reasons stay 400 invalidInput (the rule was asked once, at the entry, and said classic)", async () => {
    mockRevalidateOnConfirm.mockRejectedValue(new AssistantActionValidationError("insufficient_credits"));

    const res = await confirmRequest();

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalidInput");
    expect(freePlan.find).toHaveBeenCalledTimes(1);
  });

  it("on the free plan the entry guard refuses first: 402 free_plan, and nothing is revalidated, confirmed or executed", async () => {
    freePlan.find.mockResolvedValue({ accountId: "acc-free" });

    const res = await confirmRequest();

    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe("free_plan");
    expect(mockRevalidateOnConfirm).not.toHaveBeenCalled();
    expect(mockConfirmAssistantAction).not.toHaveBeenCalled();
    expect(mockExecuteConfirmed).not.toHaveBeenCalled();
  });

  it("a validation reason free_plan with the rule now null is still 402 (the spend was refused; code and status stay), and nothing runs", async () => {
    freeCases[0][1]();

    const res = await confirmRequest();

    expect(res.status).toBe(402);
    expect(mockConfirmAssistantAction).not.toHaveBeenCalled();
    expect(mockExecuteConfirmed).not.toHaveBeenCalled();
  });
});
