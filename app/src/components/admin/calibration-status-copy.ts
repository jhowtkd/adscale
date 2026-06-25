import type {
  CalibrationSourceLabel,
  EvidenceLevel,
} from "@/server/brand-taste/calibration-signal-types";
import type { HumanQualitySourceLabel } from "@/server/human-quality/corpus";

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

export const HUMAN_QUALITY_SOURCE_LABEL_COPY: Record<HumanQualitySourceLabel, string> = {
  synthetic_fixture: "Fixture/seed evidence",
  operator_imported: "Operator-imported evidence",
  real_customer: "Real customer evidence",
};

export function formatHumanQualitySourceLabel(sourceLabel: HumanQualitySourceLabel): string {
  return HUMAN_QUALITY_SOURCE_LABEL_COPY[sourceLabel];
}

export function getHumanQualitySourceCaveat(
  sourceLabel: HumanQualitySourceLabel
): string | undefined {
  switch (sourceLabel) {
    case "synthetic_fixture":
      return "Validates workflow only — not customer-real proof.";
    case "operator_imported":
      return "Operator-imported — not equivalent to customer-real validation.";
    case "real_customer":
      return undefined;
  }
}

function nonCustomerEvidenceBanner(profile: CalibrationStatusInput): string {
  const { synthetic_fixture, operator_imported, real_customer } = profile.sourceComposition;

  if (profile.fixtureOnly || (real_customer === 0 && synthetic_fixture > 0 && operator_imported === 0)) {
    return "Evidência apenas de fixture/seed — valida operação, não cliente real";
  }
  if (real_customer === 0 && operator_imported > 0 && synthetic_fixture === 0) {
    return "Evidência importada pelo operador — não equivale a validação com cliente real";
  }
  return "Evidência de fixture/operador — não validado com cliente real";
}

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
      bannerText: nonCustomerEvidenceBanner(profile),
    };
  }

  return { label, variant: "neutral" };
}
