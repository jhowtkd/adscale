/** #473: read-only decision. collect-g0 explicitly runs only controlled test tooling. */
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { EVALUATION_VERSIONS, semanticDigest } from "../src/server/creative-work/semantic-review-evaluation";
import { readSemanticPrivateJson, readSemanticPrivateText } from "./jev-evaluate";
import { runSyntheticCorpus, SYNTHETIC_CASES } from "./run-jev-offline";
import { requireJevTestDatabaseUrl } from "./jev-collect";
import { bytesDigest, countSchema, decisionPackageSchema, freezeSchema, G0_COMMANDS, JEV_TEST_FILES, knownIncidentKinds, operationalSchema, REGRESSION_FILES, type receiptSchema } from "./jev-decision-evidence";
import { checkFreeze, checkOperationalEvidence, evaluateCorpus, safeEvidenceCode } from "./jev-decision-evaluation";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const git = (...args: string[]) => execFileSync("git", args, { cwd: appRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
export const currentCodeSha = () => git("rev-parse", "HEAD");
type Gate = { status: "pass" | "hold" | "reject"; missing: string[]; limitations: string[] };
const gate = (): Gate => ({ status: "hold", missing: [], limitations: [] });
const fail = (g: Gate, reason: string) => { g.missing.push(reason); };
type Receipt = z.infer<typeof receiptSchema>;
function validateVitest(raw: unknown, files: readonly string[]) {
  const assertion = z.object({ status: z.literal("passed") }).passthrough();
  const report = z.object({ success: z.literal(true), numTotalTests: countSchema.positive(), numPassedTests: countSchema,
    numFailedTests: z.literal(0), numPendingTests: z.literal(0), numTodoTests: z.literal(0),
    numTotalTestSuites: countSchema.positive(), numPassedTestSuites: countSchema, numFailedTestSuites: z.literal(0), numPendingTestSuites: z.literal(0),
    testResults: z.array(z.object({ name: z.string(), status: z.literal("passed"), assertionResults: z.array(assertion).min(1) }).passthrough()).min(1),
  }).passthrough().parse(raw);
  const total = report.testResults.reduce((s, r) => s + r.assertionResults.length, 0);
  if (report.numTotalTests !== total || report.numPassedTests !== total || report.numPassedTestSuites !== report.numTotalTestSuites
    || report.testResults.length !== files.length || new Set(report.testResults.map((r) => r.name)).size !== files.length
    || files.some((file) => !report.testResults.some((r) => r.name.replaceAll("\\", "/").endsWith(`/${file}`))))
    throw new Error("incoherent_test_evidence");
}
function validateLoad(raw: unknown) {
  const n = z.number().finite().nonnegative();
  const arm = z.object({ kind: z.enum(["observer_off", "observer_on", "no_observer", "observer_provider_unavailable"]), pair: countSchema.positive().nullable(), samples: countSchema.positive(), errors: countSchema,
    outcomes: z.record(countSchema), copyCalls: countSchema, outputRows: countSchema, attemptRows: countSchema, p50Ms: n, p95Ms: n, maxMs: n,
    observer: z.object({ seededWorks: countSchema, sweeps: countSchema, httpCalls: countSchema, sweepErrors: countSchema, statuses: z.record(countSchema),
      window: z.object({ ms: n, sweeps: countSchema, sends: countSchema }).passthrough() }).passthrough(),
    jevQueue: z.object({ queued: countSchema, markers: countSchema, quotaAttempts: countSchema, completed: countSchema, outcomeUnknown: countSchema, collectionRuns: countSchema, maxQueuedAgeMs: n }).passthrough(),
    pool: z.object({ maxTotal: countSchema, maxWaiting: countSchema, minIdle: countSchema, samples: countSchema.positive() }).passthrough(),
  }).passthrough();
  const r = z.object({ harness: z.literal("jev-472-load"), verdict: z.enum(["inconclusive", "within_target", "fail"]), enablementEvidence: z.literal(false),
    pooledP95: z.literal(true), samplePerArm: countSchema.positive(), concurrency: countSchema.positive(), targetMs: n,
    deltaMs: z.number().finite(), noiseMs: n.nullable(), baselineP95Ms: n, observerOnP95Ms: n, limitations: z.array(z.string()).min(1), arms: z.array(arm).length(6),
  }).passthrough().parse(raw);
  const expected = ["observer_off:1", "observer_on:1", "observer_on:2", "observer_off:2", "no_observer:null", "observer_provider_unavailable:null"];
  if (r.arms.some((a, i) => `${a.kind}:${a.pair}` !== expected[i])) throw new Error("invalid_load_arms");
  const offs = r.arms.filter((a) => a.kind === "observer_off");
  const ons = r.arms.filter((a) => a.kind === "observer_on");
  for (const a of r.arms) {
    if (a.samples !== r.samplePerArm || a.outcomes.ok !== a.samples || Object.values(a.outcomes).reduce((s, c) => s + c, 0) !== a.samples
      || a.errors || a.copyCalls !== a.samples || a.attemptRows !== a.samples || a.outputRows || a.observer.sweepErrors
      || a.jevQueue.markers !== a.jevQueue.quotaAttempts || a.observer.httpCalls !== a.jevQueue.markers
      || a.jevQueue.completed + a.jevQueue.outcomeUnknown !== a.jevQueue.markers
      || a.p50Ms > a.p95Ms || a.p95Ms > a.maxMs || a.pool.minIdle > a.pool.maxTotal
      || Object.values(a.observer.statuses).reduce((s, c) => s + c, 0) !== a.observer.sweeps
      || a.observer.window.sends > a.observer.httpCalls || a.observer.window.sweeps > a.observer.sweeps) throw new Error("incoherent_load_counts");
    if ((a.kind === "observer_on" || a.kind === "observer_off") && a.observer.seededWorks !== offs[0].observer.seededWorks) throw new Error("unequal_load_datasets");
    if ((a.kind === "observer_off" || a.kind === "no_observer") && (a.observer.httpCalls || a.jevQueue.markers || a.jevQueue.collectionRuns)) throw new Error("off_load_has_side_effects");
    if (a.kind === "observer_on" && (!a.jevQueue.collectionRuns || a.jevQueue.markers > 3 * a.observer.sweeps)) throw new Error("load_limits_violated");
  }
  const round = (v: number) => Math.round(v * 100) / 100;
  const target = round(Math.max(50, 0.05 * r.baselineP95Ms));
  const delta = round(r.observerOnP95Ms - r.baselineP95Ms);
  const noise = round(Math.abs(offs[0].p95Ms - offs[1].p95Ms));
  if (target !== r.targetMs || Math.abs(delta - r.deltaMs) > 0.011 || r.noiseMs !== noise) throw new Error("incoherent_load_measurements");
  const sufficient = r.samplePerArm >= 100;
  const exposure = ons.every((a) => a.observer.window.sends > 0 && a.observer.window.sweeps > 0);
  const verdict = !sufficient ? "inconclusive" : delta > target ? (noise > target ? "inconclusive" : "fail") : noise > target || !exposure ? "inconclusive" : "within_target";
  if (verdict !== r.verdict || verdict === "fail") throw new Error("load_failed_or_mismatched_verdict");
  return { conclusive: verdict === "within_target", limitations: r.limitations };
}
function sourceEvidence() {
  // Audited additive migrations are immutable inputs to G0; do not infer safety from an approval flag.
  const files = ["0159_cheerful_molecule_man.sql", "0160_young_owl.sql", "0161_powerful_lady_vermin.sql"];
  const hashes = ["f72c1dce4c99f2cf5612a522dd0d97b7c8ee0f1d82ccce1c5c232afead91ce48", "cac8879ce4c5ce22cda3b3e587b097061dcecf204242aaa4956d533062741730", "e10411fe155a73100399dcc1fcf441481f72fbac4b9433b4d5a7512fb0ce5fb5"];
  for (const file of readdirSync(resolve(appRoot, "drizzle")).filter((f) => /^\d{4}.*\.sql$/.test(f) && Number(f.slice(0, 4)) > 161)) {
    if (/semantic_review_/i.test(readFileSync(resolve(appRoot, "drizzle", file), "utf8"))) throw new Error("unaudited_later_semantic_migration");
  }
  return files.map((file, index) => {
    const sql = readFileSync(resolve(appRoot, "drizzle", file), "utf8");
    if (bytesDigest(sql) !== hashes[index]) throw new Error("audited_migration_changed");
    const statements = sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
    if (statements.some((s) => !/^(?:CREATE (?:UNIQUE )?(?:TABLE|INDEX)|ALTER TABLE [\s\S]+ ADD (?:COLUMN|CONSTRAINT))\b/.test(s)
      || /\b(?:DROP|TRUNCATE|DELETE|UPDATE|INSERT)\s+(?:TABLE|FROM|INTO|"adscale_app")/i.test(s))) throw new Error("non_additive_migration");
    return { file, sha256: bytesDigest(sql) };
  });
}
function toolText(t: Receipt, directory: string, sha: string) {
  if (t.codeSha !== sha || t.exitCode !== 0 || semanticDigest(t.command) !== semanticDigest(G0_COMMANDS[t.id])) throw new Error("tool_receipt_mismatch");
  const text = readSemanticPrivateText(resolve(directory, t.artifact));
  if (bytesDigest(text) !== t.sha256) throw new Error("tool_artifact_hash_mismatch");
  return text;
}

export function decideEvidence(raw: unknown, directory: string, validationOnly = false, now = new Date()) {
  const codeSha = currentCodeSha();
  const g0 = gate(), g1 = gate(), g2 = gate();
  const limitations = ["Controlled evidence does not demonstrate model quality.", "File digests prove integrity; human approval references require human verification.",
    "Decision reads recorded tool outputs without reexecuting them; reproduce collect-g0 to establish their source.",
    "Provenance and selection order are declared, not independently verified (evaluation #471).",
    "Historical approval coverage does not authorize new activity. Future activation requires new, currently valid authorizations.",
    "Observation does not establish causal savings, conversion or readiness for blocking."];
  let formatValid = true;
  let corpus: ReturnType<typeof evaluateCorpus> | null = null;
  let loadConclusive = false, loadHash: string | null = null;
  const incidents: string[] = [];
  let migrations: ReturnType<typeof sourceEvidence> = [];
  // Inspect independent sources before package/source/gate validation can fail.
  const fields = z.record(z.unknown()).safeParse(raw);
  const input = fields.success ? fields.data : {};
  incidents.push(...knownIncidentKinds(input.incidents));
  let rawOp: unknown;
  let rawFreeze: unknown;
  if (typeof input.operational === "string") {
    try {
      rawOp = readSemanticPrivateJson(input.operational);
      const audit = z.object({ audit: z.object({ incidents: z.unknown() }).passthrough() }).passthrough().safeParse(rawOp);
      if (audit.success) incidents.push(...knownIncidentKinds(audit.data.audit.incidents));
      operationalSchema.parse(rawOp);
    } catch { formatValid = false; fail(g1, "invalid_operational_evidence"); }
  }
  if (typeof input.freeze === "string") {
    try { rawFreeze = readSemanticPrivateJson(input.freeze); freezeSchema.parse(rawFreeze); }
    catch { formatValid = false; fail(g2, "invalid_freeze_evidence"); }
  }
  if (typeof input.evaluationRoot === "string") {
    try {
      const approvalFiles = z.array(z.string()).safeParse(input.exportApprovals ?? []);
      corpus = evaluateCorpus(input.evaluationRoot, approvalFiles.success ? approvalFiles.data : [], now, (kind) => incidents.push(kind));
    } catch (error) { formatValid = false; fail(g1, safeEvidenceCode(error)); fail(g2, safeEvidenceCode(error)); }
  }
  try {
    const p = decisionPackageSchema.parse(raw);
    if (p.codeSha !== codeSha) { formatValid = false; fail(g0, "execution_sha_mismatch"); }
    if (git("diff", "HEAD", "--", "src", "scripts", "drizzle", "package.json", "package-lock.json", "../.github/workflows/ci.yml").length) fail(g0, "uncommitted_execution_code");
    if (!process.version.startsWith("v22.")) fail(g0, "node_22_required");
    migrations = sourceEvidence();
    if (new Set(p.tools.map((t) => t.id)).size !== p.tools.length) fail(g0, "duplicate_tool_receipts");
    for (const id of Object.keys(G0_COMMANDS) as Array<keyof typeof G0_COMMANDS>) {
      const tool = p.tools.find((t) => t.id === id);
      if (!tool) { fail(g0, `${id}_evidence_required`); continue; }
      try {
        const text = toolText(tool, directory, codeSha);
        if (id === "jev_tests" || id === "regressions") validateVitest(JSON.parse(text), id === "jev_tests" ? JEV_TEST_FILES : REGRESSION_FILES);
        else if (id === "fixture") { if (semanticDigest(JSON.parse(text)) !== semanticDigest(runSyntheticCorpus(SYNTHETIC_CASES))) throw new Error("fixture_mismatch"); }
        else if (id === "boundary") {
          const match = text.match(/^JEV-DEPENDENCIES: (.+)$/m);
          const r = z.object({ protectedFiles: countSchema.positive(), pilotExecutableFiles: countSchema.positive(), pilotPackages: countSchema.positive(), violations: z.literal(0) }).strict().parse(JSON.parse(match?.[1] ?? "null"));
          if (r.protectedFiles < 1) throw new Error("empty_boundary_evidence");
        } else if (id === "convergence_tests") {
          const number = (key: string) => Number(text.match(new RegExp(`^# ${key} (\\d+)$`, "m"))?.[1]);
          if (!(number("tests") > 0) || number("pass") !== number("tests") || number("fail") !== 0 || number("skipped") !== 0 || number("cancelled") !== 0 || number("todo") !== 0) throw new Error("incoherent_convergence_tests");
        } else if (id === "convergence_gate") {
          if (!text.includes("CONVERGENCE-GATE: all gates passed.")) throw new Error("convergence_gate_not_passed");
        } else {
          const load = validateLoad(JSON.parse(text)); loadConclusive = load.conclusive; loadHash = tool.sha256;
          g0.limitations.push(...load.limitations);
          if (!load.conclusive) g0.limitations.push("Load is inconclusive; allowed for controlled G0 only. G1 remains hold.");
        }
      } catch { formatValid = false; fail(g0, `${id}_invalid_or_inconsistent`); }
    }
    if (!p.evaluationRoot) {
      g1.missing.push("authorized_pt_br_evaluation_root_required", "50_clear_human_pt_br_families_required");
      g2.missing.push("authorized_evaluation_root_required", "independent_blind_human_reference_required", "300_families_100_calibration_200_holdout_required",
        "false_alert_denominator_100_required", "precision_denominator_30_required", "incremental_denominator_30_required", "complete_operational_processing_and_reconstruction_required", "g2_metrics_and_wilson_limits_unmeasured");
    }
    if (corpus) {
      g1.missing.push(...corpus.missing);
      g2.missing.push(...corpus.missing, ...corpus.g2);
      if (corpus.clearLabels < 50) fail(g1, "50_clear_human_pt_br_families_required");
    }
    if (!loadConclusive) fail(g1, "conclusive_comparable_load_required");
    if (!p.operational) {
      g1.missing.push("designated_product_operations_security_owners_required", "data_provider_spend_approvals_required", "retention_security_review_required", "ratified_limits_and_tone_777_required", "authorized_real_smoke_required", "validated_runtime_and_provenance_required");
    } else {
      try {
        const op = checkOperationalEvidence(rawOp, corpus, codeSha, loadHash, now); g1.missing.push(...op.missing); incidents.push(...op.incidents);
      }
      catch { formatValid = false; fail(g1, "invalid_operational_evidence"); }
    }
    if (!p.freeze || !corpus) fail(g2, "frozen_criteria_and_new_holdout_record_required");
    else {
      try { g2.missing.push(...checkFreeze(rawFreeze, corpus, (sha) => {
        try {
          git("merge-base", "--is-ancestor", sha, codeSha);
          return !git("diff", sha, codeSha, "--", "src/server/creative-work/semantic-review-metrics.ts", "src/server/creative-work/semantic-review-evaluation.ts",
            "src/server/creative-work/semantic-review-offline.ts", "scripts/jev-decision-evaluation.ts", "scripts/jev-decision-evidence.ts");
        } catch { return false; }
      })); } catch { formatValid = false; fail(g2, "invalid_freeze_evidence"); }
    }
  } catch { formatValid = false; fail(g0, "invalid_evidence_format"); }
  if (g0.missing.length) fail(g1, "g0_required");
  if (g1.missing.length) fail(g2, "g1_required");
  for (const g of [g0, g1, g2]) {
    g.missing = [...new Set(g.missing)];
    g.status = incidents.length ? "reject" : !g.missing.length && !validationOnly ? "pass" : "hold";
  }
  return { version: 1, codeSha, generatedAt: now.toISOString(), validationOnly, formatValid,
    decision: incidents.length ? "reject" : !validationOnly && g2.status === "pass" ? "eligible_for_human_review" : "hold",
    enablesProductBehavior: false as const, gates: { g0, g1, g2 }, incidents: [...new Set(incidents)], limitations,
    migrations, evaluation: corpus ? { ...corpus.identity, families: corpus.families, calibration: corpus.calibration, holdout: corpus.holdout, clearLabels: corpus.clearLabels, metrics: corpus.metrics, generalizationBrands: corpus.generalizationBrands } : null,
  };
}

export function collectG0(outputDir: string) {
  if (!process.version.startsWith("v22.") || git("status", "--porcelain").length) throw new Error("clean_head_and_node_22_required");
  const databaseUrl = requireJevTestDatabaseUrl();
  if (!outputDir.startsWith("/") || outputDir.split("/").includes("..") || resolve(outputDir).startsWith(resolve(appRoot, "..") + "/")) throw new Error("private_external_output_required");
  mkdirSync(outputDir, { mode: 0o700 });
  const codeSha = currentCodeSha();
  const tools: Receipt[] = [];
  const inheritedEnvironment = Object.fromEntries(["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "TMP", "TEMP"].flatMap((key) => process.env[key] === undefined ? [] : [[key, process.env[key]!]]));
  const loadEnvironment = Object.fromEntries(["JEV_LOAD_SAMPLE", "JEV_LOAD_CONCURRENCY"].flatMap((key) => {
    const value = process.env[key];
    if (value === undefined) return [];
    if (!/^[1-9]\d*$/.test(value)) throw new Error("invalid_controlled_load_configuration");
    return [[key, value]];
  }));
  for (const [id, command] of Object.entries(G0_COMMANDS) as Array<[Receipt["id"], readonly string[]]>) {
    process.stderr.write(`collect-g0: ${id}\n`);
    const npm = command[0] === "npm";
    const loadPath = resolve(outputDir, "load-source.json");
    const result = spawnSync(npm ? "npm" : process.execPath, npm ? command.slice(1) : [...command], {
      cwd: appRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
      env: { ...inheritedEnvironment, ...loadEnvironment, NODE_ENV: "test", TZ: "UTC", TEST_DATABASE_URL: databaseUrl, DATABASE_URL: databaseUrl,
        JEV_OBSERVER_ENABLED: "false", JEV_LOAD_OUT: loadPath, FORCE_COLOR: "0" },
    });
    const artifact = `${id}.${["jev_tests", "regressions", "fixture", "load"].includes(id) ? "json" : "log"}`;
    const content = id === "load" && result.status === 0 ? readFileSync(loadPath, "utf8") : result.stdout;
    if (id === "load" && result.status === 0) chmodSync(loadPath, 0o600);
    // JEV_LOAD_OUT writes only controlled metrics; do not capture environment or input text.
    writeFileSync(resolve(outputDir, artifact), content, { mode: 0o600, flag: "wx" });
    writeFileSync(resolve(outputDir, `${id}-stderr.log`), result.stderr ?? "", { mode: 0o600, flag: "wx" });
    tools.push({ id, codeSha, command: [...command], exitCode: result.status ?? 1, artifact, sha256: bytesDigest(content) });
  }
  if (currentCodeSha() !== codeSha || git("diff", "HEAD", "--", "src", "scripts", "drizzle", "package.json", "package-lock.json").length) throw new Error("execution_code_changed");
  const evidence = { version: 1, codeSha, versions: EVALUATION_VERSIONS, tools, incidents: [] };
  writeFileSync(resolve(outputDir, "package.json"), JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  const report = decideEvidence(evidence, outputDir);
  writeFileSync(resolve(outputDir, "decision.json"), JSON.stringify(report, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  return report;
}

export async function main(args: string[]) {
  if (args.length === 3 && args[0] === "collect-g0" && args[1] === "--output-dir") {
    const report = collectG0(args[2]); return { report, exitCode: report.gates.g0.status === "pass" ? 0 : 1 };
  }
  const options = new Map<string, string>();
  let validateOnly = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--validate-only" && !validateOnly) { validateOnly = true; continue; }
    if (!["--evidence", "--gate"].includes(args[i]) || options.has(args[i]) || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("invalid_arguments");
    options.set(args[i], args[++i]);
  }
  const requested = options.get("--gate");
  if (!options.get("--evidence") || !requested || !["g0", "g1", "g2"].includes(requested)) throw new Error("invalid_arguments");
  const path = options.get("--evidence")!;
  const report = decideEvidence(readSemanticPrivateJson(path), dirname(path), validateOnly);
  return { report, exitCode: report.formatValid && report.decision !== "reject" && (validateOnly || report.gates[requested as "g0" | "g1" | "g2"].status === "pass") ? 0 : 1 };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(({ report, exitCode }) => { process.stdout.write(JSON.stringify(report, null, 2) + "\n"); process.exitCode = exitCode; }).catch(() => {
    process.stdout.write(JSON.stringify({ version: 1, decision: "hold", enablesProductBehavior: false, validationOnly: false, formatValid: false, error: "invalid_or_unavailable_evidence" }) + "\n"); process.exitCode = 1;
  });
}
