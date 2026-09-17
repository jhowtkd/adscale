import { describe, expect, it } from "vitest";
import {
  validateEnablementEvidenceShape,
  type ThreeFourEnablementEvidence,
} from "./check-34-enablement-evidence";

function evidence(overrides: Partial<ThreeFourEnablementEvidence> = {}): ThreeFourEnablementEvidence {
  return {
    schemaVersion: 1,
    status: "completed",
    webSha: "abc123",
    workerSha: "abc123",
    matrixReport: "app/tests/e2e/.evidence/studio-format-matrix.json",
    matrixSha: "abc123",
    matrixOk: true,
    visualEntries: ["1:1", "4:5", "9:16", "3:4"].map((format) => ({
      format: format as "3:4",
      reviewer: "R. Silva",
      artifactIds: ["work-1"],
      compositionIntact: true,
      dimensionsOk: true,
    })),
    providerSmoke: {
      authorizedBy: "J. Souza",
      executedAt: "2026-09-17T12:00:00.000Z",
      reportRef: "docs/evidence/34-provider-smoke.md",
      outcome: "pass",
    },
    ...overrides,
  };
}

describe("3:4 enablement evidence gate (ICE-04B)", () => {
  it("accepts complete evidence on one SHA", () => {
    expect(() => validateEnablementEvidenceShape(evidence())).not.toThrow();
  });

  it("rejects mismatched web/worker deploys", () => {
    expect(() => validateEnablementEvidenceShape(evidence({ workerSha: "def456" }))).toThrow(
      /compatible deploys/,
    );
  });

  it("rejects a matrix from another SHA or a red matrix", () => {
    expect(() => validateEnablementEvidenceShape(evidence({ matrixSha: "other" }))).toThrow(
      /same delivery SHA/,
    );
    expect(() => validateEnablementEvidenceShape(evidence({ matrixOk: false }))).toThrow(
      /green format matrix/,
    );
  });

  it("rejects missing formats, missing reviewers and unjudged verdicts", () => {
    expect(() =>
      validateEnablementEvidenceShape(evidence({ visualEntries: [] })),
    ).toThrow(/missing visual entries/);
    const noReviewer = evidence();
    noReviewer.visualEntries[3] = { ...noReviewer.visualEntries[3]!, reviewer: null };
    expect(() => validateEnablementEvidenceShape(noReviewer)).toThrow(/reviewer/);
    const unjudged = evidence();
    unjudged.visualEntries[3] = { ...unjudged.visualEntries[3]!, compositionIntact: null };
    expect(() => validateEnablementEvidenceShape(unjudged)).toThrow(/composition-intact/);
  });

  it("rejects an unauthorized or failing provider smoke", () => {
    expect(() =>
      validateEnablementEvidenceShape(
        evidence({ providerSmoke: { authorizedBy: null, executedAt: null, reportRef: null, outcome: null } }),
      ),
    ).toThrow(/authorized by a named human/);
    const failed = evidence();
    failed.providerSmoke = { ...failed.providerSmoke!, outcome: "fail" };
    expect(() => validateEnablementEvidenceShape(failed)).toThrow(/passing authorized provider smoke/);
  });
});
