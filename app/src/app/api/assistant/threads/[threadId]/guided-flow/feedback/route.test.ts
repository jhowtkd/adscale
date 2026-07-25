import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("@/server/auth/require-platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: vi.fn(),
}));

vi.mock("@/server/repositories/guided-flow", () => ({
  getGuidedFlowByThread: vi.fn(),
}));

vi.mock("@/server/repositories/guided-flow-feedback", () => ({
  insertGuidedFlowFeedback: vi.fn(),
  listGuidedFlowFeedbackByThread: vi.fn(),
  GuidedFlowFeedbackValidationError: class GuidedFlowFeedbackValidationError extends Error {
    name = "GuidedFlowFeedbackValidationError";
  },
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { getGuidedFlowByThread } from "@/server/repositories/guided-flow";
import { insertGuidedFlowFeedback } from "@/server/repositories/guided-flow-feedback";

const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockGetThread = vi.mocked(getAssistantThreadById);
const mockGetFlow = vi.mocked(getGuidedFlowByThread);
const mockInsert = vi.mocked(insertGuidedFlowFeedback);

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const THREAD_ID = "22222222-2222-4222-8222-222222222222";

const thread = {
  id: THREAD_ID,
  workspaceId: WORKSPACE_ID,
  clientProfileId: "33333333-3333-4333-8333-333333333333",
};

const flow = {
  id: "flow-1",
  path: "existing_creative",
  currentStep: "review_diagnosis",
};

describe("POST /guided-flow/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
    });
    mockGetThread.mockResolvedValue(thread as Awaited<ReturnType<typeof getAssistantThreadById>>);
    mockGetFlow.mockResolvedValue(flow as Awaited<ReturnType<typeof getGuidedFlowByThread>>);
    mockInsert.mockResolvedValue({
      id: "feedback-1",
    } as Awaited<ReturnType<typeof insertGuidedFlowFeedback>>);
  });

  it("records owner feedback with workspace scope", async () => {
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: WORKSPACE_ID,
          feedbackKind: "diagnosis_utility",
          rating: "useful",
        }),
      }),
      { params: Promise.resolve({ threadId: THREAD_ID }) }
    );

    expect(res.status).toBe(201);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        feedbackKind: "diagnosis_utility",
        rating: "useful",
        userId: "owner-1",
      })
    );
  });
});
