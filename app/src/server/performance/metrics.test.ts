import { describe, expect, it } from "vitest";
import {
  derivePerformanceMetrics,
  divideDecimalStrings,
  parseNonNegativeDecimal,
} from "./metrics";

describe("performance metrics", () => {
  it("derives CTR, CPC, CPA and ROAS from raw metrics", () => {
    expect(
      derivePerformanceMetrics({
        impressions: "1000",
        clicks: "25",
        spend: "50.25",
        conversions: "2.5",
        conversionValue: "201",
      })
    ).toEqual({
      ctr: "0.025",
      cpc: "2.01",
      cpa: "20.1",
      roas: "4",
    });
  });

  it("returns null instead of zero, Infinity or NaN for zero denominators", () => {
    expect(
      derivePerformanceMetrics({
        impressions: "0",
        clicks: "0",
        spend: "0",
        conversions: "0",
        conversionValue: "0",
      })
    ).toEqual({ ctr: null, cpc: null, cpa: null, roas: null });
  });

  it("rounds deterministically without binary floating-point math", () => {
    expect(divideDecimalStrings("1", "3")).toBe("0.333333");
    expect(divideDecimalStrings("2", "3")).toBe("0.666667");
    expect(divideDecimalStrings("0.1", "0.2")).toBe("0.5");
  });

  it("supports values beyond JavaScript safe integers", () => {
    expect(divideDecimalStrings("90071992547409930", "10")).toBe(
      "9007199254740993"
    );
  });

  it.each(["-1", "1,5", "NaN", "Infinity", "", "01"]) (
    "rejects invalid decimal %s",
    (value) => {
      expect(() => parseNonNegativeDecimal(value)).toThrow();
    }
  );
});
