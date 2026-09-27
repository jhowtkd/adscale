import { describe, expect, it } from "vitest";
import { decideRoundOutcome, type RoundItemScore } from "./round";

const STRONG: RoundItemScore = {
  attemptScore: 15,
  minDimension: 4,
  criticalFailure: false,
  withdrawn: false,
  clientVerdict: "approved",
};

const TASTE: RoundItemScore = { ...STRONG, clientVerdict: "taste_adjustment" };
const UNDECIDED: RoundItemScore = { ...STRONG, clientVerdict: "none" };

describe("social rounds (3 of 4)", () => {
  it("passes with 3 client decisions and no failure", () => {
    const result = decideRoundOutcome({ frontKind: "social", items: [STRONG, TASTE, STRONG, UNDECIDED] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.outcome).toBe("passed");
      expect(result.value.decisions).toBe(3);
      expect(result.value.requiredDecisions).toBe(3);
    }
  });

  it("stays inconclusive below 3 decisions without any failure", () => {
    const result = decideRoundOutcome({ frontKind: "social", items: [STRONG, STRONG, UNDECIDED, UNDECIDED] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.outcome).toBe("inconclusive");
  });

  it("fails on a fact/brand rejection even with 3 decisions", () => {
    const rejected: RoundItemScore = { ...STRONG, clientVerdict: "fact_brand_rejection" };
    const result = decideRoundOutcome({ frontKind: "social", items: [STRONG, STRONG, STRONG, rejected] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.outcome).toBe("failed");
      expect(result.value.failures).toEqual([{ itemIndex: 3, causes: ["fact_brand_rejection"] }]);
    }
  });
});

describe("paid-media rounds (2 of 3)", () => {
  it("passes with 2 angle decisions", () => {
    const result = decideRoundOutcome({ frontKind: "paid_media", items: [STRONG, TASTE, UNDECIDED] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.outcome).toBe("passed");
  });

  it("stays inconclusive with a single decision", () => {
    const result = decideRoundOutcome({ frontKind: "paid_media", items: [STRONG, UNDECIDED, UNDECIDED] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.outcome).toBe("inconclusive");
  });
});

describe("failure beats inconclusive", () => {
  it("fails on a critical failure with too few decisions", () => {
    const critical: RoundItemScore = { ...UNDECIDED, criticalFailure: true };
    const result = decideRoundOutcome({ frontKind: "social", items: [STRONG, critical, UNDECIDED, UNDECIDED] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.outcome).toBe("failed");
      expect(result.value.failures).toEqual([{ itemIndex: 1, causes: ["critical_failure"] }]);
    }
  });

  it("fails on withdrawal, low score, or weak dimension", () => {
    const withdrawn: RoundItemScore = { ...STRONG, withdrawn: true };
    const byWithdrawal = decideRoundOutcome({ frontKind: "social", items: [withdrawn, STRONG, STRONG, STRONG] });
    expect(byWithdrawal.ok && byWithdrawal.value.outcome).toBe("failed");

    const lowScore: RoundItemScore = { ...STRONG, attemptScore: 13 };
    const byScore = decideRoundOutcome({ frontKind: "social", items: [lowScore, STRONG, STRONG, STRONG] });
    expect(byScore.ok && byScore.value.outcome).toBe("failed");
    if (byScore.ok) expect(byScore.value.failures).toEqual([{ itemIndex: 0, causes: ["score_below_14"] }]);

    const weakDimension: RoundItemScore = { ...STRONG, attemptScore: 14, minDimension: 2 };
    const byDimension = decideRoundOutcome({ frontKind: "social", items: [weakDimension, STRONG, STRONG, STRONG] });
    expect(byDimension.ok && byDimension.value.outcome).toBe("failed");
  });

  it("passes at exactly 14/16 with every dimension at 3", () => {
    const edge: RoundItemScore = { ...STRONG, attemptScore: 14, minDimension: 3 };
    const result = decideRoundOutcome({ frontKind: "social", items: [edge, edge, edge, UNDECIDED] });
    expect(result.ok && result.value.outcome).toBe("passed");
  });
});

describe("invalid input", () => {
  it("rejects out-of-range scores with a typed error", () => {
    const bad: RoundItemScore = { ...STRONG, attemptScore: 17 };
    const result = decideRoundOutcome({ frontKind: "social", items: [bad, STRONG, STRONG, STRONG] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid_score");
  });
});
