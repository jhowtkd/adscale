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

const humanRelease = (status: "approved" | "failed" | "human_needed" = "approved") => ({
  schemaVersion: 1 as const,
  reportType: "brand-cortex-human-release" as const,
  status,
  pilotId: "pilot-1",
  pilotSha256: "f".repeat(64),
  reviewSha256: "9".repeat(64),
  reviewerId: "reviewer-1",
  reviewedAt: "2026-08-13T13:00:00.000Z",
  failures: status === "failed" ? ["human release decision is rejected"] : [],
  pending: status === "human_needed" ? ["9:16: human review is missing"] : [],
});

describe("Brand Cortex readiness gate", () => {
  it("approves with stable controlled evidence and a hash-bound human release", () => {
    expect(evaluateBrandCortexReadiness({
      previousBaseline: baseline("human_needed"),
      rerunBaseline: baseline("human_needed"),
      seamEvidence: seam,
      humanRelease: humanRelease(),
    }).status).toBe("approved");
  });

  it("stays human-dependent when automated evidence or human release is pending", () => {
    expect(evaluateBrandCortexReadiness({
      previousBaseline: baseline("human_needed"),
      rerunBaseline: baseline("human_needed"),
      seamEvidence: null,
      humanRelease: null,
    }).status).toBe("human_needed");
  });

  it("fails on a baseline regression, rejected release or invalid paid evidence", () => {
    expect(evaluateBrandCortexReadiness({
      previousBaseline: baseline(),
      rerunBaseline: { ...baseline(), hashes: { ...hashes, results: "f".repeat(64) } },
      seamEvidence: seam,
      humanRelease: humanRelease(),
    }).status).toBe("failed");
    expect(evaluateBrandCortexReadiness({
      previousBaseline: baseline(),
      rerunBaseline: baseline(),
      seamEvidence: seam,
      humanRelease: humanRelease("failed"),
    }).status).toBe("failed");
    expect(evaluateBrandCortexReadiness({
      previousBaseline: baseline(),
      rerunBaseline: baseline(),
      seamEvidence: { ...seam, paidGeneration: true },
      humanRelease: humanRelease(),
    }).status).toBe("failed");
  });
});
