import { afterEach, describe, expect, it, vi } from "vitest";

import { logImagePipelineStage } from "./image-pipeline-telemetry";

describe("logImagePipelineStage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits one searchable JSON line with the existing correlation fields", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    logImagePipelineStage({
      inngestRunId: "run-123",
      inngestAttempt: 2,
      workId: "work-123",
      outputId: "output-123",
      workspaceId: "workspace-123",
      jobType: "creative_work",
      stage: "generation",
      status: "completed",
      stageElapsedMs: 1200,
    });

    expect(info).toHaveBeenCalledOnce();
    expect(info.mock.calls[0]).toHaveLength(1);
    expect(JSON.parse(String(info.mock.calls[0][0]))).toMatchObject({
      event: "image_pipeline_stage",
      level: "info",
      inngestRunId: "run-123",
      inngestAttempt: 2,
      workId: "work-123",
      outputId: "output-123",
      workspaceId: "workspace-123",
      jobType: "creative_work",
      stage: "generation",
      status: "completed",
      stageElapsedMs: 1200,
    });
  });

  it("reports a sink failure without changing the generation outcome", () => {
    vi.spyOn(console, "info").mockImplementation(() => {
      throw new Error("sink unavailable");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(() =>
      logImagePipelineStage({
        inngestRunId: "run-123",
        workId: "work-123",
        outputId: "output-123",
        workspaceId: "workspace-123",
        jobType: "creative_work",
        stage: "generation",
        status: "completed",
      })
    ).not.toThrow();

    expect(warn).toHaveBeenCalledOnce();
    expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({
      event: "image_pipeline_telemetry_emit_failed",
      level: "warn",
      sourceEvent: "image_pipeline_stage",
      inngestRunId: "run-123",
      workId: "work-123",
      outputId: "output-123",
      workspaceId: "workspace-123",
      jobType: "creative_work",
      stage: "generation",
      status: "completed",
      errorMessage: "sink unavailable",
    });
  });

  it("keeps nested error details in the structured event", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    logImagePipelineStage({
      stage: "generation",
      status: "failed",
      providerError: new Error("provider unavailable"),
    });

    expect(JSON.parse(String(info.mock.calls[0][0]))).toMatchObject({
      event: "image_pipeline_stage",
      providerError: {
        name: "Error",
        message: "provider unavailable",
      },
    });
  });
});
