#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const defaultEvidencePath = resolve(
  repoRoot,
  ".planning/convergence/phase8-human-journeys.json"
);
const evidencePath = resolve(process.argv[2] ?? defaultEvidencePath);
const allowedModes = new Set(["campaign", "no_campaign"]);
const allowedPhases = new Set(["before", "after"]);
const allowedOutcomes = new Set(["completed", "abandoned", "failed"]);
const allowedSeverities = new Set(["P0", "P1", "P2", "P3"]);
const severityRank = new Map([
  ["P0", 0],
  ["P1", 1],
  ["P2", 2],
  ["P3", 3],
]);
const allowedBreakpoints = new Set([
  "doubt",
  "abandonment",
  "return",
  "error",
  "unexpected_cost",
  "context_loss",
]);

function fail(message) {
  console.error(`PHASE8-EVIDENCE: ${message}`);
  process.exitCode = 1;
}

function parseDate(value, label) {
  const time = Date.parse(value ?? "");
  if (!Number.isFinite(time)) {
    fail(`${label} must be an ISO-8601 timestamp`);
    return null;
  }
  return time;
}

function percentile50(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[midpoint - 1] + sorted[midpoint]) / 2)
    : sorted[midpoint];
}

function validateJourney(journey, index) {
  const label = `journeys[${index}]`;
  for (const field of [
    "scenarioId",
    "phase",
    "participantId",
    "mode",
    "brand",
    "segment",
    "entrySurface",
    "device",
    "outcome",
  ]) {
    if (typeof journey?.[field] !== "string" || journey[field].trim() === "") {
      fail(`${label}.${field} is required`);
    }
  }
  if (!allowedPhases.has(journey.phase)) fail(`${label}.phase is invalid`);
  if (!allowedModes.has(journey.mode)) fail(`${label}.mode is invalid`);
  if (!allowedOutcomes.has(journey.outcome)) fail(`${label}.outcome is invalid`);
  if (journey.observerConfirmedHuman !== true) {
    fail(`${label} is not confirmed as human-operated`);
  }

  const startedAt = parseDate(journey.startedAt, `${label}.startedAt`);
  const endedAt = parseDate(journey.endedAt, `${label}.endedAt`);
  if (startedAt != null && endedAt != null && endedAt < startedAt) {
    fail(`${label}.endedAt precedes startedAt`);
  }

  if (journey.outcome === "completed") {
    let previous = startedAt;
    for (const field of ["firstOutputAt", "approvedAt", "deliveredAt"]) {
      const current = parseDate(journey[field], `${label}.${field}`);
      if (previous != null && current != null && current < previous) {
        fail(`${label}.${field} is out of order`);
      }
      previous = current;
    }
    if (previous != null && endedAt != null && endedAt < previous) {
      fail(`${label}.endedAt precedes delivery`);
    }
  }

  if (!Array.isArray(journey.breakpoints)) {
    fail(`${label}.breakpoints must be an array`);
  } else {
    for (const [breakpointIndex, breakpoint] of journey.breakpoints.entries()) {
      const breakpointLabel = `${label}.breakpoints[${breakpointIndex}]`;
      if (!breakpoint?.id || !breakpoint?.note || !breakpoint?.severity) {
        fail(`${breakpointLabel} requires id, severity and observable note`);
      }
      if (!allowedSeverities.has(breakpoint?.severity)) {
        fail(`${breakpointLabel}.severity must be P0, P1, P2 or P3`);
      }
      if (!allowedBreakpoints.has(breakpoint?.category)) {
        fail(`${breakpointLabel}.category is invalid`);
      }
      parseDate(breakpoint?.at, `${breakpointLabel}.at`);
    }
  }
}

function summarize(journeys) {
  const completed = journeys.filter((journey) => journey.outcome === "completed");
  const firstOutputDurations = completed
    .map((journey) => Date.parse(journey.firstOutputAt) - Date.parse(journey.startedAt))
    .filter(Number.isFinite);
  return {
    journeys: journeys.length,
    completed: completed.length,
    completionRate: journeys.length === 0 ? null : completed.length / journeys.length,
    approved: completed.filter((journey) => journey.approvedAt).length,
    delivered: completed.filter((journey) => journey.deliveredAt).length,
    medianTimeToFirstOutputMs: percentile50(firstOutputDurations),
  };
}

function rankBreakpointIds(journeys) {
  const grouped = new Map();
  for (const journey of journeys) {
    for (const breakpoint of journey.breakpoints ?? []) {
      const current = grouped.get(breakpoint.id) ?? {
        id: breakpoint.id,
        count: 0,
        severity: breakpoint.severity,
      };
      current.count += 1;
      if (
        (severityRank.get(breakpoint.severity) ?? 99) <
        (severityRank.get(current.severity) ?? 99)
      ) {
        current.severity = breakpoint.severity;
      }
      grouped.set(breakpoint.id, current);
    }
  }
  return [...grouped.values()].sort(
    (left, right) =>
      right.count - left.count ||
      (severityRank.get(left.severity) ?? 99) -
        (severityRank.get(right.severity) ?? 99) ||
      left.id.localeCompare(right.id)
  );
}

if (!existsSync(evidencePath)) {
  fail(`file not found: ${evidencePath}`);
} else {
  let evidence;
  try {
    evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  } catch (error) {
    fail(`invalid JSON: ${error.message}`);
  }

  if (evidence) {
    if (evidence.schemaVersion !== 1) fail("schemaVersion must be 1");
    if (!Array.isArray(evidence.journeys)) fail("journeys must be an array");
    if (!Array.isArray(evidence.corrections)) fail("corrections must be an array");
    if (evidence.baseline?.environment !== "production") {
      fail("baseline must come from production; local synthetic data is not valid");
    }
    if (!evidence.baseline?.capturedAt) fail("production baseline is not captured");
    const baselinePath = resolve(repoRoot, evidence.baseline?.path ?? "");
    if (!existsSync(baselinePath)) {
      fail(`baseline file not found: ${baselinePath}`);
    } else {
      try {
        const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
        if (baseline.environment !== "production") {
          fail("baseline file must identify the production environment");
        }
        if (baseline.capturedAt !== evidence.baseline?.capturedAt) {
          fail("baseline capturedAt does not match the frozen baseline file");
        }
        if (baseline.captureJobId !== evidence.baseline?.captureJobId) {
          fail("baseline captureJobId does not match the frozen baseline file");
        }
        for (const origin of ["campaign", "assistant", "quick_tool"]) {
          if (!baseline.origins?.[origin]) fail(`baseline is missing origin ${origin}`);
        }
      } catch (error) {
        fail(`invalid baseline JSON: ${error.message}`);
      }
    }

    for (const [index, journey] of (evidence.journeys ?? []).entries()) {
      validateJourney(journey, index);
    }

    const before = (evidence.journeys ?? []).filter((journey) => journey.phase === "before");
    const after = (evidence.journeys ?? []).filter((journey) => journey.phase === "after");
    const verdict = evidence.decision?.verdict;
    if (verdict === "iterate") {
      if (!after.some((journey) => journey.outcome === "completed")) {
        fail("iterate requires at least one completed after journey");
      }
    } else {
      for (const [phase, journeys] of [
        ["before", before],
        ["after", after],
      ]) {
        const completedJourneys = journeys.filter(
          (journey) => journey.outcome === "completed"
        );
        if (completedJourneys.length < 10) {
          fail(`${phase} requires at least 10 completed human journeys`);
        }
        if (
          completedJourneys.filter((journey) => journey.mode === "campaign").length < 5
        ) {
          fail(`${phase} requires at least 5 completed campaign journeys`);
        }
        if (
          completedJourneys.filter((journey) => journey.mode === "no_campaign").length < 5
        ) {
          fail(`${phase} requires at least 5 completed no-campaign journeys`);
        }
      }
    }

    const beforeScenarioIds = new Set(
      before
        .filter((journey) => journey.outcome === "completed")
        .map((journey) => journey.scenarioId)
    );
    const afterScenarioIds = new Set(
      after
        .filter((journey) => journey.outcome === "completed")
        .map((journey) => journey.scenarioId)
    );
    for (const scenarioId of beforeScenarioIds) {
      if (!afterScenarioIds.has(scenarioId)) fail(`after is missing paired scenario ${scenarioId}`);
    }

    const completedBefore = before.filter((journey) => journey.outcome === "completed");
    const baselineJourneys = verdict === "iterate" ? before : completedBefore;
    const brands = new Set(
      baselineJourneys.map((journey) => journey.brand.trim().toLowerCase())
    );
    const segments = new Set(
      baselineJourneys.map((journey) => journey.segment.trim().toLowerCase())
    );
    if (verdict !== "iterate") {
      if (brands.size < 3) fail("before requires at least 3 brands");
      if (segments.size < 2) fail("before requires at least 2 segments");
      if ([...segments].every((segment) => segment.includes("educa"))) {
        fail("before requires at least one non-education segment");
      }
    }

    if ((evidence.corrections ?? []).length < 3) {
      fail("at least 3 top-breakpoint corrections must be recorded");
    }
    const rankedBreakpoints = rankBreakpointIds(before);
    const observedBreakpointIds = new Set(rankedBreakpoints.map(({ id }) => id));
    const targetedBreakpointIds = new Set();
    for (const [index, correction] of (evidence.corrections ?? []).entries()) {
      if (!correction?.commit || !correction?.description) {
        fail(`corrections[${index}] requires commit and description`);
      }
      if (!Array.isArray(correction?.targetedBreakpointIds) || correction.targetedBreakpointIds.length === 0) {
        fail(`corrections[${index}] requires targetedBreakpointIds`);
      }
      for (const breakpointId of correction?.targetedBreakpointIds ?? []) {
        if (!observedBreakpointIds.has(breakpointId)) {
          fail(`corrections[${index}] targets unobserved breakpoint ${breakpointId}`);
        }
        targetedBreakpointIds.add(breakpointId);
      }
    }
    if (rankedBreakpoints.length < 3) {
      fail("before must expose at least 3 distinct breakpoints to select the top three");
    } else {
      for (const { id } of rankedBreakpoints.slice(0, 3)) {
        if (!targetedBreakpointIds.has(id)) {
          fail(`top-three breakpoint ${id} is not covered by a correction`);
        }
      }
    }

    if (!["expand", "iterate", "revert"].includes(evidence.decision?.verdict)) {
      fail("decision.verdict must be expand, iterate or revert");
    }
    if (!evidence.decision?.rationale) fail("decision.rationale is required");

    const beforeSummary = summarize(before);
    const afterSummary = summarize(after);
    if (evidence.decision?.verdict === "expand") {
      const unresolvedSevere = after.flatMap((journey) => journey.breakpoints ?? []).filter(
        (breakpoint) => breakpoint.severity === "P0" || breakpoint.severity === "P1"
      );
      if (unresolvedSevere.length > 0) {
        fail("expand is forbidden while after journeys contain P0/P1 breakpoints");
      }
      if ((afterSummary.completionRate ?? 0) < (beforeSummary.completionRate ?? 0)) {
        fail("expand requires completion rate to be no worse after corrections");
      }
      if (afterSummary.delivered < beforeSummary.delivered) {
        fail("expand requires delivered journeys to be no worse after corrections");
      }
      if (
        beforeSummary.medianTimeToFirstOutputMs != null &&
        afterSummary.medianTimeToFirstOutputMs != null &&
        afterSummary.medianTimeToFirstOutputMs >
          beforeSummary.medianTimeToFirstOutputMs * 1.1
      ) {
        fail("expand requires median time to first output within 10% of before");
      }
      if (!evidence.decision?.qualitativeGain) {
        fail("expand requires decision.qualitativeGain");
      }
    }

    console.log(
      `PHASE8-EVIDENCE: ${JSON.stringify({
        before: beforeSummary,
        after: afterSummary,
        brands: brands.size,
        segments: segments.size,
        corrections: evidence.corrections?.length ?? 0,
        decision: evidence.decision?.verdict ?? null,
      })}`
    );
    if (!process.exitCode) console.log("PHASE8-EVIDENCE: complete and valid");
  }
}
