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

vi.mock("@/server/assistant/guided-paths/existing-creative", () => ({
  selectExistingCreative: vi.fn(),
}));

vi.mock("@/server/assistant/guided-flow-telemetry", () => ({
  emitGuidedFlowTelemetry: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { selectExistingCreative } from "@/server/assistant/guided-paths/existing-creative";
import { emitGuidedFlowTelemetry } from "@/server/assistant/guided-flow-telemetry";

const mockGetThread = vi.mocked(getAssistantThreadById);
const mockSelect = vi.mocked(selectExistingCreative);
const mockEmit = vi.mocked(emitGuidedFlowTelemetry);

const thread = {
  id: "t1",
  workspaceId: "workspace-1",
  clientProfileId: "profile-1",
};

describe("POST /guided-flow/select-creative", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetThread.mockResolvedValue(thread as Awaited<ReturnType<typeof getAssistantThreadById>>);
  });

  it("records input supplied telemetry after creative selection", async () => {
    mockSelect.mockResolvedValue({
      campaignId: "camp-1",
      campaignAssetId: "asset-1",
      guidedFlow: {
        id: "flow-1",
        path: "existing_creative",
        currentStep: "review_diagnosis",
        assetIds: ["asset-1"],
        campaignId: "camp-1",
      },
      briefingSnapshot: {} as never,
      diagnosis: {} as never,
      missingFields: [],
    });

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ workspaceAssetId: "00000000-0000-4000-8000-000000000001" }),
      }),
      { params: Promise.resolve({ threadId: "t1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "guided_input_supplied",
        metadata: expect.objectContaining({ inputType: "asset" }),
      })
    );
  });
});
