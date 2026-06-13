import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), "snapshot-visual-dirty-state.mjs");
const protectedPaths = [
  "app/src/components/settings/BillingTab.test.tsx",
  "app/src/components/settings/BillingTab.tsx",
  "app/src/server/repositories/billing.ts",
];

function run(cwd, command, args, expectedStatus = 0) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return result;
}

function git(cwd, ...args) {
  return run(cwd, "git", args);
}

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "protected-snapshot-"));
  mkdirSync(resolve(root, "app/scripts"), { recursive: true });
  cpSync(scriptPath, resolve(root, "app/scripts/snapshot-visual-dirty-state.mjs"));
  for (const path of protectedPaths) {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    writeFileSync(resolve(root, path), `initial:${path}\n`);
  }
  git(root, "init", "-q");
  git(root, "config", "user.email", "test@example.test");
  git(root, "config", "user.name", "Guard Test");
  git(root, "add", ...protectedPaths);
  git(root, "commit", "-qm", "initial");
  return root;
}

function guard(root, mode, expectedStatus = 0) {
  return run(
    root,
    process.execPath,
    ["app/scripts/snapshot-visual-dirty-state.mjs", mode, "snapshot.json"],
    expectedStatus,
  );
}

test("capture is exclusive and unchanged state verifies", () => {
  const root = fixture();
  guard(root, "capture");
  guard(root, "verify");
  assert.match(guard(root, "capture", 1).stderr, /exist/i);
});

test("verify detects a protected HEAD blob change", () => {
  const root = fixture();
  guard(root, "capture");
  writeFileSync(resolve(root, protectedPaths[0]), "committed change\n");
  git(root, "add", protectedPaths[0]);
  git(root, "commit", "-qm", "change protected file");
  assert.match(guard(root, "verify", 1).stderr, /headBlob changed/);
});

test("verify detects protected index and status changes", () => {
  const root = fixture();
  writeFileSync(resolve(root, protectedPaths[0]), "dirty before capture\n");
  guard(root, "capture");
  git(root, "add", protectedPaths[0]);
  const failure = guard(root, "verify", 1).stderr;
  assert.match(failure, /index changed/);
  assert.match(failure, /porcelainV2Base64 changed/);
});

test("verify detects protected worktree mutation", () => {
  const root = fixture();
  guard(root, "capture");
  writeFileSync(resolve(root, protectedPaths[1]), "worktree change\n");
  assert.match(guard(root, "verify", 1).stderr, /worktreeSha256 changed/);
});

test("verify detects creation and staging of the protected untracked path", () => {
  const root = fixture();
  guard(root, "capture");
  const untracked = "app/scripts/verify-preview-fix.mjs";
  writeFileSync(resolve(root, untracked), "export {};\n");
  assert.match(guard(root, "verify", 1).stderr, /porcelainV2Base64 changed/);
  git(root, "add", untracked);
  assert.match(guard(root, "verify", 1).stderr, /index changed/);
});

test("malformed snapshot cannot verify successfully", () => {
  const root = fixture();
  writeFileSync(resolve(root, "snapshot.json"), JSON.stringify({ schemaVersion: 1 }));
  assert.match(guard(root, "verify", 1).stderr, /Malformed/);
});
