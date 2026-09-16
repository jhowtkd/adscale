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
    duplicateCharges: null,
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
});
