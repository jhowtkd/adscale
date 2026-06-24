import type {
  CalibrationSourceLabel,
  EvidenceLevel,
} from "@/server/brand-taste/calibration-signal-types";

export const EVIDENCE_LEVEL_LABELS: Record<EvidenceLevel, string> = {
  uncalibrated: "Sem calibração suficiente",
  seed_calibrated: "Calibração inicial (operador)",
  assisted: "Calibração assistida",
  evidence_backed: "Calibração com evidência de cliente",
};

export type CalibrationStatusInput = {
  fixtureOnly: boolean;
  evidenceLevel: EvidenceLevel;
  sourceComposition: Record<CalibrationSourceLabel, number>;
  decisionCount: number;
};

export type CalibrationStatusDisplay = {
  label: string;
  variant: "neutral" | "warning";
  bannerText?: string;
};

const FIXTURE_ONLY_BANNER =
  "Evidência apenas de fixture/operador — não validado com cliente real";

export function getCalibrationStatusDisplay(
  profile: CalibrationStatusInput
): CalibrationStatusDisplay {
  const label = EVIDENCE_LEVEL_LABELS[profile.evidenceLevel];
  const needsWarning =
    profile.fixtureOnly ||
    (profile.sourceComposition.real_customer === 0 && profile.decisionCount > 0);

  if (needsWarning) {
    return {
      label,
      variant: "warning",
      bannerText: FIXTURE_ONLY_BANNER,
    };
  }

  return { label, variant: "neutral" };
}
