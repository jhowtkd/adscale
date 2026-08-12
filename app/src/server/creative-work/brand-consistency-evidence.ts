import { createHash } from "node:crypto";

import {
  HUMAN_QUALITY_SOURCE_LABELS,
  type HumanQualitySourceLabel,
} from "@/server/human-quality/corpus";
import {
  baselineCoverageReport,
  productionPilotBaselineSchema,
  type ProductionPilotBaseline,
  type ProductionPilotRequestBaseline,
} from "@/server/human-quality/production-pilot-baseline";

import { canonicalJsonStringify } from "./canonical-json";

export const BRAND_CONSISTENCY_EVIDENCE_SCHEMA_VERSION = 1 as const;

type RequestStatus = "pass" | "fail" | "mixed" | "pending";
type BaselineStatus = "pass" | "human_needed" | "fail";
type BaselineProvider = "manifest-observation" | "e2e-controlled-replay";

export interface BrandConsistencyExecution {
  provider: BaselineProvider;
  providerCalls: number;
  durationMs?: number | null;
  rssBytes?: number | null;
}

interface RequestHashes {
  input: string;
  selection: string;
  snapshot: string | null;
  result: string;
  evidence: string;
}

export interface BrandConsistencyEvidenceRequest {
  input: {
    requestId: string;
    requestText: string;
    format: string;
    contentPattern: string;
    effectivePrompt: string;
    effectiveSpecSummary: string | null;
  };
  referenceSelection: {
    selectedReferences: ProductionPilotRequestBaseline["selectedReferences"];
  };
  snapshot: {
    available: boolean;
    version: string | null;
    declaredHash: string | null;
  };
  result: {
    observedHardFailures: string[];
    humanVerdict: RequestStatus;
    humanNotes: string | null;
    artifactRef: string | null;
    artifact: ProductionPilotRequestBaseline["artifact"] | null;
  };
  evidence: {
    source: HumanQualitySourceLabel;
    divergences: string[];
  };
  hashes: RequestHashes;
}

export interface BrandConsistencyEvidence {
  schemaVersion: typeof BRAND_CONSISTENCY_EVIDENCE_SCHEMA_VERSION;
  reportType: "brand-consistency-baseline";
  generatedAt: string;
  status: BaselineStatus;
  pilotId: string;
  brandName: string;
  sourceComposition: Record<HumanQualitySourceLabel, number>;
  coverage: ReturnType<typeof baselineCoverageReport> & { evaluatedCount: number };
  requests: BrandConsistencyEvidenceRequest[];
  execution: {
    provider: BaselineProvider;
    paidGeneration: false;
    providerCalls: number;
  };
  evidenceClasses: {
    automatedBaseline: { status: "recorded" | "not_run"; count: number };
    humanEvaluation: { status: "recorded" | "pending"; count: number };
    paidGeneration: { status: "not_run"; count: 0; costUsd: null };
  };
  metrics: {
    durationMs: number | null;
    rssBytes: number | null;
    tokens: null;
    costUsd: null;
  };
  claimsAllowed: string[];
  claimsBlocked: string[];
  withheldClaims: string[];
  divergences: string[];
  hashes: {
    inputs: string;
    selection: string;
    snapshots: string;
    results: string;
    evidence: string;
  };
}

const CUSTOMER_REAL_CLAIM = "validated_against_customer_real";

function stableHash(value: unknown): string {
  return createHash("sha256")
    .update(canonicalJsonStringify(value))
    .digest("hex");
}

function isSourceLabel(value: string): value is HumanQualitySourceLabel {
  return (HUMAN_QUALITY_SOURCE_LABELS as readonly string[]).includes(value);
}

function resolveSource(
  baseline: ProductionPilotBaseline,
  request: ProductionPilotRequestBaseline,
): HumanQualitySourceLabel {
  if (request.source) return request.source;
  if (baseline.provenance.evidenceSource) return baseline.provenance.evidenceSource;
  if (isSourceLabel(baseline.provenance.source)) return baseline.provenance.source;
  return "operator_imported";
}

function sorted(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function divergencesFor(request: ProductionPilotRequestBaseline): string[] {
  const divergences: string[] = [];
  if (request.expectedHardFailures) {
    const expected = sorted(request.expectedHardFailures);
    const observed = sorted(request.observedHardFailures);
    if (canonicalJsonStringify(expected) !== canonicalJsonStringify(observed)) {
      divergences.push(
        `${request.requestId}: observedHardFailures diverged from the expected fixture result`,
      );
    }
  }
  if (
    request.expectedHumanVerdict &&
    request.expectedHumanVerdict !== request.humanVerdict
  ) {
    divergences.push(
      `${request.requestId}: humanVerdict diverged from the expected fixture result`,
    );
  }
  return divergences;
}

function buildRequestEvidence(
  baseline: ProductionPilotBaseline,
  request: ProductionPilotRequestBaseline,
): BrandConsistencyEvidenceRequest {
  const source = resolveSource(baseline, request);
  const input = {
    requestId: request.requestId,
    requestText: request.requestText,
    format: request.format,
    contentPattern: request.contentPattern,
    effectivePrompt: request.effectivePrompt,
    effectiveSpecSummary: request.effectiveSpecSummary ?? null,
  };
  const referenceSelection = {
    selectedReferences: request.selectedReferences,
  };
  const snapshot = {
    available: request.snapshot?.available ?? false,
    version: request.snapshot?.version ?? null,
    declaredHash: request.snapshot?.hash ?? null,
  };
  const result = {
    observedHardFailures: request.observedHardFailures,
    humanVerdict: request.humanVerdict,
    humanNotes: request.humanNotes ?? null,
    artifactRef: request.artifactRef ?? null,
    artifact: request.artifact ?? null,
  };
  const hashes = {
    input: stableHash(input),
    selection: stableHash(referenceSelection),
    snapshot: snapshot.available ? stableHash(snapshot) : null,
    result: stableHash(result),
    evidence: "",
  };
  const divergences = divergencesFor(request);
  hashes.evidence = stableHash({ source, divergences, hashes: { ...hashes, evidence: undefined } });

  return {
    input,
    referenceSelection,
    snapshot,
    result,
    evidence: { source, divergences },
    hashes,
  };
}

function emptySourceComposition(): Record<HumanQualitySourceLabel, number> {
  return {
    synthetic_fixture: 0,
    operator_imported: 0,
    real_customer: 0,
  };
}

export function buildBrandConsistencyEvidence(
  input: unknown,
  capturedAt = new Date().toISOString(),
  execution: BrandConsistencyExecution = {
    provider: "manifest-observation",
    providerCalls: 0,
  },
): BrandConsistencyEvidence {
  const baseline = productionPilotBaselineSchema.parse(input);
  const requests = baseline.requests.map((request) =>
    buildRequestEvidence(baseline, request),
  );
  const sourceComposition = emptySourceComposition();
  for (const request of requests) sourceComposition[request.evidence.source] += 1;

  const evaluatedCount = requests.filter(
    (request) => request.result.humanVerdict !== "pending",
  ).length;
  const rejectedCount = requests.filter(
    (request) => request.result.humanVerdict === "fail",
  ).length;
  const mixedCount = requests.filter(
    (request) => request.result.humanVerdict === "mixed",
  ).length;
  const evaluatedRealCustomerCount = requests.filter(
    (request) =>
      request.evidence.source === "real_customer" &&
      request.result.humanVerdict !== "pending",
  ).length;
  const coverage = {
    ...baselineCoverageReport(baseline),
    evaluatedCount,
  };
  const divergences = requests.flatMap((request) => request.evidence.divergences);
  const status: BaselineStatus = divergences.length > 0 || rejectedCount > 0
    ? "fail"
    : evaluatedCount === 0 || mixedCount > 0 || evaluatedCount < requests.length || !coverage.meetsMinimum
      ? "human_needed"
      : "pass";

  const claimsAllowed = baseline.requests.length > 0
    ? ["baseline_inputs_recorded"]
    : [];
  if (
    execution.provider === "e2e-controlled-replay" &&
    requests.length > 0 &&
    requests.every((request) => request.result.artifact !== null)
  ) {
    claimsAllowed.push("automated_evidence_hashed");
  }
  const claimsBlocked = [CUSTOMER_REAL_CLAIM, "paid_generation_quality"];
  const withheldClaims = [CUSTOMER_REAL_CLAIM, "paid_generation_quality"];
  if (evaluatedCount > 0) {
    claimsAllowed.push("human_verdicts_recorded");
    const index = withheldClaims.indexOf("human_verdicts_recorded");
    if (index >= 0) withheldClaims.splice(index, 1);
  } else {
    claimsBlocked.push("human_verdicts_recorded");
    withheldClaims.push("human_verdicts_recorded");
  }
  if (
    sourceComposition.real_customer > 0 &&
    evaluatedRealCustomerCount > 0 &&
    coverage.meetsMinimum &&
    divergences.length === 0
  ) {
    claimsAllowed.push(CUSTOMER_REAL_CLAIM);
    claimsBlocked.splice(claimsBlocked.indexOf(CUSTOMER_REAL_CLAIM), 1);
    withheldClaims.splice(withheldClaims.indexOf(CUSTOMER_REAL_CLAIM), 1);
  }

  const hashes = {
    inputs: stableHash(requests.map((request) => request.hashes.input)),
    selection: stableHash(requests.map((request) => request.hashes.selection)),
    snapshots: stableHash(requests.map((request) => request.hashes.snapshot)),
    results: stableHash(requests.map((request) => request.hashes.result)),
    evidence: "",
  };
  hashes.evidence = stableHash({
    schemaVersion: BRAND_CONSISTENCY_EVIDENCE_SCHEMA_VERSION,
    pilotId: baseline.pilotId,
    requests: requests.map((request) => request.hashes.evidence),
    status,
    sourceComposition,
  });

  return {
    schemaVersion: BRAND_CONSISTENCY_EVIDENCE_SCHEMA_VERSION,
    reportType: "brand-consistency-baseline",
    generatedAt: capturedAt,
    status,
    pilotId: baseline.pilotId,
    brandName: baseline.brandName,
    sourceComposition,
    coverage,
    requests,
    execution: {
      provider: execution.provider,
      paidGeneration: false,
      providerCalls: execution.providerCalls,
    },
    evidenceClasses: {
      automatedBaseline: {
        status: execution.provider === "e2e-controlled-replay" ? "recorded" : "not_run",
        count: execution.provider === "e2e-controlled-replay" ? requests.length : 0,
      },
      humanEvaluation: {
        status: evaluatedCount > 0 ? "recorded" : "pending",
        count: evaluatedCount,
      },
      paidGeneration: { status: "not_run", count: 0, costUsd: null },
    },
    metrics: {
      durationMs: execution.durationMs ?? null,
      rssBytes: execution.rssBytes ?? null,
      tokens: null,
      costUsd: null,
    },
    claimsAllowed,
    claimsBlocked,
    withheldClaims,
    divergences,
    hashes,
  };
}

export function formatBrandConsistencyEvidence(
  report: BrandConsistencyEvidence,
): string {
  const lines = [
    `Brand consistency baseline: ${report.pilotId}`,
    `Status: ${report.status}`,
    `Requests: ${report.requests.length} · evaluated: ${report.coverage.evaluatedCount}`,
    `Provider: ${report.execution.provider} · paid generation: no · calls: ${report.execution.providerCalls}`,
    `Hashes: inputs=${report.hashes.inputs} evidence=${report.hashes.evidence}`,
  ];
  if (report.divergences.length > 0) {
    lines.push("Divergences:", ...report.divergences.map((item) => `- ${item}`));
  }
  if (report.withheldClaims.length > 0) {
    lines.push(`Withheld claims: ${report.withheldClaims.join(", ")}`);
  }
  return lines.join("\n");
}
