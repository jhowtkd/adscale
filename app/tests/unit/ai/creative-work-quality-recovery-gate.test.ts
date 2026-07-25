import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  evaluateGate,
  validateGateScaffold,
  MAX_BATCH_P95_MS,
  MAX_OUTPUT_P95_MS,
  MAX_RSS_MB,
} from "../../../scripts/check-creative-work-quality-recovery-gate";

const tsxBin = resolve("node_modules/.bin/tsx");
const scriptPath = resolve("scripts/check-creative-work-quality-recovery-gate.ts");
const templatePath = resolve("../.planning/validation/creative-work-quality-recovery-gate.json");

const PLANNED_OUTPUTS = [1, 1, 3, 3, 3, 3, 3, 1, 1, 1];
const TOTAL_OUTPUTS = PLANNED_OUTPUTS.reduce((total, count) => total + count, 0);
const PROTOCOLS = [
  "single",
  "single",
  "variations",
  "variations",
  "format_adaptation",
  "format_adaptation",
  "format_adaptation",
  "restyle",
  "restyle",
  "restyle",
];
const BRANDS = [
  "Psicologia",
  "Marca D",
  "Marca B",
  "Marca C",
  "NR1",
  "Marca D",
  "Marca B",
  "XTB",
  "Marca C",
  "Marca D",
];

function journey(index: number) {
  const mandatoryCase =
    index === 0
      ? "psicologia_fact_preservation"
      : index === 4
        ? "nr1_three_format_adaptation"
        : index === 7
          ? "xtb_content_style_identity_separation"
          : null;
  const mandatoryAssertions =
    mandatoryCase === "psicologia_fact_preservation"
      ? { requiredFacts: ["agosto", "vagas limitadas"], preservedFacts: ["agosto", "vagas limitadas"] }
      : mandatoryCase === "nr1_three_format_adaptation"
        ? { adaptedFromSamePiece: true, deliveredFormats: ["1:1", "4:5", "9:16"] }
        : mandatoryCase === "xtb_content_style_identity_separation"
          ? { separatedDimensions: ["content", "style", "identity"] }
          : null;
  return {
    id: `journey-${String(index + 1).padStart(2, "0")}`,
    protocol: PROTOCOLS[index],
    brand: BRANDS[index],
    segment: index % 2 === 0 ? "psicologia" : "investimentos",
    mandatoryCase,
    reviewerId: `reviewer-${(index % 3) + 1}`,
    reviewedAt: new Date(Date.UTC(2026, 6, 23, 10 + index)).toISOString(),
    plannedOutputs: PLANNED_OUTPUTS[index],
    terminalCoherentOutputs: PLANNED_OUTPUTS[index],
    regressions: { factual: 0, brand: 0, dimension: 0 },
    objectiveVerdict: "pass",
    inconclusiveResolution: null,
    blindComparison: {
      options: ["A", "B", "C"],
      assignmentsRevealed: true,
      assignments: {
        A: "production_snapshot",
        B: "direct_generation",
        C: "creative_work_v1",
      },
      preferenceVsProduction: index <= 8 ? "v1" : "tie",
      preferenceVsDirect: index <= 7 ? "v1" : index === 8 ? "tie" : "baseline",
    },
    mandatoryAssertions,
  };
}

function validEvidence() {
  return {
    schemaVersion: 1,
    gate: "creative_work_quality_recovery",
    status: "completed",
    budgetApproval: {
      approvedBy: "project-owner",
      approvedAt: "2026-07-22T18:00:00.000Z",
      reference: "budget-approval-gate8-2026-07-22",
    },
    evidenceWindow: {
      startedAt: "2026-07-23T10:00:00.000Z",
      endedAt: "2026-07-23T20:00:00.000Z",
    },
    journeys: Array.from({ length: 10 }, (_, index) => journey(index)),
    technicalMetrics: {
      outputDurationsMs: Array.from({ length: TOTAL_OUTPUTS }, (_, index) => 120_000 + index * 5_000),
      batchDurationsMs: [300_000, 330_000, 360_000, 390_000, 420_000],
      rssPeakMb: [280, 310, 340],
      rssMeasurement: {
        process: "web",
        instanceType: "render-starter",
        method: "process.memoryUsage().rss sampled after each output",
      },
      refinementCallCount: 0,
      imageCallCounts: Array.from({ length: TOTAL_OUTPUTS }, (_, index) => (index % 2 === 0 ? 1 : 2)),
      postgresReconciliation: {
        reconciledAt: "2026-07-23T21:00:00.000Z",
        method: "SQL join of creative_work_outputs against the credits ledger",
        terminalFailures: 1,
        refundsIssued: 1,
        unrefundedFailures: 0,
        duplicateCharges: 0,
        ledgerBalanced: true,
      },
    },
  };
}

function failuresFor(mutate: (evidence: ReturnType<typeof validEvidence>) => void): string[] {
  const evidence = validEvidence();
  mutate(evidence);
  return evaluateGate(evidence).failures;
}

function expectFailure(
  mutate: (evidence: ReturnType<typeof validEvidence>) => void,
  substring: string
) {
  const failures = failuresFor(mutate);
  expect(failures, `expected a failure containing "${substring}"`).toEqual(
    expect.arrayContaining([expect.stringContaining(substring)])
  );
}

function runChecker(file: string) {
  return spawnSync(tsxBin, [scriptPath, file], { encoding: "utf8" });
}

function runCheckerWithEvidence(evidence: unknown) {
  const directory = mkdtempSync(join(tmpdir(), "cwqr-gate-"));
  const file = join(directory, "evidence.json");
  writeFileSync(file, JSON.stringify(evidence));
  const result = runChecker(file);
  rmSync(directory, { recursive: true, force: true });
  return result;
}

describe("creative-work quality recovery gate CLI", () => {
  it("exits 2 on a well-formed pending_human_review scaffold", { timeout: 60_000 }, () => {
    const result = runCheckerWithEvidence({ ...validEvidence(), status: "pending_human_review" });
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("PENDING");
  });

  it("exits 1 on a file containing the JSON literal null", { timeout: 60_000 }, () => {
    const directory = mkdtempSync(join(tmpdir(), "cwqr-gate-"));
    const file = join(directory, "null-literal.json");
    writeFileSync(file, "null");
    const result = runChecker(file);
    rmSync(directory, { recursive: true, force: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("evidence must be a JSON object");
  });

  it("exits 0 only when every condition is simultaneously satisfied", { timeout: 60_000 }, () => {
    const result = runCheckerWithEvidence(validEvidence());
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS");
  });

  it("exits 1 on violated evidence", { timeout: 60_000 }, () => {
    const evidence = validEvidence();
    evidence.technicalMetrics.refinementCallCount = 1;
    const result = runCheckerWithEvidence(evidence);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("CWQR-GATE:");
  });

  it("exits 1 on historical blind-gate evidence instead of counting it", { timeout: 60_000 }, () => {
    const historical = {
      status: "completed",
      pairs: Array.from({ length: 12 }, (_, index) => ({
        id: `pair-${index + 1}`,
        mode: "art_variation",
        format: "1:1",
        creativeLevel: "balanced",
        preferred: "recalibrated",
        objectiveRegression: false,
      })),
    };
    expect(runCheckerWithEvidence(historical).status).toBe(1);
  });

  it("exits 1 when the evidence file does not exist", { timeout: 60_000 }, () => {
    expect(runChecker(resolve("scripts/__missing-cwqr-evidence__.json")).status).toBe(1);
  });
});

describe("validateGateScaffold", () => {
  it("accepts the pending template shape", () => {
    const template = { ...validEvidence(), status: "pending_human_review" };
    expect(validateGateScaffold(template)).toEqual([]);
  });

  it("keeps the shipped template in a stable scaffold shape regardless of collection status", () => {
    const template = JSON.parse(readFileSync(templatePath, "utf8")) as unknown;
    expect(validateGateScaffold(template)).toEqual([]);
  });

  it("rejects evidence without the gate discriminator", () => {
    const evidence = { ...validEvidence(), gate: "image_harness_blind_gate" };
    expect(validateGateScaffold(evidence).some((failure) => failure.includes("historical"))).toBe(true);
  });
});

describe("evaluateGate sample counters", () => {
  it("passes complete valid evidence with zero failures", () => {
    const { failures, summary } = evaluateGate(validEvidence());
    expect(failures).toEqual([]);
    expect(summary.v1PreferenceVsProduction).toBe(9);
    expect(summary.v1PreferenceVsDirect).toBe(8);
  });

  it("requires exactly 10 journeys", () => {
    expectFailure((evidence) => {
      evidence.journeys.pop();
    }, "exactly 10");
  });

  it("requires at least 2 cases per protocol", () => {
    expectFailure((evidence) => {
      evidence.journeys[8].protocol = "single";
      evidence.journeys[9].protocol = "single";
    }, 'protocol "restyle"');
  });

  it("requires at least 3 brands", () => {
    expectFailure((evidence) => {
      for (const item of evidence.journeys) item.brand = "Marca Unica";
    }, "3 distinct brands");
  });

  it("requires at least 2 segments", () => {
    expectFailure((evidence) => {
      for (const item of evidence.journeys) item.segment = "psicologia";
    }, "2 distinct segments");
  });

  it("requires the Psicologia mandatory case preserving agosto/vagas limitadas", () => {
    expectFailure((evidence) => {
      evidence.journeys[0].mandatoryCase = null;
    }, "psicologia_fact_preservation");
    expectFailure((evidence) => {
      evidence.journeys[0].mandatoryAssertions = {
        requiredFacts: ["agosto", "vagas limitadas"],
        preservedFacts: ["agosto"],
      };
    }, "vagas limitadas");
  });

  it("requires the XTB mandatory case separating content, style and identity", () => {
    expectFailure((evidence) => {
      evidence.journeys[7].mandatoryCase = null;
    }, "xtb_content_style_identity_separation");
    expectFailure((evidence) => {
      evidence.journeys[7].mandatoryAssertions = { separatedDimensions: ["content", "style"] };
    }, "identity");
  });

  it("requires the NR1 mandatory case adapting the same piece into three formats", () => {
    expectFailure((evidence) => {
      evidence.journeys[4].mandatoryCase = null;
    }, "nr1_three_format_adaptation");
    expectFailure((evidence) => {
      evidence.journeys[4].mandatoryAssertions = {
        adaptedFromSamePiece: false,
        deliveredFormats: ["1:1", "4:5", "9:16"],
      };
    }, "same source piece");
    expectFailure((evidence) => {
      evidence.journeys[4].mandatoryAssertions = {
        adaptedFromSamePiece: true,
        deliveredFormats: ["1:1", "4:5"],
      };
    }, "three distinct formats");
  });
});

describe("evaluateGate blind comparison and preference", () => {
  it("requires the three anonymous options revealed per case", () => {
    expectFailure((evidence) => {
      evidence.journeys[3].blindComparison.assignmentsRevealed = false;
    }, "not revealed");
    expectFailure((evidence) => {
      evidence.journeys[3].blindComparison.assignments = {
        A: "creative_work_v1",
        B: "creative_work_v1",
        C: null,
      };
    }, "three anonymous options");
  });

  it("rejects extra options or assignment keys duplicating a source", () => {
    expectFailure((evidence) => {
      evidence.journeys[3].blindComparison.options = ["A", "B", "C", "D"];
      evidence.journeys[3].blindComparison.assignments = {
        A: "production_snapshot",
        B: "direct_generation",
        C: "creative_work_v1",
        D: "creative_work_v1",
      };
    }, "three anonymous options");
  });

  it("requires v1 preference of at least 6/10 over frozen production, ties excluded", () => {
    expectFailure((evidence) => {
      for (const [index, item] of evidence.journeys.entries()) {
        item.blindComparison.preferenceVsProduction = index < 5 ? "v1" : "tie";
      }
    }, "vs frozen production is 5/10");
  });

  it("requires v1 preference of at least 6/10 over direct generation", () => {
    expectFailure((evidence) => {
      for (const [index, item] of evidence.journeys.entries()) {
        item.blindComparison.preferenceVsDirect = index < 4 ? "v1" : "baseline";
      }
    }, "vs direct generation is 4/10");
  });

  it("blocks any protocol below 50% v1 preference", () => {
    expectFailure((evidence) => {
      for (const index of [7, 8, 9]) {
        evidence.journeys[index].blindComparison.preferenceVsProduction = "baseline";
        evidence.journeys[index].blindComparison.preferenceVsDirect = "baseline";
      }
    }, 'protocol "restyle"');
  });
});

describe("evaluateGate objective validation and regressions", () => {
  it("blocks any factual, brand or dimension regression", () => {
    for (const kind of ["factual", "brand", "dimension"] as const) {
      expectFailure((evidence) => {
        evidence.journeys[2].regressions[kind] = 1;
      }, `${kind} regression`);
    }
  });

  it("requires 100% of planned outputs in a coherent terminal state", () => {
    expectFailure((evidence) => {
      evidence.journeys[4].terminalCoherentOutputs = 2;
    }, "100% is required");
  });

  it("reports an invalid plannedOutputs once, without the cosmetic terminal-state failure", () => {
    const failures = failuresFor((evidence) => {
      evidence.journeys[2].plannedOutputs = 0;
    });
    expect(failures.filter((failure) => failure.includes("journeys[2]"))).toEqual([
      expect.stringContaining("plannedOutputs must be a positive integer"),
    ]);
  });

  it("blocks an objective fail verdict", () => {
    expectFailure((evidence) => {
      evidence.journeys[1].objectiveVerdict = "fail";
    }, "failed objective validation");
  });

  it("blocks an unresolved inconclusive verdict until human review resolves it", () => {
    expectFailure((evidence) => {
      evidence.journeys[1].objectiveVerdict = "inconclusive";
    }, "inconclusive");
  });

  it("accepts an inconclusive verdict resolved as pass and rejects one resolved as fail", () => {
    const resolved = failuresFor((evidence) => {
      evidence.journeys[1].objectiveVerdict = "inconclusive";
      evidence.journeys[1].inconclusiveResolution = {
        verdict: "pass",
        reviewerId: "reviewer-1",
        resolvedAt: "2026-07-24T10:00:00.000Z",
      };
    });
    expect(resolved).toEqual([]);

    expectFailure((evidence) => {
      evidence.journeys[1].objectiveVerdict = "inconclusive";
      evidence.journeys[1].inconclusiveResolution = {
        verdict: "fail",
        reviewerId: "reviewer-1",
        resolvedAt: "2026-07-24T10:00:00.000Z",
      };
    }, "resolved as a failure");
  });
});

describe("evaluateGate technical and financial limits", () => {
  it("enforces p95 of 4 minutes per output", () => {
    expectFailure((evidence) => {
      evidence.technicalMetrics.outputDurationsMs[0] = MAX_OUTPUT_P95_MS + 60_000;
      evidence.technicalMetrics.outputDurationsMs[1] = MAX_OUTPUT_P95_MS + 60_000;
    }, "p95 per output");
  });

  it("enforces p95 of 8 minutes per three-output batch", () => {
    expectFailure((evidence) => {
      evidence.technicalMetrics.batchDurationsMs.push(MAX_BATCH_P95_MS + 60_000);
    }, "p95 per three-output batch");
  });

  it("requires exactly one duration per three-output batch", () => {
    expectFailure((evidence) => {
      evidence.technicalMetrics.batchDurationsMs.pop();
    }, "every batch must be measured");
  });

  it("reports the index of an invalid metric sample instead of a count error", () => {
    expectFailure((evidence) => {
      evidence.technicalMetrics.outputDurationsMs[2] = 0;
    }, "outputDurationsMs[2]");
    expectFailure((evidence) => {
      evidence.technicalMetrics.batchDurationsMs[1] = Number.NaN;
    }, "batchDurationsMs[1]");
  });

  it("enforces RSS below ~358 MB with recorded measurement method", () => {
    expectFailure((evidence) => {
      evidence.technicalMetrics.rssPeakMb.push(MAX_RSS_MB);
    }, "RSS peak");
    expectFailure((evidence) => {
      evidence.technicalMetrics.rssMeasurement = { process: null, instanceType: null, method: null };
    }, "rssMeasurement");
  });

  it("requires zero refinement calls", () => {
    expectFailure((evidence) => {
      evidence.technicalMetrics.refinementCallCount = 1;
    }, "refinement");
  });

  it("enforces at most 2 image calls per output with one entry per planned output", () => {
    expectFailure((evidence) => {
      evidence.technicalMetrics.imageCallCounts[0] = 3;
    }, "image calls");
    expectFailure((evidence) => {
      evidence.technicalMetrics.imageCallCounts.pop();
    }, "one entry per planned output");
  });

  it("requires Postgres reconciliation of failures and refunds", () => {
    expectFailure((evidence) => {
      evidence.technicalMetrics.postgresReconciliation.unrefundedFailures = 1;
    }, "without refund");
    expectFailure((evidence) => {
      evidence.technicalMetrics.postgresReconciliation.refundsIssued = 0;
    }, "one refund per terminal failure");
    expectFailure((evidence) => {
      evidence.technicalMetrics.postgresReconciliation.duplicateCharges = 1;
    }, "duplicate charges");
    expectFailure((evidence) => {
      evidence.technicalMetrics.postgresReconciliation.ledgerBalanced = false;
    }, "ledgerBalanced");
  });

  it("requires explicit budget approval and a rollout evidence window", () => {
    expectFailure((evidence) => {
      evidence.budgetApproval = { approvedBy: null, approvedAt: null, reference: null };
    }, "budgetApproval");
    expectFailure((evidence) => {
      evidence.evidenceWindow = { startedAt: null, endedAt: null };
    }, "evidenceWindow");
  });

  it("requires budget approval before the evidence window starts", () => {
    expectFailure((evidence) => {
      evidence.budgetApproval.approvedAt = "2026-07-23T12:00:00.000Z";
    }, "after evidenceWindow.startedAt");
  });
});
