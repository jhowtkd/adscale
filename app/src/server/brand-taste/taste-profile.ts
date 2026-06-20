import type { CalibrationSignal } from "@/server/db/schema";
import {
  classifyAgreement,
  inferMismatchBucket,
  type HumanCalibrationDecision,
} from "@/server/olhar-calibration/cenbrap-calibration";
import type {
  OlharVerdictValue,
  ExportStatusValue,
} from "@/server/ai/olhar/dual-verdict";
import type {
  BrandTasteProfile,
  CalibrationSourceLabel,
  EvidenceLevel,
} from "./calibration-signal-types";

const SEED_CALIBRATION_MIN = 5;
const ASSISTED_MIN = 10;
const EVIDENCE_BACKED_REAL_MIN = 3;

export function computeSourceComposition(
  signals: Pick<CalibrationSignal, "sourceLabel">[]
): Record<CalibrationSourceLabel, number> {
  const composition: Record<CalibrationSourceLabel, number> = {
    synthetic_fixture: 0,
    operator_imported: 0,
    real_customer: 0,
  };

  for (const signal of signals) {
    const label = signal.sourceLabel as CalibrationSourceLabel;
    if (label in composition) {
      composition[label] += 1;
    }
  }

  return composition;
}

export function computeEvidenceLevel(input: {
  decisionCount: number;
  sourceComposition: Record<CalibrationSourceLabel, number>;
}): EvidenceLevel {
  const { decisionCount, sourceComposition } = input;
  const realCount = sourceComposition.real_customer;

  if (decisionCount === 0) {
    return "uncalibrated";
  }

  if (realCount >= EVIDENCE_BACKED_REAL_MIN && decisionCount >= ASSISTED_MIN) {
    return "evidence_backed";
  }

  if (decisionCount >= ASSISTED_MIN) {
    return "assisted";
  }

  if (decisionCount >= SEED_CALIBRATION_MIN) {
    return "seed_calibrated";
  }

  return "uncalibrated";
}

export function buildEvidenceCaveats(input: {
  evidenceLevel: EvidenceLevel;
  sourceComposition: Record<CalibrationSourceLabel, number>;
  decisionCount: number;
}): string[] {
  const caveats: string[] = [];

  if (input.decisionCount < SEED_CALIBRATION_MIN) {
    caveats.push(
      `Only ${input.decisionCount} calibration decision(s); need ${SEED_CALIBRATION_MIN} for seed calibration.`
    );
  }

  if (
    input.sourceComposition.real_customer === 0 &&
    input.decisionCount > 0
  ) {
    caveats.push(
      "All calibration signals are fixture or operator-imported — not customer-real validation."
    );
  }

  if (input.evidenceLevel === "uncalibrated" && input.decisionCount > 0) {
    caveats.push("Profile is below seed calibration threshold.");
  }

  return caveats;
}

function bucketRationale(bucket: string | null): string {
  switch (bucket) {
    case "system_too_permissive":
      return "System approved outputs that human rejected as not entering.";
    case "system_too_harsh":
      return "System blocked outputs that human would accept.";
    case "voice_nuance":
      return "Human marked quase — voice or gestalt nuance.";
    case "export_setup_issue":
      return "Export/setup conflict between system and human judgment.";
    case "acceptable_override":
      return "Human override of system verdict.";
    default:
      return "Unclear or mixed calibration pattern.";
  }
}

export function buildBrandTasteProfile(input: {
  clientProfileId: string;
  workspaceId: string;
  signals: CalibrationSignal[];
}): BrandTasteProfile {
  const sourceComposition = computeSourceComposition(input.signals);
  const decisionCount = input.signals.length;

  const comparableCount = input.signals.filter((signal) => {
    const agreement = classifyAgreement({
      olharVerdict: signal.systemOlharVerdict as OlharVerdictValue | null,
      exportStatus: signal.systemExportStatus as ExportStatusValue | null,
      humanDecision: signal.humanVerdict as HumanCalibrationDecision,
    });
    return agreement === "agree" || agreement === "mismatch";
  }).length;

  const groupPatterns = (
    verdict: HumanCalibrationDecision
  ): BrandTasteProfile["positivePatterns"] => {
    const grouped = new Map<string, CalibrationSignal[]>();

    for (const signal of input.signals) {
      if (signal.humanVerdict !== verdict) continue;
      const bucket =
        signal.mismatchBucket ??
        inferMismatchBucket({
          olharVerdict: signal.systemOlharVerdict as OlharVerdictValue | null,
          exportStatus: signal.systemExportStatus as ExportStatusValue | null,
          humanDecision: signal.humanVerdict as HumanCalibrationDecision,
        });
      const key = bucket ?? "unclear_sample";
      const list = grouped.get(key) ?? [];
      list.push(signal);
      grouped.set(key, list);
    }

    return Array.from(grouped.entries()).map(([bucket, rows]) => ({
      verdict,
      mismatchBucket: bucket === "unclear_sample" ? null : (bucket as BrandTasteProfile["positivePatterns"][0]["mismatchBucket"]),
      count: rows.length,
      sampleDerivationIds: rows.slice(0, 5).map((r) => r.derivationId),
      rationale: bucketRationale(bucket),
    }));
  };

  const evidenceLevel = computeEvidenceLevel({ decisionCount, sourceComposition });
  const caveats = buildEvidenceCaveats({
    evidenceLevel,
    sourceComposition,
    decisionCount,
  });

  return {
    clientProfileId: input.clientProfileId,
    workspaceId: input.workspaceId,
    evidenceLevel,
    sourceComposition,
    positivePatterns: groupPatterns("entra"),
    rejectionPatterns: groupPatterns("nao_entra"),
    quasePatterns: groupPatterns("quase"),
    decisionCount,
    comparableCount,
    generatedAt: new Date().toISOString(),
    caveats,
  };
}
