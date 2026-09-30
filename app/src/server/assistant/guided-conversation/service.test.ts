import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/client-reference", () => ({ getClientReferencesByIds: vi.fn() }));
vi.mock("@/server/repositories/workspace-asset", () => ({ getAssetIdsVisibleToBrand: vi.fn() }));
vi.mock("@/server/repositories/guided-flow-transition", () => ({ getGuidedFlowTransitionByCommand: vi.fn() }));
vi.mock("@/server/repositories/guided-flow", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/repositories/guided-flow")>()),
  getGuidedFlowByThread: vi.fn(),
  applyGuidedFlowCommand: vi.fn(),
}));
vi.mock("@/server/assistant/guided-flow-telemetry", () => ({ emitGuidedFlowTelemetry: vi.fn() }));
vi.mock("@/server/assistant/guided-paths/existing-creative", () => ({ analyzeExistingCreativeForJourney: vi.fn() }));

import { getClientReferencesByIds } from "@/server/repositories/client-reference";
import { getAssetIdsVisibleToBrand } from "@/server/repositories/workspace-asset";
import { applyGuidedFlowCommand, getGuidedFlowByThread, GuidedFlowValidationError } from "@/server/repositories/guided-flow";
import { getGuidedFlowTransitionByCommand } from "@/server/repositories/guided-flow-transition";
import { applyGuidedConversationCommand } from "./service";

const mockClientReferences = vi.mocked(getClientReferencesByIds);
const mockVisibleAssets = vi.mocked(getAssetIdsVisibleToBrand);
const mockGetFlow = vi.mocked(getGuidedFlowByThread);
const mockApply = vi.mocked(applyGuidedFlowCommand);
const mockTransition = vi.mocked(getGuidedFlowTransitionByCommand);

const BRAND_B = "brand-B";
const flowRow = {
  id: "flow-1", workspaceId: "ws-1", clientProfileId: BRAND_B, threadId: "thread-1", path: "from_zero", status: "active",
  currentStep: "select_references", slots: {}, missingFields: [], assetIds: [], referenceIds: [], campaignId: null,
  revision: 0, schemaVersion: 1, recoverableError: null, createdAt: new Date(), updatedAt: new Date(),
} as unknown as NonNullable<Awaited<ReturnType<typeof getGuidedFlowByThread>>>;

function setReferences(referenceIds: string[]) {
  return applyGuidedConversationCommand({
    workspaceId: "ws-1", threadId: "thread-1", clientProfileId: BRAND_B,
    envelope: { commandId: "cmd-1", expectedRevision: 0, command: { type: "set_references", referenceIds } },
  });
}

describe("applyGuidedConversationCommand: set_references is scoped to the thread's brand (PR 612 review)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFlow.mockResolvedValue(flowRow);
    mockTransition.mockResolvedValue(null as never);
    mockClientReferences.mockResolvedValue([]);
    mockApply.mockResolvedValue({ ...flowRow, currentStep: "confirm_plan", revision: 1 } as never);
  });

  it("refuses an existing asset that belongs to another brand, and saves nothing", async () => {
    // Brand A's image is a row of this workspace, but the thread's brand cannot see it.
    mockVisibleAssets.mockResolvedValue(["asset-own", "asset-shared"]);

    await expect(setReferences(["asset-own", "asset-shared", "asset-of-brand-A"])).rejects.toThrow(GuidedFlowValidationError);

    expect(mockApply).not.toHaveBeenCalled();
  });

  it("asks for visibility in the thread's brand, only for the ids that are not its client references", async () => {
    mockClientReferences.mockResolvedValue([
      { id: "ref-own", clientProfileId: BRAND_B },
      { id: "ref-of-brand-A", clientProfileId: "brand-A" },
    ] as never);
    mockVisibleAssets.mockResolvedValue(["asset-shared"]);

    await expect(setReferences(["ref-own", "ref-of-brand-A", "asset-shared"])).rejects.toThrow(GuidedFlowValidationError);

    // A client reference of another brand is never smuggled in through the asset lookup.
    expect(mockVisibleAssets).toHaveBeenCalledWith("ws-1", BRAND_B, ["ref-of-brand-A", "asset-shared"]);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("accepts the brand's own client references plus assets visible to the brand", async () => {
    mockClientReferences.mockResolvedValue([{ id: "ref-own", clientProfileId: BRAND_B }] as never);
    mockVisibleAssets.mockResolvedValue(["asset-own", "asset-shared"]);

    await setReferences(["ref-own", "asset-own", "asset-shared"]);

    expect(mockApply).toHaveBeenCalledWith(expect.objectContaining({
      patch: expect.objectContaining({ referenceIds: ["ref-own", "asset-own", "asset-shared"] }),
    }));
  });
});
