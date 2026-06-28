import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  ARTIFACT_ITERATION_EVENT_KEYS,
  ARTIFACT_ITERATION_REASON_CODES,
  ArtifactIterationTelemetrySanitizationError,
  recordArtifactIterationTelemetryEvent,
  sanitizeArtifactIterationMetadata,
} from "./artifact-iteration-telemetry";

vi.mock("@/server/repositories/artifact-iteration-telemetry", () => ({
  insertArtifactIterationTelemetryEvent: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      warn: vi.fn(),
    }),
  },
}));

import { insertArtifactIterationTelemetryEvent } from "@/server/repositories/artifact-iteration-telemetry";

const mockInsert = vi.mocked(insertArtifactIterationTelemetryEvent);

const baseInput = {
  workspaceId: "ws-1",
  clientProfileId: "profile-1",
  threadId: "thread-1",
  campaignId: null,
  path: "plan_iteration" as const,
  step: "propose",
  eventKey: "proposal_created" as const,
};

describe("artifact-iteration telemetry contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({
      id: "event-1",
      ...baseInput,
      actionRecordId: null,
      reasonCode: null,
      metadata: {},
      occurredAt: new Date(),
      createdAt: new Date(),
    } as Awaited<ReturnType<typeof insertArtifactIterationTelemetryEvent>>);
  });

  it("exports stable event keys and reason codes", () => {
    expect(ARTIFACT_ITERATION_EVENT_KEYS).toHaveLength(12);
    expect(ARTIFACT_ITERATION_EVENT_KEYS).toContain("promotion_succeeded");
    expect(ARTIFACT_ITERATION_REASON_CODES).toContain("head_conflict");
  });

  it("sanitizes allowed metadata keys", () => {
    expect(
      sanitizeArtifactIterationMetadata({
        artifactType: "plan",
        lineageId: "lineage-1",
        versionNumber: 2,
        idempotent: false,
      })
    ).toEqual({
      artifactType: "plan",
      lineageId: "lineage-1",
      versionNumber: 2,
      idempotent: false,
    });
  });

  it("rejects denied persistence keys in metadata", () => {
    expect(() =>
      sanitizeArtifactIterationMetadata({ reasoning: "hidden chain of thought" })
    ).toThrow(ArtifactIterationTelemetrySanitizationError);
  });

  it("rejects unknown metadata keys", () => {
    expect(() =>
      sanitizeArtifactIterationMetadata({ prompt: "do not store" })
    ).toThrow(ArtifactIterationTelemetrySanitizationError);
  });

  it("records sanitized events via repository", async () => {
    await recordArtifactIterationTelemetryEvent({
      ...baseInput,
      metadata: { artifactType: "plan", proposalId: "proposal-1" },
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "proposal_created",
        metadata: { artifactType: "plan", proposalId: "proposal-1" },
      })
    );
  });

  it("does not throw when repository insert fails", async () => {
    mockInsert.mockRejectedValue(new Error("db down"));

    await expect(
      recordArtifactIterationTelemetryEvent(baseInput)
    ).resolves.toBeUndefined();
  });
});
