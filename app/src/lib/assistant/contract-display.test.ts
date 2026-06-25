import { describe, expect, it } from "vitest";
import {
  formatCreditImpact,
  getRiskLabelVariant,
  isTerminalActionStatus,
  parseActionCardDisplay,
} from "./contract-display";

describe("contract-display", () => {
  describe("parseActionCardDisplay", () => {
    it("parses valid display payload", () => {
      const result = parseActionCardDisplay({
        label: "Quick restyle",
        actionType: "quick_restyle",
        riskLabel: "medium",
        creditImpact: { kind: "fixed", credits: 5 },
        riskCopyLines: ["Uses credits"],
        confirmationPolicy: "required",
      });
      expect(result).toEqual({
        label: "Quick restyle",
        actionType: "quick_restyle",
        riskLabel: "medium",
        creditImpact: { kind: "fixed", credits: 5 },
        riskCopyLines: ["Uses credits"],
        confirmationPolicy: "required",
      });
    });

    it("returns null for invalid display", () => {
      expect(parseActionCardDisplay(null)).toBeNull();
      expect(parseActionCardDisplay({ actionType: "x" })).toBeNull();
    });
  });

  describe("formatCreditImpact", () => {
    it("formats fixed credits", () => {
      expect(formatCreditImpact({ kind: "fixed", credits: 10 })).toBe(
        "10 credits"
      );
    });

    it("prefers label when present", () => {
      expect(
        formatCreditImpact({ kind: "fixed", credits: 10, label: "~5 credits" })
      ).toBe("~5 credits");
    });
  });

  describe("getRiskLabelVariant", () => {
    it("maps risk levels to badge variants", () => {
      expect(getRiskLabelVariant("low")).toBe("success");
      expect(getRiskLabelVariant("medium")).toBe("warning");
      expect(getRiskLabelVariant("high")).toBe("danger");
      expect(getRiskLabelVariant(undefined)).toBe("neutral");
    });
  });

  describe("isTerminalActionStatus", () => {
    it("identifies terminal statuses", () => {
      expect(isTerminalActionStatus("completed")).toBe(true);
      expect(isTerminalActionStatus("failed")).toBe(true);
      expect(isTerminalActionStatus("canceled")).toBe(true);
      expect(isTerminalActionStatus("pending")).toBe(false);
      expect(isTerminalActionStatus("running")).toBe(false);
    });
  });
});
