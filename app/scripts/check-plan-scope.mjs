#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");

function git(args, encoding = "utf8") {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function nulList(args) {
  const output = git(args, "buffer").toString("utf8");
  return output.split("\0").filter(Boolean);
}

function sha256(path) {
  const absolutePath = resolve(repoRoot, path);
  if (!existsSync(absolutePath)) return null;
  return createHash("sha256").update(readFileSync(absolutePath)).digest("hex");
}

function readIndex() {
  const entries = {};
  for (const record of nulList(["ls-files", "--stage", "-z"])) {
    const match = record.match(/^(\d{6}) ([0-9a-f]+) (\d)\t(.+)$/);
    if (!match) throw new Error(`Unable to parse index record: ${record}`);
    const path = match[4];
    entries[path] ??= [];
    entries[path].push({ mode: match[1], blob: match[2], stage: Number(match[3]) });
  }
  return entries;
}

function inspectRepository() {
  const index = readIndex();
  const untrackedPaths = nulList(["ls-files", "--others", "--exclude-standard", "-z"]);
  const paths = new Set([...Object.keys(index), ...untrackedPaths]);
  const files = {};

  for (const path of [...paths].sort()) {
    files[path] = {
      index: index[path] ?? null,
      worktreeSha256: sha256(path),
      untracked: untrackedPaths.includes(path),
    };
  }
  return files;
}

function parseFilesModified(planPath) {
  const source = readFileSync(resolve(repoRoot, planPath), "utf8");
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)?.[1];
  if (!frontmatter) throw new Error(`Plan has no valid frontmatter: ${planPath}`);

  const lines = frontmatter.split("\n");
  const start = lines.findIndex((line) => /^files_modified:\s*$/.test(line));
  if (start === -1) throw new Error(`Plan has no files_modified list: ${planPath}`);

  const files = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const item = line.match(/^  - (\S.*)$/)?.[1];
    if (item) {
      files.push(item);
      continue;
    }
    if (/^\s*$/.test(line)) continue;
    if (/^\S/.test(line)) break;
    throw new Error(`Malformed files_modified entry in ${planPath}: ${line}`);
  }

  if (files.length === 0 || new Set(files).size !== files.length) {
    throw new Error(`Plan files_modified must be a non-empty unique list: ${planPath}`);
  }
  return files;
}

function baselinePath(plan) {
  if (!/^[A-Za-z0-9._-]+$/.test(plan)) throw new Error(`Invalid plan id: ${plan}`);
  const gitDir = git(["rev-parse", "--git-dir"]).trim();
  return resolve(repoRoot, gitDir, "gsd-guards", `${plan}.json`);
}

function begin(plan, planFile) {
  const destination = baselinePath(plan);
  mkdirSync(dirname(destination), { recursive: true });
  const baseline = {
    schemaVersion: 1,
    plan,
    planFile,
    startingHead: git(["rev-parse", "HEAD"]).trim(),
    allowlist: parseFilesModified(planFile),
    files: inspectRepository(),
  };
  writeFileSync(destination, `${JSON.stringify(baseline, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  console.log(`Created immutable scope baseline for ${plan}`);
}

function validateBaseline(baseline, plan) {
  if (
    baseline?.schemaVersion !== 1 ||
    baseline.plan !== plan ||
    typeof baseline.planFile !== "string" ||
    typeof baseline.startingHead !== "string" ||
    !Array.isArray(baseline.allowlist) ||
    baseline.allowlist.some((path) => typeof path !== "string") ||
    !baseline.files ||
    typeof baseline.files !== "object" ||
    Array.isArray(baseline.files)
  ) {
    throw new Error(`Malformed scope baseline for ${plan}`);
  }
}

function committedPaths(startingHead) {
  return new Set(
    nulList(["diff", "--name-only", "-z", "--find-renames", `${startingHead}..HEAD`]),
  );
}

function verify(plan) {
  const source = baselinePath(plan);
  const baseline = JSON.parse(readFileSync(source, "utf8"));
  validateBaseline(baseline, plan);

  const current = inspectRepository();
  const changed = committedPaths(baseline.startingHead);
  const allPaths = new Set([...Object.keys(baseline.files), ...Object.keys(current)]);
  for (const path of allPaths) {
    if (JSON.stringify(baseline.files[path] ?? null) !== JSON.stringify(current[path] ?? null)) {
      changed.add(path);
    }
  }

  const allowed = new Set(baseline.allowlist);
  const violations = [...changed].filter((path) => !allowed.has(path)).sort();
  if (violations.length > 0) {
    throw new Error(`Plan ${plan} changed undeclared paths:\n${violations.join("\n")}`);
  }
  console.log(`Plan ${plan} scope verified (${changed.size} changed paths)`);
}

function option(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) return null;
  return process.argv[index + 1];
}

function usage() {
  throw new Error(
    "Usage: check-plan-scope.mjs begin --plan <id> --plan-file <path> | verify --plan <id>",
  );
}

const mode = process.argv[2];
const plan = option("--plan");
const planFile = option("--plan-file");

try {
  if (!plan) usage();
  if (mode === "begin" && planFile) begin(plan, planFile);
  else if (mode === "verify" && !planFile) verify(plan);
  else usage();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
