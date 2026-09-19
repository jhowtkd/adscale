import { describe, expect, it } from "vitest";

import type { DiagnosticEventEnvelopeMirror } from "./types";
import {
  bucketDurations,
  callIds,
  eventBucket,
  releaseShas,
  stageBucket,
  summarizeOperations,
} from "./timeline-model";

function envelope(
  overrides: Partial<DiagnosticEventEnvelopeMirror> & { event: string },
): DiagnosticEventEnvelopeMirror {
  return {
    eventId: overrides.eventId ?? `evt-${overrides.event}`,
    event: overrides.event,
    occurredAt: overrides.occurredAt ?? "2026-01-01T00:00:00.000Z",
    recordedAt: overrides.recordedAt ?? "2026-01-01T00:00:01.000Z",
    durationMs: overrides.durationMs,
    stage: overrides.stage,
    status: overrides.status,
    correlation: overrides.correlation ?? "full",
    context: overrides.context ?? {
      operationId: "op-1",
      releaseSha: "sha-1",
    },
    call: overrides.call,
    externalRefs: overrides.externalRefs,
    content: overrides.content,
  };
}

describe("stageBucket", () => {
  it("maps the canonical journey stages to console buckets", () => {
    expect(stageBucket("queue")).toBe("queue");
    expect(stageBucket("image")).toBe("ai");
    expect(stageBucket("composition")).toBe("composition");
    expect(stageBucket("quality")).toBe("evaluation");
    expect(stageBucket("selection")).toBe("delivery");
    expect(stageBucket("export")).toBe("delivery");
  });

  it("keeps pre-image stages out of the compute buckets", () => {
    expect(stageBucket("source_analysis")).toBe("other");
    expect(stageBucket("briefing")).toBe("other");
    expect(stageBucket(undefined)).toBe("other");
    expect(stageBucket("nope")).toBe("other");
  });
});

describe("eventBucket", () => {
  it("attributes model-call events to AI even without a stage", () => {
    expect(eventBucket({ event: "model.call.completed" })).toBe("ai");
    expect(
      eventBucket({ event: "model.validation.failed", stage: "copy" }),
    ).toBe("ai");
  });

  it("attributes export/selection events to delivery", () => {
    expect(eventBucket({ event: "export.served" })).toBe("delivery");
    expect(eventBucket({ event: "selection.confirmed" })).toBe("delivery");
  });

  it("falls back to the stored stage otherwise", () => {
    expect(eventBucket({ event: "stage.completed", stage: "queue" })).toBe(
      "queue",
    );
    expect(eventBucket({ event: "operation.started" })).toBe("other");
  });
});

describe("bucketDurations", () => {
  it("sums only measured durations and counts the unmeasured rest", () => {
    const totals = bucketDurations([
      envelope({ event: "stage.completed", stage: "queue", durationMs: 120 }),
      envelope({ event: "stage.completed", stage: "queue" }),
      envelope({
        event: "model.call.completed",
        stage: "image",
        durationMs: 800,
      }),
    ]);
    expect(totals.queue).toEqual({
      totalMs: 120,
      measured: 1,
      unmeasured: 1,
    });
    expect(totals.ai).toEqual({ totalMs: 800, measured: 1, unmeasured: 0 });
    expect(totals.composition).toEqual({
      totalMs: 0,
      measured: 0,
      unmeasured: 0,
    });
  });
});

describe("summarizeOperations", () => {
  it("marks an operation recovered when a failure is followed by success in the same stage", () => {
    const summaries = summarizeOperations([
      envelope({
        eventId: "e1",
        event: "model.call.failed",
        stage: "image",
        occurredAt: "2026-01-01T00:00:00.000Z",
      }),
      envelope({
        eventId: "e2",
        event: "model.call.completed",
        stage: "image",
        occurredAt: "2026-01-01T00:01:00.000Z",
      }),
    ]);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].badges).toEqual(["recovered"]);
  });

  it("does not treat progress in another stage as recovery", () => {
    const summaries = summarizeOperations([
      envelope({
        eventId: "e1",
        event: "model.call.failed",
        stage: "image",
        occurredAt: "2026-01-01T00:00:00.000Z",
      }),
      envelope({
        eventId: "e2",
        event: "stage.completed",
        stage: "composition",
        occurredAt: "2026-01-01T00:01:00.000Z",
      }),
    ]);
    expect(summaries[0].badges).toEqual(["terminal"]);
  });

  it("marks a lone failure terminal and a quiet operation unconfirmed", () => {
    const terminal = summarizeOperations([
      envelope({ event: "operation.failed" }),
    ]);
    expect(terminal[0].badges).toEqual(["terminal"]);

    const unconfirmed = summarizeOperations([
      envelope({ event: "operation.started" }),
    ]);
    expect(unconfirmed[0].badges).toEqual(["unconfirmed"]);

    const completed = summarizeOperations([
      envelope({ event: "operation.started" }),
      envelope({
        eventId: "done",
        event: "operation.completed",
        occurredAt: "2026-01-01T00:02:00.000Z",
      }),
    ]);
    expect(completed[0].badges).toEqual([]);
  });

  it("adds the partial badge when any event lacks prior context", () => {
    const summaries = summarizeOperations([
      envelope({ event: "operation.started", correlation: "partial" }),
    ]);
    expect(summaries[0].badges).toEqual(["unconfirmed", "partial"]);
  });

  it("groups by operation and reports release + event counts", () => {
    const summaries = summarizeOperations([
      envelope({ event: "operation.started" }),
      envelope({
        eventId: "b1",
        event: "operation.started",
        context: { operationId: "op-2", releaseSha: "sha-2" },
      }),
    ]);
    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toMatchObject({
      operationId: "op-1",
      releaseSha: "sha-1",
      eventCount: 1,
    });
    expect(summaries[1]).toMatchObject({
      operationId: "op-2",
      releaseSha: "sha-2",
      eventCount: 1,
    });
  });
});

describe("releaseShas / callIds", () => {
  it("returns distinct values in first-seen order", () => {
    const events = [
      envelope({ event: "operation.started" }),
      envelope({
        eventId: "b1",
        event: "model.call.started",
        context: { operationId: "op-2", releaseSha: "sha-2" },
        call: {
          callId: "call-a",
          provider: "p",
          requestedModel: "m",
          returnedModel: null,
          providerRequestId: null,
        },
      }),
      envelope({
        eventId: "b2",
        event: "model.call.completed",
        context: { operationId: "op-2", releaseSha: "sha-2" },
        call: {
          callId: "call-a",
          provider: "p",
          requestedModel: "m",
          returnedModel: "m",
          providerRequestId: "req-1",
        },
      }),
    ];
    expect(releaseShas(events)).toEqual(["sha-1", "sha-2"]);
    expect(callIds(events)).toEqual(["call-a"]);
  });
});
