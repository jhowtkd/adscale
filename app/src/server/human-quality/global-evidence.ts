import type { HumanQualitySourceLabel } from "./corpus";
import type { SampleCoverageReport } from "./sampling/coverage";

export const GLOBAL_CORPUS_EVIDENCE_SCHEMA_VERSION = 1 as const;

export type GlobalCorpusOperationalStatus =
  | "insufficient_sample"
  | "insufficient_corpus"
  | "human_needed"
  | "ok";

export interface ClientCorpusEvaluationScope {
  clientProfileId: string;
  workspaceId: string;
  evaluationCount: number;
}

export interface GlobalCorpusEvidenceReport {
  schemaVersion: typeof GLOBAL_CORPUS_EVIDENCE_SCHEMA_VERSION;
  capturedAt: string;
  evaluatedItemCount: number;
  pendingItemCount: number;
  sourceComposition: Record<HumanQualitySourceLabel, number>;
  fixtureOnly: boolean;
  sampleCoverage: SampleCoverageReport;
  operationalStatus: GlobalCorpusOperationalStatus;
  claimsAllowed: string[];
  claimsBlocked: string[];
  withheldClaims: string[];
  dependsOnOperator: string[];
  brandTasteClientScopes: ClientCorpusEvaluationScope[];
}

export function emptySourceComposition(): Record<HumanQualitySourceLabel, number> {
  return {
    synthetic_fixture: 0,
    operator_imported: 0,
    real_customer: 0,
  };
}

export function mergeSourceComposition(
  counts: Array<Partial<Record<HumanQualitySourceLabel, number>>>
): Record<HumanQualitySourceLabel, number> {
  const merged = emptySourceComposition();
  for (const entry of counts) {
    for (const label of Object.keys(merged) as HumanQualitySourceLabel[]) {
      merged[label] += entry[label] ?? 0;
    }
  }
  return merged;
}

export function isFixtureOnlySourceComposition(
  composition: Record<HumanQualitySourceLabel, number>
): boolean {
  // No real_customer rows in the active scope — operator_imported and synthetic_fixture do not unlock customer-real claims.
  return composition.real_customer === 0;
}

export function groupEvaluationsByClientProfile<
  T extends { item: { clientProfileId: string; workspaceId: string } },
>(rows: T[]): ClientCorpusEvaluationScope[] {
  const scopes = new Map<string, ClientCorpusEvaluationScope>();

  for (const row of rows) {
    const key = `${row.item.workspaceId}:${row.item.clientProfileId}`;
    const existing = scopes.get(key);
    if (existing) {
      existing.evaluationCount += 1;
      continue;
    }

    scopes.set(key, {
      clientProfileId: row.item.clientProfileId,
      workspaceId: row.item.workspaceId,
      evaluationCount: 1,
    });
  }

  return Array.from(scopes.values()).sort((a, b) =>
    a.clientProfileId.localeCompare(b.clientProfileId)
  );
}

export function resolveOperationalStatus(
  sampleCoverage: SampleCoverageReport
): GlobalCorpusOperationalStatus {
  if (sampleCoverage.evaluatedItemCount === 0) {
    return "human_needed";
  }

  const gateStatuses = sampleCoverage.gates.map((gate) => gate.status);
  if (gateStatuses.some((status) => status === "insufficient_corpus")) {
    return "insufficient_corpus";
  }
  if (gateStatuses.some((status) => status === "insufficient_sample")) {
    return "insufficient_sample";
  }
  if (sampleCoverage.nextGate === "release") {
    return "ok";
  }

  return "insufficient_sample";
}

export function evaluateGlobalCorpusClaims(input: {
  evaluatedItemCount: number;
  fixtureOnly: boolean;
  operationalStatus: GlobalCorpusOperationalStatus;
  sampleCoverage: SampleCoverageReport;
}): {
  claimsAllowed: string[];
  claimsBlocked: string[];
  withheldClaims: string[];
  dependsOnOperator: string[];
} {
  const claimsAllowed: string[] = [];
  const claimsBlocked: string[] = [
    "commercial_quality_claim",
    "customer_real_validation",
  ];
  const withheldClaims = [
    ...new Set(input.sampleCoverage.gates.flatMap((gate) => gate.blockedClaims)),
  ];
  const dependsOnOperator: string[] = [];

  if (input.evaluatedItemCount > 0) {
    claimsAllowed.push("global_corpus_evaluations_recorded");
  } else {
    claimsBlocked.push("global_corpus_evaluations_recorded");
    dependsOnOperator.push(
      "Evaluate pending global corpus items before any quality-improvement claims."
    );
  }

  if (input.operationalStatus === "ok") {
    claimsAllowed.push("global_calibration_reports_available");
    claimsAllowed.push("global_learning_impact_available");
    claimsAllowed.push("global_quality_improvement_available");
  } else {
    claimsBlocked.push("global_calibration_reports_available");
    claimsBlocked.push("global_learning_impact_available");
    claimsBlocked.push("global_quality_improvement_available");
    dependsOnOperator.push(input.sampleCoverage.nextOperatorAction);
  }

  if (input.fixtureOnly) {
    claimsBlocked.push("validated_against_customer_real");
    dependsOnOperator.push(
      "No real_customer rows in the active scope — operator_imported and synthetic_fixture evidence cannot unlock customer-real validation claims."
    );
  } else if (input.evaluatedItemCount >= 5 && input.operationalStatus === "ok") {
    claimsAllowed.push("validated_against_customer_real");
  }

  if (input.evaluatedItemCount < 5) {
    dependsOnOperator.push(
      `${5 - input.evaluatedItemCount} more human evaluation(s) needed for global sampling gates.`
    );
  }

  return { claimsAllowed, claimsBlocked, withheldClaims, dependsOnOperator };
}

export function buildGlobalCorpusEvidenceReport(input: {
  capturedAt: string;
  evaluatedItemCount: number;
  pendingItemCount: number;
  sourceComposition: Record<HumanQualitySourceLabel, number>;
  sampleCoverage: SampleCoverageReport;
  brandTasteClientScopes: ClientCorpusEvaluationScope[];
}): GlobalCorpusEvidenceReport {
  const fixtureOnly = isFixtureOnlySourceComposition(input.sourceComposition);
  const operationalStatus = resolveOperationalStatus(input.sampleCoverage);
  const claims = evaluateGlobalCorpusClaims({
    evaluatedItemCount: input.evaluatedItemCount,
    fixtureOnly,
    operationalStatus,
    sampleCoverage: input.sampleCoverage,
  });

  return {
    schemaVersion: GLOBAL_CORPUS_EVIDENCE_SCHEMA_VERSION,
    capturedAt: input.capturedAt,
    evaluatedItemCount: input.evaluatedItemCount,
    pendingItemCount: input.pendingItemCount,
    sourceComposition: input.sourceComposition,
    fixtureOnly,
    sampleCoverage: input.sampleCoverage,
    operationalStatus,
    claimsAllowed: claims.claimsAllowed,
    claimsBlocked: claims.claimsBlocked,
    withheldClaims: claims.withheldClaims,
    dependsOnOperator: claims.dependsOnOperator,
    brandTasteClientScopes: input.brandTasteClientScopes,
  };
}
