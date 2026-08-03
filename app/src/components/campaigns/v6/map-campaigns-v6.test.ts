import { describe, expect, it } from "vitest";
import { statusToBadgeVariant } from "./map-campaigns-v6";

describe("statusToBadgeVariant", () => {
  it("keeps failed campaigns dangerous while generating campaigns stay warning", () => {
    expect(statusToBadgeVariant("failed")).toBe("danger");
    expect(statusToBadgeVariant("generating")).toBe("warning");
  });
});
