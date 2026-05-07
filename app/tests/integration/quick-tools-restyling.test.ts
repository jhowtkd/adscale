import { describe, it, expect } from "vitest";

function parseStyleIntensity(raw: FormDataEntryValue | null): "soft" | "medium" | "strong" | null {
  if (typeof raw === "string" && ["soft", "medium", "strong"].includes(raw)) {
    return raw as "soft" | "medium" | "strong";
  }
  if (raw == null) {
    return "medium";
  }
  return null;
}

describe("quick-tools restyling styleIntensity parsing", () => {
  it("parses strong styleIntensity", () => {
    expect(parseStyleIntensity("strong")).toBe("strong");
  });

  it("defaults null to medium", () => {
    expect(parseStyleIntensity(null)).toBe("medium");
  });

  it("rejects invalid styleIntensity", () => {
    expect(parseStyleIntensity("extreme")).toBeNull();
  });
});