import { describe, it, expect } from "vitest";
import { parseStyleIntensity } from "@/app/api/quick-tools/restyling/route";

describe("parseStyleIntensity", () => {
  it("parses valid intensities", () => {
    expect(parseStyleIntensity("soft")).toBe("soft");
    expect(parseStyleIntensity("medium")).toBe("medium");
    expect(parseStyleIntensity("strong")).toBe("strong");
  });

  it("defaults null to medium", () => {
    expect(parseStyleIntensity(null)).toBe("medium");
  });

  it("defaults undefined to medium", () => {
    expect(parseStyleIntensity(undefined)).toBe("medium");
  });

  it("rejects invalid string values", () => {
    expect(parseStyleIntensity("extreme")).toBeNull();
    expect(parseStyleIntensity("")).toBeNull();
    expect(parseStyleIntensity("hard")).toBeNull();
  });

  it("rejects non-string values", () => {
    expect(parseStyleIntensity(123 as unknown as string)).toBeNull();
    expect(parseStyleIntensity({} as unknown as string)).toBeNull();
  });
});
