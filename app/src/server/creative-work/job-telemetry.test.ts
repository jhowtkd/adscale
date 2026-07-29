import { afterEach, describe, expect, it, vi } from "vitest";

import {
  creativeWorkQueueWaitMs,
  logCreativeWorkGenerationLifecycle,
  logCreativeWorkOutputTerminal,
  observeCreativeWorkStage,
} from "./job-telemetry";

describe("creative work generation lifecycle telemetry", () => {
  afterEach(() => vi.restoreAllMocks());

  it("emits an accepted request with the stable generation correlation", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    logCreativeWorkGenerationLifecycle({
      event: "creative_work_generation_requested",
      workspaceId: "workspace-1",
      workItemId: "work-1",
      generationCorrelationId: "generation-1",
      unitCount: 3,
      credits: 15,
      unitChargeAmount: 5,
      result: "accepted",
    });

    expect(JSON.parse(String(info.mock.calls[0]?.[0]))).toMatchObject({
      event: "creative_work_generation_requested",
      jobType: "creative_work",
      generationCorrelationId: "generation-1",
      unitCount: 3,
      credits: 15,
      result: "accepted",
    });
  });

  it("calculates queue wait from persisted timestamps without clock drift", () => {
    expect(creativeWorkQueueWaitMs({
      queueEnteredAt: new Date("2026-07-28T12:00:00.000Z"),
      processingStartedAt: new Date("2026-07-28T12:00:00.250Z"),
    })).toBe(250);
    expect(creativeWorkQueueWaitMs({
      queueEnteredAt: new Date("2026-07-28T12:00:01.000Z"),
      processingStartedAt: new Date("2026-07-28T12:00:00.000Z"),
    })).toBe(0);
  });

  it("emits observable start and completion events with a stable stage name", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await expect(observeCreativeWorkStage(
      {
        workspaceId: "workspace-1",
        workItemId: "work-1",
        outputId: "output-1",
        generationCorrelationId: "generation-1",
        protocol: "social_post",
      },
      "quality_assessment",
      async () => "ok",
    )).resolves.toBe("ok");

    const events = info.mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "creative_work_output_stage",
        generationCorrelationId: "generation-1",
        stage: "quality_assessment",
        status: "started",
      }),
      expect.objectContaining({
        event: "creative_work_output_stage",
        generationCorrelationId: "generation-1",
        stage: "quality_assessment",
        status: "completed",
        result: "success",
        stageDurationMs: expect.any(Number),
      }),
    ]));
  });

  it("emits a failed stage before preserving the operation error", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const failure = new Error("provider unavailable");

    await expect(observeCreativeWorkStage(
      {
        workspaceId: "workspace-1",
        workItemId: "work-1",
        outputId: "output-1",
        generationCorrelationId: "generation-1",
        protocol: "social_post",
      },
      "generate_base",
      async () => { throw failure; },
    )).rejects.toBe(failure);

    expect(info.mock.calls.map(([line]) => JSON.parse(String(line)))).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: "generate_base", status: "failed", result: "failed", detail: "provider unavailable" }),
    ]));
  });

  it("bounds free-form stage error details before logging", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const failure = new Error("x".repeat(700));

    await expect(observeCreativeWorkStage(
      {
        workspaceId: "workspace-1",
        workItemId: "work-1",
        outputId: "output-1",
        protocol: "social_post",
      },
      "generate_base",
      async () => { throw failure; },
    )).rejects.toBe(failure);

    const failed = info.mock.calls
      .map(([line]) => JSON.parse(String(line)))
      .find((event) => event.stage === "generate_base" && event.status === "failed");
    expect(failed).toBeDefined();
    expect(failed?.detail).toHaveLength(501);
    expect(failed?.detail.endsWith("…")).toBe(true);
  });

  it("does not throw when the telemetry sink fails", () => {
    vi.spyOn(console, "info").mockImplementation(() => {
      throw new Error("sink unavailable");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(() => logCreativeWorkGenerationLifecycle({
      event: "creative_work_generation_dispatched",
      workspaceId: "workspace-1",
      workItemId: "work-1",
      generationCorrelationId: "generation-1",
      unitCount: 1,
      outputIds: ["output-1"],
      dispatchDurationMs: 12,
      result: "failed",
    })).not.toThrow();

    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toMatchObject({
      event: "creative_work_telemetry_emit_failed",
      sourceEvent: "creative_work_generation_dispatched",
      generationCorrelationId: "generation-1",
      errorMessage: "sink unavailable",
    });
  });

  it("keeps terminal memory, units, concurrency, and environment in one event", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    logCreativeWorkOutputTerminal({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      outputId: "output-1",
      generationCorrelationId: "generation-1",
      protocol: "social_post",
      unitCount: 3,
      activeUnitCount: 2,
      environment: "render-preview",
      outcome: "completed",
      refunded: false,
      durationMs: 120,
    });

    expect(JSON.parse(String(info.mock.calls[0]?.[0]))).toMatchObject({
      event: "creative_work_output_terminal",
      unitCount: 3,
      activeUnitCount: 2,
      environment: "render-preview",
      rssMb: expect.any(Number),
      heapUsedMb: expect.any(Number),
      externalMb: expect.any(Number),
    });
  });

  it("emits cancellation as a terminal outcome with refund state", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    logCreativeWorkOutputTerminal({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      outputId: "output-1",
      protocol: "social_post",
      outcome: "canceled",
      failureCode: "generation_canceled",
      refunded: true,
      durationMs: 40,
    });

    expect(JSON.parse(String(info.mock.calls[0]?.[0]))).toMatchObject({
      event: "creative_work_output_terminal",
      outcome: "canceled",
      failureCode: "generation_canceled",
      refunded: true,
    });
  });
});
