import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatUsageDay } from "./CreditUsageChart";

// usageSeries days are UTC. West of UTC (Brazil), formatting midnight UTC in
// the local zone showed every bar with the previous day ("30/09").
describe("formatUsageDay", () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/Sao_Paulo";
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it("labels the UTC day itself, whatever the local zone", () => {
    expect(new Date("2026-10-01").getDate()).toBe(30); // the local zone really is west of UTC
    expect(formatUsageDay("2026-10-01", "pt-BR")).toBe("01/10");
    expect(formatUsageDay("2026-01-01", "pt-BR")).toBe("01/01");
    expect(formatUsageDay("2026-10-01", "en")).toBe("10/1");
  });
});
