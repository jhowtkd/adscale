import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  FROM_ZERO_MIN_REFERENCES,
  buildFromZeroPromptAugment,
  saveFromZeroBrief,
  saveFromZeroReferences,
} from "./from-zero";

vi.mock("@/server/repositories/guided-flow", () => ({
  GuidedFlowValidationError: class GuidedFlowValidationError extends Error {
    name = "GuidedFlowValidationError";
  },
  getGuidedFlowByThread: vi.fn(),
  patchGuidedFlow: vi.fn(),
}));

import { getGuidedFlowByThread, patchGuidedFlow } from "@/server/repositories/guided-flow";

const mockGetFlow = vi.mocked(getGuidedFlowByThread);
const mockPatch = vi.mocked(patchGuidedFlow);

const baseFlow = {
  id: "flow-1",
  path: "from_zero",
  currentStep: "collect_brief",
  slots: {},
  missingFields: [],
  referenceIds: [],
};

const completeAnswers = {
  product: "Shoes",
  offer: "50% off",
  audience: "Runners",
  promise: "Comfort",
  objections: "Price",
  cta: "Buy now",
  platforms: "Meta",
  constraints: "No red",
};

describe("buildFromZeroPromptAugment", () => {
  it("returns augment at confirm_plan", () => {
    const augment = buildFromZeroPromptAugment({
      currentStep: "confirm_plan",
      slots: { briefSnapshot: { offer: "Sale" } },
      referenceIds: ["a", "b", "c"],
    });
    expect(augment).toContain("creative plan");
    expect(augment).toContain("3 visual references");
  });
});

describe("saveFromZeroBrief", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFlow.mockResolvedValue(baseFlow as Awaited<ReturnType<typeof getGuidedFlowByThread>>);
    mockPatch.mockResolvedValue({
      ...baseFlow,
      currentStep: "review_brief",
    } as Awaited<ReturnType<typeof patchGuidedFlow>>);
  });

  it("rejects incomplete brief", async () => {
    await expect(
      saveFromZeroBrief({
        workspaceId: "ws-1",
        threadId: "t-1",
        clientProfileId: "cp-1",
        answers: { product: "Only product" },
      })
    ).rejects.toThrow(/Brief incomplete/);
  });

  it("advances to review_brief when complete", async () => {
    const result = await saveFromZeroBrief({
      workspaceId: "ws-1",
      threadId: "t-1",
      clientProfileId: "cp-1",
      answers: completeAnswers,
    });
    expect(mockPatch).toHaveBeenCalledWith(
      "ws-1",
      "t-1",
      "cp-1",
      expect.objectContaining({ currentStep: "review_brief" })
    );
    expect(result.guidedFlow.currentStep).toBe("review_brief");
  });
});

describe("saveFromZeroReferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFlow.mockResolvedValue({
      ...baseFlow,
      currentStep: "select_references",
    } as Awaited<ReturnType<typeof getGuidedFlowByThread>>);
    mockPatch.mockResolvedValue({
      ...baseFlow,
      currentStep: "confirm_plan",
      referenceIds: ["r1", "r2", "r3"],
    } as Awaited<ReturnType<typeof patchGuidedFlow>>);
  });

  it(`requires at least ${FROM_ZERO_MIN_REFERENCES} references`, async () => {
    await expect(
      saveFromZeroReferences({
        workspaceId: "ws-1",
        threadId: "t-1",
        clientProfileId: "cp-1",
        referenceIds: ["r1", "r2"],
      })
    ).rejects.toThrow(/At least 3 visual references/);
  });

  it("advances to confirm_plan with enough references", async () => {
    const result = await saveFromZeroReferences({
      workspaceId: "ws-1",
      threadId: "t-1",
      clientProfileId: "cp-1",
      referenceIds: ["r1", "r2", "r3"],
    });
    expect(result.referenceIds).toHaveLength(3);
    expect(result.guidedFlow.currentStep).toBe("confirm_plan");
  });
});
