import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = resolve("scripts/check-phase8-human-evidence.mjs");
const baseline = {
  environment: "production",
  capturedAt: "2026-07-14T23:31:09.469Z",
  captureJobId: "job-d9bccbgqmsqc738cps8g",
  path: ".planning/convergence/baseline.json",
};

function journey(phase, index, overrides = {}) {
  const minuteOffset = phase === "after" ? 60 : 0;
  const startedAt = new Date(Date.UTC(2026, 6, 14, 12, minuteOffset + index * 5));
  const firstOutputAt = new Date(startedAt.getTime() + 60_000);
  const approvedAt = new Date(startedAt.getTime() + 120_000);
  const deliveredAt = new Date(startedAt.getTime() + 180_000);
  const issue = index < 4 ? "navigation-doubt" : index < 7 ? "cost-copy" : "context-loss";
  return {
    scenarioId: index < 5 ? `C0${index + 1}` : `N0${index - 4}`,
    phase,
    participantId: `participant-${index + 1}`,
    mode: index < 5 ? "campaign" : "no_campaign",
    brand: ["Horizonte", "Cafe Aurora", "Studio Pulso"][index % 3],
    segment: index % 3 === 0 ? "educacao" : "varejo",
    entrySurface: index < 5 ? "campaign" : "quick_tool",
    device: index % 2 === 0 ? "desktop" : "mobile",
    outcome: "completed",
    observerConfirmedHuman: true,
    startedAt: startedAt.toISOString(),
    firstOutputAt: firstOutputAt.toISOString(),
    approvedAt: approvedAt.toISOString(),
    deliveredAt: deliveredAt.toISOString(),
    endedAt: deliveredAt.toISOString(),
    breakpoints:
      phase === "before"
        ? [
            {
              id: issue,
              category: issue === "context-loss" ? "context_loss" : "doubt",
              severity: "P2",
              at: firstOutputAt.toISOString(),
              note: `Observed ${issue}`,
            },
          ]
        : [],
    ...overrides,
  };
}

function validEvidence() {
  return {
    schemaVersion: 1,
    baseline,
    journeys: [
      ...Array.from({ length: 10 }, (_, index) => journey("before", index)),
      ...Array.from({ length: 10 }, (_, index) => journey("after", index)),
    ],
    corrections: [
      { commit: "abc1234", description: "Fix navigation", targetedBreakpointIds: ["navigation-doubt"] },
      { commit: "def5678", description: "Clarify cost", targetedBreakpointIds: ["cost-copy"] },
      { commit: "fed4321", description: "Preserve context", targetedBreakpointIds: ["context-loss"] },
    ],
    decision: { verdict: "iterate", rationale: "Historical non-campaign duration has no completed sample." },
  };
}

function run(evidence) {
  const directory = mkdtempSync(join(tmpdir(), "phase8-evidence-"));
  const evidencePath = join(directory, "evidence.json");
  writeFileSync(evidencePath, JSON.stringify(evidence));
  const result = spawnSync(process.execPath, [scriptPath, evidencePath], {
    cwd: resolve("."),
    encoding: "utf8",
  });
  rmSync(directory, { recursive: true, force: true });
  return result;
}

test("accepts a complete paired human sample with the top three corrected", () => {
  const result = run(validEvidence());
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /complete and valid/);
});

test("automation cannot masquerade as a human journey", () => {
  const evidence = validEvidence();
  evidence.journeys[0].observerConfirmedHuman = false;
  const result = run(evidence);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not confirmed as human-operated/);
});

test("abandoned attempts do not satisfy the completed sample", () => {
  const evidence = validEvidence();
  evidence.decision = { verdict: "expand", rationale: "Claimed improvement" };
  evidence.journeys[0] = journey("before", 0, {
    outcome: "abandoned",
    firstOutputAt: null,
    approvedAt: null,
    deliveredAt: null,
  });
  const result = run(evidence);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /10 completed human journeys/);
});

test("iterate accepts a failed historical baseline with one completed after journey", () => {
  const evidence = validEvidence();
  evidence.journeys = [
    ...evidence.journeys
      .filter(({ phase }) => phase === "before")
      .map((item) => ({ ...item, outcome: "failed", firstOutputAt: null, approvedAt: null, deliveredAt: null })),
    journey("after", 0),
  ];
  evidence.decision = { verdict: "iterate", rationale: "Historical baseline has no completed sample; one post-fix journey confirms the decision remains iterative." };
  const result = run(evidence);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /complete and valid/);
});

test("corrections cannot target unobserved breakpoint ids", () => {
  const evidence = validEvidence();
  evidence.corrections[0].targetedBreakpointIds = ["invented-breakpoint"];
  const result = run(evidence);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /targets unobserved breakpoint/);
});

test("expand is rejected when time to first output regresses beyond ten percent", () => {
  const evidence = validEvidence();
  evidence.decision = {
    verdict: "expand",
    rationale: "Claimed improvement",
    qualitativeGain: "Participants understood the unified entry points.",
  };
  for (const journey of evidence.journeys.filter(({ phase }) => phase === "after")) {
    const startedAt = Date.parse(journey.startedAt);
    journey.firstOutputAt = new Date(startedAt + 180_000).toISOString();
    journey.approvedAt = new Date(startedAt + 240_000).toISOString();
    journey.deliveredAt = new Date(startedAt + 300_000).toISOString();
    journey.endedAt = journey.deliveredAt;
  }
  const result = run(evidence);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /within 10%/);
});
