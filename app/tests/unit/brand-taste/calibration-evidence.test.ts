import { describe, expect, it } from "vitest";
import { evaluateClaimsMatrix } from "@/server/brand-taste/calibration-evidence";

describe("calibration-evidence claims matrix", () => {
  it("blocks agreement claims with zero human decisions", () => {
    const result = evaluateClaimsMatrix({
      humanDecisionCount: 0,
      comparableCount: 0,
      agreementRate: null,
      fixtureOnly: true,
      evidenceLevel: "uncalibrated",
    });

    expect(result.claimsBlocked).toContain("agreement_rate_reported");
    expect(result.claimsBlocked).toContain("calibrated_from_operator_decisions");
  });

  it("allows seed calibration claim at 5 decisions", () => {
    const result = evaluateClaimsMatrix({
      humanDecisionCount: 5,
      comparableCount: 3,
      agreementRate: 0.6,
      fixtureOnly: true,
      evidenceLevel: "seed_calibrated",
    });

    expect(result.claimsAllowed).toContain("calibrated_from_operator_decisions");
    expect(result.claimsBlocked).toContain("validated_against_customer_real");
  });

  it("blocks customer-real claim for fixture-only corpus", () => {
    const result = evaluateClaimsMatrix({
      humanDecisionCount: 15,
      comparableCount: 10,
      agreementRate: 0.8,
      fixtureOnly: true,
      evidenceLevel: "assisted",
    });

    expect(result.claimsBlocked).toContain("validated_against_customer_real");
    expect(result.claimsAllowed).toContain("system_applies_learned_brand_criteria");
  });
});
