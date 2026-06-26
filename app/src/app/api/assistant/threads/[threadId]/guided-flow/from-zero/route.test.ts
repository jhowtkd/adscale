import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

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

vi.mock("@/server/assistant/guided-paths/from-zero", () => ({
  saveFromZeroBrief: vi.fn(),
  saveFromZeroReferences: vi.fn(),
}));

vi.mock("@/server/assistant/guided-flow-telemetry", () => ({
  emitGuidedFlowTelemetry: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { saveFromZeroBrief } from "@/server/assistant/guided-paths/from-zero";
import { emitGuidedFlowTelemetry } from "@/server/assistant/guided-flow-telemetry";
import { GuidedFlowValidationError } from "@/server/repositories/guided-flow";

const mockGetThread = vi.mocked(getAssistantThreadById);
const mockSaveBrief = vi.mocked(saveFromZeroBrief);
const mockEmit = vi.mocked(emitGuidedFlowTelemetry);

const thread = {
  id: "t1",
  workspaceId: "workspace-1",
  clientProfileId: "profile-1",
};

describe("POST /guided-flow/from-zero", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetThread.mockResolvedValue(thread as Awaited<ReturnType<typeof getAssistantThreadById>>);
  });

  it("records blocker telemetry when brief is incomplete", async () => {
    mockSaveBrief.mockRejectedValue(
      new GuidedFlowValidationError("Brief incomplete — missing step: offer")
    );

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          kind: "brief",
          answers: { product: "Test" },
        }),
      }),
      { params: Promise.resolve({ threadId: "t1" }) }
    );

    expect(res.status).toBe(400);
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "guided_action_blocked",
        blockerCategory: "missing_brief_fields",
      })
    );
  });
});
