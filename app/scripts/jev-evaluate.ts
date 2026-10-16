/** Private file workflow. No provider calls, business writes or human labels invented. */
import { randomUUID } from "node:crypto";
import { constants, closeSync, fstatSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { createDiagnosticContext } from "../src/server/diagnostics/context";
import { SEMANTIC_OPTIONS, SEMANTIC_QUESTIONS, SEMANTIC_RUBRIC } from "../src/server/creative-work/semantic-review-offline";
import {
  buildSemanticEvaluationReport, EVALUATION_VERSIONS, judgmentSchema, LABEL_VERSIONS, parseSemanticFamilyPlan,
  semanticDigest, validateSemanticJudgments, validateSemanticManifest,
  type SemanticEvaluationManifest, type SemanticEvaluationRow,
} from "../src/server/creative-work/semantic-review-evaluation";
import type { SemanticReviewExportRepository } from "../src/server/creative-work/semantic-review-export-repository";
import { requireJevTestDatabaseUrl } from "./jev-collect";

const approvalSchema = z.object({
  reference: z.string().url().max(2048).refine((value) => { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.hash && !value.includes("?"); }),
  authorizedBy: z.string().trim().min(1).max(200), approvedAt: z.string().datetime(), expiresAt: z.string().datetime(),
  purpose: z.literal("blind_semantic_review_export"), workspaceId: z.string().uuid(),
  clientProfileIds: z.array(z.string().uuid()).min(1).max(100), reviewIds: z.array(z.string().uuid()).min(1).max(100),
  planHash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
export function validateSemanticExportApproval(raw: unknown, workspaceId: string, planHash: string, reviewIds: string[], now: Date) {
  const approval = approvalSchema.parse(raw);
  const approved = Date.parse(approval.approvedAt), expires = Date.parse(approval.expiresAt);
  if (!Number.isFinite(now.getTime()) || approved > now.getTime() || expires <= now.getTime() || expires <= approved || expires - approved > 14 * 86_400_000
    || approval.workspaceId !== workspaceId || approval.planHash !== planHash
    || new Set(approval.reviewIds).size !== approval.reviewIds.length || new Set(approval.clientProfileIds).size !== approval.clientProfileIds.length
    || semanticDigest([...approval.reviewIds].sort()) !== semanticDigest([...reviewIds].sort())) throw new Error("invalid_export_authorization");
  return approval;
}

/** Walk components using directory descriptors. Linux /proc supplies openat-style anchoring. */
function openDirectory(path: string, requirePrivate: boolean) {
  if (!isAbsolute(path) || path.split("/").some((part) => part === "." || part === "..")) throw new Error("unsafe_private_path");
  let fd = openSync("/", constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    for (const part of path.split("/").filter(Boolean)) {
      const next = openSync(`/proc/self/fd/${fd}/${part}`, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      closeSync(fd); fd = next;
    }
    if (requirePrivate && (fstatSync(fd).mode & 0o077) !== 0) throw new Error("insecure_private_permissions");
    return fd;
  } catch (error) { closeSync(fd); throw error; }
}
function anchored(fd: number, name: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name) || name === "." || name === "..") throw new Error("unsafe_private_path");
  return `/proc/self/fd/${fd}/${name}`;
}
function writeNewJson(fd: number, name: string, value: unknown) {
  const file = openSync(anchored(fd, name), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(file, JSON.stringify(value, null, 2) + "\n"); fsyncSync(file); }
  finally { closeSync(file); }
  fsyncSync(fd);
}
function readPrivateJsonAt(fd: number, name: string): unknown {
  const file = openSync(anchored(fd, name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(file);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.size > 16 * 1024 * 1024) throw new Error("insecure_private_file");
    return JSON.parse(readFileSync(file, "utf8")) as unknown;
  } finally { closeSync(file); }
}
export function readSemanticPrivateJson(path: string): unknown {
  const fd = openDirectory(dirname(path), false);
  try { return readPrivateJsonAt(fd, basename(path)); } finally { closeSync(fd); }
}
function createPrivateDirectory(path: string) {
  if (!isAbsolute(path) || path.split("/").some((part) => part === "." || part === "..") || path.endsWith("/")) throw new Error("unsafe_private_path");
  const parent = openDirectory(dirname(path), false);
  try {
    mkdirSync(anchored(parent, basename(path)), { mode: 0o700 });
    const fd = openSync(anchored(parent, basename(path)), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    fsyncSync(parent);
    return fd;
  } finally { closeSync(parent); }
}
function provenance(workspaceId: string) {
  const context = createDiagnosticContext({ workspaceId, workItemId: "private-evaluation" });
  const environment = context.environment === "test" || context.environment === "staging" || context.environment === "production" ? context.environment : null;
  return { environment, execution: environment === "test" ? "controlled" as const : environment ? "live_authorized" as const : null, assurance: "declared" as const };
}

export async function exportSemanticReviewCases(options: {
  repository: SemanticReviewExportRepository; authorization: unknown; plan: unknown; outputDir: string; clock?: () => Date;
}) {
  const clock = options.clock ?? (() => new Date());
  const now = clock();
  // Freeze and hash selection before the repository can read any result.
  const plan = parseSemanticFamilyPlan(options.plan, now);
  const planHash = semanticDigest(plan);
  const approval = validateSemanticExportApproval(options.authorization, plan.workspaceId, planHash, plan.entries.map((e) => e.reviewId), now);
  const exportId = randomUUID();
  const families = new Map([...new Set(plan.entries.map((e) => e.familyId))].map((f) => [f, randomUUID()]));
  const loaded = await options.repository.reconstruct({ workspaceId: plan.workspaceId, clientProfileIds: approval.clientProfileIds, reviewIds: approval.reviewIds });
  validateSemanticExportApproval(approval, plan.workspaceId, planHash, plan.entries.map((e) => e.reviewId), clock());
  const cases = [];
  const rows: SemanticEvaluationRow[] = [];
  for (const entry of plan.entries) {
    const record = loaded.records.find((r) => r.reviewId === entry.reviewId)!;
    const observation = record.observation;
    const caseId = randomUUID(), familyId = families.get(entry.familyId)!;
    rows.push({
      reviewId: entry.reviewId, caseId, familyId, sourceFamilyId: entry.familyId, split: entry.split, primary: entry.primary,
      clientProfileId: observation?.clientProfileId ?? null, workItemId: observation?.workItemId ?? null, policyId: observation?.policyId ?? null,
      semanticHash: observation?.semanticHash ?? null, versions: observation ? {
        profile: observation.profile, model: observation.model, inputVersion: observation.inputVersion, rubricVersion: observation.rubricVersion, rubricHash: observation.rubricHash,
      } : EVALUATION_VERSIONS,
      dataOrigin: record.policy?.dataOrigin ?? null, state: observation?.state ?? null,
      available: record.projected !== null, unavailableReason: record.unavailableReason,
      decisions: observation?.decisions ?? null, baselineAlert: record.projected ? record.projected.baseline.briefingFindings + record.projected.baseline.copyViolations > 0 : null,
      confidence: observation?.confidence ?? null, probabilities: observation?.probabilities ?? null,
      usage: observation?.usage ?? null, returnedModel: observation?.returnedModel ?? null,
      currentAtCompletion: observation?.currentAtCompletion ?? null, errorCode: observation?.errorCode ?? null,
      createdAt: observation?.createdAt.toISOString() ?? null, sendStartedAt: observation?.sendStartedAt?.toISOString() ?? null,
      finishedAt: observation?.finishedAt?.toISOString() ?? null, httpElapsedMs: observation?.httpElapsedMs ?? null,
    });
    if (record.projected) {
      const p = record.projected.projection;
      cases.push({ caseId, familyId, semanticHash: record.projected.hash, versions: LABEL_VERSIONS,
        context: { format: p.format, request: p.request, brandName: p.brandName, facts: p.facts,
          requiredElements: p.requiredElements, prohibitedElements: p.prohibitedElements,
          briefing: Object.fromEntries(Object.entries(p.briefing).map(([field, value]) => [field, { value: value.value, state: value.state }])), copy: p.copy } });
    }
  }
  const blind = { version: 1, exportId, planHash, rubric: SEMANTIC_RUBRIC, questions: SEMANTIC_QUESTIONS, classes: SEMANTIC_OPTIONS, cases };
  const manifest: SemanticEvaluationManifest = validateSemanticManifest({ version: 1, exportId, createdAt: now.toISOString(),
    authorizationHash: semanticDigest(approval), planHash, blindHash: semanticDigest(blind), plan, provenance: provenance(plan.workspaceId),
    collectionRuns: loaded.collectionRuns, collectionHistoryComplete: loaded.collectionHistoryComplete, rows });
  const fd = createPrivateDirectory(options.outputDir);
  try {
    // The completion record is written last; partial failures are never valid runs.
    writeNewJson(fd, "blind.json", blind);
    writeNewJson(fd, "private-map.json", manifest);
    writeNewJson(fd, "complete.json", { manifestHash: semanticDigest(manifest), blindHash: manifest.blindHash });
    return { exportId, selected: rows.length, exported: cases.length, unavailable: rows.length - cases.length, planHash, blindHash: manifest.blindHash };
  } finally { closeSync(fd); }
}

function readRun(fd: number) {
  const manifest = validateSemanticManifest(readPrivateJsonAt(fd, "private-map.json"));
  const blind = readPrivateJsonAt(fd, "blind.json");
  const complete = z.object({ manifestHash: z.string(), blindHash: z.string() }).strict().parse(readPrivateJsonAt(fd, "complete.json"));
  if (complete.manifestHash !== semanticDigest(manifest) || complete.blindHash !== manifest.blindHash || semanticDigest(blind) !== manifest.blindHash) throw new Error("private_run_integrity_mismatch");
  const history = readdirSync(`/proc/self/fd/${fd}`).filter((name) => /^judgment-[0-9a-f]{64}\.json$/.test(name)).sort().map((name) => {
    const item = judgmentSchema.parse(readPrivateJsonAt(fd, name));
    if (name !== `judgment-${semanticDigest(item)}.json`) throw new Error("judgment_history_mismatch");
    return item;
  });
  return { manifest, history };
}
function withRunLock<T>(directory: string, run: (fd: number) => T): T {
  const fd = openDirectory(directory, true);
  // A durable immutable history file uses O_EXCL; a lock also serializes
  // validation against history, so two writers cannot both add a third review.
  let locked = false;
  try {
    const lock = openSync(anchored(fd, "lock"), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    closeSync(lock); locked = true;
    return run(fd);
  } finally {
    try { if (locked) unlinkLock(fd); }
    finally { closeSync(fd); }
  }
}
function unlinkLock(fd: number) { unlinkSync(anchored(fd, "lock")); fsyncSync(fd); }
export function importSemanticReviewJudgment(options: { directory: string; judgment: unknown; now?: Date }) {
  return withRunLock(options.directory, (fd) => {
    const { manifest, history } = readRun(fd);
    const item = judgmentSchema.parse(options.judgment);
    validateSemanticJudgments(manifest, [...history, item], options.now);
    const digest = semanticDigest(item);
    writeNewJson(fd, `judgment-${digest}.json`, item);
    return { imported: item.cases.length, kind: item.kind, judgmentHash: digest };
  });
}
export function writeSemanticEvaluationReport(options: { directory: string; now?: Date }) {
  return withRunLock(options.directory, (fd) => {
    const { manifest, history } = readRun(fd);
    const report = buildSemanticEvaluationReport(manifest, history, options.now);
    const name = `report-${semanticDigest(report)}.json`;
    writeNewJson(fd, name, report);
    return { filename: name, report };
  });
}

export async function main(args: string[]) {
  if (args.length === 1 && args[0] === "demo") return (await import("./jev-evaluate-demo")).runSemanticEvaluationDemo();
  const [command, ...rest] = args;
  const flags = new Map<string, string>();
  for (let i = 0; i < rest.length; i += 2) {
    if (!rest[i]?.startsWith("--") || !rest[i + 1] || flags.has(rest[i])) throw new Error("invalid_arguments");
    flags.set(rest[i], rest[i + 1]);
  }
  const requireFlags = (names: string[]) => {
    if (flags.size !== names.length || names.some((name) => !flags.has(name))) throw new Error("invalid_arguments");
    return names.map((name) => flags.get(name)!);
  };
  if (command === "import") {
    const [directory, path] = requireFlags(["--directory", "--input"]);
    return importSemanticReviewJudgment({ directory, judgment: readSemanticPrivateJson(path) });
  }
  if (command === "report") {
    const [directory] = requireFlags(["--directory"]);
    const result = writeSemanticEvaluationReport({ directory });
    return { filename: result.filename, selected: result.report.selected, unavailable: result.report.unavailable };
  }
  if (command !== "export") throw new Error("invalid_arguments");
  const [approval, plan, outputDir] = requireFlags(["--authorization", "--plan", "--output-dir"]);
  const connectionString = requireJevTestDatabaseUrl();
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { createSemanticReviewExportRepository } = await import("../src/server/creative-work/semantic-review-export-repository");
  const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5_000 });
  try {
    return await exportSemanticReviewCases({ repository: createSemanticReviewExportRepository(drizzle(pool)),
      authorization: readSemanticPrivateJson(approval), plan: readSemanticPrivateJson(plan), outputDir });
  } finally { await pool.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((result) => console.log(JSON.stringify(result))).catch(() => { console.error("jev_evaluation_failed"); process.exitCode = 1; });
}
