import { describe, expect, it } from "vitest";
import {
  verifyBaselineReproduction,
  type BaselineManifest,
  type BaselineReproduction,
} from "./baseline-reproduction";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function baseline(): BaselineManifest {
  return {
    schemaVersion: 1,
    baselineId: "base-1",
    policyVersion: "quality_recovery_v1",
    inputsHash: HASH_A,
    capturedAt: "2026-09-10T12:00:00.000Z",
    capturedBy: "R. Silva",
    artifacts: [
      { artifactId: "art-1", sha256: HASH_A },
      { artifactId: "art-2", sha256: HASH_B },
    ],
  };
}

function reproduction(): BaselineReproduction {
  return {
    schemaVersion: 1,
    baselineId: "base-1",
    policyVersion: "quality_recovery_v1",
    inputsHash: HASH_A,
    runAt: "2026-09-17T12:00:00.000Z",
    runBy: "R. Silva",
    authorization: { authorizedBy: "J. Souza", authorizedAt: "2026-09-17T11:00:00.000Z" },
    artifacts: [
      { artifactId: "art-1", sha256: HASH_A },
      { artifactId: "art-2", sha256: HASH_B },
    ],
  };
}

describe("baseline reproduction (ICE-05A)", () => {
  it("accepts an exact reproduction", () => {
    expect(verifyBaselineReproduction(baseline(), reproduction())).toEqual({ ok: true, failures: [] });
  });

  it("rejects policy, input and target drift", () => {
    expect(
      verifyBaselineReproduction(baseline(), { ...reproduction(), policyVersion: "legacy" }).failures,
    ).toContain("reproduction ran under another policy version");
    expect(
      verifyBaselineReproduction(baseline(), { ...reproduction(), inputsHash: HASH_B }).failures,
    ).toContain("reproduction inputs diverge from the baseline inputs");
    expect(
      verifyBaselineReproduction(baseline(), { ...reproduction(), baselineId: "base-2" }).failures,
    ).toContain("reproduction targets another baseline");
  });

  it("rejects diverged, missing and extra artifact hashes", () => {
    const diverged = verifyBaselineReproduction(
      baseline(),
      {
        ...reproduction(),
        artifacts: [
          { artifactId: "art-1", sha256: HASH_B },
          { artifactId: "art-2", sha256: HASH_B },
        ],
      },
    );
    expect(diverged.failures).toContain("art-1: hash diverged from the baseline");
    const missing = verifyBaselineReproduction(
      baseline(),
      { ...reproduction(), artifacts: [{ artifactId: "art-1", sha256: HASH_A }] },
    );
    expect(missing.failures).toContain("art-2: missing from the reproduction");
    const extra = verifyBaselineReproduction(
      baseline(),
      {
        ...reproduction(),
        artifacts: [...reproduction().artifacts, { artifactId: "art-9", sha256: HASH_A }],
      },
    );
    expect(extra.failures).toContain("art-9: not part of the baseline");
  });

  it("rejects an unauthorized reproduction report", () => {
    const { authorization: _dropped, ...rest } = reproduction();
    expect(verifyBaselineReproduction(baseline(), rest).ok).toBe(false);
  });
});
