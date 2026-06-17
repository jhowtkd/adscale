import { describe, it, expect } from "vitest";
import {
  OUTPUT_LEARNING_APPLICATION_SCHEMA_VERSION,
  buildApplicationSnapshotFromAccept,
  outputLearningApplicationSchema,
  resolveOutputLearningApplication,
  sanitizeOutputLearningApplication,
} from "@/server/human-quality/application-schema";
import type { OutputLearningApplicationSnapshot } from "@/server/human-quality/corpus";

const validRecordedSnapshot: OutputLearningApplicationSnapshot = {
  schemaVersion: 1,
  applied: true,
  resolution: "recorded",
  traceId: "ol-trace-abc123",
  recommendationId: "rec-001",
  primaryVariableKey: "cta_tone",
  algorithmVersion: "1.0.0",
  safetyVersion: "1.0.0",
  learningsSource: "postgres",
};

describe("outputLearningApplicationSchema", () => {
  it("accepts valid snapshot with applied=true and attribution fields", () => {
    const result = outputLearningApplicationSchema.safeParse(validRecordedSnapshot);
    expect(result.success).toBe(true);
  });

  it("rejects forbidden top-level keys", () => {
    const result = outputLearningApplicationSchema.safeParse({
      ...validRecordedSnapshot,
      prompt: "secret prompt",
    });
    expect(result.success).toBe(false);
  });

  it("rejects signedUrl and modelResponse keys", () => {
    for (const key of ["signedUrl", "modelResponse"] as const) {
      const result = outputLearningApplicationSchema.safeParse({
        ...validRecordedSnapshot,
        [key]: "leaked",
      });
      expect(result.success).toBe(false);
    }
  });

  it("rejects unbounded AppliedLearningTrace entries", () => {
    const result = outputLearningApplicationSchema.safeParse({
      ...validRecordedSnapshot,
      entries: [{ learningId: "l1", variableKey: "k", variableValue: "v" }],
    });
    expect(result.success).toBe(false);
  });

  it("requires learningsSource to be postgres", () => {
    const result = outputLearningApplicationSchema.safeParse({
      ...validRecordedSnapshot,
      learningsSource: "mem0",
    });
    expect(result.success).toBe(false);
  });

  it("requires traceId to match /^ol-/ when provided", () => {
    const result = outputLearningApplicationSchema.safeParse({
      ...validRecordedSnapshot,
      traceId: "bad-trace-id",
    });
    expect(result.success).toBe(false);
  });

  it("accepts resolution enum values", () => {
    for (const resolution of ["recorded", "not_recorded", "recommendation_only"] as const) {
      const result = outputLearningApplicationSchema.safeParse({
        schemaVersion: 1,
        applied: resolution === "recorded",
        resolution,
        learningsSource: "postgres",
        ...(resolution === "recorded" && {
          traceId: "ol-trace-1",
          recommendationId: "rec-1",
          primaryVariableKey: "cta_tone",
        }),
      });
      expect(result.success).toBe(true);
    }
  });
});

describe("sanitizeOutputLearningApplication", () => {
  it("strips forbidden keys before returning bounded snapshot", () => {
    const input = {
      ...validRecordedSnapshot,
      prompt: "should be stripped",
      signedUrl: "https://example.com/leak",
    } as Record<string, unknown>;

    const sanitized = sanitizeOutputLearningApplication(input);
    expect(sanitized).toEqual(validRecordedSnapshot);
    expect(sanitized).not.toHaveProperty("prompt");
    expect(sanitized).not.toHaveProperty("signedUrl");
  });
});

describe("buildApplicationSnapshotFromAccept", () => {
  it("maps accept payload into recorded applied snapshot", () => {
    const snapshot = buildApplicationSnapshotFromAccept({
      traceId: "ol-accept-trace",
      recommendationId: "rec-accept",
      primaryVariableKey: "visual_density",
      algorithmVersion: "1.0.0",
      safetyVersion: "1.0.0",
    });

    expect(snapshot).toEqual({
      schemaVersion: OUTPUT_LEARNING_APPLICATION_SCHEMA_VERSION,
      applied: true,
      resolution: "recorded",
      traceId: "ol-accept-trace",
      recommendationId: "rec-accept",
      primaryVariableKey: "visual_density",
      algorithmVersion: "1.0.0",
      safetyVersion: "1.0.0",
      learningsSource: "postgres",
    });
  });
});

describe("resolveOutputLearningApplication", () => {
  it("returns legacy not_recorded snapshot for null/undefined", () => {
    expect(resolveOutputLearningApplication(null)).toEqual({
      schemaVersion: 1,
      applied: false,
      resolution: "not_recorded",
      learningsSource: "postgres",
    });
    expect(resolveOutputLearningApplication(undefined)).toEqual({
      schemaVersion: 1,
      applied: false,
      resolution: "not_recorded",
      learningsSource: "postgres",
    });
  });

  it("returns stored snapshot when present", () => {
    expect(resolveOutputLearningApplication(validRecordedSnapshot)).toEqual(
      validRecordedSnapshot
    );
  });
});
