/**
 * trace-390: selection/export lifecycle tracing — adapter unit tests.
 *
 * The adapter maps selection and download outcomes to journal envelopes
 * (frozen names/stages) through a single injectable sink. It never throws,
 * never double-emits, and stays silent outside the Peça única pilot.
 */
import { describe, expect, it, vi } from "vitest";
import type { DiagnosticEventEnvelope } from "./contract";
import {
  createDiagnosticContext,
  withDiagnosticContext,
} from "./context";
import {
  resolveLifecycleTraceContext,
  traceExportPrepared,
  traceExportServed,
  traceSelectionConfirmed,
  traceSelectionEffectFailed,
} from "./selection-export-tracing";

function collectSink() {
  const events: DiagnosticEventEnvelope[] = [];
  return {
    events,
    sink: (event: DiagnosticEventEnvelope) => {
      events.push(event);
    },
  };
}

const SCOPE = {
  workspaceId: "ws-390",
  workItemId: "work-390",
  outputId: "output-390",
  clientProfileId: "profile-390",
  toolKind: "single",
};

const FIXED_NOW = new Date("2026-09-17T10:00:00.000Z");

function testContext() {
  const context = resolveLifecycleTraceContext(SCOPE);
  if (!context) throw new Error("expected a trace context for single-protocol work");
  return context;
}

describe("resolveLifecycleTraceContext (trace-390)", () => {
  it("resolves a fresh single-protocol operation", () => {
    const context = resolveLifecycleTraceContext(SCOPE);

    expect(context).toMatchObject({
      schemaVersion: 1,
      workspaceId: "ws-390",
      workItemId: "work-390",
      protocol: "single",
      outputId: "output-390",
      clientProfileId: "profile-390",
      process: "web",
    });
    expect(context?.operationId).toBeTruthy();
    expect(context?.parentOperationId).toBeUndefined();
  });

  it("mints a distinct operation per call — repeated downloads never share one", () => {
    const first = resolveLifecycleTraceContext(SCOPE);
    const second = resolveLifecycleTraceContext(SCOPE);

    expect(first?.operationId).toBeTruthy();
    expect(second?.operationId).toBeTruthy();
    expect(first?.operationId).not.toBe(second?.operationId);
  });

  it("links to same-work ambient context as a related child operation", async () => {
    const ambient = createDiagnosticContext({
      workspaceId: SCOPE.workspaceId,
      workItemId: SCOPE.workItemId,
      clientProfileId: SCOPE.clientProfileId,
      generationCorrelationId: "gen-390",
    });

    const child = await withDiagnosticContext(ambient, async () =>
      resolveLifecycleTraceContext(SCOPE),
    );

    expect(child?.operationId).not.toBe(ambient.operationId);
    expect(child?.parentOperationId).toBe(ambient.operationId);
    expect(child?.generationCorrelationId).toBe("gen-390");
    expect(child?.outputId).toBe("output-390");
  });

  it("ignores foreign ambient context instead of attaching it", async () => {
    const foreign = createDiagnosticContext({
      workspaceId: "ws-other",
      workItemId: "work-other",
    });

    const context = await withDiagnosticContext(foreign, async () =>
      resolveLifecycleTraceContext(SCOPE),
    );

    expect(context?.workspaceId).toBe("ws-390");
    expect(context?.parentOperationId).toBeUndefined();
    expect(context?.generationCorrelationId).toBeUndefined();
  });

  it("stays silent outside the Peça única pilot", () => {
    expect(
      resolveLifecycleTraceContext({ ...SCOPE, toolKind: "social_post" }),
    ).toBeNull();
    expect(
      resolveLifecycleTraceContext({ ...SCOPE, toolKind: "carousel" }),
    ).toBeNull();
  });

  it("never throws on invalid identity — tracing degrades to silence", () => {
    expect(
      resolveLifecycleTraceContext({ ...SCOPE, workspaceId: "" }),
    ).toBeNull();
  });
});

describe("traceSelectionConfirmed (trace-390)", () => {
  it("emits exactly one selection.confirmed with human approval truth", () => {
    const { events, sink } = collectSink();

    traceSelectionConfirmed({
      context: testContext(),
      selectedBy: "operator",
      effectsRequested: 2,
      sink,
      now: FIXED_NOW,
    });

    expect(events).toHaveLength(1);
    const [envelope] = events;
    expect(envelope.event).toBe("selection.confirmed");
    expect(envelope.stage).toBe("selection");
    expect(envelope.status).toBe("completed");
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.correlation).toBe("full");
    expect(envelope.occurredAt).toBe("2026-09-17T10:00:00.000Z");
    expect(envelope.recordedAt).toBe("2026-09-17T10:00:00.000Z");
    expect(envelope.eventId).toBeTruthy();
    expect(envelope.context?.workItemId).toBe("work-390");
    expect(envelope.context?.outputId).toBe("output-390");
    expect(envelope.attributes).toEqual({
      "selection.selected_by": "operator",
      "selection.human_approval": true,
      "selection.effects_requested": 2,
    });
  });

  it("marks agent selection as not human approval", () => {
    const { events, sink } = collectSink();

    traceSelectionConfirmed({
      context: testContext(),
      selectedBy: "agent",
      effectsRequested: 0,
      sink,
      now: FIXED_NOW,
    });

    expect(events).toHaveLength(1);
    expect(events[0].attributes).toEqual({
      "selection.selected_by": "agent",
      "selection.human_approval": false,
      "selection.effects_requested": 0,
    });
  });

  it("refuses to mislabel an unknown selector", () => {
    const { events, sink } = collectSink();

    traceSelectionConfirmed({
      context: testContext(),
      selectedBy: "owner",
      effectsRequested: 1,
      sink,
      now: FIXED_NOW,
    });

    expect(events).toHaveLength(0);
  });

  it("never throws when the sink fails", () => {
    const context = testContext();
    const sink = () => {
      throw new Error("journal down");
    };

    expect(() =>
      traceSelectionConfirmed({
        context,
        selectedBy: "operator",
        effectsRequested: 1,
        sink,
        now: FIXED_NOW,
      }),
    ).not.toThrow();
  });
});

describe("traceSelectionEffectFailed (trace-390)", () => {
  it("records the downstream fault without touching approval truth", () => {
    const { events, sink } = collectSink();
    const context = testContext();

    traceSelectionConfirmed({
      context,
      selectedBy: "operator",
      effectsRequested: 1,
      sink,
      now: FIXED_NOW,
    });
    traceSelectionEffectFailed({
      context,
      effect: "library",
      effectId: "effect-1",
      code: "library_failed",
      phase: "run",
      sink,
      now: FIXED_NOW,
    });

    expect(events).toHaveLength(2);
    const [confirmed, failed] = events;
    expect(confirmed.event).toBe("selection.confirmed");
    expect(confirmed.status).toBe("completed");
    expect(failed.event).toBe("selection.effect.failed");
    expect(failed.stage).toBe("selection");
    expect(failed.status).toBe("failed");
    expect(failed.context?.operationId).toBe(confirmed.context?.operationId);
    expect(failed.attributes).toEqual({
      "effect.kind": "library",
      "effect.id": "effect-1",
      "effect.code": "library_failed",
      "effect.phase": "run",
      "effect.retryable": true,
    });
    // Approval truth is never rewritten by the downstream fault.
    expect(failed.attributes).not.toHaveProperty("selection.human_approval");
  });

  it("distinguishes the confirm phase from the run phase", () => {
    const { events, sink } = collectSink();

    traceSelectionEffectFailed({
      context: testContext(),
      effect: "value_event",
      effectId: "effect-2",
      code: "effect_confirm_failed",
      phase: "confirm",
      sink,
      now: FIXED_NOW,
    });

    expect(events).toHaveLength(1);
    expect(events[0].attributes).toMatchObject({
      "effect.kind": "value_event",
      "effect.phase": "confirm",
    });
  });

  it("rejects unknown effect kinds and phases", () => {
    const { events, sink } = collectSink();
    const context = testContext();

    traceSelectionEffectFailed({
      context,
      effect: "billing",
      effectId: "effect-3",
      code: "nope",
      phase: "run",
      sink,
      now: FIXED_NOW,
    });
    traceSelectionEffectFailed({
      context,
      effect: "recipe",
      effectId: "effect-4",
      code: "nope",
      phase: "settle",
      sink,
      now: FIXED_NOW,
    });

    expect(events).toHaveLength(0);
  });

  it("never throws when the sink fails", () => {
    expect(() =>
      traceSelectionEffectFailed({
        context: testContext(),
        effect: "recipe",
        effectId: "effect-5",
        code: "save_recipe_failed",
        phase: "run",
        sink: () => {
          throw new Error("journal down");
        },
        now: FIXED_NOW,
      }),
    ).not.toThrow();
  });
});

describe("traceExportPrepared / traceExportServed (trace-390)", () => {
  it("records preparation as its own export operation", () => {
    const { events, sink } = collectSink();

    traceExportPrepared({
      context: testContext(),
      format: "original",
      sink,
      now: FIXED_NOW,
    });

    expect(events).toHaveLength(1);
    const [envelope] = events;
    expect(envelope.event).toBe("export.prepared");
    expect(envelope.stage).toBe("export");
    expect(envelope.status).toBe("completed");
    expect(envelope.attributes).toEqual({ "export.format": "original" });
  });

  it("records serving under the same operation as preparation", () => {
    const { events, sink } = collectSink();
    const context = testContext();

    traceExportPrepared({ context, format: "original", sink, now: FIXED_NOW });
    traceExportServed({ context, servedAs: "redirect", sink, now: FIXED_NOW });

    expect(events).toHaveLength(2);
    const [prepared, served] = events;
    expect(prepared.event).toBe("export.prepared");
    expect(served.event).toBe("export.served");
    expect(served.stage).toBe("export");
    expect(served.status).toBe("completed");
    expect(served.context?.operationId).toBe(prepared.context?.operationId);
    expect(served.attributes).toEqual({ "export.served_as": "redirect" });
  });

  it("distinguishes serve transports without a generic success", () => {
    const { events, sink } = collectSink();
    const context = testContext();

    for (const servedAs of ["json", "redirect", "bytes"] as const) {
      traceExportServed({ context, servedAs, sink, now: FIXED_NOW });
    }

    expect(events.map((event) => event.attributes?.["export.served_as"])).toEqual([
      "json",
      "redirect",
      "bytes",
    ]);
  });

  it("mints unique eventIds across repeated operations", () => {
    const { events, sink } = collectSink();

    for (let i = 0; i < 3; i += 1) {
      const context = testContext();
      traceExportPrepared({ context, format: "original", sink, now: FIXED_NOW });
      traceExportServed({ context, servedAs: "redirect", sink, now: FIXED_NOW });
    }

    const ids = events.map((event) => event.eventId);
    expect(new Set(ids).size).toBe(ids.length);
    const operations = events.map((event) => event.context?.operationId);
    expect(new Set(operations).size).toBe(3);
  });

  it("never throws when the sink fails", () => {
    const context = testContext();
    const sink = () => {
      throw new Error("journal down");
    };

    expect(() =>
      traceExportPrepared({ context, format: "original", sink, now: FIXED_NOW }),
    ).not.toThrow();
    expect(() =>
      traceExportServed({ context, servedAs: "json", sink, now: FIXED_NOW }),
    ).not.toThrow();
  });

  it("mints UUID eventIds", () => {
    const { events, sink } = collectSink();

    traceExportPrepared({ context: testContext(), format: "zip", sink, now: FIXED_NOW });

    expect(events).toHaveLength(1);
    expect(events[0].eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe("adapter discipline (trace-390)", () => {
  it("emits through the sink exactly once per call — never double-emitted", () => {
    const sink = vi.fn();
    const context = testContext();

    traceSelectionConfirmed({
      context,
      selectedBy: "operator",
      effectsRequested: 1,
      sink,
      now: FIXED_NOW,
    });

    expect(sink).toHaveBeenCalledTimes(1);
  });

  it("keeps transport, quality, approval, delivery and telemetry states independent", () => {
    const { events, sink } = collectSink();
    const context = testContext();

    traceSelectionConfirmed({
      context,
      selectedBy: "operator",
      effectsRequested: 1,
      sink,
      now: FIXED_NOW,
    });
    traceSelectionEffectFailed({
      context,
      effect: "library",
      effectId: "effect-1",
      code: "library_failed",
      phase: "run",
      sink,
      now: FIXED_NOW,
    });
    traceExportPrepared({ context, format: "original", sink, now: FIXED_NOW });
    traceExportServed({ context, servedAs: "redirect", sink, now: FIXED_NOW });

    for (const event of events) {
      // No generic "success" status exists; each event carries its own stage/status.
      expect(event.status).not.toBe("success");
      expect(event.attributes ?? {}).not.toHaveProperty("success");
      // Quality verdicts never leak into selection/export records.
      expect(event.attributes ?? {}).not.toHaveProperty("verdict");
      expect(JSON.stringify(event.attributes ?? {})).not.toContain("verdict");
    }
    const keys = events.flatMap((event) => Object.keys(event.attributes ?? {}));
    expect(keys.filter((key) => key.startsWith("selection."))).toHaveLength(3);
    expect(keys.filter((key) => key.startsWith("effect."))).toHaveLength(5);
    expect(keys.filter((key) => key.startsWith("export."))).toHaveLength(2);
  });
});
