import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  GUIDED_FLOW_BLOCKER_CATEGORIES,
  GUIDED_FLOW_EVENT_KEYS,
  GuidedFlowTelemetrySanitizationError,
  recordGuidedFlowTelemetryEvent,
  sanitizeGuidedFlowMetadata,
} from "./guided-flow-telemetry";

vi.mock("@/server/repositories/guided-flow-telemetry", () => ({
  insertGuidedFlowTelemetryEvent: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      warn: vi.fn(),
    }),
  },
}));

import { insertGuidedFlowTelemetryEvent } from "@/server/repositories/guided-flow-telemetry";

const mockInsert = vi.mocked(insertGuidedFlowTelemetryEvent);

const baseInput = {
  workspaceId: "ws-1",
  clientProfileId: "profile-1",
  threadId: "thread-1",
  guidedFlowId: "flow-1",
  path: "existing_creative",
  step: "select_creative",
  eventKey: "guided_flow_started" as const,
};

describe("guided-flow telemetry contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({
      id: "event-1",
      ...baseInput,
      blockerCategory: null,
      actionRecordId: null,
      campaignId: null,
      metadata: {},
      occurredAt: new Date(),
      createdAt: new Date(),
    } as Awaited<ReturnType<typeof insertGuidedFlowTelemetryEvent>>);
  });

  it("exports stable event keys and blocker categories", () => {
    expect(GUIDED_FLOW_EVENT_KEYS).toContain("guided_flow_completed");
    expect(GUIDED_FLOW_BLOCKER_CATEGORIES).toContain("missing_references");
  });

  it("sanitizes allowed metadata keys", () => {
    expect(
      sanitizeGuidedFlowMetadata({
        inputType: "brief",
        referenceCount: 3,
        isRetry: false,
      })
    ).toEqual({
      inputType: "brief",
      referenceCount: 3,
      isRetry: false,
    });
  });

  it("rejects denied persistence keys in metadata", () => {
    expect(() =>
      sanitizeGuidedFlowMetadata({ reasoning: "hidden chain of thought" })
    ).toThrow(GuidedFlowTelemetrySanitizationError);
  });

  it("rejects unknown metadata keys", () => {
    expect(() =>
      sanitizeGuidedFlowMetadata({ prompt: "do not store" })
    ).toThrow(GuidedFlowTelemetrySanitizationError);
  });

  it("records sanitized events via repository", async () => {
    await recordGuidedFlowTelemetryEvent({
      ...baseInput,
      metadata: { inputType: "asset", assetCount: 1 },
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "guided_flow_started",
        metadata: { inputType: "asset", assetCount: 1 },
      })
    );
  });

  it("does not throw when repository insert fails", async () => {
    mockInsert.mockRejectedValue(new Error("db down"));

    await expect(
      recordGuidedFlowTelemetryEvent(baseInput)
    ).resolves.toBeUndefined();
  });
});
