import { describe, expect, it } from "vitest";

import { evaluateBrandCortexReadiness } from "./run-brand-cortex-readiness-gate";

const hashes = {
  inputs: "a".repeat(64),
  selection: "b".repeat(64),
  snapshots: "c".repeat(64),
  results: "d".repeat(64),
  evidence: "e".repeat(64),
};

const baseline = (status: "pass" | "human_needed" | "fail" = "pass") => ({
  status,
  hashes,
  divergences: status === "fail" ? ["regression"] : [],
});

const seam = {
  schemaVersion: 1,
  status: "pass",
  capturedAt: "2026-08-13T12:00:00.000Z",
  authenticated: true,
  provider: "e2e-controlled",
  paidGeneration: false,
  featureFlag: "enabled_for_test",
  assertions: {
    trainingReviewed: true,
    versionPublished: true,
    laterPublicationDidNotMutateSnapshot: true,
    exactAssetProven: true,
    approvedFontAndCopyProven: true,
    deterministicAndResidualSeparated: true,
    traceableToEvidence: true,
  },
};

describe("Brand Cortex readiness gate", () => {
  it("approves only with stable baseline, passing authenticated seam and human release", () => {
    expect(evaluateBrandCortexReadiness({
      previousBaseline: baseline(),
      rerunBaseline: baseline(),
      seamEvidence: seam,
      humanRelease: "approved",
    }).status).toBe("approved");
  });

  it("stays human-dependent when automated evidence or human release is pending", () => {
    expect(evaluateBrandCortexReadiness({
      previousBaseline: baseline("human_needed"),
      rerunBaseline: baseline("human_needed"),
      seamEvidence: null,
      humanRelease: "pending",
    }).status).toBe("human_needed");
  });

  it("fails on a baseline regression, rejected release or invalid paid evidence", () => {
    expect(evaluateBrandCortexReadiness({
      previousBaseline: baseline(),
      rerunBaseline: { ...baseline(), hashes: { ...hashes, results: "f".repeat(64) } },
      seamEvidence: seam,
      humanRelease: "approved",
    }).status).toBe("failed");
    expect(evaluateBrandCortexReadiness({
      previousBaseline: baseline(),
      rerunBaseline: baseline(),
      seamEvidence: seam,
      humanRelease: "rejected",
    }).status).toBe("failed");
    expect(evaluateBrandCortexReadiness({
      previousBaseline: baseline(),
      rerunBaseline: baseline(),
      seamEvidence: { ...seam, paidGeneration: true },
      humanRelease: "approved",
    }).status).toBe("failed");
  });
});
