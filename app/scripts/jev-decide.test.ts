/**
 * #473 — decision CLI, exercised by spawning the real script. Everything here is synthetic/test-only instrumentation:
 * no provider, no database, no real corpus. A "perfect" synthetic fixture must still be `hold`.
 *
 * Evidence artifact formats (vitest JSON, TAP, boundary, fixture, load) follow docs/agents/jev-decision-pilot.md;
 * `tools()` below is the single place to adjust if a validator expects a different shape.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readdirSync, statSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { workRow } from "../src/server/creative-work/semantic-review-collection.pg-helpers";
import { EVALUATION_VERSIONS, judgmentSchema, LABEL_VERSIONS, semanticDigest } from "../src/server/creative-work/semantic-review-evaluation";
import { projectSemanticReviewOffline, type SemanticDecisions } from "../src/server/creative-work/semantic-review-offline";
import { validateSemanticExportApproval } from "../src/server/creative-work/semantic-review-export-authorization";
import { exportSemanticReviewCases, importSemanticReviewJudgment, writeSemanticEvaluationReport } from "./jev-evaluate";
import { bytesDigest, G0_COMMANDS, G2_CRITERIA, JEV_TEST_FILES, REGRESSION_FILES } from "./jev-decision-evidence";
import { runSyntheticCorpus, SYNTHETIC_CASES } from "./run-jev-offline";
import { captureEvidenceProcess } from "./jev-decide";

vi.setConfig({ testTimeout: 120_000 });

const APP = resolve(__dirname, "..");
const HEAD = execFileSync("git", ["rev-parse", "HEAD"], { cwd: APP, encoding: "utf8" }).trim();
const OTHER_SHA = HEAD.replace(/^./, (c) => (c === "a" ? "b" : "a"));
const BASE = new Date("2026-10-10T12:00:00.000Z");
const at = (ms: number) => new Date(BASE.getTime() + ms);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const roots: string[] = [];
function tmp() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "jev473-")));
  chmodSync(dir, 0o700);
  roots.push(dir);
  return dir;
}
afterAll(() => { for (const dir of roots) rmSync(dir, { recursive: true, force: true }); });

// ---------- CLI driver ----------
type Out = { version: number; codeSha: string; decision: string; enablesProductBehavior: boolean; validationOnly: boolean;
  gates: Record<"g0" | "g1" | "g2", { status: string; missing: string[]; limitations: string[]; metrics?: unknown }> } & Record<string, unknown>;
function cli(args: string[]) {
  const r = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/jev-decide.ts", ...args],
    { cwd: APP, encoding: "utf8", env: { ...process.env, NODE_ENV: "test", DATABASE_URL: "", TEST_DATABASE_URL: "" }, timeout: 60_000 });
  let out: Out | null = null;
  try { out = JSON.parse(r.stdout) as Out; } catch { /* not JSON */ }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, out };
}
const decide = (pkg: string, gate: "g0" | "g1" | "g2", extra: string[] = []) => cli(["--evidence", pkg, "--gate", gate, ...extra]);

// ---------- synthetic tool receipts ----------
type ToolId = keyof typeof G0_COMMANDS;
type Artifacts = Partial<Record<ToolId, string>>;
const vitestJson = (files: readonly string[], over: { skipped?: boolean; failed?: boolean; drop?: string; incoherent?: boolean } = {}) => {
  const kept = files.filter((f) => f !== over.drop);
  const testResults = kept.map((file, i) => ({
    name: join(APP, file), status: over.failed && i === 0 ? "failed" : "passed",
    assertionResults: [{ status: over.skipped && i === 0 ? "skipped" : over.failed && i === 0 ? "failed" : "passed", title: "t", fullName: "t", ancestorTitles: [] }, { status: "passed", title: "u", fullName: "u", ancestorTitles: [] }],
  }));
  const n = kept.length * 2;
  const skipped = over.skipped ? 1 : 0, failed = over.failed ? 1 : 0;
  return JSON.stringify({ numTotalTestSuites: kept.length, numPassedTestSuites: kept.length - failed, numFailedTestSuites: failed, numPendingTestSuites: 0, numTotalTests: over.incoherent ? n + 5 : n,
    numPassedTests: n - skipped - failed, numFailedTests: failed, numPendingTests: skipped, numTodoTests: 0, success: !failed, testResults });
};
const boundary = (over: Record<string, number> = {}) => `JEV-DEPENDENCIES: ${JSON.stringify({ protectedFiles: 3, pilotExecutableFiles: 5, pilotPackages: 2, violations: 0, ...over })}\n`;
/** Minimal coherent #472 load result: observer on/off pairs, 100 samples per arm, within target. */
const load = (over: { samplePerArm?: number; verdict?: string } = {}) => {
  const S = over.samplePerArm ?? 100;
  const idle = { seededWorks: 10, sweeps: 4, httpCalls: 0, sweepErrors: 0, statuses: { completed: 4 }, window: { ms: 1000, sweeps: 2, sends: 0 } };
  const base = { samples: S, errors: 0, outcomes: { ok: S }, copyCalls: S, outputRows: 0, attemptRows: S, pool: { maxTotal: 4, maxWaiting: 0, minIdle: 1, samples: 10 }, p50Ms: 900, maxMs: 1200 };
  const quiet = { queued: 0, maxQueuedAgeMs: 0, markers: 0, quotaAttempts: 0, completed: 0, outcomeUnknown: 0, collectionRuns: 0 };
  const on = { observer: { ...idle, httpCalls: 6, window: { ms: 1000, sweeps: 2, sends: 3 } }, jevQueue: { queued: 0, maxQueuedAgeMs: 0, markers: 6, quotaAttempts: 6, completed: 5, outcomeUnknown: 1, collectionRuns: 4 } };
  const arm = (kind: string, pair: number | null, p95Ms: number, extra: object) => ({ kind, pair, p95Ms, ...base, observer: idle, jevQueue: quiet, ...extra });
  return JSON.stringify({ harness: "jev-472-load", verdict: over.verdict ?? (S >= 100 ? "within_target" : "inconclusive"), enablementEvidence: false, pooledP95: true,
    samplePerArm: S, concurrency: 4, targetMs: 50, deltaMs: 10, noiseMs: 10, baselineP95Ms: 1000, observerOnP95Ms: 1010, limitations: ["synthetic test fixture; not enablement evidence"],
    arms: [arm("observer_off", 1, 1000, {}), arm("observer_on", 1, 1010, on), arm("observer_on", 2, 1010, on), arm("observer_off", 2, 1010, {}), arm("no_observer", null, 1000, {}),
      arm("observer_provider_unavailable", null, 1000, { observer: { ...idle, httpCalls: 6 }, jevQueue: { queued: 0, maxQueuedAgeMs: 0, markers: 6, quotaAttempts: 6, completed: 6, outcomeUnknown: 0, collectionRuns: 1 } })] });
};
const tap = (pass = 7, fail = 0, skipped = 0) => `TAP version 13\n1..${pass + fail + skipped}\n# tests ${pass + fail + skipped}\n# suites 0\n# pass ${pass}\n# fail ${fail}\n# cancelled 0\n# skipped ${skipped}\n# todo 0\n`;
const ARTIFACTS: Record<ToolId, { file: string; body: () => string }> = {
  jev_tests: { file: "jev_tests.json", body: () => vitestJson(JEV_TEST_FILES) },
  regressions: { file: "regressions.json", body: () => vitestJson(REGRESSION_FILES) },
  convergence_tests: { file: "convergence_tests.log", body: () => tap() },
  convergence_gate: { file: "convergence_gate.log", body: () => "CONVERGENCE-GATE: all gates passed.\n" },
  boundary: { file: "boundary.log", body: () => boundary() },
  fixture: { file: "fixture.json", body: () => JSON.stringify(runSyntheticCorpus(SYNTHETIC_CASES)) },
  load: { file: "load.json", body: () => load() },
};
const TOOL_IDS = Object.keys(G0_COMMANDS) as ToolId[];

/** Writes every artifact (with overrides), returns receipts. `receiptOver` mutates a receipt after hashing. */
function tools(dir: string, artifacts: Artifacts = {}, receiptOver: Partial<Record<ToolId, Record<string, unknown>>> = {}, only: ToolId[] = TOOL_IDS) {
  return only.map((id) => {
    const body = artifacts[id] ?? ARTIFACTS[id].body();
    writeFileSync(join(dir, ARTIFACTS[id].file), body, { mode: 0o600 });
    return { id, codeSha: HEAD, command: [...G0_COMMANDS[id]], exitCode: 0, artifact: ARTIFACTS[id].file, sha256: bytesDigest(body), ...receiptOver[id] };
  });
}
function pkg(dir: string, over: Record<string, unknown> = {}, toolSet = tools(dir)) {
  const path = join(dir, "package.json");
  writeFileSync(path, JSON.stringify({ version: 1, codeSha: HEAD, versions: EVALUATION_VERSIONS, tools: toolSet, incidents: [], ...over }), { mode: 0o600 });
  return path;
}
const INCIDENT = (kind: string) => ({ kind, reference: "https://example.com/incidents/1", observedAt: at(0).toISOString() });

// ---------- synthetic #471 evaluation root (perfect agreement) ----------
const CLEAR: SemanticDecisions = { briefing_claims: "supported", headline_claims: "supported", body_claims: "supported", cta_claims: "supported", intent_alignment: "aligned", prohibited_claims: "compliant" };
const ALERT: SemanticDecisions = { ...CLEAR, body_claims: "unsupported" };
async function evaluationRoot(humans: Array<"alert" | "clear">, referenceKind = "synthetic_fixture") {
  const root = tmp();
  const ids = { workspaceId: randomUUID(), brandId: randomUUID(), policyId: randomUUID() };
  const entries = humans.map((_, i) => ({ reviewId: randomUUID(), familyId: `fam-${i}`, split: (i % 3 === 0 ? "calibration" : "holdout") as "calibration" | "holdout", primary: true }));
  const records = humans.map((human, i) => {
    const workItemId = randomUUID();
    const work = { ...workRow({ userId: "u", workspaceId: ids.workspaceId, brandIds: [ids.brandId] }, { updatedAt: at(-DAY), headline: `Marker ${i}` }), id: workItemId, createdAt: at(-DAY) };
    const projected = projectSemanticReviewOffline(work);
    if (!projected.ok) throw new Error("fixture_not_projectable");
    const decisions = human === "alert" ? ALERT : CLEAR;
    const observation = { ...EVALUATION_VERSIONS, id: entries[i].reviewId, clientProfileId: ids.brandId, workItemId, policyId: ids.policyId, semanticHash: projected.hash,
      state: "completed" as const, decisions, confidence: { briefing_claims: 0.9 }, probabilities: { briefing_claims: { supported: 0.9, unsupported: 0.1 } },
      usage: { input_tokens: 100, output_tokens: 6 }, returnedModel: EVALUATION_VERSIONS.model, currentAtCompletion: true, errorCode: null,
      createdAt: at(-HOUR), sendStartedAt: at(-HOUR + 30_000), finishedAt: at(-HOUR + 31_000), httpElapsedMs: 800 };
    return { reviewId: entries[i].reviewId, observation, policy: { dataOrigin: "synthetic" as const }, projected, unavailableReason: null };
  });
  const plan = { version: 1 as const, workspaceId: ids.workspaceId, selectedAt: at(-2 * DAY).toISOString(), selectedBy: "synthetic-selector", selectedBeforeResults: true as const, entries };
  const authorization = { reference: "https://example.com/approvals/blind-export", authorizedBy: "synthetic-owner", approvedAt: at(-HOUR).toISOString(), expiresAt: at(7 * DAY).toISOString(),
    purpose: "blind_semantic_review_export", workspaceId: ids.workspaceId, clientProfileIds: [ids.brandId], reviewIds: entries.map((e) => e.reviewId), planHash: semanticDigest(plan) };
  const repository = { reconstruct: vi.fn(async () => ({ records, collectionRuns: [] as never[], collectionHistoryComplete: false, processingObservations: [] as never[] })) } as never;
  const dir = join(root, "export-001");
  await exportSemanticReviewCases({ repository, authorization, plan, outputDir: dir, evaluationRoot: root, clock: () => BASE });
  const blind = JSON.parse(readFileSync(join(dir, "blind.json"), "utf8"));
  const map = JSON.parse(readFileSync(join(dir, "private-map.json"), "utf8"));
  const reviewFor = (reviewerId: string) => ({ version: 1, kind: "review", exportId: blind.exportId, planHash: blind.planHash, blindHash: map.blindHash, reviewerId, createdAt: at(HOUR).toISOString(), referenceKind,
    cases: entries.map((entry, i) => { const row = map.rows.find((r: { reviewId: string }) => r.reviewId === entry.reviewId); const c = blind.cases.find((b: { caseId: string }) => b.caseId === row.caseId);
      return { caseId: c.caseId, familyId: c.familyId, caseHash: c.caseHash, versions: LABEL_VERSIONS, labels: humans[i] === "alert" ? ALERT : CLEAR, ambiguous: false }; }) });
  for (const who of ["ana", "bia"]) importSemanticReviewJudgment({ directory: dir, judgment: judgmentSchema.parse(reviewFor(who)), now: at(3 * HOUR) });
  writeSemanticEvaluationReport({ directory: dir, now: at(DAY) });
  return { root, dir };
}

const hasMissing = (out: Out | null, gate: "g0" | "g1" | "g2", needle: string) => out?.gates[gate].missing.some((m) => m.includes(needle));
function expectNeverEnables(out: Out | null) {
  expect(out).not.toBeNull();
  expect(out!.enablesProductBehavior).toBe(false);
  expect(out!.version).toBe(1);
  expect(out!.codeSha).toBe(HEAD);
}
/** The decision refuses a tracked-dirty execution tree (guard kept strict). Until committed, a complete package may only be missing that. */
const TREE_DIRTY = execFileSync("git", ["diff", "HEAD", "--", "src", "scripts", "drizzle", "package.json", "package-lock.json", "../.github/workflows/ci.yml"], { cwd: APP, encoding: "utf8" }).length > 0;
const NODE22 = process.version.startsWith("v22.");
function expectG0Complete(out: Out | null) {
  const allowed = [...(TREE_DIRTY ? ["uncommitted_execution_code"] : []), ...(NODE22 ? [] : ["node_22_required"])];
  expect(out!.gates.g0.missing.filter((m) => !allowed.includes(m))).toEqual([]);
  expect(out!.gates.g0.status).toBe(allowed.length ? "hold" : "pass");
}

describe("argument and evidence handling", () => {
  it("fails with non-zero exit on missing arguments, unknown gate, or unreadable evidence", () => {
    const dir = tmp();
    expect(cli([]).status).not.toBe(0);
    expect(cli(["--gate", "g0"]).status).not.toBe(0);
    expect(cli(["--evidence", join(dir, "package.json")]).status).not.toBe(0);
    expect(cli(["--evidence", join(dir, "package.json"), "--gate", "g9"]).status).not.toBe(0);
    for (const gate of ["g0", "g1", "g2"] as const) {
      const r = decide(join(dir, "missing.json"), gate);
      expect(r.status, gate).not.toBe(0);
      if (r.out) { expect(r.out.decision).not.toBe("eligible_for_human_review"); expect(r.out.enablesProductBehavior).toBe(false); }
    }
  });

  it("refuses group-readable evidence packages", () => {
    const dir = tmp();
    const path = pkg(dir);
    chmodSync(path, 0o644);
    const r = decide(path, "g0");
    expect(r.status).not.toBe(0);
    expect(r.out?.gates?.g0?.status ?? "hold").not.toBe("pass");
  });

  it("treats an invalid schema as hold/invalid_evidence with exit 1 and JSON on stdout, even with --validate-only", () => {
    const dir = tmp();
    for (const [name, over] of Object.entries({
      selfDeclaredG0: { g0Passed: true }, selfDeclaredDecision: { decision: "eligible_for_human_review" }, selfDeclaredEnable: { enablesProductBehavior: true },
      badSha: { codeSha: "nothex" }, badVersions: { versions: { ...EVALUATION_VERSIONS, model: "other" } }, noTools: { tools: undefined },
    } as Record<string, Record<string, unknown>>)) {
      for (const extra of [[], ["--validate-only"]]) {
        const r = decide(pkg(dir, over), "g0", extra);
        expect(r.status, `${name} ${extra}`).toBe(1);
        expect(r.out, name).not.toBeNull();
        expect(r.out!.decision).toBe("hold");
        expect(r.out!.enablesProductBehavior).toBe(false);
        expect(hasMissing(r.out, "g0", "invalid_evidence_format"), name).toBe(true);
      }
    }
  });

  it("prints a single JSON document on stdout and nothing secret on stderr", () => {
    const dir = tmp();
    const r = decide(pkg(dir), "g0");
    expect(() => JSON.parse(r.stdout)).not.toThrow();
    expect(r.stderr).not.toContain(dir);
  });
});

describe("--validate-only", () => {
  it("valid schema with insufficient evidence exits 0, says validationOnly and never releases a gate", () => {
    const dir = tmp();
    const r = decide(pkg(dir, {}, []), "g2", ["--validate-only"]);
    expect(r.status).toBe(0);
    expectNeverEnables(r.out);
    expect(r.out!.validationOnly).toBe(true);
    expect(r.out!.decision).toBe("hold");
    for (const gate of ["g0", "g1", "g2"] as const) expect(r.out!.gates[gate].status).not.toBe("pass");
  });

  it("a complete controlled G0 package still reports hold and no pass under --validate-only", () => {
    const dir = tmp();
    const r = decide(pkg(dir), "g0", ["--validate-only"]);
    expect(r.status).toBe(0);
    expect(r.out!.validationOnly).toBe(true);
    expect(r.out!.decision).toBe("hold");
    expect(r.out!.gates.g0.status).not.toBe("pass");
    expect(r.out!.enablesProductBehavior).toBe(false);
  });

  it("a package with a recognised incident is not hidden by --validate-only", () => {
    const dir = tmp();
    const r = decide(pkg(dir, { incidents: [INCIDENT("workspace_leak")] }), "g0", ["--validate-only"]);
    expect(r.status).toBe(1);
    expect(r.out!.decision).toBe("reject");
    expect(r.out!.enablesProductBehavior).toBe(false);
  });
});

describe("G0 (controlled tooling evidence)", () => {
  it("passes g0 with exit 0 (once the tree is committed, on Node 22) for a complete controlled package while the overall decision stays hold", () => {
    const dir = tmp();
    const r = decide(pkg(dir), "g0");
    expectNeverEnables(r.out);
    expectG0Complete(r.out);
    expect(r.out!.decision).toBe("hold");
    expect(r.out!.validationOnly).toBe(false);
    expect(r.status).toBe(TREE_DIRTY || !NODE22 ? 1 : 0);
    // G0 never claims model quality
    expect(r.out!.gates.g1.status).not.toBe("pass");
    expect(r.out!.gates.g2.status).not.toBe("pass");
  });

  it("holds g0 with exit 1 when no tool receipts exist, listing each tool as missing", () => {
    const dir = tmp();
    const r = decide(pkg(dir, {}, []), "g0");
    expect(r.status).toBe(1);
    expectNeverEnables(r.out);
    expect(r.out!.gates.g0.status).toBe("hold");
    expect(r.out!.gates.g0.missing.length).toBeGreaterThan(0);
    expect(r.out!.decision).toBe("hold");
  });

  it.each(TOOL_IDS)("holds g0 when the %s receipt is absent", (id) => {
    const dir = tmp();
    const r = decide(pkg(dir, {}, tools(dir, {}, {}, TOOL_IDS.filter((t) => t !== id))), "g0");
    expect(r.status).toBe(1);
    expect(r.out!.gates.g0.status).toBe("hold");
    expect(r.out!.gates.g0.missing.join(" ")).toContain(id);
  });

  const tampers: Array<[string, ToolId, (dir: string) => ReturnType<typeof tools>]> = [
    ["artifact bytes changed after hashing", "jev_tests", (dir) => { const t = tools(dir); writeFileSync(join(dir, "jev_tests.json"), vitestJson(JEV_TEST_FILES) + " "); return t; }],
    ["receipt sha256 forged", "jev_tests", (dir) => tools(dir, {}, { jev_tests: { sha256: "0".repeat(64) } })],
    ["receipt codeSha differs from HEAD", "regressions", (dir) => tools(dir, {}, { regressions: { codeSha: OTHER_SHA } })],
    ["receipt command differs from the fixed one", "fixture", (dir) => tools(dir, {}, { fixture: { command: ["echo", "ok"] } })],
    ["tool exit code is non-zero", "convergence_gate", (dir) => tools(dir, {}, { convergence_gate: { exitCode: 1 } })],
    ["vitest reports a skipped test", "jev_tests", (dir) => tools(dir, { jev_tests: vitestJson(JEV_TEST_FILES, { skipped: true }) })],
    ["vitest reports a failed test", "regressions", (dir) => tools(dir, { regressions: vitestJson(REGRESSION_FILES, { failed: true }) })],
    ["vitest counts are incoherent with the assertions", "jev_tests", (dir) => tools(dir, { jev_tests: vitestJson(JEV_TEST_FILES, { incoherent: true }) })],
    ["a required Jev test file is missing from the run", "jev_tests", (dir) => tools(dir, { jev_tests: vitestJson(JEV_TEST_FILES, { drop: "scripts/jev-evaluate.test.ts" }) })],
    ["a required regression file is missing from the run", "regressions", (dir) => tools(dir, { regressions: vitestJson(REGRESSION_FILES, { drop: "src/server/creative-work/fact-pack.test.ts" }) })],
    ["a negative count is reported", "jev_tests", (dir) => tools(dir, { jev_tests: vitestJson(JEV_TEST_FILES).replace(/"numFailedTests":0/, '"numFailedTests":-1') })],
    ["convergence TAP reports skips", "convergence_tests", (dir) => tools(dir, { convergence_tests: tap(6, 0, 1) })],
    ["convergence TAP reports failures", "convergence_tests", (dir) => tools(dir, { convergence_tests: tap(6, 1, 0) })],
    ["convergence gate text is not the success line", "convergence_gate", (dir) => tools(dir, { convergence_gate: "convergence gate: ok\n" })],
    ["boundary reports violations", "boundary", (dir) => tools(dir, { boundary: boundary({ violations: 1 }) })],
    ["boundary protects nothing", "boundary", (dir) => tools(dir, { boundary: boundary({ protectedFiles: 0 }) })],
    ["boundary output is not the JEV-DEPENDENCIES line", "boundary", (dir) => tools(dir, { boundary: "all good\n" })],
    ["fixture JSON differs from the recomputed synthetic corpus", "fixture", (dir) => tools(dir, { fixture: "{}" })],
    ["load verdict is inconsistent with its measurements", "load", (dir) => tools(dir, { load: load({ verdict: "fail" }) })],
    ["load arms have unequal seeded datasets", "load", (dir) => tools(dir, { load: JSON.stringify((() => { const l = JSON.parse(load()); l.arms[1].observer.seededWorks = 99; return l; })()) })],
    ["load percentiles are out of order (p50 > p95)", "load", (dir) => tools(dir, { load: JSON.stringify((() => { const l = JSON.parse(load()); l.arms[0].p50Ms = 5000; return l; })()) })],
    ["load is not the #472 shape", "load", (dir) => tools(dir, { load: "{}" })],
  ];
  it.each(tampers)("is formatValid=false, exit 1 and names the tool when %s", (name, id, make) => {
    const dir = tmp();
    const r = decide(pkg(dir, {}, make(dir)), "g0");
    expect(r.status, name).toBe(1);
    expectNeverEnables(r.out);
    expect(r.out!.formatValid).toBe(false);
    expect(r.out!.gates.g0.status).not.toBe("pass");
    expect(r.out!.gates.g0.missing.join(" ")).toContain(id);
    expect(decide(pkg(dir, {}, make(dir)), "g0", ["--validate-only"]).status).toBe(1);
  });

  it("holds g0 when the package SHA is not the current HEAD", () => {
    const dir = tmp();
    const r = decide(pkg(dir, { codeSha: OTHER_SHA }), "g0");
    expect(r.status).toBe(1);
    expect(r.out!.gates.g0.missing).toContain("execution_sha_mismatch");
  });

  it("accepts an inconclusive (small sample) load for G0 as a limitation, but G1 still requires a conclusive one", () => {
    const dir = tmp();
    const r = decide(pkg(dir, {}, tools(dir, { load: load({ samplePerArm: 30 }) })), "g1");
    expect(r.out!.gates.g0.missing.join(" ")).not.toContain("load");
    expect(r.out!.gates.g0.limitations.join(" ")).toMatch(/inconclusive|inconclusiv/i);
    expect(r.out!.gates.g1.status).toBe("hold");
    expect(r.out!.gates.g1.missing).toContain("conclusive_comparable_load_required");
    expect(r.status).toBe(1);
  });

  it("holds duplicated tool receipts", () => {
    const dir = tmp();
    const t = tools(dir);
    const r = decide(pkg(dir, {}, [...t, t[0]]), "g0");
    expect(r.status).toBe(1);
    expect(r.out!.gates.g0.missing).toContain("duplicate_tool_receipts");
  });

  it("refuses receipt artifacts that escape the package directory", () => {
    const dir = tmp();
    const t = tools(dir);
    for (const artifact of ["../outside.log", "/etc/passwd", "sub/dir.log"]) {
      const r = decide(pkg(dir, {}, t.map((x) => (x.id === "boundary" ? { ...x, artifact } : x))), "g0");
      expect(r.status, artifact).toBe(1);
      expect(r.out?.gates.g0.status ?? "hold").not.toBe("pass");
    }
  });
});

describe("incidents", () => {
  it.each(["workspace_leak", "duplicate_send", "business_mutation", "raw_diagnostic"])("rejects on %s even when G0 evidence is missing", (kind) => {
    const dir = tmp();
    const r = decide(pkg(dir, { incidents: [INCIDENT(kind)] }, []), "g0");
    expect(r.status).toBe(1);
    expectNeverEnables(r.out);
    expect(r.out!.decision).toBe("reject");
    expect(JSON.stringify(r.out!.gates)).toContain("reject");
  });

  it("rejects over a perfect G0 package for any gate", () => {
    const dir = tmp();
    const path = pkg(dir, { incidents: [INCIDENT("duplicate_send")] });
    for (const gate of ["g0", "g1", "g2"] as const) {
      const r = decide(path, gate);
      expect(r.status).toBe(1);
      expect(r.out!.decision).toBe("reject");
      expect(r.out!.enablesProductBehavior).toBe(false);
    }
  });

  it("keeps reject for a known incident kind even when its reference is malformed, but an unknown kind is just invalid (hold)", () => {
    const dir = tmp();
    for (const incident of [{ ...INCIDENT("workspace_leak"), reference: "http://example.com/x" }, { ...INCIDENT("workspace_leak"), reference: "https://u:p@example.com/x" }]) {
      const r = decide(pkg(dir, { incidents: [incident] }), "g0");
      expect(r.status).toBe(1);
      expect(r.out!.decision).toBe("reject");
      expect(r.out!.formatValid).toBe(false);
    }
    const unknown = decide(pkg(dir, { incidents: [INCIDENT("made_up")] }), "g0");
    expect(unknown.status).toBe(1);
    expect(unknown.out!.decision).toBe("hold");
  });
});

describe("real gates without real evidence", () => {
  it("g1 and g2 exit 1 with hold and explicit missing evidence on a perfect G0 package", () => {
    const dir = tmp();
    const path = pkg(dir);
    for (const gate of ["g1", "g2"] as const) {
      const r = decide(path, gate);
      expect(r.status, gate).toBe(1);
      expectNeverEnables(r.out);
      expect(r.out!.decision).toBe("hold");
      expect(r.out!.gates[gate].status).toBe("hold");
      expect(r.out!.gates[gate].missing.length).toBeGreaterThan(0);
    }
  });

  it("g1 and g2 stay hold when G0 itself is not satisfied", () => {
    const dir = tmp();
    const path = pkg(dir, {}, []);
    for (const gate of ["g1", "g2"] as const) {
      const r = decide(path, gate);
      expect(r.status).toBe(1);
      expect(r.out!.gates[gate].status).toBe("hold");
      expect(r.out!.gates.g0.status).toBe("hold");
    }
  });

  it("rejects an operational/freeze path that does not exist or whose schema carries self-declared flags", () => {
    const dir = tmp();
    writeFileSync(join(dir, "operational.json"), JSON.stringify({ version: 1, g1Passed: true }), { mode: 0o600 });
    for (const over of [{ operational: join(dir, "nope.json") }, { operational: join(dir, "operational.json") }, { freeze: join(dir, "nope.json") }]) {
      const r = decide(pkg(dir, over), "g1");
      expect(r.status).toBe(1);
      expect(r.out!.gates.g1.status).not.toBe("pass");
      expect(r.out!.enablesProductBehavior).toBe(false);
    }
  });
});

describe("synthetic evaluation root (instrumentation only, never a real release)", () => {
  // 10 families: 3 alerts, 7 clear, human == candidate everywhere.
  const HUMANS = [..."aaacccccc"].concat("c").map((c) => (c === "a" ? "alert" : "clear")) as Array<"alert" | "clear">;

  it("a perfect synthetic fixture recomputes from the root and keeps hold, with insufficient sample and synthetic limitations", async () => {
    const dir = tmp();
    const { root } = await evaluationRoot(HUMANS);
    const path = pkg(dir, { evaluationRoot: root });
    const r = decide(path, "g2");
    expect(r.status).toBe(1);
    expectNeverEnables(r.out);
    expect(r.out!.decision).toBe("hold");
    expect(r.out!.gates.g2.status).toBe("hold");
    expect(r.out!.gates.g2.missing.length).toBeGreaterThan(0);
    expect(r.stdout).not.toMatch(/Marker \d|headline/i);
  });

  it("validate-only on the synthetic root is exit 0, hold, validationOnly", async () => {
    const dir = tmp();
    const { root } = await evaluationRoot(HUMANS);
    const r = decide(pkg(dir, { evaluationRoot: root }), "g2", ["--validate-only"]);
    expect(r.status).toBe(0);
    expect(r.out!.decision).toBe("hold");
    expect(r.out!.validationOnly).toBe(true);
    expect(r.out!.enablesProductBehavior).toBe(false);
  });

  it("synthetic evidence never releases a real gate even with a perfect G0 package", async () => {
    const dir = tmp();
    const { root } = await evaluationRoot(HUMANS);
    const path = pkg(dir, { evaluationRoot: root });
    expectG0Complete(decide(path, "g0").out);
    for (const gate of ["g1", "g2"] as const) {
      const r = decide(path, gate);
      expect(r.status).toBe(1);
      expect(r.out!.gates[gate].status).toBe("hold");
      expect(r.out!.decision).not.toBe("eligible_for_human_review");
    }
  });

  it("holds when the evaluation root is tampered with after the report (judgment history changed)", async () => {
    const dir = tmp();
    const { root, dir: run } = await evaluationRoot(HUMANS);
    const { readdirSync } = await import("node:fs");
    const judgment = readdirSync(run).find((n) => n.startsWith("judgment-"))!;
    writeFileSync(join(run, judgment), readFileSync(join(run, judgment), "utf8").replace("ana", "zed").replace("bia", "zed"), { mode: 0o600 });
    const r = decide(pkg(dir, { evaluationRoot: root }), "g2");
    expect(r.status).toBe(1);
    expect(r.out!.decision).not.toBe("eligible_for_human_review");
    expect(r.out!.gates.g2.status).not.toBe("pass");
  });

  it("holds when the evaluation root is missing, not private, or not a directory", async () => {
    const dir = tmp();
    const file = join(dir, "file");
    writeFileSync(file, "x", { mode: 0o600 });
    const open = tmp();
    chmodSync(open, 0o755);
    for (const evaluationRoot of [join(dir, "absent"), file, open]) {
      const r = decide(pkg(dir, { evaluationRoot }), "g2");
      expect(r.status, evaluationRoot).toBe(1);
      expect(r.out?.gates.g2.status ?? "hold").not.toBe("pass");
    }
  });

  it("does not turn six questions into six families: a small fixture never meets the 300-family target", async () => {
    const dir = tmp();
    const { root } = await evaluationRoot(["alert", "clear"]);
    const r = decide(pkg(dir, { evaluationRoot: root }), "g2");
    expect(r.out!.gates.g2.status).toBe("hold");
    expect(r.out!.decision).toBe("hold");
  });
});

describe("output invariants", () => {
  it("never emits eligible_for_human_review or enablesProductBehavior=true across a matrix of packages", () => {
    const dir = tmp();
    const variants = [pkg(dir), pkg(dir, {}, []), pkg(dir, { incidents: [INCIDENT("raw_diagnostic")] }), pkg(dir, { g2Passed: true })];
    for (const path of variants) for (const gate of ["g0", "g2"] as const) for (const extra of [[], ["--validate-only"]]) {
      const r = decide(path, gate, extra);
      if (!r.out) continue;
      expect(r.out.enablesProductBehavior).toBe(false);
      expect(r.out.decision).not.toBe("eligible_for_human_review");
    }
  });

  it("does not create or modify files next to the package (read-only CLI)", () => {
    const dir = tmp();
    const path = pkg(dir);
    const snapshot = () => readdirSync(dir).sort().map((n) => `${n}:${statSync(join(dir, n)).mtimeMs}:${bytesDigest(readFileSync(join(dir, n)))}`);
    const before = snapshot();
    decide(path, "g1");
    expect(snapshot()).toEqual(before);
  });
});


// ---------------------------------------------------------------------------------------------------------------------
// SYNTHETIC / TEST-ONLY human-like corpus. All labels, approvals, owners and receipts below are artificial instrumentation
// data (references use example.invalid). Nothing here is, or claims to be, real evidence.
// ---------------------------------------------------------------------------------------------------------------------
const NOW_MS = Date.now();
const rel = (ms: number) => new Date(NOW_MS + ms);
const ABSTAIN: SemanticDecisions = { ...CLEAR, cta_claims: "insufficient_context" };
type Fam = { human: "alert" | "clear" | "ambiguous" | "unavailable"; cand: SemanticDecisions; baselineAlert: boolean };
const TP: Fam = { human: "alert", cand: ALERT, baselineAlert: false };   // alert missed by baseline, caught by candidate
const TPB: Fam = { human: "alert", cand: ALERT, baselineAlert: true };   // alert already caught by baseline
const FN: Fam = { human: "alert", cand: CLEAR, baselineAlert: false };   // baseline miss, candidate miss
const FP: Fam = { human: "clear", cand: ALERT, baselineAlert: false };
const TN: Fam = { human: "clear", cand: CLEAR, baselineAlert: false };
const AMB: Fam = { human: "ambiguous", cand: CLEAR, baselineAlert: false };
const UNAV: Fam = { human: "unavailable", cand: CLEAR, baselineAlert: false };   // observation could not be reconstructed
const times = (n: number, fam: Fam) => Array.from({ length: n }, () => fam);
/** `shiftDays` moves this export's whole timeline earlier (e.g. calibration done before the freeze). `variantOfFirst` adds a non-primary variant reusing the first family's Trabalho (=> duplicate send identity). */
type ExportSpec = { split: "calibration" | "holdout"; fams: Fam[]; policy: "calibrationPolicy" | "holdoutPolicy"; shiftDays?: number; variantOfFirst?: boolean };
type Opts = { divergentLastSnapshot?: boolean; approvalExpiresAtMs?: number; unreadableApprovals?: boolean };

/** Builds the full private root + operational/freeze/approvals for the given exports. Environment is staged as "staging" via NODE_ENV during export. */
async function humanLikeCorpus(specs: ExportSpec[], opts: Opts = {}) {
  const root = tmp();
  const pkgDir = tmp();
  const workspaceId = randomUUID();
  const brands = [randomUUID(), randomUUID(), randomUUID()];
  const policyIds = { calibrationPolicy: randomUUID(), holdoutPolicy: randomUUID() };
  const maxShift = Math.max(0, ...specs.map((s) => s.shiftDays ?? 0));
  const approvedAtMs = -(4.5 + maxShift) * DAY;
  type Item = { fam: Fam; familyId: string; primary: boolean; reuse?: { workItemId: string; projected: unknown } };
  type Built = { entries: Array<{ reviewId: ReturnType<typeof randomUUID>; familyId: string; split: "calibration" | "holdout"; primary: boolean }>; items: Item[]; records: unknown[]; obs: unknown[]; policyId: ReturnType<typeof randomUUID>; shift: number };
  const built: Built[] = specs.map((spec, e) => {
    const policyId = policyIds[spec.policy];
    const shift = (spec.shiftDays ?? 0) * DAY;
    const items: Item[] = spec.fams.map((fam, i) => ({ fam, familyId: `synthetic-family-${e}-${i}`, primary: true }));
    const entries = items.map((it) => ({ reviewId: randomUUID(), familyId: it.familyId, split: spec.split, primary: it.primary }));
    const obs: unknown[] = [];
    const records: Array<{ projected: unknown; observation: { workItemId: string } | null }> = [];
    items.forEach((it, i) => {
      if (it.fam.human === "unavailable") { records.push({ reviewId: entries[i].reviewId, observation: null, policy: null, projected: null, unavailableReason: "observation_unavailable" } as never); return; }
      const workItemId = randomUUID();
      const work = { ...workRow({ userId: "u", workspaceId, brandIds: [brands[e % brands.length]] }, { updatedAt: rel(-5 * DAY - shift), headline: `Artificial headline ${e}-${i}` }), id: workItemId, createdAt: rel(-5 * DAY - shift) };
      const projected = projectSemanticReviewOffline(work);
      if (!projected.ok) throw new Error("fixture_not_projectable");
      records.push(makeRecord(it, i, workItemId, projected));
      if (i === 0) (items[0] as Item).reuse = { workItemId, projected };
    });
    function makeRecord(it: Item, i: number, workItemId: string, projected: Extract<ReturnType<typeof projectSemanticReviewOffline>, { ok: true }>, offsetMs = 0) {
      const createdAt = rel(-3.5 * DAY - shift + i * 1000 + offsetMs), sendStartedAt = new Date(createdAt.getTime() + 30_000), finishedAt = new Date(createdAt.getTime() + 31_000);
      const observation = { ...EVALUATION_VERSIONS, id: entries[i].reviewId, clientProfileId: brands[e % brands.length], workItemId, policyId, semanticHash: projected.hash,
        state: "completed" as const, decisions: it.fam.cand, confidence: { briefing_claims: 0.9 }, probabilities: { briefing_claims: { supported: 0.9, unsupported: 0.1 } },
        usage: { input_tokens: 100, output_tokens: 6 }, returnedModel: EVALUATION_VERSIONS.model, currentAtCompletion: true, errorCode: null,
        createdAt, sendStartedAt, finishedAt, httpElapsedMs: 800 };
      obs.push({ policyId, dataOrigin: "authorized", versions: { profile: EVALUATION_VERSIONS.profile, model: EVALUATION_VERSIONS.model, inputVersion: EVALUATION_VERSIONS.inputVersion, rubricVersion: EVALUATION_VERSIONS.rubricVersion, rubricHash: EVALUATION_VERSIONS.rubricHash },
        state: "completed", createdAt: createdAt.toISOString(), sendStartedAt: sendStartedAt.toISOString(), httpElapsedMs: 800, usage: { input_tokens: 100, output_tokens: 6 }, errorCode: null });
      const baseline = { briefingFindings: it.fam.baselineAlert ? 1 : 0, copyViolations: 0 };
      return { reviewId: entries[i].reviewId, observation, policy: { dataOrigin: "authorized" as const }, projected: { ...projected, baseline }, unavailableReason: null };
    }
    if (spec.variantOfFirst) {
      const first = items[0].reuse!;
      const variant: Item = { fam: items[0].fam, familyId: items[0].familyId, primary: false };
      items.push(variant);
      entries.push({ reviewId: randomUUID(), familyId: variant.familyId, split: spec.split, primary: false });
      records.push(makeRecord(variant, items.length - 1, first.workItemId, first.projected as never, 500));
    }
    return { entries, items, records, obs, policyId, shift };
  });
  // Surviving observations / ledger are whole-policy: exports sharing a policy carry the identical snapshot.
  const policyObs = (policyId: string) => built.filter((b) => b.policyId === policyId).flatMap((b) => b.obs);
  const runFor = (policyId: string, recordedAtMs: number) => ({ id: randomUUID(), policyId, workspaceId, windowLower: "2026-01-01T00:00:00.000Z", windowUpper: "2026-01-02T00:00:00.000Z",
    recordedAt: rel(recordedAtMs).toISOString(), status: "collected" as const, consulted: policyObs(policyId).length, eligible: policyObs(policyId).length, errorCode: null,
    unique: policyObs(policyId).length, duplicates: 0, outOfScope: 0, invalid: 0, notSampled: 0, exclusions: {}, windowComplete: true, initialPage: true });
  const sharedRuns = new Map(Object.values(policyIds).map((id) => [id, runFor(id, -3 * DAY - maxShift * DAY)]));

  const approvalPaths: string[] = [];
  const manifestHashes: string[] = [];
  const planHashes: string[] = [];
  const dirs: string[] = [];
  const clearIds: string[] = [];
  vi.stubEnv("NODE_ENV", "staging");
  try {
    for (const [e, b] of built.entries()) {
      const plan = { version: 1 as const, workspaceId, selectedAt: rel(-5 * DAY - b.shift).toISOString(), selectedBy: "synthetic-selector", selectedBeforeResults: true as const, entries: b.entries };
      const authorization = { reference: `https://approvals.example.invalid/export-${e}`, authorizedBy: "synthetic-owner", approvedAt: rel(approvedAtMs).toISOString(), expiresAt: rel(approvedAtMs + 13 * DAY).toISOString(),
        purpose: "blind_semantic_review_export", workspaceId, clientProfileIds: [brands[e % brands.length]], reviewIds: b.entries.map((x) => x.reviewId), planHash: semanticDigest(plan) };
      const approval = validateSemanticExportApproval(authorization, workspaceId, semanticDigest(plan), b.entries.map((x) => x.reviewId), rel(-2 * DAY - b.shift));
      const approvalPath = join(pkgDir, `export-approval-${e}.json`);
      writeFileSync(approvalPath, opts.unreadableApprovals ? "{not json" : JSON.stringify(approval), { mode: 0o600 });
      approvalPaths.push(approvalPath);
      const run = opts.divergentLastSnapshot && e === built.length - 1 && built.filter((x) => x.policyId === b.policyId).length > 1
        ? { ...sharedRuns.get(b.policyId)!, recordedAt: rel(-3 * DAY + 1000).toISOString() } : sharedRuns.get(b.policyId)!;
      const repository = { reconstruct: vi.fn(async () => ({ records: b.records, collectionRuns: [run], collectionHistoryComplete: true, processingObservations: policyObs(b.policyId) })) } as never;
      const dir = join(root, `export-00${e}`);
      await exportSemanticReviewCases({ repository, authorization: approval, plan, outputDir: dir, evaluationRoot: root, clock: () => rel(-2 * DAY - b.shift) });
      dirs.push(dir);
      const blind = JSON.parse(readFileSync(join(dir, "blind.json"), "utf8"));
      const map = JSON.parse(readFileSync(join(dir, "private-map.json"), "utf8"));
      const review = (reviewerId: string) => ({ version: 1, kind: "review", exportId: blind.exportId, planHash: blind.planHash, blindHash: map.blindHash, reviewerId, createdAt: rel(-1 * DAY - b.shift).toISOString(),
        referenceKind: "independent_human", cases: b.entries.flatMap((entry, i) => {
          const fam = b.items[i].fam;
          if (fam.human === "unavailable") return [];
          const row = map.rows.find((r: { reviewId: string }) => r.reviewId === entry.reviewId); const c = blind.cases.find((x: { caseId: string }) => x.caseId === row.caseId);
          return [{ caseId: c.caseId, familyId: c.familyId, caseHash: c.caseHash, versions: LABEL_VERSIONS, labels: fam.human === "alert" ? ALERT : fam.human === "clear" ? CLEAR : ABSTAIN, ambiguous: fam.human === "ambiguous" }];
        }) });
      for (const who of ["reviewer-one", "reviewer-two"]) importSemanticReviewJudgment({ directory: dir, judgment: judgmentSchema.parse(review(who)), now: rel(-23 * 3_600_000 - b.shift) });
      const { report } = writeSemanticEvaluationReport({ directory: dir, now: rel(-12 * 3_600_000 - b.shift) });
      manifestHashes.push(report.manifestHash);
      planHashes.push(report.planHash);
      b.items.forEach((it) => { if (it.primary && (it.fam.human === "alert" || it.fam.human === "clear")) clearIds.push(`${workspaceId}:${it.familyId}`); });
    }
  } finally { vi.unstubAllEnvs(); }

  const att = (recordedAt: Date) => ({ reference: "https://records.example.invalid/attestation", recordedBy: "synthetic-operator", recordedAt: recordedAt.toISOString(), codeSha: HEAD, versions: EVALUATION_VERSIONS, environment: "staging" as const });
  const approvalKinds = ["data", "provider", "spend", "retention", "security", "limits", "tone"] as const;
  const limited = ["data", "provider", "spend"];
  const operational = { version: 1, codeSha: HEAD, versions: EVALUATION_VERSIONS, environment: "staging", language: "pt-BR",
    owners: { product: "synthetic-product", operations: "synthetic-operations", security: "synthetic-security", reference: "https://owners.example.invalid/record" },
    approvals: approvalKinds.map((kind) => ({ kind, reference: `https://approvals.example.invalid/${kind}`, approvedBy: "synthetic-owner", approvedAt: rel(approvedAtMs).toISOString(),
      ...(limited.includes(kind) ? { expiresAt: rel(opts.approvalExpiresAtMs ?? approvedAtMs + 13 * DAY).toISOString() } : {}), versions: EVALUATION_VERSIONS,
      workspaceIds: [workspaceId], clientProfileIds: brands, provider: "typesafe", purpose: "prepared_work_semantic_review" })),
    smoke: { ...att(rel(-3.7 * DAY)), authorizationReference: "https://approvals.example.invalid/spend", startedAt: rel(-3.8 * DAY).toISOString(), finishedAt: rel(-3.79 * DAY).toISOString(),
      workspaceId, clientProfileId: brands[0], observationId: randomUUID(), requestedModel: EVALUATION_VERSIONS.model, returnedModel: EVALUATION_VERSIONS.model, sendsStarted: 1, validResponses: 1 },
    runtime: { ...att(rel(-3.6 * DAY)), deploymentSha: HEAD, jobId: "semantic-review-observer", cron: "*/5 * * * *", retries: 0, concurrency: 1 },
    loadEnvironment: { ...att(rel(-3.5 * DAY)), toolArtifactHash: bytesDigest(load()), comparableEnvironment: "synthetic-comparable-staging" },
    audit: { ...att(rel(-1 * DAY)), evaluationRoot: root, manifestHashes, incidents: [], normalFamilies: clearIds.slice(0, Math.ceil(clearIds.length * 2 / 3)), difficultFamilies: clearIds.slice(Math.ceil(clearIds.length * 2 / 3)) } };
  const freeze = { version: 1, reference: "https://freeze.example.invalid/record", frozenBy: "synthetic-product-owner", frozenAt: rel(-6 * DAY).toISOString(), holdoutOpenedAt: rel(-4 * DAY).toISOString(),
    codeSha: HEAD, versions: EVALUATION_VERSIONS, evaluationRoot: root, planHashes, criteriaHash: semanticDigest({ criteria: G2_CRITERIA, codeSha: HEAD, versions: EVALUATION_VERSIONS }),
    historyReference: "https://history.example.invalid/record", previousHoldout: null };
  const operationalPath = join(pkgDir, "operational.json"), freezePath = join(pkgDir, "freeze.json");
  writeFileSync(operationalPath, JSON.stringify(operational), { mode: 0o600 });
  writeFileSync(freezePath, JSON.stringify(freeze), { mode: 0o600 });
  const packagePath = pkg(pkgDir, { evaluationRoot: root, exportApprovals: approvalPaths, operational: operationalPath, freeze: freezePath });
  return { root, pkgDir, dirs, packagePath, operationalPath, freezePath, operational, freeze, approvalPaths, clearIds };
}
const calibrationSpec = (): ExportSpec => ({ split: "calibration", policy: "calibrationPolicy", fams: times(100, TN) });
const holdoutSpecs = (fams: Fam[]): ExportSpec[] => [{ split: "holdout", policy: "holdoutPolicy", fams: fams.slice(0, 100) }, { split: "holdout", policy: "holdoutPolicy", fams: fams.slice(100) }];
const HAPPY_HOLDOUT = [...times(40, TP), ...times(1, FP), ...times(159, TN)];
const IGNORED_MISSING = ["uncommitted_execution_code", "node_22_required", "g0_required", "g1_required"];
const real = (m: string[]) => m.filter((x) => !IGNORED_MISSING.includes(x));
type Metric = { numerator: number; denominator: number; value: number | null; wilson95: { lower: number; upper: number } | null };
const metricsOf = (out: Out | null) => (out as unknown as { evaluation: { metrics: Record<"precision" | "falseAlert" | "incrementalDetection" | "abstention" | "validResponseRate" | "reconstructionRate", Metric>; families: number; calibration: number; holdout: number; clearLabels: number } }).evaluation;

describe("SYNTHETIC test-only human-like corpus (instrumentation, not real evidence)", () => {
  it("happy path: 3 exports x 100 families clear every G0/G1/G2 criterion; eligible only for human review (once the tree is committed) and never enables product behavior", async () => {
    const c = await humanLikeCorpus([calibrationSpec(), ...holdoutSpecs(HAPPY_HOLDOUT)]);
    const r = decide(c.packagePath, "g2");
    expectNeverEnables(r.out);
    const ev = metricsOf(r.out);
    expect(ev).toMatchObject({ families: 300, calibration: 100, holdout: 200, clearLabels: 300 });
    expect(ev.metrics.falseAlert).toMatchObject({ numerator: 1, denominator: 160 });
    expect(ev.metrics.precision).toMatchObject({ numerator: 40, denominator: 41 });
    expect(ev.metrics.incrementalDetection).toMatchObject({ numerator: 40, denominator: 40 });
    expect(ev.metrics.abstention).toMatchObject({ numerator: 0, denominator: 200 });
    expect(ev.metrics.reconstructionRate).toMatchObject({ numerator: 300, denominator: 300 });
    // Shared holdout policy snapshot is repeated by two exports but counted once: 100 (calibration) + 200 (holdout) sends, not 400.
    expect(ev.metrics.validResponseRate).toMatchObject({ numerator: 300, denominator: 300 });
    for (const g of ["g0", "g1", "g2"] as const) expect(real(r.out!.gates[g].missing), g).toEqual([]);
    expect(r.out!.gates.g2.limitations).toBeDefined();
    if (!TREE_DIRTY && NODE22) {
      expect(r.out!.decision).toBe("eligible_for_human_review");
      expect(r.out!.gates.g2.status).toBe("pass");
      expect(r.status).toBe(0);
    } else {
      expect(r.out!.decision).toBe("hold");
      expect(r.status).toBe(1);
    }
    expect(r.out!.enablesProductBehavior).toBe(false);
    const validateOnly = decide(c.packagePath, "g2", ["--validate-only"]);
    expect(validateOnly.status).toBe(0);
    expect(validateOnly.out!.decision).toBe("hold");
    expect(validateOnly.out!.validationOnly).toBe(true);
    expect(r.stdout).not.toMatch(/Artificial headline/);
  });

  it("holds when the false-alert denominator is below 100 human-clean, non-abstained families despite 300 families", async () => {
    const c = await humanLikeCorpus([calibrationSpec(), ...holdoutSpecs([...times(40, TP), ...times(1, FP), ...times(59, TN), ...times(100, AMB)])]);
    const r = decide(c.packagePath, "g2");
    const m = metricsOf(r.out);
    expect(m.families).toBe(300);
    expect(m.metrics.falseAlert.denominator).toBe(60);
    expect(r.out!.gates.g2.missing).toContain("false_alert_denominator_100_required");
    expect(r.out!.gates.g2.status).not.toBe("pass");
    expect(r.out!.decision).toBe("hold");
    expect(r.status).toBe(1);
  });

  it("holds when the precision denominator (alerted, evaluable) is below 30", async () => {
    const c = await humanLikeCorpus([calibrationSpec(), ...holdoutSpecs([...times(25, TP), ...times(10, FN), ...times(150, TN), ...times(15, AMB)])]);
    const r = decide(c.packagePath, "g2");
    expect(metricsOf(r.out).metrics.precision.denominator).toBe(25);
    expect(metricsOf(r.out).metrics.incrementalDetection.denominator).toBe(35);
    expect(r.out!.gates.g2.missing).toContain("precision_denominator_30_required");
    expect(r.out!.gates.g2.missing).not.toContain("incremental_denominator_30_required");
    expect(r.out!.decision).toBe("hold");
    expect(r.status).toBe(1);
  });

  it("holds when fewer than 30 problems are missed by the baseline (incremental denominator)", async () => {
    const c = await humanLikeCorpus([calibrationSpec(), ...holdoutSpecs([...times(20, TP), ...times(20, TPB), ...times(1, FP), ...times(159, TN)])]);
    const r = decide(c.packagePath, "g2");
    expect(metricsOf(r.out).metrics.incrementalDetection).toMatchObject({ numerator: 20, denominator: 20 });
    expect(metricsOf(r.out).metrics.precision.denominator).toBe(41);
    expect(r.out!.gates.g2.missing).toContain("incremental_denominator_30_required");
    expect(r.out!.gates.g2.missing).not.toContain("precision_denominator_30_required");
    expect(r.status).toBe(1);
  });

  it("holds on the Wilson lower bound even though the point precision is 90% (27 TP / 3 FP)", async () => {
    const c = await humanLikeCorpus([calibrationSpec(), ...holdoutSpecs([...times(27, TP), ...times(3, FP), ...times(5, FN), ...times(140, TN), ...times(25, AMB)])]);
    const r = decide(c.packagePath, "g2");
    const precision = metricsOf(r.out).metrics.precision;
    expect(precision).toMatchObject({ numerator: 27, denominator: 30 });
    expect(precision.value).toBeGreaterThanOrEqual(G2_CRITERIA.precision);
    expect(precision.wilson95!.lower).toBeLessThan(G2_CRITERIA.precisionWilsonLower);
    expect(r.out!.gates.g2.missing).toContain("precision_point_or_wilson_limit");
    expect(r.out!.gates.g2.missing).not.toContain("precision_denominator_30_required");
    expect(r.out!.decision).toBe("hold");
    expect(r.status).toBe(1);
  });

  it("holds the false-alert criterion on its Wilson upper bound (point <=5% but upper >10%)", async () => {
    // 5 FP / 100 clear = 5.0% point; Wilson upper is above 10%.
    const c = await humanLikeCorpus([calibrationSpec(), ...holdoutSpecs([...times(40, TP), ...times(5, FP), ...times(95, TN), ...times(60, AMB)])]);
    const r = decide(c.packagePath, "g2");
    const fa = metricsOf(r.out).metrics.falseAlert;
    expect(fa).toMatchObject({ numerator: 5, denominator: 100 });
    expect(fa.wilson95!.upper).toBeGreaterThan(G2_CRITERIA.falseAlertWilsonUpper);
    expect(r.out!.gates.g2.missing).toContain("false_alert_point_or_wilson_limit");
    expect(r.status).toBe(1);
  });

  it("holds with fewer than 300 families (200 here) even if the metrics themselves look fine", async () => {
    const c = await humanLikeCorpus([calibrationSpec(), { split: "holdout", policy: "holdoutPolicy", fams: [...times(40, TP), ...times(1, FP), ...times(59, TN)] }]);
    const r = decide(c.packagePath, "g2");
    expect(metricsOf(r.out)).toMatchObject({ families: 200, calibration: 100, holdout: 100 });
    expect(r.out!.gates.g2.missing).toContain("300_families_100_calibration_200_holdout_required");
    expect(r.out!.decision).toBe("hold");
    expect(r.status).toBe(1);
  });

  it("computes metrics and missing items even when G0 is dirty or G1 evidence is absent (no operational/freeze)", async () => {
    const c = await humanLikeCorpus([calibrationSpec(), ...holdoutSpecs(HAPPY_HOLDOUT)]);
    const bare = pkg(c.pkgDir, { evaluationRoot: c.root, exportApprovals: c.approvalPaths });
    const r = decide(bare, "g2");
    expect(metricsOf(r.out).metrics.precision).toMatchObject({ numerator: 40, denominator: 41 });
    expect(r.out!.gates.g1.missing).toContain("designated_product_operations_security_owners_required");
    expect(r.out!.gates.g2.missing).toContain("frozen_criteria_and_new_holdout_record_required");
    expect(r.out!.decision).toBe("hold");
    expect(r.status).toBe(1);
  });

  it("does not inflate valid-response rates by repeating an identical policy snapshot, but holds when the snapshots of one policy diverge", async () => {
    const same = await humanLikeCorpus([calibrationSpec(), ...holdoutSpecs(HAPPY_HOLDOUT)]);
    expect(metricsOf(decide(same.packagePath, "g2").out).metrics.validResponseRate.denominator).toBe(300);
    const diverge = await humanLikeCorpus([calibrationSpec(), ...holdoutSpecs(HAPPY_HOLDOUT)], { divergentLastSnapshot: true });
    const r = decide(diverge.packagePath, "g2");
    expect(r.out!.gates.g1.missing.join(" ") + r.out!.gates.g2.missing.join(" ")).toContain("inconsistent_policy_snapshots");
    expect(r.out!.decision).toBe("hold");
    expect(r.status).toBe(1);
  });

  it("holds when a stored report digest or judgment history is tampered with", async () => {
    const c = await humanLikeCorpus([calibrationSpec(), ...holdoutSpecs(HAPPY_HOLDOUT)]);
    const report = readdirSync(c.dirs[1]).find((n) => n.startsWith("report-"))!;
    const stored = JSON.parse(readFileSync(join(c.dirs[1], report), "utf8"));
    writeFileSync(join(c.dirs[1], report), JSON.stringify({ ...stored, selected: stored.selected + 1 }), { mode: 0o600 });
    const r = decide(c.packagePath, "g2");
    expect(r.out!.gates.g2.status).not.toBe("pass");
    expect(r.out!.gates.g2.missing).toContain("invalid_or_inconsistent_evaluation_evidence");
    expect(r.out!.decision).toBe("hold");
    expect(r.status).toBe(1);
  });

  it("holds when an export approval file is missing or when the operational audit does not match the root", async () => {
    const c = await humanLikeCorpus([calibrationSpec(), ...holdoutSpecs(HAPPY_HOLDOUT)]);
    const missingApproval = pkg(c.pkgDir, { evaluationRoot: c.root, exportApprovals: c.approvalPaths.slice(1), operational: c.operationalPath, freeze: c.freezePath });
    expect(decide(missingApproval, "g2").out!.gates.g2.missing).toContain("export_authorization_required");
    writeFileSync(c.operationalPath, JSON.stringify({ ...c.operational, audit: { ...c.operational.audit, manifestHashes: [bytesDigest("x")] } }), { mode: 0o600 });
    const r = decide(c.packagePath, "g1");
    expect(r.out!.gates.g1.missing).toContain("runtime_corpus_provenance_required");
    expect(r.status).toBe(1);
  });

  it("holds when freeze happens after the holdout was opened or the criteria hash differs", async () => {
    const c = await humanLikeCorpus([calibrationSpec(), ...holdoutSpecs(HAPPY_HOLDOUT)]);
    writeFileSync(c.freezePath, JSON.stringify({ ...c.freeze, frozenAt: rel(-3 * DAY).toISOString() }), { mode: 0o600 });
    expect(decide(c.packagePath, "g2").out!.gates.g2.missing).toContain("criteria_must_precede_holdout");
    writeFileSync(c.freezePath, JSON.stringify({ ...c.freeze, criteriaHash: bytesDigest("other") }), { mode: 0o600 });
    expect(decide(c.packagePath, "g2").out!.gates.g2.missing).toContain("frozen_criteria_or_plan_mismatch");
  });

  it("holds when the smoke used a different model/count or an approval does not cover the corpus window", async () => {
    const c = await humanLikeCorpus([calibrationSpec(), ...holdoutSpecs(HAPPY_HOLDOUT)]);
    writeFileSync(c.operationalPath, JSON.stringify({ ...c.operational, smoke: { ...c.operational.smoke, sendsStarted: 2 } }), { mode: 0o600 });
    expect(decide(c.packagePath, "g1").out!.gates.g1.missing).toContain("valid_real_smoke_required");
    const shortApprovals = c.operational.approvals.map((a: { kind: string }) => (a.kind === "spend" ? { ...a, approvedAt: rel(-1 * DAY).toISOString() } : a));
    writeFileSync(c.operationalPath, JSON.stringify({ ...c.operational, approvals: shortApprovals }), { mode: 0o600 });
    const r = decide(c.packagePath, "g1");
    expect(r.out!.gates.g1.missing).toContain("spend_approval_required");
    expect(r.out!.decision).toBe("hold");
  });

  it("rejects any recognised incident over an otherwise complete synthetic corpus", async () => {
    const c = await humanLikeCorpus([calibrationSpec(), ...holdoutSpecs(HAPPY_HOLDOUT)]);
    const r = decide(pkg(c.pkgDir, { evaluationRoot: c.root, exportApprovals: c.approvalPaths, operational: c.operationalPath, freeze: c.freezePath, incidents: [INCIDENT("business_mutation")] }), "g2");
    expect(r.out!.decision).toBe("reject");
    expect(r.out!.enablesProductBehavior).toBe(false);
    expect(r.status).toBe(1);
  });
});

describe("SYNTHETIC test-only corpus: decision-review regressions (instrumentation, not real evidence)", () => {
  const base = () => [calibrationSpec(), ...holdoutSpecs(HAPPY_HOLDOUT)];
  type Approval = { kind: string; approvedAt: string; expiresAt?: string; versions: Record<string, unknown> } & Record<string, unknown>;
  type Op = { approvals: Approval[]; audit: Record<string, unknown> } & Record<string, unknown>;
  type Freeze = { frozenAt: string; evaluationRoot: string } & Record<string, unknown>;
  const rewrite = <T extends Record<string, unknown>>(path: string, fn: (value: T) => unknown) => writeFileSync(path, JSON.stringify(fn(JSON.parse(readFileSync(path, "utf8")) as T)), { mode: 0o600 });

  it("a retrospective decision after the data/provider/spend authorizations expired still passes, since coverage is temporal (retention/security/limits/tone carry no expiry)", async () => {
    const c = await humanLikeCorpus(base(), { approvalExpiresAtMs: -0.5 * DAY });
    const r = decide(c.packagePath, "g2");
    for (const g of ["g0", "g1", "g2"] as const) expect(real(r.out!.gates[g].missing), g).toEqual([]);
    expect(r.out!.enablesProductBehavior).toBe(false);
    expect(c.operational.approvals.find((a: { kind: string }) => a.kind === "retention")).not.toHaveProperty("expiresAt");
  });

  it("holds when a data/provider/spend authorization has no expiry, expired before a send, or lasts more than 14 days", async () => {
    for (const mutate of [
      (a: Approval) => { delete a.expiresAt; return a; },
      (a: Approval) => ({ ...a, expiresAt: rel(-3.6 * DAY).toISOString() }),           // before the sends (-3.5d)
      (a: Approval) => ({ ...a, expiresAt: new Date(Date.parse(a.approvedAt) + 15 * DAY).toISOString() }),
    ]) {
      const c = await humanLikeCorpus(base());
      rewrite(c.operationalPath, (op: Op) => ({ ...op, approvals: op.approvals.map((a: Approval) => (a.kind === "provider" ? mutate(a) : a)) }));
      const r = decide(c.packagePath, "g1");
      expect(r.out!.gates.g1.missing).toContain("provider_approval_required");
      expect(r.status).toBe(1);
    }
  });

  it("holds when any approval was reviewed for different versions, or after the evidence it covers", async () => {
    const c = await humanLikeCorpus(base());
    rewrite(c.operationalPath, (op: Op) => ({ ...op, approvals: op.approvals.map((a: Approval) => (a.kind === "security" ? { ...a, versions: { ...a.versions, rubricHash: "0".repeat(64) } } : a)) }));
    const r = decide(c.packagePath, "g1");
    expect(r.out!.gates.g1.status).toBe("hold");
    expect(r.status).toBe(1);
    writeFileSync(c.operationalPath, JSON.stringify(c.operational), { mode: 0o600 });
    rewrite(c.operationalPath, (op: Op) => ({ ...op, approvals: op.approvals.map((a: Approval) => (a.kind === "limits" ? { ...a, approvedAt: rel(-1 * DAY).toISOString() } : a)) }));
    expect(decide(c.packagePath, "g1").out!.gates.g1.missing).toContain("limits_approval_required");
  });

  it("holds on tampered audit classification: duplicate ids, ids outside the root, ambiguous (not clear) families, or an overlap between normal and difficult", async () => {
    const withAmbiguous = await humanLikeCorpus([calibrationSpec(), ...holdoutSpecs([...times(40, TP), ...times(1, FP), ...times(139, TN), ...times(20, AMB)])]);
    const ambiguousId = `${JSON.parse(readFileSync(withAmbiguous.operationalPath, "utf8")).smoke.workspaceId}:synthetic-family-2-199`;
    const c = withAmbiguous;
    const clear = c.clearIds;
    for (const [name, audit] of Object.entries({
      duplicateAcrossLists: { normalFamilies: clear.slice(0, 10), difficultFamilies: clear.slice(5, 15) },
      duplicateInsideList: { normalFamilies: [clear[0], clear[0]], difficultFamilies: [clear[1]] },
      outsideRoot: { normalFamilies: [`${randomUUID()}:nope`], difficultFamilies: [clear[1]] },
      ambiguousFamily: { normalFamilies: [ambiguousId], difficultFamilies: [clear[1]] },
      legacyCounts: { normalFamilies: 200, difficultFamilies: 100 },
    } as Record<string, Record<string, unknown>>)) {
      rewrite(c.operationalPath, (op: Op) => ({ ...op, audit: { ...op.audit, ...audit } }));
      const r = decide(c.packagePath, "g1");
      expect(r.out!.gates.g1.status, name).not.toBe("pass");
      expect(r.status, name).toBe(1);
      if (name !== "legacyCounts") expect(r.out!.gates.g1.missing, name).toContain("normal_and_difficult_pt_br_families_required");
    }
  });

  it("freeze: requires the metric code SHA, the history reference and previousHoldout; criteria hash binds criteria+code+versions", async () => {
    const c = await humanLikeCorpus(base());
    for (const [name, mutate, expected] of [
      ["criteriaHash of the old shape", (f: Freeze) => ({ ...f, criteriaHash: semanticDigest(G2_CRITERIA) }), "frozen_criteria_or_plan_mismatch"],
      ["codeSha that is not reachable from HEAD", (f: Freeze) => ({ ...f, codeSha: "1".repeat(40), criteriaHash: semanticDigest({ criteria: G2_CRITERIA, codeSha: "1".repeat(40), versions: EVALUATION_VERSIONS }) }), "frozen_metric_code_changed_or_unreachable"],
      ["frozenAt equal to holdoutOpenedAt", (f: Freeze) => ({ ...f, holdoutOpenedAt: f.frozenAt }), "criteria_must_precede_holdout"],
      ["holdout judgments created before the holdout was opened", (f: Freeze) => ({ ...f, holdoutOpenedAt: rel(-0.5 * DAY).toISOString() }), "criteria_must_precede_holdout"],
      ["a previous holdout under other versions that shares the root", (f: Freeze) => ({ ...f, previousHoldout: { evaluationRoot: f.evaluationRoot, versionsHash: bytesDigest("older"), criteriaHash: f.criteriaHash, familyIds: ["ws:other-family"] } }), "new_holdout_required_after_versions_or_criteria_change"],
    ] as const) {
      writeFileSync(c.freezePath, JSON.stringify(mutate(JSON.parse(JSON.stringify(c.freeze)))), { mode: 0o600 });
      const r = decide(c.packagePath, "g2");
      expect(r.out!.gates.g2.missing, name).toContain(expected);
      expect(r.status, name).toBe(1);
    }
    for (const omit of ["historyReference", "previousHoldout", "codeSha"]) {
      writeFileSync(c.freezePath, JSON.stringify(Object.fromEntries(Object.entries(c.freeze).filter(([k]) => k !== omit))), { mode: 0o600 });
      const r = decide(c.packagePath, "g2");
      expect(r.out!.gates.g2.missing, omit).toContain("invalid_freeze_evidence");
    }
  });

  it("calibration performed before the freeze is allowed; holdout plans, sends and judgments must follow it", async () => {
    const c = await humanLikeCorpus([{ ...calibrationSpec(), shiftDays: 6 }, ...holdoutSpecs(HAPPY_HOLDOUT)]);
    const r = decide(c.packagePath, "g2");
    for (const g of ["g0", "g1", "g2"] as const) expect(real(r.out!.gates[g].missing), g).toEqual([]);
    expect(r.out!.gates.g2.missing).not.toContain("criteria_must_precede_holdout");
    // moving the freeze after the holdout plans (selectedAt -5d) is not allowed
    rewrite(c.freezePath, (f: Freeze) => ({ ...f, frozenAt: rel(-4.5 * DAY).toISOString() }));
    expect(decide(c.packagePath, "g2").out!.gates.g2.missing).toContain("criteria_must_precede_holdout");
  });

  it("tolerates up to 10% unavailable (null-origin) primaries when the other denominators are sufficient, and holds beyond that", async () => {
    const some = await humanLikeCorpus([calibrationSpec(), ...holdoutSpecs([...times(40, TP), ...times(1, FP), ...times(139, TN), ...times(20, UNAV)])]);
    const ok = decide(some.packagePath, "g2");
    expect(metricsOf(ok.out).metrics.reconstructionRate).toMatchObject({ numerator: 280, denominator: 300 });
    for (const g of ["g0", "g1", "g2"] as const) expect(real(ok.out!.gates[g].missing), g).toEqual([]);
    const many = await humanLikeCorpus([calibrationSpec(), ...holdoutSpecs([...times(40, TP), ...times(1, FP), ...times(119, TN), ...times(40, UNAV)])]);
    const bad = decide(many.packagePath, "g2");
    expect(metricsOf(bad.out).metrics.reconstructionRate).toMatchObject({ numerator: 260, denominator: 300 });
    expect(bad.out!.gates.g2.missing).toContain("reconstruction_below_90_percent_or_unknown");
    expect(bad.out!.decision).toBe("hold");
    expect(bad.status).toBe(1);
  });

  it("rejects over a duplicated send identity before it can be hidden by unreadable approvals", async () => {
    const c = await humanLikeCorpus([{ ...calibrationSpec(), fams: times(99, TN), variantOfFirst: true }, ...holdoutSpecs(HAPPY_HOLDOUT)], { unreadableApprovals: true });
    const r = decide(c.packagePath, "g2");
    expect(r.out!.decision).toBe("reject");
    expect(r.out!.incidents).toContain("duplicate_send");
    expect(r.out!.enablesProductBehavior).toBe(false);
    expect(r.status).toBe(1);
  });

  it("unreadable approvals alone (no incident) hold instead of passing", async () => {
    const c = await humanLikeCorpus(base(), { unreadableApprovals: true });
    const r = decide(c.packagePath, "g2");
    expect(r.out!.decision).toBe("hold");
    expect(r.out!.gates.g2.status).not.toBe("pass");
    expect(r.status).toBe(1);
  });

  it("incident priority is per element: a malformed neighbour never hides a known incident", async () => {
    const dir = tmp();
    for (const incidents of [[INCIDENT("workspace_leak"), { kind: "other" }], [INCIDENT("workspace_leak"), null], [null, { kind: "other" }, INCIDENT("raw_diagnostic")]]) {
      const r = decide(pkg(dir, { incidents }), "g0");
      expect(r.out!.decision, JSON.stringify(incidents)).toBe("reject");
      expect(r.status).toBe(1);
    }
    const onlyMalformed = decide(pkg(dir, { incidents: [{ kind: "other" }, null] }), "g0");
    expect(onlyMalformed.out!.decision).toBe("hold");
  });

  it("an invalid package still reads operational.audit.incidents as an isolated field", async () => {
    const c = await humanLikeCorpus(base());
    rewrite(c.operationalPath, (op: Op) => ({ ...op, audit: { ...op.audit, incidents: [INCIDENT("business_mutation"), { kind: "other" }] } }));
    const invalid = pkg(c.pkgDir, { g2Passed: true, evaluationRoot: c.root, exportApprovals: c.approvalPaths, operational: c.operationalPath, freeze: c.freezePath });
    const r = decide(invalid, "g2");
    expect(r.out!.decision).toBe("reject");
    expect(r.out!.enablesProductBehavior).toBe(false);
    expect(r.status).toBe(1);
  });

  it("--validate-only: malformed or unreadable operational/freeze/root make the format invalid (exit 1) even without a corpus; omitted optional files stay valid", () => {
    const dir = tmp();
    const bad = join(dir, "bad.json");
    writeFileSync(bad, "{not json", { mode: 0o600 });
    for (const over of [{ operational: bad }, { freeze: bad }, { operational: join(dir, "absent.json") }, { freeze: join(dir, "absent.json") }, { evaluationRoot: join(dir, "absent-root") }]) {
      const r = decide(pkg(dir, over), "g1", ["--validate-only"]);
      expect(r.status, JSON.stringify(over)).toBe(1);
      expect(r.out!.formatValid).toBe(false);
      expect(r.out!.validationOnly).toBe(true);
      expect(r.out!.decision).toBe("hold");
    }
    const omitted = decide(pkg(dir), "g1", ["--validate-only"]);
    expect(omitted.status).toBe(0);
    expect(omitted.out!.formatValid).toBe(true);
  });

  it("N1: explicit expiresAt on retention/security/limits/tone is honoured without a 14-day cap (expired before a send => hold; 50 days covering the sends => accepted)", async () => {
    const c = await humanLikeCorpus(base());
    for (const kind of ["retention", "security", "limits", "tone"]) {
      writeFileSync(c.operationalPath, JSON.stringify(c.operational), { mode: 0o600 });
      rewrite(c.operationalPath, (op: Op) => ({ ...op, approvals: op.approvals.map((a: Approval) => (a.kind === kind ? { ...a, expiresAt: rel(-3.6 * DAY).toISOString() } : a)) }));
      expect(decide(c.packagePath, "g1").out!.gates.g1.missing, kind).toContain(`${kind}_approval_required`);
      rewrite(c.operationalPath, (op: Op) => ({ ...op, approvals: op.approvals.map((a: Approval) => (a.kind === kind ? { ...a, expiresAt: new Date(Date.parse(a.approvedAt) + 50 * DAY).toISOString() } : a)) }));
      const ok = decide(c.packagePath, "g1");
      expect(ok.out!.gates.g1.missing, kind).not.toContain(`${kind}_approval_required`);
      expect(real(ok.out!.gates.g1.missing), kind).toEqual([]);
    }
  });

  describe("N3: previousHoldout (history of earlier holdouts)", () => {
    const holdoutIds = (c: { clearIds: string[] }) => c.clearIds.filter((id) => id.includes("-family-1-")).slice(0, 5);
    const continuationOf = (out: Out | null) => (out as unknown as { evaluation: { continuation: { previousEvaluationRoot: string; sharedFamilies: number; independentEvaluation: boolean } | null } }).evaluation.continuation;
    const withPrevious = (c: Awaited<ReturnType<typeof humanLikeCorpus>>, previous: Record<string, unknown> | null) => writeFileSync(c.freezePath, JSON.stringify({ ...c.freeze, previousHoldout: previous }), { mode: 0o600 });
    const previous = (c: Awaited<ReturnType<typeof humanLikeCorpus>>, over: Record<string, unknown> = {}) => ({ evaluationRoot: join(c.pkgDir, "earlier-root"), versionsHash: semanticDigest(EVALUATION_VERSIONS), criteriaHash: c.freeze.criteriaHash, familyIds: holdoutIds(c), ...over });

    it("holds when the versions differ and holdout families overlap (a new holdout is required)", async () => {
      const c = await humanLikeCorpus(base());
      withPrevious(c, previous(c, { versionsHash: bytesDigest("older-versions") }));
      const r = decide(c.packagePath, "g2");
      expect(r.out!.gates.g2.missing).toContain("new_holdout_required_after_versions_or_criteria_change");
      expect(r.out!.gates.g2.status).not.toBe("pass");
      expect(r.status).toBe(1);
    });

    it("holds when the versions are the same but the frozen criteria hash differs", async () => {
      const c = await humanLikeCorpus(base());
      withPrevious(c, previous(c, { criteriaHash: bytesDigest("older-criteria") }));
      const r = decide(c.packagePath, "g2");
      expect(r.out!.gates.g2.missing).toContain("new_holdout_required_after_versions_or_criteria_change");
      expect(r.status).toBe(1);
    });

    it("holds when the evaluation root is reused after a version/criteria change, even without overlapping families", async () => {
      const c = await humanLikeCorpus(base());
      withPrevious(c, previous(c, { versionsHash: bytesDigest("older-versions"), evaluationRoot: c.root, familyIds: ["ws:unrelated-family"] }));
      expect(decide(c.packagePath, "g2").out!.gates.g2.missing).toContain("new_holdout_required_after_versions_or_criteria_change");
    });

    it("accepts the same versions and criteria as a continuation (never an independent evaluation) and reports shared families", async () => {
      const c = await humanLikeCorpus(base());
      withPrevious(c, previous(c));
      const r = decide(c.packagePath, "g2");
      for (const g of ["g0", "g1", "g2"] as const) expect(real(r.out!.gates[g].missing), g).toEqual([]);
      expect(continuationOf(r.out)).toMatchObject({ previousEvaluationRoot: join(c.pkgDir, "earlier-root"), sharedFamilies: 5, independentEvaluation: false });
      expect(r.out!.enablesProductBehavior).toBe(false);
      if (!TREE_DIRTY && NODE22) { expect(r.out!.gates.g2.status).toBe("pass"); expect(r.out!.decision).toBe("eligible_for_human_review"); expect(r.status).toBe(0); }
      else expect(r.out!.decision).toBe("hold");
    });

    it("reports no continuation without a previous holdout or without overlapping families, and rejects an empty family list", async () => {
      const c = await humanLikeCorpus(base());
      expect(continuationOf(decide(c.packagePath, "g2").out)).toBeNull();
      withPrevious(c, previous(c, { familyIds: ["ws:unrelated-family"] }));
      expect(continuationOf(decide(c.packagePath, "g2").out)).toBeNull();
      withPrevious(c, previous(c, { familyIds: [] }));
      expect(decide(c.packagePath, "g2").out!.gates.g2.missing).toContain("invalid_freeze_evidence");
    });
  });
});

describe("evidence capture boundary (OS pipes and file descriptors)", () => {
  const program = `require("node:fs").writeFileSync("/proc/self/fd/3", JSON.stringify({ numTotalTests: 1, success: true }));
process.stdout.write("EXPLAIN direct stdout line\\n");
process.stderr.write("diagnostic on stderr\\n");`;

  it("keeps the machine report on the private descriptor separate from direct stdout/stderr, with a 0600 artifact", () => {
    const dir = tmp();
    const reportPath = join(dir, "jev_tests.json");
    const { result, report } = captureEvidenceProcess(process.execPath, ["-e", program], { PATH: process.env.PATH ?? "", NODE_ENV: "test" }, reportPath);
    expect(result.status).toBe(0);
    expect(JSON.parse(report!)).toEqual({ numTotalTests: 1, success: true });
    expect(readFileSync(reportPath, "utf8")).toBe(report);
    expect(statSync(reportPath).mode & 0o777).toBe(0o600);
    expect(result.stdout).toBe("EXPLAIN direct stdout line\n");
    expect(result.stdout).not.toContain("numTotalTests");
    expect(result.stderr).toBe("diagnostic on stderr\n");
  });

  it("returns no report and writes no file when no report path is given, and refuses to overwrite an existing artifact", () => {
    const dir = tmp();
    const none = captureEvidenceProcess(process.execPath, ["-e", "process.stdout.write('ok')"], { PATH: process.env.PATH ?? "", NODE_ENV: "test" });
    expect(none.report).toBeNull();
    expect(none.result.stdout).toBe("ok");
    const reportPath = join(dir, "existing.json");
    writeFileSync(reportPath, "keep", { mode: 0o600 });
    expect(() => captureEvidenceProcess(process.execPath, ["-e", program], { PATH: process.env.PATH ?? "", NODE_ENV: "test" }, reportPath)).toThrow();
    expect(readFileSync(reportPath, "utf8")).toBe("keep");
  });

  it("a process that exits 0 but wrote nothing (or a truncated report) to the descriptor yields an empty artifact that the decision rejects", () => {
    const dir = tmp();
    for (const [name, body] of [["empty", ""], ["truncated", vitestJson(JEV_TEST_FILES).slice(0, 200)]] as const) {
      const reportPath = join(dir, `${name}.json`);
      const script = body ? `require("node:fs").writeFileSync("/proc/self/fd/3", ${JSON.stringify(body)})` : "process.stdout.write('EXPLAIN only')";
      const { result, report } = captureEvidenceProcess(process.execPath, ["-e", script], { PATH: process.env.PATH ?? "", NODE_ENV: "test" }, reportPath);
      expect(result.status, name).toBe(0);
      expect(report, name).toBe(body);
      const pkgDir = tmp();
      const r = decide(pkg(pkgDir, {}, tools(pkgDir, { jev_tests: report! })), "g0");
      expect(r.status, name).toBe(1);
      expect(r.out!.formatValid, name).toBe(false);
      expect(r.out!.gates.g0.status, name).not.toBe("pass");
      expect(r.out!.gates.g0.missing.join(" "), name).toContain("jev_tests");
    }
  });

  it("the fixed G0 vitest commands write their JSON report to the private descriptor", () => {
    for (const id of ["jev_tests", "regressions"] as const) expect(G0_COMMANDS[id]).toContain("--outputFile=/proc/self/fd/3");
  });

  it("a real Vitest process (temporary suite, no database) writes pure JSON to the private descriptor while stdout stays separate", () => {
    const dir = tmp();
    const suite = join(dir, "capture.test.js");
    writeFileSync(suite, `test("captures", () => { process.stdout.write("EXPLAIN direct stdout\\n"); console.log("EXPLAIN console"); expect(1 + 1).toBe(2); });\n`, { mode: 0o600 });
    const config = join(dir, "vitest.config.mjs");
    writeFileSync(config, `export default { test: { globals: true, root: ${JSON.stringify(dir)}, include: [${JSON.stringify(suite)}], reporters: ["json"], watch: false } };\n`, { mode: 0o600 });
    const reportPath = join(dir, "report.json");
    const { result, report } = captureEvidenceProcess(process.execPath, [join(APP, "node_modules/vitest/vitest.mjs"), "run", "--config", config, "--reporter=json", "--outputFile=/proc/self/fd/3"],
      { PATH: process.env.PATH ?? "", NODE_ENV: "test", FORCE_COLOR: "0" }, reportPath);
    expect(result.status, result.stderr).toBe(0);
    const parsed = JSON.parse(report!);
    expect(parsed).toMatchObject({ success: true, numTotalTests: 1, numPassedTests: 1, numFailedTests: 0, numPendingTests: 0 });
    expect(statSync(reportPath).mode & 0o777).toBe(0o600);
    expect(() => JSON.parse(result.stdout)).toThrow();   // stdout is not the machine report
    expect(result.stdout).not.toContain("numTotalTests");
    expect(report).not.toContain("EXPLAIN");
  });

  it("a report that was only written to stdout (descriptor left empty) is not accepted as evidence even with a matching hash", () => {
    const dir = tmp();
    const stdoutOnly = vitestJson(JEV_TEST_FILES);
    const { result, report } = captureEvidenceProcess(process.execPath, ["-e", `process.stdout.write(${JSON.stringify(stdoutOnly)})`], { PATH: process.env.PATH ?? "", NODE_ENV: "test" }, join(dir, "jev_tests.json"));
    expect(result.status).toBe(0);
    expect(report).toBe("");
    expect(result.stdout).toBe(stdoutOnly);
    const pkgDir = tmp();
    const r = decide(pkg(pkgDir, {}, tools(pkgDir, { jev_tests: report! })), "g0");
    expect(r.status).toBe(1);
    expect(r.out!.formatValid).toBe(false);
    expect(r.out!.gates.g0.missing.join(" ")).toContain("jev_tests");
  });
});
