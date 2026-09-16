import { describe, expect, it } from "vitest";
import {
  DIAGNOSTIC_ENVELOPE_KEY,
  type DiagnosticContext,
} from "./contract";
import { createDiagnosticContext, getDiagnosticContext, withDiagnosticContext } from "./context";
import {
  attachDiagnosticEnvelope,
  diagnosticContextForDispatch,
  extractDiagnosticEnvelope,
  reenterDiagnosticContext,
  withWorkerDiagnosticContext,
} from "./envelope";

function validEnvelope(overrides: Partial<DiagnosticContext> = {}): DiagnosticContext {
  return {
    schemaVersion: 1,
    workspaceId: "ws-1",
    clientProfileId: "profile-1",
    workItemId: "work-1",
    protocol: "single",
    operationId: "op-1",
    releaseSha: "abc1234",
    environment: "test",
    process: "web",
    dataOrigin: "test",
    ...overrides,
  };
}

function generateEventData(extra: Record<string, unknown> = {}) {
  return {
    workspaceId: "ws-1",
    workItemId: "work-1",
    outputId: "output-1",
    generationCorrelationId: "generation-1",
    ...extra,
  };
}

describe("attachDiagnosticEnvelope (trace-386)", () => {
  it("returns legacy data untouched when no context is available", () => {
    const data = generateEventData();
    expect(attachDiagnosticEnvelope(data)).toBe(data);
    expect(data).not.toHaveProperty(DIAGNOSTIC_ENVELOPE_KEY);
  });

  it("attaches the ambient context without touching business fields", async () => {
    const context = validEnvelope();
    const data = generateEventData();
    const attached = await withDiagnosticContext(context, async () =>
      attachDiagnosticEnvelope(data),
    );

    expect(attached).not.toBe(data);
    expect(attached[DIAGNOSTIC_ENVELOPE_KEY]).toEqual(context);
    expect(attached[DIAGNOSTIC_ENVELOPE_KEY]).not.toBe(context);
    const business = { ...attached };
    delete business[DIAGNOSTIC_ENVELOPE_KEY];
    expect(business).toEqual(data);
  });

  it("prefers an explicit context over the ambient one", async () => {
    const ambient = validEnvelope({ operationId: "op-ambient" });
    const explicit = validEnvelope({ operationId: "op-explicit" });
    const attached = await withDiagnosticContext(ambient, async () =>
      attachDiagnosticEnvelope(generateEventData(), explicit),
    );
    expect(attached[DIAGNOSTIC_ENVELOPE_KEY]).toMatchObject({
      operationId: "op-explicit",
    });
  });

  it("never overwrites an envelope already on the event", async () => {
    const ambient = validEnvelope({ operationId: "op-ambient" });
    const existing = validEnvelope({ operationId: "op-existing" });
    const data = generateEventData({ [DIAGNOSTIC_ENVELOPE_KEY]: existing });
    const attached = await withDiagnosticContext(ambient, async () =>
      attachDiagnosticEnvelope(data),
    );
    expect(attached).toBe(data);
    expect(attached[DIAGNOSTIC_ENVELOPE_KEY]).toBe(existing);
  });
});

describe("extractDiagnosticEnvelope (trace-386)", () => {
  it("round-trips a full envelope", () => {
    const envelope = validEnvelope({
      parentOperationId: "op-parent",
      generationCorrelationId: "generation-1",
      outputId: "output-1",
      inngestRunId: "run-1",
      attemptNumber: 0,
    });
    expect(
      extractDiagnosticEnvelope({ [DIAGNOSTIC_ENVELOPE_KEY]: envelope }),
    ).toEqual(envelope);
  });

  it("accepts a minimal envelope with null client profile", () => {
    const envelope = validEnvelope({ clientProfileId: null });
    delete (envelope as Partial<DiagnosticContext>).parentOperationId;
    expect(
      extractDiagnosticEnvelope({ [DIAGNOSTIC_ENVELOPE_KEY]: envelope }),
    ).toEqual(envelope);
  });

  it("ignores externally supplied authorization and unknown fields", () => {
    const extracted = extractDiagnosticEnvelope({
      [DIAGNOSTIC_ENVELOPE_KEY]: {
        ...validEnvelope(),
        role: "platform-owner",
        isAdmin: true,
        userId: "user-evil",
        workspaceRole: "owner",
        access_token: "secret",
        sessionToken: "secret",
      },
    });

    expect(extracted).toEqual(validEnvelope());
    expect(extracted).not.toHaveProperty("role");
    expect(extracted).not.toHaveProperty("isAdmin");
    expect(extracted).not.toHaveProperty("userId");
    expect(extracted).not.toHaveProperty("workspaceRole");
  });

  it.each([
    ["missing key", generateEventData()],
    ["null data", null],
    ["string data", "nope"],
    ["null envelope", { [DIAGNOSTIC_ENVELOPE_KEY]: null }],
    ["string envelope", { [DIAGNOSTIC_ENVELOPE_KEY]: "op-1" }],
    ["array envelope", { [DIAGNOSTIC_ENVELOPE_KEY]: [] }],
    ["bad schema version", { [DIAGNOSTIC_ENVELOPE_KEY]: validEnvelope({ schemaVersion: 2 as 1 }) }],
    ["string schema version", { [DIAGNOSTIC_ENVELOPE_KEY]: { ...validEnvelope(), schemaVersion: "1" } }],
    ["wrong protocol", { [DIAGNOSTIC_ENVELOPE_KEY]: { ...validEnvelope(), protocol: "variations" } }],
    ["empty workspace", { [DIAGNOSTIC_ENVELOPE_KEY]: validEnvelope({ workspaceId: "" }) }],
    ["missing workspace", { [DIAGNOSTIC_ENVELOPE_KEY]: { ...validEnvelope(), workspaceId: undefined } }],
    ["empty work item", { [DIAGNOSTIC_ENVELOPE_KEY]: validEnvelope({ workItemId: "" }) }],
    ["empty operation", { [DIAGNOSTIC_ENVELOPE_KEY]: validEnvelope({ operationId: "" }) }],
    ["numeric client profile", { [DIAGNOSTIC_ENVELOPE_KEY]: { ...validEnvelope(), clientProfileId: 42 } }],
    ["empty release", { [DIAGNOSTIC_ENVELOPE_KEY]: validEnvelope({ releaseSha: "" }) }],
    ["empty environment", { [DIAGNOSTIC_ENVELOPE_KEY]: validEnvelope({ environment: "" }) }],
    ["bad process", { [DIAGNOSTIC_ENVELOPE_KEY]: { ...validEnvelope(), process: "edge" } }],
    ["bad origin", { [DIAGNOSTIC_ENVELOPE_KEY]: { ...validEnvelope(), dataOrigin: "prod" } }],
    ["negative attempt", { [DIAGNOSTIC_ENVELOPE_KEY]: validEnvelope({ attemptNumber: -1 }) }],
    ["fractional attempt", { [DIAGNOSTIC_ENVELOPE_KEY]: validEnvelope({ attemptNumber: 1.5 }) }],
    ["string attempt", { [DIAGNOSTIC_ENVELOPE_KEY]: { ...validEnvelope(), attemptNumber: "0" } }],
    ["numeric run id", { [DIAGNOSTIC_ENVELOPE_KEY]: { ...validEnvelope(), inngestRunId: 7 } }],
    ["empty parent operation", { [DIAGNOSTIC_ENVELOPE_KEY]: validEnvelope({ parentOperationId: "" }) }],
  ])("degrades %s to null", (_label, data) => {
    expect(extractDiagnosticEnvelope(data)).toBeNull();
  });
});

describe("reenterDiagnosticContext (trace-386)", () => {
  it("degrades envelopeless legacy events to partial correlation without a context", () => {
    expect(
      reenterDiagnosticContext(generateEventData(), { runId: "run-1", attempt: 0 }),
    ).toEqual({ context: null, correlation: "partial" });
  });

  it("degrades malformed metadata to partial correlation without a context", () => {
    expect(
      reenterDiagnosticContext(
        generateEventData({ [DIAGNOSTIC_ENVELOPE_KEY]: { operationId: "op-1" } }),
        { runId: "run-1", attempt: 0 },
      ),
    ).toEqual({ context: null, correlation: "partial" });
  });

  it("binds live run and attempt ids on first entry with full correlation", () => {
    const reentry = reenterDiagnosticContext(
      generateEventData({ [DIAGNOSTIC_ENVELOPE_KEY]: validEnvelope() }),
      { runId: "run-1", attempt: 0 },
    );

    expect(reentry.correlation).toBe("full");
    expect(reentry.context).toMatchObject({
      operationId: "op-1",
      process: "worker",
      inngestRunId: "run-1",
      attemptNumber: 0,
    });
  });

  it("invents no run or attempt ids when the worker reports none", () => {
    const reentry = reenterDiagnosticContext(
      generateEventData({ [DIAGNOSTIC_ENVELOPE_KEY]: validEnvelope() }),
      {},
    );

    expect(reentry.correlation).toBe("full");
    expect(reentry.context).not.toHaveProperty("inngestRunId");
    expect(reentry.context).not.toHaveProperty("attemptNumber");
  });

  it("preserves existing run and attempt ids across reentry", () => {
    const reentry = reenterDiagnosticContext(
      generateEventData({
        [DIAGNOSTIC_ENVELOPE_KEY]: validEnvelope({
          inngestRunId: "run-1",
          attemptNumber: 0,
        }),
      }),
      { runId: "run-1", attempt: 0 },
    );

    expect(reentry.correlation).toBe("full");
    expect(reentry.context).toMatchObject({
      inngestRunId: "run-1",
      attemptNumber: 0,
    });
  });

  it("preserves existing run and attempt ids when the worker reports none", () => {
    const reentry = reenterDiagnosticContext(
      generateEventData({
        [DIAGNOSTIC_ENVELOPE_KEY]: validEnvelope({
          inngestRunId: "run-1",
          attemptNumber: 0,
        }),
      }),
      {},
    );

    expect(reentry.correlation).toBe("full");
    expect(reentry.context).toMatchObject({
      inngestRunId: "run-1",
      attemptNumber: 0,
    });
  });

  it("degrades repeated runs under a new run id to partial correlation, preserving the original ids", () => {
    const reentry = reenterDiagnosticContext(
      generateEventData({
        [DIAGNOSTIC_ENVELOPE_KEY]: validEnvelope({
          inngestRunId: "run-1",
          attemptNumber: 0,
        }),
      }),
      { runId: "run-2", attempt: 0 },
    );

    expect(reentry.correlation).toBe("partial");
    expect(reentry.context).toMatchObject({
      operationId: "op-1",
      inngestRunId: "run-1",
      attemptNumber: 0,
    });
  });

  it("degrades repeated attempts under the same run to partial correlation", () => {
    const reentry = reenterDiagnosticContext(
      generateEventData({
        [DIAGNOSTIC_ENVELOPE_KEY]: validEnvelope({
          inngestRunId: "run-1",
          attemptNumber: 0,
        }),
      }),
      { runId: "run-1", attempt: 1 },
    );

    expect(reentry.correlation).toBe("partial");
    expect(reentry.context).toMatchObject({
      inngestRunId: "run-1",
      attemptNumber: 0,
    });
  });

  it.each([
    ["workspace", { workspaceId: "ws-other" }],
    ["work item", { workItemId: "work-other" }],
    ["output", { outputId: "output-other" }],
  ])("adopts no context when the envelope %s disagrees with the event", (_label, mismatch) => {
    const data = generateEventData({
      [DIAGNOSTIC_ENVELOPE_KEY]: validEnvelope({ outputId: "output-1" }),
    });
    expect(
      reenterDiagnosticContext(data, {
        runId: "run-1",
        attempt: 0,
        expected: { workspaceId: "ws-1", workItemId: "work-1", outputId: "output-1", ...mismatch },
      }),
    ).toEqual({ context: null, correlation: "partial" });
  });

  it("adopts the envelope when it agrees with the event identity", () => {
    const reentry = reenterDiagnosticContext(
      generateEventData({ [DIAGNOSTIC_ENVELOPE_KEY]: validEnvelope({ outputId: "output-1" }) }),
      {
        runId: "run-1",
        attempt: 0,
        expected: { workspaceId: "ws-1", workItemId: "work-1", outputId: "output-1" },
      },
    );
    expect(reentry.correlation).toBe("full");
    expect(reentry.context?.operationId).toBe("op-1");
  });
});

describe("diagnosticContextForDispatch (trace-386)", () => {
  const singleWork = { toolKind: "single", clientProfileId: "profile-1" };
  const variationsWork = { toolKind: "variations", clientProfileId: "profile-1" };

  it("reuses the ambient context when it matches the dispatched work", async () => {
    const ambient = validEnvelope();
    const resolved = await withDiagnosticContext(ambient, async () =>
      diagnosticContextForDispatch({
        workspaceId: "ws-1",
        workItemId: "work-1",
        outputId: "output-1",
        generationCorrelationId: "generation-1",
        work: singleWork,
        synthesize: true,
      }),
    );
    expect(resolved).toBe(ambient);
  });

  it("refuses ambient context from another workspace and synthesizes a fresh single operation", async () => {
    const ambient = validEnvelope({ workspaceId: "ws-other", workItemId: "work-other" });
    const resolved = await withDiagnosticContext(ambient, async () =>
      diagnosticContextForDispatch({
        workspaceId: "ws-1",
        workItemId: "work-1",
        outputId: "output-1",
        generationCorrelationId: "generation-1",
        work: singleWork,
        synthesize: true,
      }),
    );

    expect(resolved).toBeDefined();
    expect(resolved).not.toBe(ambient);
    expect(resolved).toMatchObject({
      workspaceId: "ws-1",
      workItemId: "work-1",
      clientProfileId: "profile-1",
      outputId: "output-1",
      generationCorrelationId: "generation-1",
      protocol: "single",
      process: "web",
    });
    expect(resolved?.operationId).not.toBe(ambient.operationId);
    expect(resolved).not.toHaveProperty("parentOperationId");
  });

  it("synthesizes a fresh context for single-protocol work without ambient state", () => {
    const resolved = diagnosticContextForDispatch({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
      generationCorrelationId: "generation-1",
      work: singleWork,
      synthesize: true,
    });

    expect(resolved).toMatchObject({
      schemaVersion: 1,
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      workItemId: "work-1",
      protocol: "single",
      outputId: "output-1",
      generationCorrelationId: "generation-1",
      process: "web",
    });
    expect(typeof resolved?.operationId).toBe("string");
  });

  it("attaches nothing for non-single work", () => {
    expect(
      diagnosticContextForDispatch({
        workspaceId: "ws-1",
        workItemId: "work-1",
        work: variationsWork,
        synthesize: true,
      }),
    ).toBeUndefined();
  });

  it("attaches nothing when the work identity is unknown", () => {
    expect(
      diagnosticContextForDispatch({
        workspaceId: "ws-1",
        workItemId: "work-1",
        synthesize: true,
      }),
    ).toBeUndefined();
  });

  it("propagates ambient context only when synthesis is disabled", async () => {
    const ambient = validEnvelope();
    const propagated = await withDiagnosticContext(ambient, async () =>
      diagnosticContextForDispatch({
        workspaceId: "ws-1",
        workItemId: "work-1",
        work: singleWork,
        synthesize: false,
      }),
    );
    expect(propagated).toBe(ambient);

    expect(
      diagnosticContextForDispatch({
        workspaceId: "ws-1",
        workItemId: "work-1",
        work: singleWork,
        synthesize: false,
      }),
    ).toBeUndefined();
  });
});

describe("withWorkerDiagnosticContext (trace-386)", () => {
  it("runs inside the bound worker context for enveloped events", async () => {
    const seen: Array<DiagnosticContext | undefined> = [];
    const result = await withWorkerDiagnosticContext(
      {
        event: {
          data: generateEventData({ [DIAGNOSTIC_ENVELOPE_KEY]: validEnvelope() }),
        },
        runId: "run-1",
        attempt: 0,
      },
      async () => {
        seen.push(getDiagnosticContext());
        return "done";
      },
    );

    expect(result).toBe("done");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      operationId: "op-1",
      process: "worker",
      inngestRunId: "run-1",
      attemptNumber: 0,
    });
    expect(getDiagnosticContext()).toBeUndefined();
  });

  it("runs without ambient context for legacy, malformed and mismatched events — never rejecting", async () => {
    const cases = [
      generateEventData(),
      generateEventData({ [DIAGNOSTIC_ENVELOPE_KEY]: { operationId: "op-1" } }),
      generateEventData({
        [DIAGNOSTIC_ENVELOPE_KEY]: validEnvelope({ workspaceId: "ws-other" }),
      }),
    ];

    for (const data of cases) {
      const seen: Array<DiagnosticContext | undefined> = [];
      const result = await withWorkerDiagnosticContext(
        { event: { data }, runId: "run-1", attempt: 0 },
        async () => {
          seen.push(getDiagnosticContext());
          return "done";
        },
      );
      expect(result).toBe("done");
      expect(seen).toEqual([undefined]);
    }
    expect(getDiagnosticContext()).toBeUndefined();
  });

  it("propagates rejections without leaking the scope", async () => {
    await expect(
      withWorkerDiagnosticContext(
        {
          event: {
            data: generateEventData({ [DIAGNOSTIC_ENVELOPE_KEY]: validEnvelope() }),
          },
          runId: "run-1",
          attempt: 0,
        },
        async () => {
          throw new Error("boom");
        },
      ),
    ).rejects.toThrow("boom");
    expect(getDiagnosticContext()).toBeUndefined();
  });

  it("is unrelated to factory defaults: the envelope process is adopted as worker", async () => {
    const context = createDiagnosticContext({
      workspaceId: "ws-1",
      workItemId: "work-1",
      process: "web",
    });
    let seen: DiagnosticContext | undefined;
    await withWorkerDiagnosticContext(
      { event: { data: generateEventData({ [DIAGNOSTIC_ENVELOPE_KEY]: context }) } },
      async () => {
        seen = getDiagnosticContext();
      },
    );
    expect(seen?.process).toBe("worker");
    expect(seen?.workspaceId).toBe("ws-1");
  });
});
