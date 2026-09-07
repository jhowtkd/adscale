import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  creativeWorkQueueWaitMs,
  logCreativeWorkGenerationLifecycle,
  logCreativeWorkOutputStage,
  logCreativeWorkOutputTerminal,
  observeCreativeWorkStage,
} from "./job-telemetry";

const CAROUSEL_DECK_FIELDS = {
  protocol: "carousel",
  slideCount: 5,
  inputKind: "long_text",
  blockingQuestionCount: 1,
  anchorState: "closing",
  failedSlideCount: 1,
  manualRetryCount: 1,
  deckRevisionCount: 1,
} as const;

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
      executorPid: process.pid,
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
      expect.objectContaining({ stage: "generate_base", status: "failed", result: "failed", detail: "provider unavailable", executorPid: process.pid }),
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

describe("carousel deck telemetry (Task 10)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("propagates the safe carousel deck fields through lifecycle logs", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    logCreativeWorkGenerationLifecycle({
      event: "creative_work_generation_requested",
      workspaceId: "workspace-1",
      workItemId: "work-1",
      generationCorrelationId: "generation-1",
      unitCount: 5,
      ...CAROUSEL_DECK_FIELDS,
    });

    expect(JSON.parse(String(info.mock.calls[0]?.[0]))).toMatchObject(CAROUSEL_DECK_FIELDS);
  });

  it("propagates the safe carousel deck fields through stage and terminal logs", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    logCreativeWorkOutputStage({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      outputId: "slide-1",
      ...CAROUSEL_DECK_FIELDS,
      stage: "generate_base",
      status: "completed",
      result: "success",
    });
    logCreativeWorkOutputTerminal({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      outputId: "slide-1",
      ...CAROUSEL_DECK_FIELDS,
      outcome: "completed",
      refunded: false,
      durationMs: 90,
    });

    const events = info.mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: "creative_work_output_stage", ...CAROUSEL_DECK_FIELDS }),
      expect.objectContaining({ event: "creative_work_output_terminal", ...CAROUSEL_DECK_FIELDS }),
    ]));
  });

  it("never adds free-form copy: the safe carousel fields are counts, kinds and states only", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    logCreativeWorkGenerationLifecycle({
      event: "creative_work_generation_requested",
      workspaceId: "workspace-1",
      workItemId: "work-1",
      unitCount: 5,
      ...CAROUSEL_DECK_FIELDS,
    });

    const payload = JSON.parse(String(info.mock.calls[0]?.[0])) as Record<string, unknown>;
    const carouselFieldNames = [
      "slideCount", "inputKind", "blockingQuestionCount", "anchorState",
      "failedSlideCount", "manualRetryCount", "deckRevisionCount",
    ];
    for (const field of carouselFieldNames) {
      const value = payload[field];
      expect(typeof value === "number" || typeof value === "string").toBe(true);
      // No copy/prompt/answers/facts/storage/reference payloads leak through
      // the carousel fields: counts are numbers, kinds/states are short enums.
      expect(String(value).length).toBeLessThan(40);
    }
    const serialized = JSON.stringify(payload);
    for (const forbidden of ["primaryText", "secondaryText", "purpose", "answer", "outputKey", "assetKey", "providerBaseKey", "contractHash"]) {
      expect(serialized).not.toContain(`"${forbidden}":"`);
    }
  });
});

describe("carousel funnel chain completeness (Task 10)", () => {
  const source = (...segments: string[]): string =>
    readFileSync(path.resolve(__dirname, ...segments), "utf8");

  it("keeps the canonical funnel vocabulary in order", () => {
    const funnel = source("funnel-events.ts");
    const events = ["briefing_ready", "generation_confirmed", "output_ready", "creative_work_reviewed", "creative_work_approved"];
    let lastIndex = -1;
    for (const event of events) {
      const index = funnel.indexOf(`"${event}"`);
      expect(index, `${event} missing from funnel-events.ts`).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
  });

  it("emits briefing_ready from the generic progressive preparePlan for carousel", () => {
    expect(source("../../components/creative-work/useComposerPlanActions.ts"))
      .toContain('recordCanonicalEvent("briefing_ready"');
  });

  it("emits generation_confirmed exactly once from the deck confirmation", () => {
    const generate = source("../application/generate-carousel-work.ts");
    expect(generate).toContain('"generation_confirmed"');
    expect(generate.match(/eventKey: "generation_confirmed"/g)).toHaveLength(1);
  });

  it("emits exactly one deck-level output_ready and never per slide", () => {
    const advance = source("../application/advance-carousel-generation.ts");
    expect(advance).toContain('"output_ready"');
    expect(advance.match(/eventKey: "output_ready"/g)).toHaveLength(1);
    // The deck-level emission lives inside the once-only set-review CAS.
    expect(advance).toContain("recordCarouselSetReviewOnce");
    // The per-slide job must never emit the deck-level funnel event.
    const slideJob = source("../jobs/creative-work-carousel.ts");
    expect(slideJob).not.toContain('"output_ready"');
  });

  it("emits creative_work_reviewed and creative_work_approved through the injected recorder", () => {
    const composer = source("../../components/creative-work/useCarouselComposer.ts");
    expect(composer).toContain('recordCanonicalEvent("creative_work_reviewed"');
    expect(composer).toContain('recordCanonicalEvent("creative_work_approved"');
    expect(composer).toContain("protocol: \"carousel\"");
  });
});
