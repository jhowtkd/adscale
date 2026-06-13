#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const PROTECTED_PATHS = [
  "app/src/components/settings/BillingTab.test.tsx",
  "app/src/components/settings/BillingTab.tsx",
  "app/src/server/repositories/billing.ts",
  "app/scripts/verify-preview-fix.mjs",
];

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");

function git(args, encoding = "utf8") {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function optionalGit(args) {
  try {
    return git(args).trim();
  } catch {
    return null;
  }
}

function worktreeHash(path) {
  const absolutePath = resolve(repoRoot, path);
  if (!existsSync(absolutePath)) return null;
  return createHash("sha256").update(readFileSync(absolutePath)).digest("hex");
}

function indexEntries(path) {
  const output = git(["ls-files", "--stage", "-z", "--", path], "buffer");
  if (output.length === 0) return null;

  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((record) => {
      const match = record.match(/^(\d{6}) ([0-9a-f]+) (\d)\t(.+)$/);
      if (!match) throw new Error(`Unable to parse index entry for ${path}`);
      return { mode: match[1], blob: match[2], stage: Number(match[3]) };
    });
}

function porcelainRecord(path) {
  const output = git(
    ["status", "--porcelain=v2", "-z", "--untracked-files=all", "--", path],
    "buffer",
  );
  return output.length === 0 ? null : output.toString("base64");
}

function inspectPath(path) {
  return {
    path,
    headBlob: optionalGit(["rev-parse", `HEAD:${path}`]),
    index: indexEntries(path),
    worktreeSha256: worktreeHash(path),
    porcelainV2Base64: porcelainRecord(path),
  };
}

function buildSnapshot() {
  return {
    schemaVersion: 1,
    capturedHead: git(["rev-parse", "HEAD"]).trim(),
    protectedPaths: PROTECTED_PATHS.map(inspectPath),
  };
}

function validateSnapshot(snapshot) {
  if (
    snapshot?.schemaVersion !== 1 ||
    typeof snapshot.capturedHead !== "string" ||
    !Array.isArray(snapshot.protectedPaths) ||
    snapshot.protectedPaths.length !== PROTECTED_PATHS.length
  ) {
    throw new Error("Malformed protected-state snapshot");
  }

  for (const [index, path] of PROTECTED_PATHS.entries()) {
    if (snapshot.protectedPaths[index]?.path !== path) {
      throw new Error("Protected path list does not match the required contract");
    }
  }
}

function capture(destination) {
  const absoluteDestination = resolve(repoRoot, destination);
  const snapshot = buildSnapshot();
  writeFileSync(absoluteDestination, `${JSON.stringify(snapshot, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  console.log(`Captured protected state at ${destination}`);
}

function verify(source) {
  const absoluteSource = resolve(repoRoot, source);
  const snapshot = JSON.parse(readFileSync(absoluteSource, "utf8"));
  validateSnapshot(snapshot);

  const mismatches = [];
  for (const expected of snapshot.protectedPaths) {
    const actual = inspectPath(expected.path);
    for (const field of ["headBlob", "index", "worktreeSha256", "porcelainV2Base64"]) {
      if (JSON.stringify(actual[field]) !== JSON.stringify(expected[field])) {
        mismatches.push(`${expected.path}: ${field} changed`);
      }
    }
  }

  if (mismatches.length > 0) {
    throw new Error(`Protected state changed:\n${mismatches.join("\n")}`);
  }
  console.log(`Protected state matches ${source}`);
}

function usage() {
  throw new Error(
    "Usage: snapshot-visual-dirty-state.mjs <capture|verify> <snapshot-path>",
  );
}

const [mode, snapshotPath, ...extra] = process.argv.slice(2);
if (!snapshotPath || extra.length > 0) usage();

try {
  if (mode === "capture") capture(snapshotPath);
  else if (mode === "verify") verify(snapshotPath);
  else usage();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
