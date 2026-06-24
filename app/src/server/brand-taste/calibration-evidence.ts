import type { CalibrationSignal } from "@/server/db/schema";
import {
  classifyAgreement,
  type HumanCalibrationDecision,
} from "@/server/olhar-calibration/cenbrap-calibration";
import type {
  ExportStatusValue,
  OlharVerdictValue,
} from "@/server/ai/olhar/dual-verdict";
import type {
  BrandTasteProfile,
  CalibrationSourceLabel,
  EvidenceLevel,
} from "./calibration-signal-types";
import { buildBrandTasteProfile } from "./taste-profile";

export const PER_BRAND_EVIDENCE_SCHEMA_VERSION = 1 as const;

const SEED_CALIBRATION_MIN = 5;
const ASSISTED_MIN = 10;
const EVIDENCE_BACKED_REAL_MIN = 3;
const AGREEMENT_COMPARABLE_MIN = 5;

const FIXTURE_ONLY_CAVEAT_PT =
  "Evidência apenas de fixture/operador — não validado com cliente real";

const WITHHELD_CLAIM_KEYS = new Set([
  "customer_real_validation",
  "commercial_quality_claim",
  "validated_against_customer_real",
]);

export interface PerBrandEvidenceReport {
  schemaVersion: typeof PER_BRAND_EVIDENCE_SCHEMA_VERSION;
  capturedAt: string;
  clientProfileId: string;
  workspaceId: string;
  evidenceLevel: EvidenceLevel;
  decisionCount: number;
  comparableCount: number;
  agreementRate: number | null;
  sourceComposition: Record<CalibrationSourceLabel, number>;
  fixtureOnly: boolean;
  fixtureCaveat: string | null;
  claimsAllowed: string[];
  claimsBlocked: string[];
  withheldClaims: string[];
  missingConditions: string[];
  caveats: string[];
}

export interface CalibrationEvidenceReport {
  capturedAt: string;
  brandProfiles: Array<{
    clientProfileId: string;
    evidenceLevel: EvidenceLevel;
    decisionCount: number;
    comparableCount: number;
    agreementRate: number | null;
    mismatchTrend: Record<string, number>;
    uncertaintyReduction: {
      beforeHighUncertaintyRate: number | null;
      afterHighUncertaintyRate: number | null;
    };
  }>;
  globalMetrics: {
    totalSignals: number;
    totalComparable: number;
    agreementRate: number | null;
    fixtureOnly: boolean;
  };
  claimsAllowed: string[];
  claimsBlocked: string[];
  dependsOnOperator: string[];
}

export function computeAgreementRate(
  signals: CalibrationSignal[]
): { comparable: number; agree: number; rate: number | null } {
  let comparable = 0;
  let agree = 0;

  for (const signal of signals) {
    const classification = classifyAgreement({
      olharVerdict: signal.systemOlharVerdict as OlharVerdictValue | null,
      exportStatus: signal.systemExportStatus as ExportStatusValue | null,
      humanDecision: signal.humanVerdict as HumanCalibrationDecision,
    });

    if (classification === "agree" || classification === "mismatch") {
      comparable += 1;
      if (classification === "agree") agree += 1;
    }
  }

  return {
    comparable,
    agree,
    rate: comparable > 0 ? agree / comparable : null,
  };
}

export function buildMismatchTrend(
  signals: CalibrationSignal[]
): Record<string, number> {
  const trend: Record<string, number> = {};

  for (const signal of signals) {
    const classification = classifyAgreement({
      olharVerdict: signal.systemOlharVerdict as OlharVerdictValue | null,
      exportStatus: signal.systemExportStatus as ExportStatusValue | null,
      humanDecision: signal.humanVerdict as HumanCalibrationDecision,
    });

    if (classification === "mismatch") {
      const bucket = signal.mismatchBucket ?? "unclear_sample";
      trend[bucket] = (trend[bucket] ?? 0) + 1;
    }
  }

  return trend;
}

export function buildCalibrationEvidenceReport(input: {
  profiles: BrandTasteProfile[];
  allSignals: CalibrationSignal[];
  beforeUncertaintyRate?: number | null;
  afterUncertaintyRate?: number | null;
}): CalibrationEvidenceReport {
  const globalAgreement = computeAgreementRate(input.allSignals);
  const fixtureOnly = input.allSignals.every(
    (s) => s.sourceLabel === "synthetic_fixture"
  );

  const { claimsAllowed, claimsBlocked } = evaluateClaimsMatrix({
    humanDecisionCount: input.allSignals.length,
    comparableCount: globalAgreement.comparable,
    agreementRate: globalAgreement.rate,
    fixtureOnly,
    evidenceLevel: input.profiles[0]?.evidenceLevel ?? "uncalibrated",
  });

  return {
    capturedAt: new Date().toISOString(),
    brandProfiles: input.profiles.map((profile) => {
      const brandSignals = input.allSignals.filter(
        (s) => s.clientProfileId === profile.clientProfileId
      );
      const agreement = computeAgreementRate(brandSignals);

      return {
        clientProfileId: profile.clientProfileId,
        evidenceLevel: profile.evidenceLevel,
        decisionCount: profile.decisionCount,
        comparableCount: agreement.comparable,
        agreementRate: agreement.rate,
        mismatchTrend: buildMismatchTrend(brandSignals),
        uncertaintyReduction: {
          beforeHighUncertaintyRate: input.beforeUncertaintyRate ?? null,
          afterHighUncertaintyRate: input.afterUncertaintyRate ?? null,
        },
      };
    }),
    globalMetrics: {
      totalSignals: input.allSignals.length,
      totalComparable: globalAgreement.comparable,
      agreementRate: globalAgreement.rate,
      fixtureOnly,
    },
    claimsAllowed,
    claimsBlocked,
    dependsOnOperator: buildOperatorDependencies(input.allSignals.length, fixtureOnly),
  };
}

export function evaluateClaimsMatrix(input: {
  humanDecisionCount: number;
  comparableCount: number;
  agreementRate: number | null;
  fixtureOnly: boolean;
  evidenceLevel: EvidenceLevel;
}): { claimsAllowed: string[]; claimsBlocked: string[] } {
  const claimsAllowed: string[] = [];
  const claimsBlocked: string[] = [
    "customer_real_validation",
    "commercial_quality_claim",
  ];

  if (input.evidenceLevel !== "uncalibrated") {
    claimsAllowed.push("initial_art_direction_rules_applied");
  }

  if (input.humanDecisionCount >= 5 && input.evidenceLevel !== "uncalibrated") {
    claimsAllowed.push("calibrated_from_operator_decisions");
  } else {
    claimsBlocked.push("calibrated_from_operator_decisions");
  }

  if (
    input.comparableCount >= 5 &&
    input.agreementRate != null &&
    !input.fixtureOnly
  ) {
    claimsAllowed.push("agreement_rate_reported");
  } else {
    claimsBlocked.push("agreement_rate_reported");
  }

  if (input.fixtureOnly) {
    claimsBlocked.push("validated_against_customer_real");
  } else if (input.evidenceLevel === "evidence_backed") {
    claimsAllowed.push("validated_against_customer_real");
  }

  if (input.evidenceLevel === "assisted" || input.evidenceLevel === "evidence_backed") {
    claimsAllowed.push("system_applies_learned_brand_criteria");
  }

  return { claimsAllowed, claimsBlocked };
}

function buildOperatorDependencies(
  decisionCount: number,
  fixtureOnly: boolean
): string[] {
  const deps: string[] = [];

  if (decisionCount < 5) {
    deps.push(`${5 - decisionCount} more Jhonatan calibration decision(s) needed for seed gate.`);
  }

  if (fixtureOnly) {
    deps.push("Customer-real corpus rows still required for evidence_backed claims.");
  }

  return deps;
}

export function buildBrandProfilesFromSignals(
  signalsByClient: Map<string, { workspaceId: string; signals: CalibrationSignal[] }>
): BrandTasteProfile[] {
  const profiles: BrandTasteProfile[] = [];

  for (const [clientProfileId, entry] of signalsByClient) {
    profiles.push(
      buildBrandTasteProfile({
        clientProfileId,
        workspaceId: entry.workspaceId,
        signals: entry.signals,
      })
    );
  }

  return profiles;
}

export function buildMissingConditions(input: {
  profile: BrandTasteProfile;
  agreement: { comparable: number; rate: number | null };
  claims: { claimsAllowed: string[]; claimsBlocked: string[] };
}): string[] {
  const conditions: string[] = [];
  const { profile, agreement } = input;

  if (profile.decisionCount < SEED_CALIBRATION_MIN) {
    conditions.push(
      `Faltam ${SEED_CALIBRATION_MIN - profile.decisionCount} decisão(ões) de calibração para atingir calibração inicial (mínimo ${SEED_CALIBRATION_MIN}).`
    );
  }

  if (
    profile.decisionCount > 0 &&
    profile.decisionCount < ASSISTED_MIN &&
    profile.evidenceLevel !== "assisted" &&
    profile.evidenceLevel !== "evidence_backed"
  ) {
    conditions.push(
      `Faltam ${ASSISTED_MIN - profile.decisionCount} decisão(ões) para calibração assistida (mínimo ${ASSISTED_MIN}).`
    );
  }

  if (profile.sourceComposition.real_customer < EVIDENCE_BACKED_REAL_MIN) {
    const needed = EVIDENCE_BACKED_REAL_MIN - profile.sourceComposition.real_customer;
    if (needed > 0 && profile.decisionCount > 0) {
      conditions.push(
        `Faltam ${needed} sinal(is) de cliente real para calibração com evidência (mínimo ${EVIDENCE_BACKED_REAL_MIN}).`
      );
    }
  }

  if (profile.sourceComposition.real_customer === 0 && profile.decisionCount > 0) {
    conditions.push(
      "Sinais apenas de fixture/operador — validação com cliente real bloqueada até amostra real."
    );
  }

  if (agreement.comparable < AGREEMENT_COMPARABLE_MIN && profile.decisionCount > 0) {
    conditions.push(
      `Faltam ${AGREEMENT_COMPARABLE_MIN - agreement.comparable} decisão(ões) comparáveis para relatório de taxa de concordância (mínimo ${AGREEMENT_COMPARABLE_MIN}).`
    );
  }

  return conditions;
}

export function buildPerBrandEvidenceReport(input: {
  clientProfileId: string;
  workspaceId: string;
  signals: CalibrationSignal[];
}): PerBrandEvidenceReport {
  const profile = buildBrandTasteProfile({
    clientProfileId: input.clientProfileId,
    workspaceId: input.workspaceId,
    signals: input.signals,
  });

  const agreement = computeAgreementRate(input.signals);
  const fixtureOnly =
    profile.sourceComposition.real_customer === 0 && profile.decisionCount > 0;

  const claims = evaluateClaimsMatrix({
    humanDecisionCount: profile.decisionCount,
    comparableCount: agreement.comparable,
    agreementRate: agreement.rate,
    fixtureOnly,
    evidenceLevel: profile.evidenceLevel,
  });

  const missingConditions = buildMissingConditions({
    profile,
    agreement,
    claims,
  });

  const withheldClaims = claims.claimsBlocked.filter((key) =>
    WITHHELD_CLAIM_KEYS.has(key)
  );

  return {
    schemaVersion: PER_BRAND_EVIDENCE_SCHEMA_VERSION,
    capturedAt: new Date().toISOString(),
    clientProfileId: profile.clientProfileId,
    workspaceId: profile.workspaceId,
    evidenceLevel: profile.evidenceLevel,
    decisionCount: profile.decisionCount,
    comparableCount: agreement.comparable,
    agreementRate: agreement.rate,
    sourceComposition: profile.sourceComposition,
    fixtureOnly,
    fixtureCaveat: fixtureOnly ? FIXTURE_ONLY_CAVEAT_PT : null,
    claimsAllowed: claims.claimsAllowed,
    claimsBlocked: claims.claimsBlocked,
    withheldClaims,
    missingConditions,
    caveats: profile.caveats,
  };
}
