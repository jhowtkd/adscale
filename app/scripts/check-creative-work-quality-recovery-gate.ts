import fs from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Gate 8 checker for the Creative Work quality recovery rollout (R-011b /
 * spec sections 13 and 15).
 *
 * The gate is human and paid: automation only validates the collected
 * evidence. Exit codes:
 * - 0: complete evidence, every counter and limit satisfied simultaneously;
 * - 1: missing/invalid file, incomplete sample or any violated limit;
 * - 2: well-formed scaffold still `pending_human_review`.
 *
 * Historical evidence (old blind-gate files) fails the `gate` discriminator
 * and never satisfies any counter of this checker.
 */

export const GATE_ID = "creative_work_quality_recovery";
export const JOURNEY_COUNT = 10;
export const MIN_BRANDS = 3;
export const MIN_SEGMENTS = 2;
export const MIN_CASES_PER_PROTOCOL = 2;
export const MIN_V1_PREFERENCES = 6;
export const MIN_PROTOCOL_PREFERENCE_RATE = 0.5;
export const MAX_OUTPUT_P95_MS = 4 * 60 * 1000;
export const MAX_BATCH_P95_MS = 8 * 60 * 1000;
export const MAX_RSS_MB = 358;
export const MAX_IMAGE_CALLS_PER_OUTPUT = 2;

const PROTOCOLS = ["single", "variations", "format_adaptation", "restyle", "carousel"] as const;
const SOURCES = ["production_snapshot", "direct_generation", "creative_work_v1"] as const;
const PREFERENCES = ["v1", "baseline", "tie"] as const;
const MANDATORY_CASES = [
  "psicologia_fact_preservation",
  "xtb_content_style_identity_separation",
  "nr1_three_format_adaptation",
  "carousel_slide_sequence",
  "studio_edit_preserves_copy",
  "safe_margins",
] as const;
const STATUSES = ["pending_human_review", "completed"] as const;

export type CreativeWorkProtocol = (typeof PROTOCOLS)[number];
export type ComparisonSource = (typeof SOURCES)[number];
export type Preference = (typeof PREFERENCES)[number];
export type MandatoryCase = (typeof MANDATORY_CASES)[number];
export type GateStatus = (typeof STATUSES)[number];

export interface GateJourney {
  id: string;
  protocol: CreativeWorkProtocol;
  brand: string;
  segment: string;
  mandatoryCase: MandatoryCase | null;
  reviewerId: string | null;
  reviewedAt: string | null;
  plannedOutputs: number;
  terminalCoherentOutputs: number | null;
  regressions: { factual: number; brand: number; dimension: number };
  objectiveVerdict: "pass" | "fail" | "inconclusive" | null;
  inconclusiveResolution: {
    verdict: "pass" | "fail";
    reviewerId: string;
    resolvedAt: string;
  } | null;
  blindComparison: {
    options: string[];
    assignmentsRevealed: boolean;
    assignments: Record<string, ComparisonSource | null>;
    preferenceVsProduction: Preference | null;
    preferenceVsDirect: Preference | null;
  };
  mandatoryAssertions?: {
    requiredFacts?: string[];
    preservedFacts?: string[];
    separatedDimensions?: string[];
    adaptedFromSamePiece?: boolean;
    deliveredFormats?: string[];
    slideSequencePreserved?: boolean;
    slideOrder?: string[];
    editPreservedCopy?: boolean;
    editPreservedExactAssets?: boolean;
    safeMarginsPreserved?: boolean;
    safeAreaVerified?: boolean;
  } | null;
}

export interface GateEvidence {
  schemaVersion: 1;
  gate: typeof GATE_ID;
  status: GateStatus;
  budgetApproval: { approvedBy: string | null; approvedAt: string | null; reference: string | null };
  evidenceWindow: { startedAt: string | null; endedAt: string | null };
  journeys: GateJourney[];
  technicalMetrics: {
    outputDurationsMs: number[];
    batchDurationsMs: number[];
    rssPeakMb: number[];
    rssMeasurement: { process: string | null; instanceType: string | null; method: string | null };
    refinementCallCount: number | null;
    imageCallCounts: number[];
    postgresReconciliation: {
      reconciledAt: string | null;
      method: string | null;
      terminalFailures: number | null;
      refundsIssued: number | null;
      unrefundedFailures: number | null;
      duplicateCharges: number | null;
      ledgerBalanced: boolean;
    };
  };
}

export interface PreferenceTally {
  wins: number;
  losses: number;
  ties: number;
}

export interface GateSummary {
  journeys: number;
  brands: number;
  segments: number;
  perProtocol: Record<string, number>;
  v1PreferenceVsProduction: number;
  v1PreferenceVsDirect: number;
  p95OutputMs: number | null;
  p95BatchMs: number | null;
  maxRssMb: number | null;
  /** ICE-05A: blind wins/losses/ties plus inconclusive verdicts; absence is never zeroed silently. */
  tallyVsProduction: PreferenceTally;
  tallyVsDirect: PreferenceTally;
  inconclusiveVerdicts: number;
  perProtocolTally: Record<string, { vsProduction: PreferenceTally; vsDirect: PreferenceTally }>;
  perBrandTally: Record<string, { vsProduction: PreferenceTally; vsDirect: PreferenceTally }>;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isIsoDate(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function asNumberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  return value.every((item) => typeof item === "number" && Number.isFinite(item) && item > 0)
    ? (value as number[])
    : null;
}

/** Index of the first non-positive or non-finite sample, or null when every item is valid. */
function invalidNumberSampleIndex(value: unknown): number | null {
  if (!Array.isArray(value)) return null;
  const index = value.findIndex(
    (item) => typeof item !== "number" || !Number.isFinite(item) || item <= 0
  );
  return index === -1 ? null : index;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isNonEmptyString);
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Nearest-rank p95, deterministic for small rollout samples. */
export function percentile95(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index];
}

/**
 * Minimal scaffold shape required even before human collection. A
 * `pending_human_review` template that fails this is malformed evidence
 * (exit 1), not a pending gate (exit 2).
 */
export function validateGateScaffold(evidence: unknown): string[] {
  const failures: string[] = [];
  const record = asRecord(evidence);
  if (!record) {
    return ["evidence must be a JSON object"];
  }
  if (record.schemaVersion !== 1) failures.push("schemaVersion must be 1");
  if (record.gate !== GATE_ID) {
    failures.push(
      `gate must be "${GATE_ID}"; historical or unrelated evidence does not satisfy this checker`
    );
  }
  if (!STATUSES.includes(record.status as GateStatus)) {
    failures.push(`status must be one of ${STATUSES.map((status) => `"${status}"`).join(", ")}`);
  }
  if (!Array.isArray(record.journeys)) {
    failures.push("journeys must be an array");
  } else {
    if (record.journeys.length !== JOURNEY_COUNT) {
      failures.push(`gate requires exactly ${JOURNEY_COUNT} scaffolded journeys`);
    }
    for (const [index, journey] of record.journeys.entries()) {
      const label = `journeys[${index}]`;
      const item = asRecord(journey);
      if (!item) {
        failures.push(`${label} must be an object`);
        continue;
      }
      if (!isNonEmptyString(item.id)) failures.push(`${label}.id is required`);
      if (!PROTOCOLS.includes(item.protocol as CreativeWorkProtocol)) {
        failures.push(`${label}.protocol must be one of ${PROTOCOLS.join(", ")}`);
      }
      if (!isNonEmptyString(item.brand)) failures.push(`${label}.brand is required`);
      if (!isNonEmptyString(item.segment)) failures.push(`${label}.segment is required`);
    }
  }
  if (!asRecord(record.technicalMetrics)) failures.push("technicalMetrics must be an object");
  return failures;
}

function checkMandatoryAssertions(journey: GateJourney, label: string, failures: string[]): void {
  const assertions = journey.mandatoryAssertions ?? {};
  switch (journey.mandatoryCase) {
    case "psicologia_fact_preservation": {
      const required = asStringArray(assertions.requiredFacts);
      const preserved = new Set(asStringArray(assertions.preservedFacts).map(normalize));
      if (
        !required.some((fact) => normalize(fact).includes("agosto")) ||
        !required.some((fact) => normalize(fact).includes("vagas limitadas"))
      ) {
        failures.push(
          `${label} (Psicologia) must track the required facts "agosto" and "vagas limitadas"`
        );
      }
      for (const fact of required) {
        if (!preserved.has(normalize(fact))) {
          failures.push(`${label} (Psicologia) did not preserve required fact "${fact}"`);
        }
      }
      break;
    }
    case "xtb_content_style_identity_separation": {
      const separated = new Set(asStringArray(assertions.separatedDimensions).map(normalize));
      for (const dimension of ["content", "style", "identity"]) {
        if (!separated.has(dimension)) {
          failures.push(`${label} (XTB) did not confirm separation of ${dimension}`);
        }
      }
      break;
    }
    case "nr1_three_format_adaptation": {
      const formats = new Set(asStringArray(assertions.deliveredFormats).map(normalize));
      if (assertions.adaptedFromSamePiece !== true) {
        failures.push(`${label} (NR1) must adapt the same source piece`);
      }
      if (formats.size < 3) {
        failures.push(`${label} (NR1) must deliver the same piece in three distinct formats`);
      }
      break;
    }
    case "carousel_slide_sequence": {
      const order = asStringArray(assertions.slideOrder);
      if (assertions.slideSequencePreserved !== true) {
        failures.push(`${label} (carousel) must preserve slide sequence`);
      }
      if (order.length < 2) {
        failures.push(`${label} (carousel) must record at least two ordered slides`);
      }
      break;
    }
    case "studio_edit_preserves_copy": {
      if (assertions.editPreservedCopy !== true) {
        failures.push(`${label} (edit) must preserve approved copy`);
      }
      if (assertions.editPreservedExactAssets !== true) {
        failures.push(`${label} (edit) must preserve exact brand assets`);
      }
      break;
    }
    case "safe_margins": {
      if (assertions.safeMarginsPreserved !== true) {
        failures.push(`${label} (margins) must preserve safe margins`);
      }
      if (assertions.safeAreaVerified !== true) {
        failures.push(`${label} (margins) must verify the text safe area`);
      }
      break;
    }
    default:
      break;
  }
}

/**
 * Full gate evaluation over `completed` evidence. Every acceptance counter
 * of R-011 is checked; a single failure blocks the release.
 *
 * Technical integrity (durations, RSS, image calls, ledger) is scored from
 * `technicalMetrics`. Visual quality is scored from brand/dimension
 * regressions and the blind preference. Empty arrays never count as success.
 */
export function evaluateGate(evidence: unknown): { failures: string[]; summary: GateSummary } {
  const failures: string[] = [];
  const emptyTally = (): PreferenceTally => ({ wins: 0, losses: 0, ties: 0 });
  const summary: GateSummary = {
    journeys: 0,
    brands: 0,
    segments: 0,
    perProtocol: {},
    v1PreferenceVsProduction: 0,
    v1PreferenceVsDirect: 0,
    p95OutputMs: null,
    p95BatchMs: null,
    maxRssMb: null,
    tallyVsProduction: emptyTally(),
    tallyVsDirect: emptyTally(),
    inconclusiveVerdicts: 0,
    perProtocolTally: {},
    perBrandTally: {},
  };

  const record = asRecord(evidence);
  if (!record) {
    failures.push("evidence must be a JSON object");
    return { failures, summary };
  }
  if (record.schemaVersion !== 1) failures.push("schemaVersion must be 1");
  if (record.gate !== GATE_ID) {
    failures.push(
      `gate must be "${GATE_ID}"; historical or unrelated evidence does not satisfy this checker`
    );
  }
  if (record.status !== "completed") {
    failures.push('status must be "completed"; pending evidence cannot approve the gate');
  }

  const budget = asRecord(record.budgetApproval);
  if (!budget || !isNonEmptyString(budget.approvedBy) || !isIsoDate(budget.approvedAt) || !isNonEmptyString(budget.reference)) {
    failures.push(
      "budgetApproval requires approvedBy, approvedAt and reference; paid Gate 8 generations need explicit budget approval"
    );
  }

  const window = asRecord(record.evidenceWindow);
  if (!window || !isIsoDate(window.startedAt) || !isIsoDate(window.endedAt)) {
    failures.push("evidenceWindow requires startedAt/endedAt ISO timestamps from this rollout");
  } else if (Date.parse(window.endedAt) < Date.parse(window.startedAt)) {
    failures.push("evidenceWindow.endedAt precedes startedAt");
  }
  if (
    budget &&
    isIsoDate(budget.approvedAt) &&
    window &&
    isIsoDate(window.startedAt) &&
    Date.parse(budget.approvedAt) > Date.parse(window.startedAt)
  ) {
    failures.push(
      "budgetApproval.approvedAt is after evidenceWindow.startedAt; real generations only start after explicit budget approval"
    );
  }

  const rawJourneys = Array.isArray(record.journeys) ? (record.journeys as GateJourney[]) : [];
  if (rawJourneys.length !== JOURNEY_COUNT) {
    failures.push(`gate requires exactly ${JOURNEY_COUNT} complete journeys`);
  }

  const seenIds = new Set<string>();
  const journeys: GateJourney[] = [];
  for (const [index, raw] of rawJourneys.entries()) {
    const label = `journeys[${index}]`;
    const journey = asRecord(raw) as GateJourney | null;
    if (!journey) {
      failures.push(`${label} must be an object`);
      continue;
    }
    journeys.push(journey);

    if (!isNonEmptyString(journey.id)) {
      failures.push(`${label}.id is required`);
    } else if (seenIds.has(journey.id)) {
      failures.push(`${label}.id "${journey.id}" is duplicated`);
    } else {
      seenIds.add(journey.id);
    }
    if (!PROTOCOLS.includes(journey.protocol)) {
      failures.push(`${label}.protocol must be one of ${PROTOCOLS.join(", ")}`);
    }
    if (!isNonEmptyString(journey.brand)) failures.push(`${label}.brand is required`);
    if (!isNonEmptyString(journey.segment)) failures.push(`${label}.segment is required`);
    if (journey.mandatoryCase != null && !MANDATORY_CASES.includes(journey.mandatoryCase)) {
      failures.push(`${label}.mandatoryCase is invalid`);
    }
    if (!isNonEmptyString(journey.reviewerId) || !isIsoDate(journey.reviewedAt)) {
      failures.push(`${label} requires reviewerId and reviewedAt from the human review`);
    }

    if (!isPositiveInteger(journey.plannedOutputs)) {
      failures.push(`${label}.plannedOutputs must be a positive integer`);
    } else if (journey.terminalCoherentOutputs !== journey.plannedOutputs) {
      failures.push(
        `${label} reached a coherent terminal state on ${String(journey.terminalCoherentOutputs)}/${String(journey.plannedOutputs)} planned outputs; 100% is required`
      );
    }

    const regressions = asRecord(journey.regressions);
    for (const kind of ["factual", "brand", "dimension"] as const) {
      const count = regressions?.[kind];
      if (!isNonNegativeInteger(count)) {
        failures.push(`${label}.regressions.${kind} must be a non-negative integer`);
      } else if (count > 0) {
        failures.push(`${label} recorded ${count} ${kind} regression(s); zero regressions are required`);
      }
    }

    if (journey.objectiveVerdict === "fail") {
      failures.push(`${label} failed objective validation`);
    } else if (journey.objectiveVerdict === "inconclusive") {
      const resolution = asRecord(journey.inconclusiveResolution);
      if (!resolution) {
        failures.push(
          `${label} is inconclusive and blocks objective approval until a human review resolves it`
        );
      } else if (resolution.verdict !== "pass") {
        failures.push(`${label} inconclusive case was resolved as a failure by human review`);
      } else if (!isNonEmptyString(resolution.reviewerId) || !isIsoDate(resolution.resolvedAt)) {
        failures.push(`${label} inconclusive resolution requires reviewerId and resolvedAt`);
      }
    } else if (journey.objectiveVerdict !== "pass") {
      failures.push(`${label}.objectiveVerdict must be "pass", "fail" or "inconclusive"`);
    }

    const blind = asRecord(journey.blindComparison);
    if (!blind) {
      failures.push(`${label}.blindComparison is required`);
    } else {
      if (blind.assignmentsRevealed !== true) {
        failures.push(`${label} blind comparison assignments are not revealed`);
      }
      const options = Array.isArray(blind.options) ? blind.options : [];
      const assignments = asRecord(blind.assignments);
      const assignmentKeys = assignments ? Object.keys(assignments) : [];
      const assignedSources = new Set(assignments ? Object.values(assignments) : []);
      if (
        options.length !== SOURCES.length ||
        assignmentKeys.length !== SOURCES.length ||
        !assignmentKeys.every((key) => options.includes(key)) ||
        assignedSources.size !== SOURCES.length ||
        !SOURCES.every((source) => assignedSources.has(source))
      ) {
        failures.push(
          `${label} must present frozen production, direct generation and Creative Work v1 as three anonymous options`
        );
      }
      if (!PREFERENCES.includes(blind.preferenceVsProduction as Preference)) {
        failures.push(`${label}.blindComparison.preferenceVsProduction is required (v1, baseline or tie)`);
      }
      if (!PREFERENCES.includes(blind.preferenceVsDirect as Preference)) {
        failures.push(`${label}.blindComparison.preferenceVsDirect is required (v1, baseline or tie)`);
      }
      // ICE-05A: a vote decided by an agent or filled from an automatic
      // score is not a human vote — it fails loudly. Absent provenance is
      // legacy evidence and passes through, never reclassified.
      const provenance = asRecord(blind.preferenceProvenance) ?? {};
      for (const key of ["vsProduction", "vsDirect"] as const) {
        const decidedBy = provenance[key];
        if (decidedBy === null || decidedBy === undefined) continue;
        if (decidedBy === "human") continue;
        if (decidedBy === "agent" || decidedBy === "auto_score") {
          failures.push(
            `${label}.blindComparison.preferenceProvenance.${key} is "${decidedBy}": agent and automatic-score votes never count as human preference`,
          );
        } else {
          failures.push(
            `${label}.blindComparison.preferenceProvenance.${key} must be "human", "agent" or "auto_score"`,
          );
        }
      }
    }

    checkMandatoryAssertions(journey, label, failures);
  }

  summary.journeys = journeys.length;
  summary.brands = new Set(journeys.map((journey) => normalize(journey.brand ?? ""))).size;
  summary.segments = new Set(journeys.map((journey) => normalize(journey.segment ?? ""))).size;
  if (summary.brands < MIN_BRANDS) failures.push(`gate requires at least ${MIN_BRANDS} distinct brands`);
  if (summary.segments < MIN_SEGMENTS) failures.push(`gate requires at least ${MIN_SEGMENTS} distinct segments`);

  for (const protocol of PROTOCOLS) {
    const count = journeys.filter((journey) => journey.protocol === protocol).length;
    summary.perProtocol[protocol] = count;
    if (count < MIN_CASES_PER_PROTOCOL) {
      failures.push(`protocol "${protocol}" has ${count} case(s); at least ${MIN_CASES_PER_PROTOCOL} are required`);
    }
  }

  for (const mandatoryCase of MANDATORY_CASES) {
    if (!journeys.some((journey) => journey.mandatoryCase === mandatoryCase)) {
      failures.push(`mandatory case "${mandatoryCase}" is missing from the sample`);
    }
  }

  summary.v1PreferenceVsProduction = journeys.filter(
    (journey) => journey.blindComparison?.preferenceVsProduction === "v1"
  ).length;
  summary.v1PreferenceVsDirect = journeys.filter(
    (journey) => journey.blindComparison?.preferenceVsDirect === "v1"
  ).length;
  // ICE-05A tally: every preference lands in exactly one bucket per arm;
  // ties and inconclusives stay visible instead of vanishing into a rate.
  const count = (preference: unknown, tally: PreferenceTally): void => {
    if (preference === "v1") tally.wins += 1;
    else if (preference === "baseline") tally.losses += 1;
    else if (preference === "tie") tally.ties += 1;
  };
  for (const journey of journeys) {
    count(journey.blindComparison?.preferenceVsProduction, summary.tallyVsProduction);
    count(journey.blindComparison?.preferenceVsDirect, summary.tallyVsDirect);
    if (journey.objectiveVerdict === "inconclusive") summary.inconclusiveVerdicts += 1;
    const protocol = typeof journey.protocol === "string" ? journey.protocol : "unknown";
    const slot = summary.perProtocolTally[protocol] ?? {
      vsProduction: emptyTally(),
      vsDirect: emptyTally(),
    };
    count(journey.blindComparison?.preferenceVsProduction, slot.vsProduction);
    count(journey.blindComparison?.preferenceVsDirect, slot.vsDirect);
    summary.perProtocolTally[protocol] = slot;
    const brand = typeof journey.brand === "string" ? journey.brand : "unknown";
    const brandSlot = summary.perBrandTally[brand] ?? {
      vsProduction: emptyTally(),
      vsDirect: emptyTally(),
    };
    count(journey.blindComparison?.preferenceVsProduction, brandSlot.vsProduction);
    count(journey.blindComparison?.preferenceVsDirect, brandSlot.vsDirect);
    summary.perBrandTally[brand] = brandSlot;
  }
  if (summary.v1PreferenceVsProduction < MIN_V1_PREFERENCES) {
    failures.push(
      `v1 preference vs frozen production is ${summary.v1PreferenceVsProduction}/${JOURNEY_COUNT}; at least ${MIN_V1_PREFERENCES}/${JOURNEY_COUNT} is required and ties count as non-preference`
    );
  }
  if (summary.v1PreferenceVsDirect < MIN_V1_PREFERENCES) {
    failures.push(
      `v1 preference vs direct generation is ${summary.v1PreferenceVsDirect}/${JOURNEY_COUNT}; at least ${MIN_V1_PREFERENCES}/${JOURNEY_COUNT} is required and ties count as non-preference`
    );
  }
  for (const protocol of PROTOCOLS) {
    const group = journeys.filter((journey) => journey.protocol === protocol);
    if (group.length === 0) continue;
    const picks =
      group.filter((journey) => journey.blindComparison?.preferenceVsProduction === "v1").length +
      group.filter((journey) => journey.blindComparison?.preferenceVsDirect === "v1").length;
    const rate = picks / (2 * group.length);
    if (rate < MIN_PROTOCOL_PREFERENCE_RATE) {
      failures.push(
        `protocol "${protocol}" v1 preference rate is ${(rate * 100).toFixed(1)}%; no protocol may fall below ${MIN_PROTOCOL_PREFERENCE_RATE * 100}%`
      );
    }
  }

  const metrics = asRecord(record.technicalMetrics);
  const plannedOutputsTotal = journeys.reduce(
    (total, journey) => total + (isPositiveInteger(journey.plannedOutputs) ? journey.plannedOutputs : 0),
    0
  );
  const threeOutputBatches = journeys.filter((journey) => journey.plannedOutputs === 3).length;
  if (!metrics) {
    failures.push("technicalMetrics is required");
  } else {
    const outputDurations = asNumberArray(metrics.outputDurationsMs);
    const invalidOutputSample = invalidNumberSampleIndex(metrics.outputDurationsMs);
    if (invalidOutputSample !== null) {
      failures.push(
        `technicalMetrics.outputDurationsMs[${invalidOutputSample}] must be a positive finite number`
      );
    } else if (!outputDurations || outputDurations.length === 0) {
      failures.push("technicalMetrics.outputDurationsMs must contain one duration per planned output");
    } else {
      if (outputDurations.length !== plannedOutputsTotal) {
        failures.push(
          `technicalMetrics.outputDurationsMs has ${outputDurations.length} sample(s) for ${plannedOutputsTotal} planned output(s); every planned output must be measured`
        );
      }
      summary.p95OutputMs = percentile95(outputDurations);
      if (summary.p95OutputMs > MAX_OUTPUT_P95_MS) {
        failures.push(
          `p95 per output is ${(summary.p95OutputMs / 1000).toFixed(0)}s; the limit is ${MAX_OUTPUT_P95_MS / 1000}s`
        );
      }
    }

    const batchDurations = asNumberArray(metrics.batchDurationsMs);
    const invalidBatchSample = invalidNumberSampleIndex(metrics.batchDurationsMs);
    if (invalidBatchSample !== null) {
      failures.push(
        `technicalMetrics.batchDurationsMs[${invalidBatchSample}] must be a positive finite number`
      );
    } else if (!batchDurations || batchDurations.length === 0) {
      failures.push("technicalMetrics.batchDurationsMs must contain three-output batch durations");
    } else {
      if (batchDurations.length !== threeOutputBatches) {
        failures.push(
          `technicalMetrics.batchDurationsMs has ${batchDurations.length} sample(s) for ${threeOutputBatches} three-output batch(es); every batch must be measured`
        );
      }
      summary.p95BatchMs = percentile95(batchDurations);
      if (summary.p95BatchMs > MAX_BATCH_P95_MS) {
        failures.push(
          `p95 per three-output batch is ${(summary.p95BatchMs / 1000).toFixed(0)}s; the limit is ${MAX_BATCH_P95_MS / 1000}s`
        );
      }
    }

    const rssSamples = asNumberArray(metrics.rssPeakMb);
    const invalidRssSample = invalidNumberSampleIndex(metrics.rssPeakMb);
    const measurement = asRecord(metrics.rssMeasurement);
    if (invalidRssSample !== null) {
      failures.push(`technicalMetrics.rssPeakMb[${invalidRssSample}] must be a positive finite number`);
    } else if (!rssSamples || rssSamples.length === 0) {
      failures.push("technicalMetrics.rssPeakMb must contain RSS peak samples");
    } else {
      summary.maxRssMb = Math.max(...rssSamples);
      if (summary.maxRssMb >= MAX_RSS_MB) {
        failures.push(`RSS peak is ${summary.maxRssMb} MB; it must stay below ~${MAX_RSS_MB} MB`);
      }
    }
    if (
      !measurement ||
      !isNonEmptyString(measurement.process) ||
      !isNonEmptyString(measurement.instanceType) ||
      !isNonEmptyString(measurement.method)
    ) {
      failures.push(
        "technicalMetrics.rssMeasurement requires process, instanceType and method so memory evidence reflects the Render starter"
      );
    }

    if (metrics.refinementCallCount !== 0) {
      failures.push("refinementCallCount must be 0; refinement is removed from the Creative Work path");
    }

    const callCounts = Array.isArray(metrics.imageCallCounts) ? (metrics.imageCallCounts as number[]) : null;
    if (!callCounts || callCounts.length !== plannedOutputsTotal) {
      failures.push(
        `technicalMetrics.imageCallCounts must contain exactly one entry per planned output (${plannedOutputsTotal})`
      );
    } else {
      for (const [index, count] of callCounts.entries()) {
        if (!isPositiveInteger(count) || count > MAX_IMAGE_CALLS_PER_OUTPUT) {
          failures.push(
            `technicalMetrics.imageCallCounts[${index}] is ${String(count)}; every output must use 1-${MAX_IMAGE_CALLS_PER_OUTPUT} image calls`
          );
        }
      }
    }

    const reconciliation = asRecord(metrics.postgresReconciliation);
    if (!reconciliation) {
      failures.push("technicalMetrics.postgresReconciliation is required");
    } else {
      if (!isIsoDate(reconciliation.reconciledAt) || !isNonEmptyString(reconciliation.method)) {
        failures.push("postgresReconciliation requires reconciledAt and the SQL/query method used");
      }
      for (const field of ["terminalFailures", "refundsIssued", "unrefundedFailures", "duplicateCharges"] as const) {
        if (!isNonNegativeInteger(reconciliation[field])) {
          failures.push(`postgresReconciliation.${field} must be a non-negative integer`);
        }
      }
      if (reconciliation.ledgerBalanced !== true) {
        failures.push("postgresReconciliation.ledgerBalanced must be true");
      }
      if (reconciliation.unrefundedFailures !== 0) {
        failures.push("postgresReconciliation shows terminal failures without refund");
      }
      if (reconciliation.duplicateCharges !== 0) {
        failures.push("postgresReconciliation shows duplicate charges");
      }
      if (
        isNonNegativeInteger(reconciliation.terminalFailures) &&
        isNonNegativeInteger(reconciliation.refundsIssued) &&
        reconciliation.refundsIssued !== reconciliation.terminalFailures
      ) {
        failures.push("postgresReconciliation must show exactly one refund per terminal failure");
      }
    }
  }

  return { failures, summary };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) {
    console.error("CWQR-GATE: usage: check-creative-work-quality-recovery-gate.ts <evidence.json>");
    process.exitCode = 1;
  } else if (!fs.existsSync(file)) {
    console.error(`CWQR-GATE: file not found: ${file}`);
    process.exitCode = 1;
  } else {
    let evidence: unknown;
    let parseOk = true;
    try {
      evidence = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      parseOk = false;
      console.error(`CWQR-GATE: invalid JSON: ${(error as Error).message}`);
      process.exitCode = 1;
    }

    if (parseOk) {
      const scaffoldFailures = validateGateScaffold(evidence);
      if (scaffoldFailures.length > 0) {
        for (const failure of scaffoldFailures) console.error(`CWQR-GATE: ${failure}`);
        process.exitCode = 1;
      } else if ((evidence as GateEvidence).status === "pending_human_review") {
        console.log(`CWQR-GATE: PENDING human collection (${JOURNEY_COUNT} journeys scaffolded)`);
        process.exitCode = 2;
      } else {
        const { failures, summary } = evaluateGate(evidence);
        if (failures.length > 0) {
          for (const failure of failures) console.error(`CWQR-GATE: ${failure}`);
          process.exitCode = 1;
        } else {
          console.log(`CWQR-GATE: PASS ${JSON.stringify(summary)}`);
        }
      }
    }
  }
}
