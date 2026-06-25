import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { revalidateOnConfirm } from "@/server/assistant/action-contracts/validate";
import {
  AssistantActionValidationError,
  confirmAssistantAction,
  InvalidActionTransitionError,
} from "@/server/repositories/assistant-action";
import { executeConfirmedAssistantAction } from "@/server/assistant/action-execution/execute";
import { POST } from "./route";

const mockRequireWorkspaceAccess = vi.mocked(requireWorkspaceAccess);
const mockRevalidateOnConfirm = vi.mocked(revalidateOnConfirm);
const mockConfirmAssistantAction = vi.mocked(confirmAssistantAction);
const mockExecuteConfirmed = vi.mocked(executeConfirmedAssistantAction);

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
  });

  it("returns 200 with executed action when revalidation passes", async () => {
    const confirmedAction = {
      id: ACTION_ID,
      workspaceId: "workspace-1",
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
    expect(mockRevalidateOnConfirm).toHaveBeenCalledWith("workspace-1", ACTION_ID);
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
