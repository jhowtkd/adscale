import { describe, expect, it } from "vitest";

import { buildBrandConsistencyEvidence } from "./brand-consistency-evidence";

describe("brand consistency baseline", () => {
  it("records a deterministic, unpaid replay with evidence hashes", () => {
    const report = buildBrandConsistencyEvidence({
      version: 1,
      pilotId: "piece-unica-baseline",
      brandName: "Acme",
      provenance: { source: "synthetic_fixture" },
      requests: [
        {
          requestId: "fixture-1",
          requestText: "Post institucional",
          format: "1:1",
          contentPattern: "text_led_ad",
          effectivePrompt: "controlled prompt",
          selectedReferences: [
            { referenceId: "ref-logo", reason: "approved logo" },
          ],
          snapshot: { available: true, version: "legacy-1" },
          observedHardFailures: [],
          humanVerdict: "pass",
          capturedAt: "2026-08-12T12:00:00.000Z",
        },
      ],
    });

    expect(report.status).toBe("human_needed");
    expect(report.execution).toMatchObject({
      provider: "e2e-controlled-replay",
      paidGeneration: false,
      providerCalls: 0,
    });
    expect(report.sourceComposition).toEqual({
      synthetic_fixture: 1,
      operator_imported: 0,
      real_customer: 0,
    });
    expect(report.requests[0]?.hashes).toEqual({
      input: expect.stringMatching(/^[a-f0-9]{64}$/),
      selection: expect.stringMatching(/^[a-f0-9]{64}$/),
      snapshot: expect.stringMatching(/^[a-f0-9]{64}$/),
      result: expect.stringMatching(/^[a-f0-9]{64}$/),
      evidence: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(report.claimsBlocked).toContain("validated_against_customer_real");
    expect(report.withheldClaims).toContain("validated_against_customer_real");
  });

  it("fails explicitly when a fixture result diverges", () => {
    const report = buildBrandConsistencyEvidence({
      version: 1,
      pilotId: "divergent",
      brandName: "Acme",
      provenance: { source: "synthetic_fixture" },
      requests: [
        {
          requestId: "fixture-divergent",
          requestText: "Post",
          format: "1:1",
          contentPattern: "text_led_ad",
          effectivePrompt: "controlled prompt",
          selectedReferences: [],
          expectedHardFailures: ["logo_absent"],
          observedHardFailures: [],
          expectedHumanVerdict: "fail",
          humanVerdict: "pass",
          capturedAt: "2026-08-12T12:00:00.000Z",
        },
      ],
    });

    expect(report.status).toBe("fail");
    expect(report.divergences).toHaveLength(2);
  });
});
