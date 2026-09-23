/** Explicitly authorized local pilot; manifest is metadata-only and append-only. */
import { createHash } from "node:crypto";
import { constants, closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { canonicalJsonStringify } from "../src/server/creative-work/canonical-json";
import { evaluateJev, type JevResult } from "../src/server/creative-work/semantic-review-http";
import { projectSemanticReviewOffline, SEMANTIC_MODEL, SEMANTIC_PROFILE, type SemanticProjection } from "../src/server/creative-work/semantic-review-offline";
import type { SyntheticCase } from "./run-jev-offline";

const authorizationSchema = z.object({
  reference: z.string().url(),
  authorizedBy: z.string().trim().min(1),
  approvedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  provider: z.literal("typesafe"),
  purpose: z.literal("offline_jev_semantic_review"),
  corpusSha256: z.string().regex(/^[0-9a-f]{64}$/),
  syntheticOnly: z.literal(true),
  spendApproved: z.literal(true),
  maxCalls: z.number().int().min(1).max(100),
}).strict();
export type JevAuthorization = z.infer<typeof authorizationSchema>;

const runRecord = z.object({
  kind: z.literal("run"), version: z.literal(1), corpusHash: z.string(), authorizationHash: z.string(),
  model: z.literal(SEMANTIC_MODEL), profile: z.literal(SEMANTIC_PROFILE), maxCalls: z.number().int(), createdAt: z.string(),
}).strict();
const startRecord = z.object({
  kind: z.literal("started"), caseKey: z.string(), inputHash: z.string(), startedAt: z.string(),
}).strict();
const terminalRecord = z.object({
  kind: z.literal("terminal"), caseKey: z.string(), outcome: z.enum(["completed", "failed", "outcome_unknown"]),
  finishedAt: z.string(), reason: z.string().optional(),
  decisions: z.record(z.string()).optional(),
  usage: z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() }).nullable().optional(),
  confidence: z.record(z.number()).optional(),
  probabilities: z.record(z.record(z.number())).optional(),
}).strict();
type RecordLine = z.infer<typeof runRecord> | z.infer<typeof startRecord> | z.infer<typeof terminalRecord>;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export function syntheticCorpusHash(cases: SyntheticCase[]): string {
  return sha256(canonicalJsonStringify({ origin: "synthetic", cases }));
}

function validateAuthorization(raw: unknown, corpusHash: string, maxCalls: number, now: Date, resume: boolean): { value: JevAuthorization; expired: boolean } {
  const parsed = authorizationSchema.safeParse(raw);
  if (!parsed.success || !Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 100) throw new Error("invalid_authorization");
  const value = parsed.data;
  const reference = new URL(value.reference);
  const approved = Date.parse(value.approvedAt);
  const expires = Date.parse(value.expiresAt);
  if (reference.protocol !== "https:" || reference.username || reference.password || reference.search
    || !reference.hostname || value.corpusSha256 !== corpusHash || maxCalls > value.maxCalls
    || approved > now.getTime() || (!resume && expires <= now.getTime()) || expires <= approved
    || expires - approved > 14 * 24 * 60 * 60 * 1000) throw new Error("invalid_authorization");
  return { value, expired: expires <= now.getTime() };
}

function privateStat(path: string, directory: boolean) {
  const stat = lstatSync(path);
  if ((directory ? !stat.isDirectory() : !stat.isFile()) || (stat.mode & 0o077) !== 0) throw new Error("insecure_manifest_permissions");
}

// ponytail: One lock serializes this local pilot; use OS locking if concurrent runs become necessary.
function lockRun(directory: string): string {
  const lockPath = join(directory, ".lock");
  try {
    const fd = openSync(lockPath, "wx", 0o600);
    try { writeSync(fd, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })); fsyncSync(fd); }
    finally { closeSync(fd); }
    return lockPath;
  } catch { throw new Error("manifest_locked"); }
}

export function appendManifestRecord(fd: number, record: RecordLine) {
  const line = `${JSON.stringify(record)}\n`;
  if (writeSync(fd, line) !== Buffer.byteLength(line)) throw new Error("manifest_write_failed");
  fsyncSync(fd);
}

function readManifest(path: string) {
  privateStat(path, false);
  const text = readFileSync(path, "utf8");
  if (!text.endsWith("\n")) throw new Error("manifest_corrupt");
  const lines = text.slice(0, -1).split("\n").map((line) => {
    try { return JSON.parse(line) as unknown; }
    catch { throw new Error("manifest_corrupt"); }
  });
  const header = runRecord.safeParse(lines.shift());
  if (!header.success) throw new Error("manifest_corrupt");
  const started = new Map<string, z.infer<typeof startRecord>>();
  const terminal = new Map<string, z.infer<typeof terminalRecord>>();
  for (const line of lines) {
    const start = startRecord.safeParse(line);
    if (start.success) {
      if (started.has(start.data.caseKey)) throw new Error("manifest_corrupt");
      started.set(start.data.caseKey, start.data);
      continue;
    }
    const end = terminalRecord.safeParse(line);
    if (!end.success || !started.has(end.data.caseKey) || terminal.has(end.data.caseKey)) throw new Error("manifest_corrupt");
    terminal.set(end.data.caseKey, end.data);
  }
  return { header: header.data, started, terminal };
}

type AuthorizedOptions = {
  cases: SyntheticCase[];
  authorization: unknown;
  credential: string | undefined;
  maxCalls: number;
  manifestDir: string;
  resume?: boolean;
  now?: Date;
  transport?: (projection: SemanticProjection, credential: string) => Promise<JevResult>;
  persist?: typeof appendManifestRecord;
};

export async function runAuthorizedCorpus(options: AuthorizedOptions) {
  const now = options.now ?? new Date();
  const corpusHash = syntheticCorpusHash(options.cases);
  const { value: authorization, expired } = validateAuthorization(options.authorization, corpusHash, options.maxCalls, now, Boolean(options.resume));
  if (!options.credential?.trim()) throw new Error("missing_credential");
  const authorizationHash = sha256(canonicalJsonStringify(authorization));
  const manifestPath = join(options.manifestDir, "manifest.jsonl");
  if (!options.resume) mkdirSync(options.manifestDir, { mode: 0o700 });
  privateStat(options.manifestDir, true);
  const lockPath = lockRun(options.manifestDir);
  let fd: number | undefined;
  try {
    if (!options.resume) {
      fd = openSync(manifestPath, "wx", 0o600);
      appendManifestRecord(fd, { kind: "run", version: 1, corpusHash, authorizationHash, model: SEMANTIC_MODEL, profile: SEMANTIC_PROFILE, maxCalls: options.maxCalls, createdAt: now.toISOString() });
    } else {
      privateStat(manifestPath, false);
      fd = openSync(manifestPath, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW);
    }
    const manifest = readManifest(manifestPath);
    if (manifest.header.corpusHash !== corpusHash || manifest.header.authorizationHash !== authorizationHash
      || manifest.header.maxCalls !== options.maxCalls) throw new Error("manifest_mismatch");
    const persist = options.persist ?? appendManifestRecord;
    for (const [caseKey] of manifest.started) {
      if (manifest.terminal.has(caseKey)) continue;
      const terminal = { kind: "terminal" as const, caseKey, outcome: "outcome_unknown" as const, finishedAt: new Date().toISOString() };
      persist(fd, terminal);
      manifest.terminal.set(caseKey, terminal);
    }
    let excluded = 0;
    const transport = options.transport ?? evaluateJev;
    for (const entry of expired ? [] : options.cases) {
      const caseKey = sha256(`${entry.id}\u0000${entry.family}`);
      if (manifest.started.has(caseKey)) continue;
      if (manifest.started.size >= options.maxCalls) break;
      const projected = projectSemanticReviewOffline(entry.work);
      if (!projected.ok) { excluded += 1; continue; }
      const startedAt = new Date().toISOString();
      persist(fd, { kind: "started", caseKey, inputHash: projected.hash, startedAt });
      manifest.started.set(caseKey, { kind: "started", caseKey, inputHash: projected.hash, startedAt });
      let result: JevResult;
      try { result = await transport(projected.projection, options.credential); }
      catch { result = { ok: false, reason: "network_error" }; }
      const ambiguous = !result.ok && (result.reason === "timeout" || result.reason === "network_error"
        || (result.reason === "http_status" && (result.status ?? 0) >= 500));
      const terminal: z.infer<typeof terminalRecord> = result.ok
        ? { kind: "terminal", caseKey, outcome: "completed", finishedAt: new Date().toISOString(), decisions: result.decisions, usage: result.usage, confidence: result.confidence, probabilities: result.probabilities }
        : { kind: "terminal", caseKey, outcome: ambiguous ? "outcome_unknown" : "failed", finishedAt: new Date().toISOString(), reason: result.reason };
      persist(fd, terminal);
      manifest.terminal.set(caseKey, terminal);
    }
    const outcomes = [...manifest.terminal.values()];
    return {
      origin: "synthetic" as const, execution: "live_authorized" as const, humanReference: "not_collected" as const,
      corpusHash, started: manifest.started.size,
      completed: outcomes.filter((record) => record.outcome === "completed").length,
      failed: outcomes.filter((record) => record.outcome === "failed").length,
      outcomeUnknown: outcomes.filter((record) => record.outcome === "outcome_unknown").length,
      excluded,
      remainingCalls: expired ? 0 : Math.max(0, options.maxCalls - manifest.started.size),
    };
  } catch (error) {
    if (error instanceof Error && ["manifest_corrupt", "manifest_mismatch", "insecure_manifest_permissions"].includes(error.message)) throw error;
    throw new Error("manifest_write_failed");
  } finally {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(lockPath); } catch { /* crash recovery requires --resume */ }
  }
}
