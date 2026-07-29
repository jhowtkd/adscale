import { afterEach, describe, expect, it, vi } from "vitest";

import {
  logImagePipelineStage,
  observeImagePipelineExternalCall,
} from "./image-pipeline-telemetry";

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

  it("records external call type, duration, result and attempt without retrying", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await expect(observeImagePipelineExternalCall({
      callType: "image",
      attempt: 2,
      workspaceId: "workspace-1",
      workId: "work-1",
      outputId: "output-1",
      generationCorrelationId: "generation-1",
      jobType: "creative_work",
    }, async () => "candidate")).resolves.toBe("candidate");

    expect(JSON.parse(String(info.mock.calls[0]?.[0]))).toMatchObject({
      event: "image_pipeline_external_call",
      callType: "image",
      attempt: 2,
      generationCorrelationId: "generation-1",
      result: "success",
      durationMs: expect.any(Number),
    });
  });

  it("reports a failed external call and rethrows without an automatic retry", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const failure = new Error("provider unavailable");

    await expect(observeImagePipelineExternalCall({
      callType: "selector",
      attempt: 1,
      workId: "work-1",
    }, async () => { throw failure; })).rejects.toBe(failure);

    expect(info.mock.calls.map(([line]) => JSON.parse(String(line)))).toEqual(expect.arrayContaining([
      expect.objectContaining({ callType: "selector", attempt: 1, result: "failed", errorMessage: "provider unavailable" }),
    ]));
    expect(info).toHaveBeenCalledTimes(1);
  });
});
