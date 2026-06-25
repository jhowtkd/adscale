#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  aggregateEvidence,
  BLENDED_FIELD_DENYLIST,
  PHASE_EVIDENCE,
  runRegressionMode,
} from "./check-real-quality-release-evidence.mjs";
import {
  EVIDENCE_SOURCE,
  emptySourceComposition,
  isFixtureOnlySourceComposition,
  isPlainObject,
  rejectClaimsWhenGuidanceBlocked,
  validateEvidenceSourceTag,
  validateSourceComposition,
} from "./lib/evidence-honesty.mjs";

export { BLENDED_FIELD_DENYLIST };

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const phaseDir = resolve(repoRoot, ".planning/phases/137-operational-quality-release-gate");
const defaultEvidencePath = resolve(phaseDir, "137-EVIDENCE.template.json");
const milestoneEvidencePath = resolve(phaseDir, "137-EVIDENCE.json");
const baselinePath = resolve(phaseDir, "137-BASELINE.md");
const verificationPath = resolve(phaseDir, "137-VERIFICATION.md");

export const PHASE_EVIDENCE_V126 = {
  ...PHASE_EVIDENCE,
  sampling:
    ".planning/phases/135-sampling-sufficiency-and-evidence-honesty/135-EVIDENCE.json",
  samplingFallback:
    ".planning/phases/135-sampling-sufficiency-and-evidence-honesty/135-EVIDENCE.template.json",
  trend: ".planning/phases/136-quality-trend-dashboard/136-EVIDENCE.json",
  trendFallback: ".planning/phases/136-quality-trend-dashboard/136-EVIDENCE.template.json",
  v125Gate: ".planning/phases/133-real-quality-release-gate/133-EVIDENCE.json",
  v125GateFallback: ".planning/phases/133-real-quality-release-gate/133-EVIDENCE.template.json",
};

const LIVE_HUMAN_DENOMINATOR = "Human-evaluated corpus items only";
const FIXTURE_DENOMINATOR = "Deterministic v12.3 archetype matrix — not human corpus";
const TECHNICAL_DENOMINATOR = "Deterministic v12.3/v12.4 regression scripts — not human corpus";

const DEFAULT_QALIVE_REQUIREMENTS = [
  {
    id: "QALIVE-01",
    result: "pending",
    automated: "cd app && npm run operational-quality-release-gate",
  },
  {
    id: "QALIVE-02",
    result: "pass",
    automated: "node app/scripts/check-operational-quality-release-evidence.mjs --skip-tests",
  },
  {
    id: "QALIVE-03",
    result: "pass",
    automated: "node app/scripts/check-operational-quality-release-evidence.mjs --skip-tests",
  },
  {
    id: "QALIVE-04",
    result: "pending",
    automated: ".planning/milestones/v12.6-MILESTONE-AUDIT.md",
  },
];

export const OPERATIONAL_BLENDED_FIELD_DENYLIST = [
  "milestonePass",
  "overallOperationalPass",
  "customerValidated",
];

export const ACTIVE_BRAND_SAMPLE_STATUSES = [
  "ok",
  "insufficient_sample",
  "insufficient_source",
  "claim_withheld",
];

const CUSTOMER_REAL_CLAIMS = [
  "validated_against_customer_real",
  "customer_real_validation",
];

const REQUIRED_REQUIREMENT_IDS = ["QALIVE-01", "QALIVE-02", "QALIVE-03", "QALIVE-04"];

const REQUIRED_TOP_LEVEL_SECTIONS = [
  "technicalRegression",
  "operationalEvidence",
  "qualityMetrics",
  "factualMetrics",
  "learningImpactMetrics",
  "trendMetrics",
  "acceptedCaveats",
];

const VALID_ROOT_STATUSES = ["ok", "gaps_found", "tech_debt", "claim_withheld", "blocked"];

function usage() {
  return "Usage: node app/scripts/check-operational-quality-release-evidence.mjs [--evidence PATH] [--skip-tests] [--aggregate] [--run-regression] [--technical-only]";
}

function readPhaseEvidence(relativePath, { fallbackPath = null, label = relativePath } = {}) {
  const absolute = resolve(repoRoot, relativePath);
  if (existsSync(absolute)) {
    return JSON.parse(readFileSync(absolute, "utf8"));
  }
  if (fallbackPath) {
    const fallbackAbsolute = resolve(repoRoot, fallbackPath);
    if (existsSync(fallbackAbsolute)) {
      console.warn(
        `OPERATIONAL-QUALITY-RELEASE-EVIDENCE: ${label} missing; using fallback ${fallbackPath}`
      );
      return JSON.parse(readFileSync(fallbackAbsolute, "utf8"));
    }
  }
  throw new Error(`${label} not found. Run the phase evidence CLI to generate it.`);
}

function gateSampleGuidance(phaseEvidence, samplingGate) {
  if (Array.isArray(phaseEvidence?.sampleGuidance) && phaseEvidence.sampleGuidance.length > 0) {
    return phaseEvidence.sampleGuidance;
  }
  if (Array.isArray(samplingGate?.sampleGuidance) && samplingGate.sampleGuidance.length > 0) {
    return samplingGate.sampleGuidance;
  }
  return [];
}

function buildLiveHumanGate(phaseEvidence, samplingGate, sourcePath, extra = {}) {
  return {
    status: phaseEvidence?.status ?? samplingGate?.status ?? "insufficient_sample",
    evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN,
    denominatorNote: LIVE_HUMAN_DENOMINATOR,
    evaluatedItemCount: phaseEvidence?.evaluatedItemCount ?? samplingGate?.evaluatedItemCount ?? 0,
    sampleGuidance: gateSampleGuidance(phaseEvidence, samplingGate),
    sourcePath,
    ...extra,
  };
}

function resolveOperationalStatus(gates, alertFlags) {
  if (alertFlags?.regressionDetected === true || alertFlags?.staleEvidence === true) {
    return "gaps_found";
  }

  const liveGates = [gates.calibration, gates.impact, gates.qualityImprovement, gates.trend];
  if (liveGates.every((gate) => gate?.status === "ok")) {
    return "ok";
  }

  return "insufficient_sample";
}

export function deriveRootStatus(technicalStatus, operationalStatus, activeBrandSample = null) {
  if (technicalStatus === "fail") {
    return "blocked";
  }

  const brandStatus = activeBrandSample?.operationalStatus ?? null;
  if (brandStatus === "claim_withheld" || brandStatus === "insufficient_source") {
    return "claim_withheld";
  }

  if (operationalStatus === "ok" && (!activeBrandSample || brandStatus === "ok")) {
    return "ok";
  }
  if (operationalStatus === "gaps_found") {
    return "gaps_found";
  }
  return "tech_debt";
}

function resolveActiveBrandOperationalStatus(sourceComposition, evaluatedItemCount) {
  const fixtureOnly = isFixtureOnlySourceComposition(sourceComposition);
  if (fixtureOnly && evaluatedItemCount > 0) {
    return "claim_withheld";
  }
  if (fixtureOnly) {
    return "insufficient_source";
  }
  if (evaluatedItemCount < 5) {
    return "insufficient_sample";
  }
  return "ok";
}

function resolveActiveBrandClaims(sourceComposition, operationalStatus) {
  const fixtureOnly = isFixtureOnlySourceComposition(sourceComposition);
  const claimsAllowed = ["global_corpus_evaluations_recorded"];
  const claimsBlocked = [...CUSTOMER_REAL_CLAIMS];

  if (!fixtureOnly && operationalStatus === "ok") {
    claimsAllowed.push("validated_against_customer_real");
    const blocked = new Set(claimsBlocked);
    for (const claim of CUSTOMER_REAL_CLAIMS) {
      blocked.delete(claim);
    }
    return {
      claimsAllowed,
      claimsBlocked: Array.from(blocked),
    };
  }

  return { claimsAllowed, claimsBlocked };
}

function resolveActiveBrandNextActions(sourceComposition, operationalStatus) {
  const fixtureOnly = isFixtureOnlySourceComposition(sourceComposition);
  if (fixtureOnly) {
    return [
      "Import or promote real_customer corpus rows for the active brand before customer-real claims.",
      "operator_imported and synthetic_fixture rows validate operation only — not market proof.",
    ];
  }
  if (operationalStatus === "insufficient_sample") {
    return [
      "Evaluate corpus items in the human-quality queue — at least 5 human evaluations are required for the active brand.",
    ];
  }
  return [];
}

export function buildActiveBrandSample(existingSample = {}, calibration = {}) {
  const sourceComposition = isPlainObject(existingSample.sourceComposition)
    ? { ...emptySourceComposition(), ...existingSample.sourceComposition }
    : emptySourceComposition();
  const evaluatedItemCount =
    typeof existingSample.evaluatedItemCount === "number"
      ? existingSample.evaluatedItemCount
      : calibration.evaluatedItemCount ?? 0;
  const operationalStatus =
    existingSample.operationalStatus ??
    resolveActiveBrandOperationalStatus(sourceComposition, evaluatedItemCount);
  const fixtureOnly = isFixtureOnlySourceComposition(sourceComposition);
  const claims =
    Array.isArray(existingSample.claimsAllowed) && Array.isArray(existingSample.claimsBlocked)
      ? {
          claimsAllowed: existingSample.claimsAllowed,
          claimsBlocked: existingSample.claimsBlocked,
        }
      : resolveActiveBrandClaims(sourceComposition, operationalStatus);

  return {
    workspaceId: existingSample.workspaceId ?? null,
    clientProfileId: existingSample.clientProfileId ?? null,
    sourceComposition,
    evaluatedItemCount,
    operationalStatus,
    fixtureOnly,
    claimsAllowed: claims.claimsAllowed,
    claimsBlocked: claims.claimsBlocked,
    nextActions:
      Array.isArray(existingSample.nextActions) && existingSample.nextActions.length > 0
        ? existingSample.nextActions
        : resolveActiveBrandNextActions(sourceComposition, operationalStatus),
  };
}

export function validateActiveBrandSample(activeBrandSample, errors, label = "operationalEvidence.activeBrandSample") {
  if (!isPlainObject(activeBrandSample)) {
    errors.push(`${label} must be an object`);
    return;
  }

  if (
    activeBrandSample.workspaceId != null &&
    (typeof activeBrandSample.workspaceId !== "string" || !activeBrandSample.workspaceId)
  ) {
    errors.push(`${label}.workspaceId must be a non-empty string when present`);
  }

  if (
    activeBrandSample.clientProfileId != null &&
    (typeof activeBrandSample.clientProfileId !== "string" || !activeBrandSample.clientProfileId)
  ) {
    errors.push(`${label}.clientProfileId must be a non-empty string when present`);
  }

  validateSourceComposition(activeBrandSample.sourceComposition, label, errors);

  if (
    typeof activeBrandSample.evaluatedItemCount !== "number" ||
    activeBrandSample.evaluatedItemCount < 0
  ) {
    errors.push(`${label}.evaluatedItemCount must be a non-negative number`);
  }

  if (!ACTIVE_BRAND_SAMPLE_STATUSES.includes(activeBrandSample.operationalStatus)) {
    errors.push(
      `${label}.operationalStatus must be one of: ${ACTIVE_BRAND_SAMPLE_STATUSES.join(", ")}`
    );
  }

  if (typeof activeBrandSample.fixtureOnly !== "boolean") {
    errors.push(`${label}.fixtureOnly must be a boolean`);
  } else if (
    activeBrandSample.fixtureOnly !==
    isFixtureOnlySourceComposition(activeBrandSample.sourceComposition)
  ) {
    errors.push(`${label}.fixtureOnly must match sourceComposition.real_customer === 0`);
  }

  if (!Array.isArray(activeBrandSample.claimsAllowed)) {
    errors.push(`${label}.claimsAllowed must be an array`);
  }
  if (!Array.isArray(activeBrandSample.claimsBlocked)) {
    errors.push(`${label}.claimsBlocked must be an array`);
  }
  if (!Array.isArray(activeBrandSample.nextActions)) {
    errors.push(`${label}.nextActions must be an array`);
  } else {
    for (const [index, action] of activeBrandSample.nextActions.entries()) {
      if (typeof action !== "string" || !action) {
        errors.push(`${label}.nextActions[${index}] must be a non-empty string`);
      }
    }
  }
}

export function assertSourceClaimGates(evidence, errors) {
  const activeBrandSample = evidence.operationalEvidence?.activeBrandSample;
  if (!isPlainObject(activeBrandSample)) {
    errors.push("SOURCE-05: operationalEvidence.activeBrandSample is required");
    return;
  }

  validateActiveBrandSample(activeBrandSample, errors);

  if (activeBrandSample.fixtureOnly) {
    for (const claim of CUSTOMER_REAL_CLAIMS) {
      if (activeBrandSample.claimsAllowed.includes(claim)) {
        errors.push(
          `SOURCE-05: fixture-only active brand sample must not allow customer-real claim "${claim}"`
        );
      }
      if (!activeBrandSample.claimsBlocked.includes(claim)) {
        errors.push(
          `SOURCE-05: fixture-only active brand sample must block customer-real claim "${claim}"`
        );
      }
    }
  }

  if (
    activeBrandSample.operationalStatus === "claim_withheld" &&
    CUSTOMER_REAL_CLAIMS.some((claim) => activeBrandSample.claimsAllowed.includes(claim))
  ) {
    errors.push(
      "SOURCE-05: claim_withheld active brand sample must not include customer-real claims in claimsAllowed"
    );
  }

  if (evidence.status === "ok" && activeBrandSample.operationalStatus !== "ok") {
    errors.push(
      "SOURCE-05: root status ok requires activeBrandSample.operationalStatus ok when active brand sample is present"
    );
  }
}

function buildTechnicalRegression(v125Core, v133Evidence) {
  const regression = v133Evidence?.regressionMetrics ?? v125Core.regressionMetrics ?? {};
  const factual = v133Evidence?.factualMetrics ?? v125Core.factualMetrics ?? {};
  const gateMatrixPass = regression.gateMatrixPass ?? true;
  const v12_3Rate = factual.v12_3FactualFidelityRate ?? 1.0;
  const creativeValidationScript = regression.creativeValidationScript ?? "pending";
  const outputLearningScript = regression.outputLearningScript ?? "pending";
  const scriptsPass =
    creativeValidationScript !== "fail" && outputLearningScript !== "fail";
  const status = gateMatrixPass && v12_3Rate === 1.0 && scriptsPass ? "pass" : "fail";

  return {
    status,
    evidenceSource: EVIDENCE_SOURCE.TECHNICAL_REGRESSION,
    denominatorNote: TECHNICAL_DENOMINATOR,
    gateMatrixPass,
    creativeValidationScript,
    outputLearningScript,
    v12_3FactualFidelityRate: v12_3Rate,
    safetyGuardPassRate: factual.safetyGuardPassRate ?? 1.0,
    sourcePath: PHASE_EVIDENCE_V126.v125Gate,
  };
}

function resolveSampleCoverage(sampling) {
  const defaultAction =
    "Evaluate corpus items in the human-quality queue — at least 5 human evaluations are required.";
  return {
    nextGate: sampling.nextGate ?? sampling.sampleCoverage?.nextGate ?? "calibration",
    nextOperatorAction:
      sampling.nextOperatorAction ??
      sampling.sampleCoverage?.nextOperatorAction ??
      defaultAction,
    sourcePath: PHASE_EVIDENCE_V126.sampling,
  };
}

export function aggregateOperationalEvidence(existingEvidence = {}) {
  const v125Core = aggregateEvidence(existingEvidence);
  const calibration = readPhaseEvidence(PHASE_EVIDENCE.calibration, {
    label: PHASE_EVIDENCE.calibration,
  });
  const impact = readPhaseEvidence(PHASE_EVIDENCE.impact, {
    fallbackPath: PHASE_EVIDENCE.impactFallback,
    label: PHASE_EVIDENCE.impact,
  });
  const quality = readPhaseEvidence(PHASE_EVIDENCE.quality, {
    label: PHASE_EVIDENCE.quality,
  });
  const sampling = readPhaseEvidence(PHASE_EVIDENCE_V126.sampling, {
    fallbackPath: PHASE_EVIDENCE_V126.samplingFallback,
    label: PHASE_EVIDENCE_V126.sampling,
  });
  const trend = readPhaseEvidence(PHASE_EVIDENCE_V126.trend, {
    fallbackPath: PHASE_EVIDENCE_V126.trendFallback,
    label: PHASE_EVIDENCE_V126.trend,
  });
  const v133Evidence = readPhaseEvidence(PHASE_EVIDENCE_V126.v125Gate, {
    fallbackPath: PHASE_EVIDENCE_V126.v125GateFallback,
    label: PHASE_EVIDENCE_V126.v125Gate,
  });

  const trendReport = isPlainObject(trend.report) ? trend.report : trend;
  const trendAlertFlags = trend.alertFlags ?? trendReport.alertFlags ?? {};
  const samplingGates = isPlainObject(sampling.gates) ? sampling.gates : {};

  const gates = {
    calibration: buildLiveHumanGate(calibration, samplingGates.calibration, PHASE_EVIDENCE.calibration),
    impact: buildLiveHumanGate(impact, samplingGates.impact, PHASE_EVIDENCE.impact),
    qualityImprovement: buildLiveHumanGate(quality, samplingGates.qualityImprovement, PHASE_EVIDENCE.quality, {
      fixtureMetrics: isPlainObject(quality.fixtureMetrics)
        ? quality.fixtureMetrics
        : {
            evidenceSource: EVIDENCE_SOURCE.FIXTURE,
            denominatorNote: FIXTURE_DENOMINATOR,
            targetedArchetypePassRateBefore: 0.7,
            targetedArchetypePassRateAfter: null,
          },
    }),
    trend: buildLiveHumanGate(trendReport, null, PHASE_EVIDENCE_V126.trend, {
      evaluatedItemCount: trendReport.evaluatedItemCount ?? 0,
      sampleGuidance:
        gateSampleGuidance(trendReport, null).length > 0
          ? gateSampleGuidance(trendReport, null)
          : Array.isArray(trend.sampleGuidance)
            ? trend.sampleGuidance
            : [],
    }),
  };

  const operationalStatus = resolveOperationalStatus(gates, trendAlertFlags);
  const technicalRegression = buildTechnicalRegression(v125Core, v133Evidence);
  const activeBrandSample = buildActiveBrandSample(
    existingEvidence.operationalEvidence?.activeBrandSample,
    calibration
  );
  const rootStatus = deriveRootStatus(
    technicalRegression.status,
    operationalStatus,
    activeBrandSample
  );
  const evaluatedItemCount = calibration.evaluatedItemCount ?? 0;

  const merged = {
    ...v125Core,
    schemaVersion: 1,
    milestoneVersion: "v12.6",
    capturedAt: new Date().toISOString(),
    status: rootStatus,
    qualityImprovementClaimed:
      existingEvidence.qualityImprovementClaimed === true ? true : false,
    technicalRegression,
    operationalEvidence: {
      status: operationalStatus,
      evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN,
      denominatorNote: LIVE_HUMAN_DENOMINATOR,
      evaluatedItemCount,
      activeBrandSample,
      gates,
      sampleCoverage: resolveSampleCoverage(sampling),
    },
    trendMetrics: {
      evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN,
      status: trendReport.status ?? trend.status ?? "insufficient_sample",
      populatedBucketCount: trendReport.populatedBucketCount ?? 0,
      alertFlags: trendAlertFlags,
      sampleGuidance: trendReport.sampleGuidance ?? trend.sampleGuidance ?? [],
      sourcePath: PHASE_EVIDENCE_V126.trend,
    },
    requirements: Array.isArray(existingEvidence.requirements)
      ? existingEvidence.requirements
      : DEFAULT_QALIVE_REQUIREMENTS,
    automated: isPlainObject(existingEvidence.automated) ? existingEvidence.automated : {},
    acceptedCaveats: Array.isArray(v125Core.acceptedCaveats) ? v125Core.acceptedCaveats : [],
  };

  delete merged.regressionMetrics;
  return merged;
}

export function mergeRegressionIntoTechnical(evidence, { skipTests = false } = {}) {
  const working = structuredClone(evidence);
  const { evidence: regressionEvidence, errors } = runRegressionMode(working, { skipTests });
  const regression = regressionEvidence.regressionMetrics ?? {};
  const factual = regressionEvidence.factualMetrics ?? {};

  evidence.technicalRegression = {
    ...(evidence.technicalRegression ?? {}),
    status: errors.length === 0 ? "pass" : "fail",
    evidenceSource: EVIDENCE_SOURCE.TECHNICAL_REGRESSION,
    denominatorNote: TECHNICAL_DENOMINATOR,
    gateMatrixPass: regression.gateMatrixPass ?? false,
    creativeValidationScript: regression.creativeValidationScript ?? "fail",
    outputLearningScript: regression.outputLearningScript ?? "fail",
    v12_3FactualFidelityRate: factual.v12_3FactualFidelityRate ?? 1.0,
    safetyGuardPassRate: factual.safetyGuardPassRate ?? 1.0,
    sourcePath: PHASE_EVIDENCE_V126.v125Gate,
  };
  evidence.factualMetrics = {
    ...(evidence.factualMetrics ?? {}),
    v12_3FactualFidelityRate:
      factual.v12_3FactualFidelityRate ?? evidence.factualMetrics?.v12_3FactualFidelityRate ?? 1.0,
    safetyGuardPassRate:
      factual.safetyGuardPassRate ?? evidence.factualMetrics?.safetyGuardPassRate ?? 1.0,
  };

  return { errors };
}

export function assertTechnicalOnly(evidence, errors) {
  const technical = evidence.technicalRegression;
  if (!isPlainObject(technical)) {
    errors.push("technical-only: technicalRegression must be a top-level object");
    return;
  }

  validateEvidenceSourceTag(
    technical,
    EVIDENCE_SOURCE.TECHNICAL_REGRESSION,
    "technicalRegression",
    errors
  );

  if (technical.status !== "pass" && technical.status !== "fail") {
    errors.push('technical-only: technicalRegression.status must be "pass" or "fail"');
  }

  if (technical.status === "fail") {
    errors.push("technical-only: technicalRegression.status is fail");
  }
}

function fail(errors) {
  for (const error of errors) {
    console.error(`OPERATIONAL-QUALITY-RELEASE-EVIDENCE: ${error}`);
  }
  process.exitCode = 1;
}

function parseArgs(argv) {
  const args = {
    evidencePath: defaultEvidencePath,
    skipTests: false,
    aggregate: false,
    runRegression: false,
    technicalOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--evidence") {
      args.evidencePath = resolve(argv[index + 1] ?? "");
      index += 1;
    } else if (token === "--skip-tests") {
      args.skipTests = true;
    } else if (token === "--aggregate") {
      args.aggregate = true;
      if (args.evidencePath === defaultEvidencePath) {
        args.evidencePath = milestoneEvidencePath;
      }
    } else if (token === "--run-regression") {
      args.runRegression = true;
      if (args.evidencePath === defaultEvidencePath) {
        args.evidencePath = milestoneEvidencePath;
      }
    } else if (token === "--technical-only") {
      args.technicalOnly = true;
    } else if (token === "--help" || token === "-h") {
      console.log(usage());
      process.exit(0);
    }
  }
  return args;
}

export function validateRootBlendedFields(evidence, errors, label = "evidence") {
  for (const field of BLENDED_FIELD_DENYLIST) {
    if (field in evidence) {
      errors.push(`${label} must not include blended metric field "${field}" at root`);
    }
  }
  for (const field of OPERATIONAL_BLENDED_FIELD_DENYLIST) {
    if (field in evidence) {
      errors.push(`${label} must not include blended operational pass field "${field}" at root (QALIVE-02)`);
    }
  }
}

export function assertQalive02(evidence, errors) {
  const technical = evidence.technicalRegression;
  const operational = evidence.operationalEvidence;

  if (!isPlainObject(technical)) {
    errors.push("QALIVE-02: technicalRegression must be a top-level object");
    return;
  }

  if (!isPlainObject(operational)) {
    errors.push("QALIVE-02: operationalEvidence must be a top-level object");
    return;
  }

  validateEvidenceSourceTag(
    technical,
    EVIDENCE_SOURCE.TECHNICAL_REGRESSION,
    "technicalRegression",
    errors
  );
  validateEvidenceSourceTag(
    operational,
    EVIDENCE_SOURCE.LIVE_HUMAN,
    "operationalEvidence",
    errors
  );

  for (const field of OPERATIONAL_BLENDED_FIELD_DENYLIST) {
    if (field in evidence) {
      errors.push(`QALIVE-02: evidence must not include blended field "${field}" at root`);
    }
  }

  if (technical.status !== "pass" && technical.status !== "fail") {
    errors.push('QALIVE-02: technicalRegression.status must be "pass" or "fail"');
  }

  if (
    operational.status !== "ok" &&
    operational.status !== "insufficient_sample" &&
    operational.status !== "gaps_found"
  ) {
    errors.push(
      'QALIVE-02: operationalEvidence.status must be "ok", "insufficient_sample", or "gaps_found"'
    );
  }

  if (technical.status === "fail") {
    errors.push(
      "QALIVE-02: technicalRegression.status is fail — technical regression block must pass independently"
    );
  }

  validateActiveBrandSample(
    operational.activeBrandSample,
    errors,
    "operationalEvidence.activeBrandSample"
  );
}

export function assertQalive03(evidence, errors) {
  const qiGate = evidence.operationalEvidence?.gates?.qualityImprovement;
  const fixtureMetrics = isPlainObject(qiGate?.fixtureMetrics) ? qiGate.fixtureMetrics : null;

  if (evidence.qualityImprovementClaimed === true) {
    const factualRate = evidence.factualMetrics?.humanCorpusFactualPassRate;
    if (factualRate !== 1.0) {
      errors.push(
        "QALIVE-03: humanCorpusFactualPassRate must be 1.0 when qualityImprovementClaimed is true"
      );
    }

    if (qiGate?.status !== "ok") {
      errors.push("QALIVE-03: qualityImprovementClaimed must be false when gate status is not ok");
    }

    if (fixtureMetrics?.evidenceSource === EVIDENCE_SOURCE.FIXTURE && qiGate?.status !== "ok") {
      errors.push(
        "QALIVE-03: fixtureMetrics alone cannot satisfy qualityImprovementClaimed — live_human gate must be ok"
      );
    }

    rejectClaimsWhenGuidanceBlocked(
      {
        ...qiGate,
        improvementClaimed: true,
      },
      errors,
      "operationalEvidence.gates.qualityImprovement",
      {
        improvementField: "improvementClaimed",
        movementPaths: ["targetedFailureDelta", "deltaRateByReason"],
      }
    );
  }

  if (
    evidence.status === "ok" &&
    evidence.operationalEvidence?.status === "insufficient_sample" &&
    evidence.qualityImprovementClaimed !== false
  ) {
    errors.push(
      "QALIVE-03: root status ok requires qualityImprovementClaimed: false when operational sample insufficient"
    );
  }
}

function validateRequirements(requirements, errors, label = "evidence") {
  if (!Array.isArray(requirements)) {
    errors.push(`${label}.requirements must be an array`);
    return;
  }

  const requirementIds = requirements.map((entry) => entry?.id).filter(Boolean);
  for (const requiredId of REQUIRED_REQUIREMENT_IDS) {
    if (!requirementIds.includes(requiredId)) {
      errors.push(`${label}.requirements must include ${requiredId}`);
    }
  }
}

export function validateEvidenceShape(evidence, errors, label = "evidence") {
  if (!isPlainObject(evidence)) {
    errors.push(`${label} must be a JSON object`);
    return;
  }

  if (evidence.schemaVersion !== 1) {
    errors.push(`${label}.schemaVersion must be 1`);
  }

  if (evidence.milestoneVersion !== "v12.6") {
    errors.push(`${label}.milestoneVersion must be "v12.6"`);
  }

  if (!VALID_ROOT_STATUSES.includes(evidence.status)) {
    errors.push(`${label}.status must be one of: ${VALID_ROOT_STATUSES.join(", ")}`);
  }

  if (typeof evidence.qualityImprovementClaimed !== "boolean") {
    errors.push(`${label}.qualityImprovementClaimed must be a boolean`);
  }

  for (const section of REQUIRED_TOP_LEVEL_SECTIONS) {
    if (!(section in evidence)) {
      errors.push(`${label}.${section} is required`);
    }
  }

  validateRootBlendedFields(evidence, errors, label);
  validateRequirements(evidence.requirements, errors, label);

  if (!isPlainObject(evidence.automated)) {
    errors.push(`${label}.automated must be an object`);
  }

  if (!Array.isArray(evidence.acceptedCaveats)) {
    errors.push(`${label}.acceptedCaveats must be an array`);
  }
}

function writeBaseline(evidence) {
  const technical = evidence.technicalRegression ?? {};
  const operational = evidence.operationalEvidence ?? {};

  const lines = [
    "# Phase 137 Operational Quality Release Gate Baseline",
    "",
    `Generated at ${evidence.verifiedAt ?? evidence.capturedAt ?? new Date().toISOString()}.`,
    "",
    "**Dual-status separation (QALIVE-02):** technical regression and operational live evidence are independent top-level sections.",
    "",
    "## Technical vs Operational Status",
    "",
    "| Block | status | evidenceSource | Role |",
    "|---|---|---|---|",
    `| technicalRegression | ${technical.status ?? "—"} | ${technical.evidenceSource ?? "—"} | v12.3/v12.4 regression — independent pass/fail |`,
    `| operationalEvidence | ${operational.status ?? "—"} | ${operational.evidenceSource ?? "—"} | Live human corpus gates — may be insufficient_sample |`,
    "",
    "## Technical Regression Metrics",
    "",
    "| Metric | Value |",
    "|---|---:|",
    `| gateMatrixPass | ${technical.gateMatrixPass ?? "—"} |`,
    `| v12_3FactualFidelityRate | ${technical.v12_3FactualFidelityRate ?? "—"} |`,
    `| safetyGuardPassRate | ${technical.safetyGuardPassRate ?? "—"} |`,
    "",
    "## Operational Evidence",
    "",
    `| evaluatedItemCount | ${operational.evaluatedItemCount ?? 0} |`,
    `| qualityImprovementClaimed | ${evidence.qualityImprovementClaimed ?? false} |`,
    `| nextOperatorAction | ${operational.sampleCoverage?.nextOperatorAction ?? "—"} |`,
    "",
  ];

  mkdirSync(phaseDir, { recursive: true });
  writeFileSync(baselinePath, `${lines.join("\n")}\n`);
}

function writeVerification(evidence, errors) {
  const status = errors.length === 0 ? "passed" : "failed";
  const technical = evidence.technicalRegression ?? {};
  const operational = evidence.operationalEvidence ?? {};

  const lines = [
    "---",
    "phase: 137-operational-quality-release-gate",
    `verified: ${evidence.verifiedAt ?? evidence.capturedAt ?? new Date().toISOString()}`,
    `status: ${status}`,
    "requirements: [QALIVE-01, QALIVE-02, QALIVE-03, QALIVE-04]",
    "---",
    "",
    "# Phase 137: Operational Quality Release Gate Verification",
    "",
    `**Status:** ${status}`,
    "",
    "## Requirement Rows",
    "",
    "| ID | Description | Result |",
    "|---|---|---|",
    "| QALIVE-01 | Release gate reruns live evidence CLIs | pending (orchestrator — Plan 137-02) |",
    "| QALIVE-02 | Technical regression independent of operational status | pass when checker green |",
    "| QALIVE-03 | Quality improvement claims blocked when sample insufficient | pass when checker green |",
    "| QALIVE-04 | Milestone audit with commands and operator action | pending (Plan 137-04) |",
    "",
    "## Dual Status (QALIVE-02)",
    "",
    "| Section | status | evaluatedItemCount |",
    "|---|---|---:|",
    `| technicalRegression | ${technical.status ?? "—"} | — |`,
    `| operationalEvidence | ${operational.status ?? "—"} | ${operational.evaluatedItemCount ?? 0} |`,
    "",
    "## Commands",
    "",
    "```bash",
    "node app/scripts/check-operational-quality-release-evidence.mjs --skip-tests",
    "cd app && npm test -- tests/unit/release/operational-quality-release-evidence.test.ts",
    "cd app && npm run operational-quality-release-evidence",
    "```",
    "",
  ];

  if (errors.length > 0) {
    lines.push("## Errors", "", ...errors.map((error) => `- ${error}`), "");
  }

  writeFileSync(verificationPath, `${lines.join("\n")}\n`);
}

function updateRequirementRows(evidence) {
  if (!Array.isArray(evidence.requirements)) {
    return;
  }

  const checkerCmd = "node app/scripts/check-operational-quality-release-evidence.mjs --skip-tests";
  for (const row of evidence.requirements) {
    if (!isPlainObject(row)) {
      continue;
    }
    if (row.id === "QALIVE-02" || row.id === "QALIVE-03") {
      row.result = "pass";
      row.automated = checkerCmd;
    }
  }
}

function main() {
  const { evidencePath, skipTests, aggregate, runRegression, technicalOnly } = parseArgs(
    process.argv.slice(2)
  );
  const errors = [];

  let evidence = null;
  if (existsSync(evidencePath)) {
    try {
      evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    } catch {
      fail([`invalid JSON: ${evidencePath}`]);
      return;
    }
  } else if (!aggregate) {
    fail([`evidence file not found: ${evidencePath}`]);
    return;
  }

  if (aggregate) {
    evidence = aggregateOperationalEvidence(evidence ?? {});
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(`Aggregated operational evidence written to ${evidencePath}`);
  }

  if (runRegression) {
    const regressionResult = mergeRegressionIntoTechnical(evidence, { skipTests });
    errors.push(...regressionResult.errors);
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    if (regressionResult.errors.length === 0) {
      console.log("Regression mode complete: technicalRegression updated.");
    }
  }

  if (technicalOnly) {
    assertTechnicalOnly(evidence, errors);
    if (errors.length > 0) {
      fail(errors);
      return;
    }
    console.log("Operational quality technical-only check passed.");
    console.log(`Evidence: ${evidencePath}`);
    return;
  }

  validateEvidenceShape(evidence, errors);
  assertQalive02(evidence, errors);
  assertQalive03(evidence, errors);
  assertSourceClaimGates(evidence, errors);

  if (errors.length > 0) {
    writeVerification(evidence, errors);
    fail(errors);
    return;
  }

  updateRequirementRows(evidence);
  writeBaseline(evidence);
  writeVerification(evidence, errors);

  if (evidencePath !== defaultEvidencePath) {
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  }

  console.log("Operational quality release evidence check passed.");
  console.log(`Evidence: ${evidencePath}`);
  if (skipTests) {
    console.log("Tests skipped (--skip-tests).");
  }
}

const isMain =
  process.argv[1] != null &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main();
}
