import { describe, expect, it } from "vitest";
import {
  validateExperimentManifest,
  type ExperimentManifest,
  type ManifestReportReader,
} from "./experiment-manifest";

const SHA_A = "a".repeat(40);
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function manifest(overrides: Partial<ExperimentManifest> = {}): ExperimentManifest {
  return {
    schemaVersion: 1,
    experimentId: "exp-1",
    sha: SHA_A,
    changedFeatures: ["quality_recovery"],
    control: { kind: "frozen_production", baselineId: "base-1" },
    baseline: {
      id: "base-1",
      policyVersion: "quality_recovery_v1",
      schemaVersion: 1,
      inputsHash: HASH_A,
      expectedPolicyVersion: "quality_recovery_v1",
      expectedSchemaVersion: 1,
    },
    inputs: { inputsHash: HASH_A, count: 10 },
    origin: "staging",
    authorization: {
      authorizedBy: "J. Souza",
      authorizedAt: "2026-09-17T12:00:00.000Z",
      scope: "quality-recovery gate evidence collection",
    },
    measurements: { schemaVersion: 1, origin: "staging", reportRef: "measurements.json" },
    packages: [{ kind: "quality_recovery_blind", path: "package.json", sha256: HASH_B }],
    gates: [{ kind: "quality_recovery", reportRef: "gate.json" }],
    conclusion: {
      decision: "approved",
      decidedBy: "R. Silva",
      decidedAt: "2026-09-17T13:00:00.000Z",
      notes: "All gates green on one SHA.",
    },
    ...overrides,
  };
}

function reader(files: Record<string, unknown>): ManifestReportReader {
  return (ref) => (ref in files ? files[ref] : null);
}

const gatePass = () => ({ failures: [] as string[] });
const gateFail = () => ({ failures: ["v1 preference too low"] });

function greenFiles(): Record<string, unknown> {
  return {
    "gate.json": { status: "completed" },
    "measurements.json": { schemaVersion: 1, origin: "staging" },
  };
}

describe("experiment manifest (ICE-05A)", () => {
  it("accepts a fully supported approval", () => {
    expect(validateExperimentManifest(manifest(), reader(greenFiles()), gatePass)).toEqual({
      ok: true,
      failures: [],
    });
  });

  it("rejects two changed features", () => {
    const result = validateExperimentManifest(
      manifest({ changedFeatures: ["quality_recovery", "brand_cortex_single"] }),
      reader(greenFiles()),
      gatePass,
    );
    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toMatch(/exactly one feature/);
  });

  it("rejects an incompatible baseline and diverged inputs", () => {
    const base = manifest();
    const incompatible = validateExperimentManifest(
      manifest({ baseline: { ...base.baseline, policyVersion: "legacy" } }),
      reader(greenFiles()),
      gatePass,
    );
    expect(incompatible.failures.join("\n")).toMatch(/incompatible/);
    const diverged = validateExperimentManifest(
      manifest({ inputs: { inputsHash: HASH_B, count: 10 } }),
      reader(greenFiles()),
      gatePass,
    );
    expect(diverged.failures.join("\n")).toMatch(/arms diverged/);
  });

  it("rejects a missing origin and a decided conclusion without authorization", () => {
    expect(
      validateExperimentManifest({ ...manifest(), origin: undefined }, reader(greenFiles()), gatePass)
        .ok,
    ).toBe(false);
    const noAuth = validateExperimentManifest(
      manifest({
        authorization: {
          authorizedBy: null,
          authorizedAt: null,
          scope: "quality-recovery gate evidence collection",
        },
      }),
      reader(greenFiles()),
      gatePass,
    );
    expect(noAuth.ok).toBe(false);
    expect(noAuth.failures.join("\n")).toMatch(/authorization by a named human/);
  });

  it("rejects a false approval: failing gate, pending evidence, missing measurements", () => {
    const failingGate = validateExperimentManifest(manifest(), reader(greenFiles()), gateFail);
    expect(failingGate.failures.join("\n")).toMatch(/gate fails/);
    const pendingEvidence = validateExperimentManifest(
      manifest(),
      reader({ ...greenFiles(), "gate.json": { status: "pending_human_review" } }),
      gatePass,
    );
    expect(pendingEvidence.failures.join("\n")).toMatch(/not completed/);
    const noMeasurements = validateExperimentManifest(
      manifest({ measurements: null }),
      reader(greenFiles()),
      gatePass,
    );
    expect(noMeasurements.failures.join("\n")).toMatch(/measurements/);
    const wrongOrigin = validateExperimentManifest(
      manifest(),
      reader({ ...greenFiles(), "measurements.json": { schemaVersion: 1, origin: "production" } }),
      gatePass,
    );
    expect(wrongOrigin.failures.join("\n")).toMatch(/origin/);
  });

  it("rejects a readiness approval that is not approved", () => {
    const result = validateExperimentManifest(
      manifest({
        changedFeatures: ["brand_cortex_single"],
        gates: [{ kind: "brand_cortex_readiness", reportRef: "readiness.json" }],
      }),
      reader({ ...greenFiles(), "readiness.json": { status: "human_needed" } }),
      gatePass,
    );
    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toMatch(/not approved/);
  });

  it("accepts pending without gates; rejected and inconclusive need an audit trail", () => {
    const pending = validateExperimentManifest(
      manifest({
        gates: [],
        measurements: null,
        conclusion: { decision: "pending", decidedBy: null, decidedAt: null, notes: null },
      }),
      reader({}),
      gatePass,
    );
    expect(pending).toEqual({ ok: true, failures: [] });
    const rejected = validateExperimentManifest(
      manifest({
        conclusion: {
          decision: "rejected",
          decidedBy: "R. Silva",
          decidedAt: "2026-09-17T13:00:00.000Z",
          notes: null,
        },
      }),
      reader(greenFiles()),
      gatePass,
    );
    expect(rejected.failures.join("\n")).toMatch(/notes for audit/);
  });
});
