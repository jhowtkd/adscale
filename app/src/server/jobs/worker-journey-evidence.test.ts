import { describe, expect, it } from "vitest";
import {
  validateWorkerJourneyEvidence,
  WORKER_JOURNEY_EVIDENCE_SCHEMA_VERSION,
  type WorkerJourneyEvidence,
} from "./worker-journey-evidence";

function baseEvidence(): WorkerJourneyEvidence {
  return {
    schemaVersion: WORKER_JOURNEY_EVIDENCE_SCHEMA_VERSION,
    sha: "abc1234",
    syntheticOrigin: true,
    workerTarget: "worker",
    nodeVersion: "20.19.0",
    workspaceId: "ws-test",
    workItemId: "work-test",
    outputIds: ["out-1"],
    scenario: "success",
    workerConnected: true,
    executorObserved: "worker",
    providerCalls: 3,
    duplicateCharges: 0,
    ledgerDebits: 1,
    ledgerRefunds: 0,
    remoteUncertainty: "none",
    resultObserved: "completed",
  };
}

describe("worker-journey evidence contract", () => {
  it("accepts a valid worker-executed journey", () => {
    expect(validateWorkerJourneyEvidence(baseEvidence())).toEqual({ ok: true, failures: [] });
  });

  it("accepts a valid no-worker journey with zero observed provider calls", () => {
    const evidence = baseEvidence();
    evidence.scenario = "no-worker";
    evidence.workerConnected = false;
    evidence.executorObserved = "none";
    evidence.providerCalls = 0;
    evidence.resultObserved = "unexecuted";
    expect(validateWorkerJourneyEvidence(evidence)).toEqual({ ok: true, failures: [] });
  });

  it("rejects an unsupported schema version", () => {
    const evidence = { ...baseEvidence(), schemaVersion: 999 };
    const result = validateWorkerJourneyEvidence(evidence as WorkerJourneyEvidence);
    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toMatch(/schema version/);
  });

  it("requires a synthetic origin and the worker target", () => {
    const origin = validateWorkerJourneyEvidence({
      ...baseEvidence(),
      syntheticOrigin: false as unknown as true,
    });
    expect(origin.ok).toBe(false);
    const target = validateWorkerJourneyEvidence({
      ...baseEvidence(),
      workerTarget: "web" as unknown as "worker",
    });
    expect(target.ok).toBe(false);
  });

  it("requires sha, node version, workspace, work and at least one output", () => {
    for (const patch of [
      { sha: "" },
      { nodeVersion: "" },
      { workspaceId: "" },
      { workItemId: "" },
      { outputIds: [] },
    ] as const) {
      expect(validateWorkerJourneyEvidence({ ...baseEvidence(), ...patch }).ok).toBe(false);
    }
  });

  it("fails when provider calls or the result were not observed", () => {
    expect(
      validateWorkerJourneyEvidence({ ...baseEvidence(), providerCalls: null }).ok,
    ).toBe(false);
    expect(
      validateWorkerJourneyEvidence({ ...baseEvidence(), resultObserved: "unknown" }).ok,
    ).toBe(false);
    const negative = baseEvidence();
    negative.scenario = "no-worker";
    negative.workerConnected = false;
    negative.executorObserved = "none";
    negative.providerCalls = null;
    negative.resultObserved = "unexecuted";
    expect(validateWorkerJourneyEvidence(negative).ok).toBe(false);
  });

  it("fails on duplicate charges in either scenario", () => {
    expect(
      validateWorkerJourneyEvidence({ ...baseEvidence(), duplicateCharges: 1 }).ok,
    ).toBe(false);
  });

  it("fails the success scenario without a connected worker executor", () => {
    expect(
      validateWorkerJourneyEvidence({ ...baseEvidence(), workerConnected: false }).ok,
    ).toBe(false);
    expect(
      validateWorkerJourneyEvidence({ ...baseEvidence(), executorObserved: "none" }).ok,
    ).toBe(false);
    expect(
      validateWorkerJourneyEvidence({ ...baseEvidence(), executorObserved: "unexpected" }).ok,
    ).toBe(false);
    expect(
      validateWorkerJourneyEvidence({ ...baseEvidence(), resultObserved: "unexecuted" }).ok,
    ).toBe(false);
    expect(
      validateWorkerJourneyEvidence({ ...baseEvidence(), providerCalls: 0 }).ok,
    ).toBe(false);
  });

  it("fails the no-worker scenario on any execution signal", () => {
    const evidence = baseEvidence();
    evidence.scenario = "no-worker";
    evidence.workerConnected = false;
    evidence.executorObserved = "none";
    evidence.providerCalls = 0;
    evidence.resultObserved = "unexecuted";
    expect(
      validateWorkerJourneyEvidence({ ...evidence, workerConnected: true }).ok,
    ).toBe(false);
    expect(
      validateWorkerJourneyEvidence({ ...evidence, executorObserved: "worker" }).ok,
    ).toBe(false);
    expect(
      validateWorkerJourneyEvidence({ ...evidence, resultObserved: "completed" }).ok,
    ).toBe(false);
    expect(
      validateWorkerJourneyEvidence({ ...evidence, providerCalls: 2 }).ok,
    ).toBe(false);
  });

  it("accepts replay and restart with exactly one execution", () => {
    for (const scenario of ["replay", "restart"] as const) {
      const evidence = {
        ...baseEvidence(),
        scenario,
        providerCalls: 1,
      };
      expect(validateWorkerJourneyEvidence(evidence)).toEqual({ ok: true, failures: [] });
      // A new retry would surface as extra calls — the matrix must catch it.
      expect(validateWorkerJourneyEvidence({ ...evidence, providerCalls: 2 }).ok).toBe(false);
      expect(validateWorkerJourneyEvidence({ ...evidence, providerCalls: 0 }).ok).toBe(false);
      expect(
        validateWorkerJourneyEvidence({ ...evidence, resultObserved: "failed" }).ok,
      ).toBe(false);
    }
  });

  it("accepts terminal failure with a single refund and zero net", () => {
    const evidence = {
      ...baseEvidence(),
      scenario: "failure" as const,
      providerCalls: 1,
      ledgerRefunds: 1,
      resultObserved: "failed" as const,
    };
    expect(validateWorkerJourneyEvidence(evidence)).toEqual({ ok: true, failures: [] });
    expect(validateWorkerJourneyEvidence({ ...evidence, ledgerRefunds: 0 }).ok).toBe(false);
    expect(validateWorkerJourneyEvidence({ ...evidence, ledgerRefunds: 2 }).ok).toBe(false);
    expect(
      validateWorkerJourneyEvidence({ ...evidence, resultObserved: "completed" }).ok,
    ).toBe(false);
  });

  it("requires the uncertainty flag on the ambiguous-timeout scenario", () => {
    const evidence = {
      ...baseEvidence(),
      scenario: "ambiguous-timeout" as const,
      providerCalls: 1,
      ledgerRefunds: 1,
      remoteUncertainty: "ambiguous_provider_timeout" as const,
      resultObserved: "failed" as const,
    };
    expect(validateWorkerJourneyEvidence(evidence)).toEqual({ ok: true, failures: [] });
    expect(
      validateWorkerJourneyEvidence({ ...evidence, remoteUncertainty: "none" }).ok,
    ).toBe(false);
  });

  it("accepts pre-provider failure with zero calls and zero ledger rows", () => {
    const evidence = {
      ...baseEvidence(),
      scenario: "pre-provider-failure" as const,
      executorObserved: "none" as const,
      providerCalls: 0,
      ledgerDebits: 0,
      resultObserved: "unexecuted" as const,
    };
    expect(validateWorkerJourneyEvidence(evidence)).toEqual({ ok: true, failures: [] });
    // The worker is UP here — that is what distinguishes it from no-worker.
    expect(validateWorkerJourneyEvidence({ ...evidence, workerConnected: false }).ok).toBe(false);
    expect(validateWorkerJourneyEvidence({ ...evidence, providerCalls: 1 }).ok).toBe(false);
    expect(validateWorkerJourneyEvidence({ ...evidence, ledgerDebits: 1 }).ok).toBe(false);
  });

  it("requires an observed ledger in every matrix scenario", () => {
    for (const scenario of [
      "success",
      "replay",
      "restart",
      "failure",
      "ambiguous-timeout",
      "pre-provider-failure",
    ] as const) {
      const evidence = {
        ...baseEvidence(),
        scenario,
        providerCalls: scenario === "pre-provider-failure" ? 0 : 1,
        executorObserved: (scenario === "pre-provider-failure" ? "none" : "worker") as
          | "none"
          | "worker",
        resultObserved: (scenario === "failure" || scenario === "ambiguous-timeout"
          ? "failed"
          : scenario === "pre-provider-failure"
            ? "unexecuted"
            : "completed") as "completed" | "unexecuted" | "failed",
        ledgerDebits: scenario === "pre-provider-failure" ? 0 : 1,
        ledgerRefunds: scenario === "failure" || scenario === "ambiguous-timeout" ? 1 : 0,
        remoteUncertainty: (scenario === "ambiguous-timeout"
          ? "ambiguous_provider_timeout"
          : "none") as "none" | "ambiguous_provider_timeout",
      };
      expect(validateWorkerJourneyEvidence(evidence).ok).toBe(true);
      expect(
        validateWorkerJourneyEvidence({ ...evidence, duplicateCharges: null }).ok,
      ).toBe(false);
      expect(validateWorkerJourneyEvidence({ ...evidence, ledgerDebits: null }).ok).toBe(false);
      expect(validateWorkerJourneyEvidence({ ...evidence, ledgerRefunds: null }).ok).toBe(false);
    }
  });

  it("keeps the ledger optional in the no-worker scenario", () => {
    const evidence = {
      ...baseEvidence(),
      scenario: "no-worker" as const,
      workerConnected: false,
      executorObserved: "none" as const,
      providerCalls: 0,
      duplicateCharges: null,
      ledgerDebits: null,
      ledgerRefunds: null,
      resultObserved: "unexecuted" as const,
    };
    expect(validateWorkerJourneyEvidence(evidence)).toEqual({ ok: true, failures: [] });
  });
});
