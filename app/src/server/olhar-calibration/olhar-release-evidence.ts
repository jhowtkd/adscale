import type { SampleGuidance } from "@/server/human-quality/sampling/types";
import {
  buildTemplateCalibrationReport,
  type CenbrapCalibrationReport,
} from "./cenbrap-calibration";

export const OLHAR_RELEASE_EVIDENCE_SCHEMA_VERSION = 1;
export const OLHAR_RELEASE_MILESTONE = "v12.7";

export type OlharReleaseEvidenceStatus =
  | "ok"
  | "insufficient_sample"
  | "human_needed"
  | "template"
  | "tech_debt";

export const ART_DIRECTION_DENOMINATOR =
  "Cenbrap derivations with operator decisions from output_decision_events";
export const FACTUAL_EXPORT_DENOMINATOR =
  "Cenbrap derivations with dual verdict evidence — export safety separate from art direction";

export const BLENDED_FIELD_DENYLIST = [
  "overallPass",
  "combinedPass",
  "blendedAgreementRate",
  "qualityScore",
  "factualPassRate",
] as const;

export interface ArtDirectionMetrics {
  evidenceSource: "live_human";
  denominatorNote: string;
  evaluatedCampaignCount: number;
  evaluatedDerivationCount: number;
  humanDecisionCount: number;
  agreementRate: number | null;
  mismatchReasonCounts: Record<string, number>;
  overrideApprovedCount: number;
  missingDualVerdictCount: number;
  missingHumanDecisionCount: number;
}

export interface FactualExportMetrics {
  evidenceSource: "live_human";
  denominatorNote: string;
  approvedInvalidPreventedCount: number;
  semOpiniaoDetectionCount: number;
  exportBlockSeparationCount: number;
}

export interface OlharReleaseRequirementResult {
  id: string;
  result: "pass" | "pending" | "human_needed" | "insufficient_sample";
  note?: string;
}

export interface OlharReleaseEvidence {
  schemaVersion: typeof OLHAR_RELEASE_EVIDENCE_SCHEMA_VERSION;
  capturedAt: string;
  verifiedAt: string | null;
  milestone: typeof OLHAR_RELEASE_MILESTONE;
  status: OlharReleaseEvidenceStatus;
  calibrationSourcePath: string;
  contactSheetPath: string | null;
  artDirectionMetrics: ArtDirectionMetrics;
  factualExportMetrics: FactualExportMetrics;
  sampleGuidance: SampleGuidance[];
  qualityImprovementClaimed: false | null;
  acceptedGaps: string[];
  requirements: OlharReleaseRequirementResult[];
  technicalVerification: {
    phases138to141: "pass" | "human_needed";
    note: string;
  };
}

export function isSampleGuidanceBlocked(
  sampleGuidance: SampleGuidance[]
): boolean {
  return sampleGuidance.some((entry) => entry.additionalNeeded > 0);
}

export function resolveAgreementRateForEvidence(input: {
  agreementRate: number | null;
  sampleGuidance: SampleGuidance[];
}): number | null {
  if (isSampleGuidanceBlocked(input.sampleGuidance)) {
    return null;
  }
  return input.agreementRate;
}

export function countOverrideApproved(
  report: CenbrapCalibrationReport
): number {
  return report.operatorDecisions.filter(
    (decision) => decision.overrideApproved === true
  ).length;
}

export function resolveOlharReleaseStatus(input: {
  calibrationStatus: CenbrapCalibrationReport["status"];
  sampleGuidance: SampleGuidance[];
  humanDecisionCount: number;
  missingHumanDecisionCount: number;
  evaluatedDerivationCount: number;
}): OlharReleaseEvidenceStatus {
  if (input.calibrationStatus === "template") {
    return "template";
  }

  if (
    input.evaluatedDerivationCount > 0 &&
    input.humanDecisionCount === 0 &&
    input.missingHumanDecisionCount > 0
  ) {
    return "human_needed";
  }

  if (isSampleGuidanceBlocked(input.sampleGuidance)) {
    return "insufficient_sample";
  }

  if (input.calibrationStatus === "ok") {
    return "ok";
  }

  if (input.calibrationStatus === "insufficient_sample") {
    return "insufficient_sample";
  }

  return "tech_debt";
}

export function buildAcceptedGaps(input: {
  status: OlharReleaseEvidenceStatus;
  sampleGuidance: SampleGuidance[];
  calibrationNotes: string[];
}): string[] {
  const gaps: string[] = [];

  if (input.status === "template") {
    gaps.push(
      "Live Cenbrap calibration data unavailable — template artifact only."
    );
  }

  if (input.status === "human_needed") {
    gaps.push(
      "Jhonatan operator decisions missing for evaluated derivations — agreement claims withheld."
    );
  }

  for (const guidance of input.sampleGuidance) {
    if (guidance.additionalNeeded > 0) {
      gaps.push(
        `${guidance.blockedClaim}: ${guidance.currentCount}/${guidance.requiredCount} (need ${guidance.additionalNeeded} more).`
      );
    }
  }

  for (const note of input.calibrationNotes) {
    if (note.toLowerCase().includes("do not infer")) {
      gaps.push(note);
    }
  }

  return [...new Set(gaps)];
}

export function buildOlharReleaseRequirements(input: {
  status: OlharReleaseEvidenceStatus;
  humanDecisionCount: number;
  sampleGuidance: SampleGuidance[];
}): OlharReleaseRequirementResult[] {
  const sampleBlocked = isSampleGuidanceBlocked(input.sampleGuidance);

  const calib03Result =
    input.status === "ok"
      ? "pass"
      : input.status === "human_needed"
        ? "human_needed"
        : sampleBlocked
          ? "insufficient_sample"
          : "pending";

  const calib04Result =
    input.status === "template" || sampleBlocked || input.status === "human_needed"
      ? input.status === "human_needed"
        ? "human_needed"
        : "insufficient_sample"
      : "pass";

  return [
    {
      id: "CALIB-03",
      result: calib03Result,
      note: "Art-direction agreement, mismatch reasons and export-safety counters reported separately",
    },
    {
      id: "CALIB-04",
      result: calib04Result,
      note: "Factual/export metrics kept separate from art-direction quality metrics",
    },
  ];
}

export function buildOlharReleaseEvidence(input: {
  calibration: CenbrapCalibrationReport;
  capturedAt: string;
  verifiedAt?: string | null;
  calibrationSourcePath: string;
  contactSheetPath?: string | null;
  technicalVerification?: OlharReleaseEvidence["technicalVerification"];
}): OlharReleaseEvidence {
  const { metrics, sampleGuidance } = input.calibration;
  const overrideApprovedCount = countOverrideApproved(input.calibration);
  const agreementRate = resolveAgreementRateForEvidence({
    agreementRate: metrics.agreementRate,
    sampleGuidance,
  });

  const status = resolveOlharReleaseStatus({
    calibrationStatus: input.calibration.status,
    sampleGuidance,
    humanDecisionCount: metrics.decisionCount,
    missingHumanDecisionCount: metrics.missingHumanDecisionCount,
    evaluatedDerivationCount: metrics.evaluatedDerivationCount,
  });

  const acceptedGaps = buildAcceptedGaps({
    status,
    sampleGuidance,
    calibrationNotes: input.calibration.evidenceNotes,
  });

  return {
    schemaVersion: OLHAR_RELEASE_EVIDENCE_SCHEMA_VERSION,
    capturedAt: input.capturedAt,
    verifiedAt: input.verifiedAt ?? null,
    milestone: OLHAR_RELEASE_MILESTONE,
    status,
    calibrationSourcePath: input.calibrationSourcePath,
    contactSheetPath: input.contactSheetPath ?? null,
    artDirectionMetrics: {
      evidenceSource: "live_human",
      denominatorNote: ART_DIRECTION_DENOMINATOR,
      evaluatedCampaignCount: metrics.evaluatedCampaignCount,
      evaluatedDerivationCount: metrics.evaluatedDerivationCount,
      humanDecisionCount: metrics.decisionCount,
      agreementRate,
      mismatchReasonCounts: metrics.mismatchReasonCounts,
      overrideApprovedCount,
      missingDualVerdictCount: metrics.missingDualVerdictCount,
      missingHumanDecisionCount: metrics.missingHumanDecisionCount,
    },
    factualExportMetrics: {
      evidenceSource: "live_human",
      denominatorNote: FACTUAL_EXPORT_DENOMINATOR,
      approvedInvalidPreventedCount: metrics.approvedInvalidPreventedCount,
      semOpiniaoDetectionCount: metrics.semOpiniaoDetectionCount,
      exportBlockSeparationCount: metrics.exportBlockSeparationCount,
    },
    sampleGuidance,
    qualityImprovementClaimed:
      isSampleGuidanceBlocked(sampleGuidance) || status !== "ok" ? null : false,
    acceptedGaps,
    requirements: buildOlharReleaseRequirements({
      status,
      humanDecisionCount: metrics.decisionCount,
      sampleGuidance,
    }),
    technicalVerification: input.technicalVerification ?? {
      phases138to141: "human_needed",
      note: "Phases 138-141 automated verification green; live override UX confirmation pending operator review.",
    },
  };
}

export function buildTemplateOlharReleaseEvidence(
  capturedAt: string,
  paths: {
    calibrationSourcePath: string;
    contactSheetPath?: string | null;
  }
): OlharReleaseEvidence {
  return buildOlharReleaseEvidence({
    calibration: buildTemplateCalibrationReport(capturedAt),
    capturedAt,
    calibrationSourcePath: paths.calibrationSourcePath,
    contactSheetPath: paths.contactSheetPath ?? null,
    technicalVerification: {
      phases138to141: "human_needed",
      note: "Template evidence — technical phases verified; Cenbrap calibration awaits live data and operator decisions.",
    },
  });
}
