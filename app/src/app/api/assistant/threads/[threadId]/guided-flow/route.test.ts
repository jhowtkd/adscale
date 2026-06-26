import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PATCH } from "./route";

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

vi.mock("@/server/repositories/guided-flow", () => ({
  getGuidedFlowByThread: vi.fn(),
  upsertGuidedFlow: vi.fn(),
  patchGuidedFlow: vi.fn(),
  GuidedFlowValidationError: class GuidedFlowValidationError extends Error {
    name = "GuidedFlowValidationError";
  },
}));

vi.mock("@/server/assistant/guided-flow-telemetry-lifecycle", () => ({
  emitGuidedFlowLifecycleFromPatch: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import {
  getGuidedFlowByThread,
  patchGuidedFlow,
  upsertGuidedFlow,
  GuidedFlowValidationError,
} from "@/server/repositories/guided-flow";
import { emitGuidedFlowLifecycleFromPatch } from "@/server/assistant/guided-flow-telemetry-lifecycle";

const mockGetThread = vi.mocked(getAssistantThreadById);
const mockGetFlow = vi.mocked(getGuidedFlowByThread);
const mockUpsert = vi.mocked(upsertGuidedFlow);
const mockPatch = vi.mocked(patchGuidedFlow);
const mockEmitLifecycle = vi.mocked(emitGuidedFlowLifecycleFromPatch);

const thread = {
  id: "t1",
  workspaceId: "workspace-1",
  clientProfileId: "profile-1",
  name: "Main",
};

const guidedFlow = {
  id: "flow-1",
  threadId: "t1",
  path: "from_zero",
  status: "active",
  currentStep: "collect_brief",
};

describe("GET /api/assistant/threads/[threadId]/guided-flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when thread missing", async () => {
    mockGetThread.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ threadId: "t1" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 404 when flow missing", async () => {
    mockGetThread.mockResolvedValue(thread as Awaited<ReturnType<typeof getAssistantThreadById>>);
    mockGetFlow.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ threadId: "t1" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns guided flow when present", async () => {
    mockGetThread.mockResolvedValue(thread as Awaited<ReturnType<typeof getAssistantThreadById>>);
    mockGetFlow.mockResolvedValue(guidedFlow as Awaited<ReturnType<typeof getGuidedFlowByThread>>);

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ threadId: "t1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.guidedFlow).toEqual(guidedFlow);
  });
});

describe("PATCH /api/assistant/threads/[threadId]/guided-flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetThread.mockResolvedValue(thread as Awaited<ReturnType<typeof getAssistantThreadById>>);
  });

  it("upserts when no existing flow", async () => {
    mockGetFlow.mockResolvedValue(null);
    mockUpsert.mockResolvedValue(guidedFlow as Awaited<ReturnType<typeof upsertGuidedFlow>>);

    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          path: "from_zero",
          status: "active",
          currentStep: "collect_brief",
        }),
      }),
      { params: Promise.resolve({ threadId: "t1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.guidedFlow).toEqual(guidedFlow);
    expect(mockUpsert).toHaveBeenCalled();
    expect(mockEmitLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        previous: null,
        next: guidedFlow,
      })
    );
  });

  it("patches existing flow by default", async () => {
    mockGetFlow.mockResolvedValue(guidedFlow as Awaited<ReturnType<typeof getGuidedFlowByThread>>);
    mockPatch.mockResolvedValue({
      ...guidedFlow,
      currentStep: "select_references",
    } as Awaited<ReturnType<typeof patchGuidedFlow>>);

    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ currentStep: "select_references" }),
      }),
      { params: Promise.resolve({ threadId: "t1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.guidedFlow.currentStep).toBe("select_references");
    expect(mockPatch).toHaveBeenCalled();
  });

  it("returns 400 on validation error", async () => {
    mockGetFlow.mockResolvedValue(null);
    mockUpsert.mockRejectedValue(new GuidedFlowValidationError("Thread not found"));

    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          path: "from_zero",
          status: "active",
          currentStep: "collect_brief",
        }),
      }),
      { params: Promise.resolve({ threadId: "t1" }) }
    );

    expect(res.status).toBe(400);
  });
});
