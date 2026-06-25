import { describe, expect, it } from "vitest";
import {
  EVIDENCE_LEVEL_LABELS,
  formatHumanQualitySourceLabel,
  getCalibrationStatusDisplay,
  getHumanQualitySourceCaveat,
} from "./calibration-status-copy";

const FORBIDDEN_STRINGS = ["Totalmente calibrada", "customer-validated"];

describe("getCalibrationStatusDisplay", () => {
  it("never returns marketing strings when fixtureOnly is true", () => {
    const display = getCalibrationStatusDisplay({
      fixtureOnly: true,
      evidenceLevel: "seed_calibrated",
      sourceComposition: {
        synthetic_fixture: 5,
        operator_imported: 0,
        real_customer: 0,
      },
      decisionCount: 5,
    });

    const serialized = JSON.stringify(display);
    for (const forbidden of FORBIDDEN_STRINGS) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("returns warning variant with fixture-only banner for synthetic_fixture profiles", () => {
    const display = getCalibrationStatusDisplay({
      fixtureOnly: true,
      evidenceLevel: "seed_calibrated",
      sourceComposition: {
        synthetic_fixture: 5,
        operator_imported: 0,
        real_customer: 0,
      },
      decisionCount: 5,
    });

    expect(display.variant).toBe("warning");
    expect(display.bannerText).toContain("fixture/seed");
    expect(display.bannerText).toContain("não cliente real");
  });

  it("returns operator-specific banner when only operator_imported evidence exists", () => {
    const display = getCalibrationStatusDisplay({
      fixtureOnly: false,
      evidenceLevel: "assisted",
      sourceComposition: {
        synthetic_fixture: 0,
        operator_imported: 4,
        real_customer: 0,
      },
      decisionCount: 4,
    });

    expect(display.variant).toBe("warning");
    expect(display.bannerText).toContain("operador");
    expect(display.bannerText).not.toContain("fixture/seed");
  });

  it("maps human quality source labels to fixture-safe display copy", () => {
    expect(formatHumanQualitySourceLabel("synthetic_fixture")).toBe("Fixture/seed evidence");
    expect(formatHumanQualitySourceLabel("operator_imported")).toBe("Operator-imported evidence");
    expect(formatHumanQualitySourceLabel("real_customer")).toBe("Real customer evidence");
    expect(getHumanQualitySourceCaveat("synthetic_fixture")).toMatch(/workflow only/i);
    expect(getHumanQualitySourceCaveat("synthetic_fixture")).not.toMatch(/product proof/i);
    expect(getHumanQualitySourceCaveat("real_customer")).toBeUndefined();
  });

  it("maps evidence levels to neutral PT-BR labels when real_customer > 0", () => {
    const base = {
      fixtureOnly: false,
      sourceComposition: {
        synthetic_fixture: 0,
        operator_imported: 0,
        real_customer: 3,
      },
      decisionCount: 12,
    };

    expect(
      getCalibrationStatusDisplay({ ...base, evidenceLevel: "uncalibrated" }).label
    ).toBe(EVIDENCE_LEVEL_LABELS.uncalibrated);
    expect(
      getCalibrationStatusDisplay({ ...base, evidenceLevel: "seed_calibrated" }).label
    ).toBe(EVIDENCE_LEVEL_LABELS.seed_calibrated);
    expect(
      getCalibrationStatusDisplay({ ...base, evidenceLevel: "assisted" }).label
    ).toBe(EVIDENCE_LEVEL_LABELS.assisted);
    expect(
      getCalibrationStatusDisplay({ ...base, evidenceLevel: "evidence_backed" }).label
    ).toBe(EVIDENCE_LEVEL_LABELS.evidence_backed);

    const display = getCalibrationStatusDisplay({
      ...base,
      evidenceLevel: "evidence_backed",
    });
    expect(display.variant).toBe("neutral");
    expect(display.bannerText).toBeUndefined();
  });

  it("warns when real_customer is zero but decisions exist", () => {
    const display = getCalibrationStatusDisplay({
      fixtureOnly: false,
      evidenceLevel: "assisted",
      sourceComposition: {
        synthetic_fixture: 10,
        operator_imported: 2,
        real_customer: 0,
      },
      decisionCount: 12,
    });

    expect(display.variant).toBe("warning");
    expect(display.bannerText).toBeDefined();
  });
});
