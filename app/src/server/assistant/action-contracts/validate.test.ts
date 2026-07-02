import { describe, it, expect, vi, beforeEach } from "vitest";
import { AssistantActionValidationError } from "@/server/repositories/assistant-action";
import { validateProposeAction } from "./validate";

vi.mock("@/server/auth/workspace", () => ({
  requireRole: vi.fn(),
  WorkspaceAuthError: class WorkspaceAuthError extends Error {
    constructor(public code: string, message: string) {
      super(message);
      this.name = "WorkspaceAuthError";
    }
  },
}));

import { requireRole, WorkspaceAuthError } from "@/server/auth/workspace";

const mockRequireRole = vi.mocked(requireRole);

const BASE_CREATIVE_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const STYLE_REFERENCE_ID = "b1ffcd00-ad1c-5fe9-cc7e-7cc0ce491b22";

const ctx = {
  workspaceId: "ws-1",
  clientProfileId: "profile-1",
  threadId: "thread-1",
  userId: "user-1",
};

describe("validateProposeAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue({ role: "member" });
  });

  it("throws unknown_action_type for unregistered actionType", async () => {
    await expect(
      validateProposeAction(ctx, {
        actionType: "restyle",
        label: "Restyle",
        inputSnapshot: { baseCreativeId: BASE_CREATIVE_ID },
      })
    ).rejects.toThrow(
      new AssistantActionValidationError("unknown_action_type")
    );
  });

  it("throws invalid_action_inputs when required field is missing", async () => {
    await expect(
      validateProposeAction(ctx, {
        actionType: "quick_restyle",
        label: "Restyle rápido",
        inputSnapshot: {},
      })
    ).rejects.toThrow(
      new AssistantActionValidationError("invalid_action_inputs")
    );
  });

  it("succeeds for quick_restyle with only baseCreativeId and includes risk copy", async () => {
    const result = await validateProposeAction(ctx, {
      actionType: "quick_restyle",
      label: "Restyle rápido",
      inputSnapshot: { baseCreativeId: BASE_CREATIVE_ID },
    });

    const riskCopyLines = result.display.riskCopyLines;
    expect(riskCopyLines).toHaveLength(1);
    expect(riskCopyLines[0]).toContain("referência de estilo");
    expect(mockRequireRole).toHaveBeenCalledWith("ws-1", "user-1", [
      "owner",
      "admin",
      "member",
    ]);
  });

  it("returns empty riskCopyLines when styleReferenceId is present", async () => {
    const result = await validateProposeAction(ctx, {
      actionType: "quick_restyle",
      label: "Restyle rápido",
      inputSnapshot: {
        baseCreativeId: BASE_CREATIVE_ID,
        styleReferenceId: STYLE_REFERENCE_ID,
      },
    });

    expect(result.display.riskCopyLines).toEqual([]);
  });

  it("propagates WorkspaceAuthError when role is not allowed", async () => {
    mockRequireRole.mockRejectedValue(
      new WorkspaceAuthError("forbidden", "Forbidden")
    );

    await expect(
      validateProposeAction(ctx, {
        actionType: "quick_restyle",
        label: "Restyle rápido",
        inputSnapshot: { baseCreativeId: BASE_CREATIVE_ID },
      })
    ).rejects.toBeInstanceOf(WorkspaceAuthError);
  });

  it("returns enriched display metadata from contract", async () => {
    const result = await validateProposeAction(ctx, {
      actionType: "quick_restyle",
      label: "Custom label",
      inputSnapshot: { baseCreativeId: BASE_CREATIVE_ID },
    });

    expect(result.display).toEqual({
      label: "Custom label",
      actionType: "quick_restyle",
      intentFamily: "quick_action",
      riskLabel: "medium",
      creditImpact: expect.objectContaining({
        kind: "creditAction",
        action: "restyling",
      }),
      riskCopyLines: [
        "Sem referência de estilo, o resultado pode divergir mais da marca.",
      ],
      confirmationPolicy: "required",
    });
    expect(result.contract.actionType).toBe("quick_restyle");
  });
});
