import { describe, expect, it } from "vitest";
import { DIAGNOSTIC_SCHEMA_VERSION } from "../src/server/diagnostics/contract";
import {
  applyRowEnv,
  mapEnvelopeToObserved,
  parseSplitMatrixOnly,
  rowEnvOverlay,
  splitMatrixForwardedArgs,
  splitMatrixSummaryPath,
  splitMatrixWantsHelp,
  splitMatrixWantsPlan,
  summarizeSplitMatrix,
} from "./run-diagnostics-split-matrix";
import { DIAGNOSTICS_SPLIT_ROWS } from "./diagnostics-split-evidence";

describe("diagnostics split matrix args", () => {
  it("covers every row by default", () => {
    expect(parseSplitMatrixOnly([])).toEqual([...DIAGNOSTICS_SPLIT_ROWS]);
    expect(DIAGNOSTICS_SPLIT_ROWS).toHaveLength(7);
  });

  it("narrows with --only and rejects unknown rows", () => {
    expect(parseSplitMatrixOnly(["--only", "success,restart"])).toEqual(["success", "restart"]);
    expect(() => parseSplitMatrixOnly(["--only", "bogus"])).toThrow(/row/);
    expect(() => parseSplitMatrixOnly(["--only"])).toThrow(/--only/);
  });

  it("forwards harness flags and strips matrix-only flags", () => {
    expect(
      splitMatrixForwardedArgs([
        "--build",
        "--web-port",
        "3101",
        "--only",
        "replay",
        "--plan",
        "--observe-ms",
        "1000",
      ]),
    ).toEqual(["--build", "--web-port", "3101", "--observe-ms", "1000"]);
    expect(() => splitMatrixForwardedArgs(["--web-port"])).toThrow(/--web-port/);
    expect(() => splitMatrixForwardedArgs(["--scenario", "success"])).toThrow(/unknown flag/);
  });

  it("detects --plan and --help", () => {
    expect(splitMatrixWantsPlan(["--only", "success", "--plan"])).toBe(true);
    expect(splitMatrixWantsPlan([])).toBe(false);
    expect(splitMatrixWantsHelp(["--help"])).toBe(true);
    expect(splitMatrixWantsHelp(["-h"])).toBe(true);
    expect(splitMatrixWantsHelp([])).toBe(false);
  });

  it("summarizes failures by row", () => {
    expect(
      summarizeSplitMatrix([
        { row: "success", code: 0, reportPath: "/tmp/a.json" },
        { row: "replay", code: 1, reportPath: "/tmp/b.json" },
        { row: "restart", code: 2, reportPath: "/tmp/c.json" },
      ]),
    ).toEqual({ ok: false, failed: ["replay", "restart"] });
    expect(summarizeSplitMatrix([{ row: "success", code: 0, reportPath: "/tmp/a.json" }])).toEqual({
      ok: true,
      failed: [],
    });
  });

  it("writes the summary next to the row reports", () => {
    expect(splitMatrixSummaryPath()).toMatch(/tests\/e2e\/\.evidence\/diagnostics-split-matrix\.json$/);
  });
});

describe("row env overlays", () => {
  it("enables observability in metadata_only for journey rows", () => {
    expect(rowEnvOverlay("success")).toEqual({
      set: {
        OBSERVABILITY_ENABLED: "true",
        OBSERVABILITY_CONTENT_MODE: "metadata_only",
        OBSERVABILITY_WORKSPACE_ALLOWLIST: "",
      },
      unset: [],
    });
    expect(rowEnvOverlay("restart")).toEqual(rowEnvOverlay("success"));
  });

  it("points vendor-down at an unreachable exporter with bogus keys", () => {
    const overlay = rowEnvOverlay("vendor-down");
    expect(overlay.set.OBSERVABILITY_LANGFUSE_ENABLED).toBe("true");
    expect(overlay.set.LANGFUSE_BASE_URL).toBe("http://127.0.0.1:9");
    expect(overlay.set.LANGFUSE_SECRET_KEY).toContain("bogus");
    expect(overlay.set.OBSERVABILITY_CONTENT_MODE).toBe("metadata_only");
  });

  it("clears every observability flag for instrumented-off", () => {
    const overlay = rowEnvOverlay("instrumented-off");
    expect(overlay.set).toEqual({});
    expect(overlay.unset).toContain("OBSERVABILITY_ENABLED");
    expect(overlay.unset).toContain("LANGFUSE_SECRET_KEY");
  });

  it("applies and restores overlays on the given env object", () => {
    const env: NodeJS.ProcessEnv = {
      OBSERVABILITY_ENABLED: "true",
      KEEP: "yes",
    };
    const restore = applyRowEnv("instrumented-off", env);
    expect(env.OBSERVABILITY_ENABLED).toBeUndefined();
    expect(env.KEEP).toBe("yes");
    restore();
    expect(env.OBSERVABILITY_ENABLED).toBe("true");

    const vendor: NodeJS.ProcessEnv = {};
    const restoreVendor = applyRowEnv("vendor-down", vendor);
    expect(vendor.LANGFUSE_BASE_URL).toBe("http://127.0.0.1:9");
    restoreVendor();
    expect(vendor.LANGFUSE_BASE_URL).toBeUndefined();
  });
});

describe("mapEnvelopeToObserved", () => {
  it("projects envelopes to the evidence shape", () => {
    const observed = mapEnvelopeToObserved({
      eventId: "evt-1",
      event: "model.call.completed",
      schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
      occurredAt: new Date(0).toISOString(),
      recordedAt: new Date(0).toISOString(),
      stage: "image",
      status: "completed",
      correlation: "partial",
      context: {
        schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
        workspaceId: "ws-1",
        clientProfileId: null,
        workItemId: "work-1",
        protocol: "single",
        operationId: "op-1",
        parentOperationId: "op-0",
        outputId: "out-1",
        releaseSha: "abc",
        environment: "test",
        process: "worker",
        dataOrigin: "synthetic",
      },
      call: {
        callId: "call-1",
        provider: "openai",
        requestedModel: "gpt-x",
        returnedModel: null,
        providerRequestId: null,
      },
      externalRefs: { langfuseTraceId: "trace-1" },
      content: { availability: "not_collected", policyVersion: "v1" },
    });
    expect(observed).toEqual({
      eventId: "evt-1",
      event: "model.call.completed",
      stage: "image",
      status: "completed",
      correlation: "partial",
      operationId: "op-1",
      parentOperationId: "op-0",
      outputId: "out-1",
      process: "worker",
      dataOrigin: "synthetic",
      hasCall: true,
      hasError: false,
      hasExternalRefs: true,
      hasLangfuseRefs: true,
      contentAvailability: "not_collected",
    });
  });
});
