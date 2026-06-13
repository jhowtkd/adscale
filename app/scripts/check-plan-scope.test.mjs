import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), "check-plan-scope.mjs");

function run(cwd, command, args, expectedStatus = 0) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return result;
}

function git(cwd, ...args) {
  return run(cwd, "git", args);
}

function fixture(allowlist = ["allowed.txt"]) {
  const root = mkdtempSync(resolve(tmpdir(), "plan-scope-"));
  mkdirSync(resolve(root, "app/scripts"), { recursive: true });
  mkdirSync(resolve(root, ".planning"), { recursive: true });
  cpSync(scriptPath, resolve(root, "app/scripts/check-plan-scope.mjs"));
  writeFileSync(resolve(root, "allowed.txt"), "allowed\n");
  writeFileSync(resolve(root, "other.txt"), "other\n");
  writeFileSync(
    resolve(root, ".planning/PLAN.md"),
    `---\nphase: test\nfiles_modified:\n${allowlist.map((path) => `  - ${path}`).join("\n")}\nautonomous: true\n---\n`,
  );
  git(root, "init", "-q");
  git(root, "config", "user.email", "test@example.test");
  git(root, "config", "user.name", "Guard Test");
  git(root, "add", "allowed.txt", "other.txt", ".planning/PLAN.md");
  git(root, "commit", "-qm", "initial");
  return root;
}

function guard(root, mode, expectedStatus = 0) {
  const args = ["app/scripts/check-plan-scope.mjs", mode, "--plan", "test-01"];
  if (mode === "begin") args.push("--plan-file", ".planning/PLAN.md");
  return run(root, process.execPath, args, expectedStatus);
}

function begin(root) {
  guard(root, "begin");
  assert.match(guard(root, "begin", 1).stderr, /exist/i);
}

function expectViolation(root, path) {
  assert.match(guard(root, "verify", 1).stderr, new RegExp(path.replace(".", "\\.")));
}

test("declared committed, staged, unstaged, deleted, renamed and untracked paths are allowed", () => {
  const paths = [
    "committed.txt",
    "staged.txt",
    "unstaged.txt",
    "deleted.txt",
    "renamed.txt",
    "renamed-new.txt",
    "untracked.txt",
  ];
  const root = fixture(paths);
  for (const path of paths.slice(0, 5)) writeFileSync(resolve(root, path), `${path}\n`);
  git(root, "add", ...paths.slice(0, 5));
  git(root, "commit", "-qm", "add declared fixtures");
  begin(root);

  writeFileSync(resolve(root, "committed.txt"), "committed change\n");
  git(root, "add", "committed.txt");
  git(root, "commit", "-qm", "declared commit");
  writeFileSync(resolve(root, "staged.txt"), "staged change\n");
  git(root, "add", "staged.txt");
  writeFileSync(resolve(root, "unstaged.txt"), "unstaged change\n");
  git(root, "rm", "-q", "deleted.txt");
  git(root, "mv", "renamed.txt", "renamed-new.txt");
  writeFileSync(resolve(root, "untracked.txt"), "untracked\n");
  guard(root, "verify");
});

for (const [name, mutate] of [
  ["committed", (root) => {
    writeFileSync(resolve(root, "other.txt"), "committed\n");
    git(root, "add", "other.txt");
    git(root, "commit", "-qm", "undeclared commit");
  }],
  ["staged", (root) => {
    writeFileSync(resolve(root, "other.txt"), "staged\n");
    git(root, "add", "other.txt");
  }],
  ["unstaged", (root) => writeFileSync(resolve(root, "other.txt"), "unstaged\n")],
  ["deleted", (root) => git(root, "rm", "-q", "other.txt")],
  ["renamed", (root) => git(root, "mv", "other.txt", "renamed.txt")],
  ["untracked", (root) => writeFileSync(resolve(root, "untracked.txt"), "new\n")],
]) {
  test(`verify rejects an undeclared ${name} path`, () => {
    const root = fixture();
    begin(root);
    mutate(root);
    expectViolation(root, "other.txt" === name ? name : name === "untracked" ? "untracked.txt" : "other.txt");
  });
}

test("plan parser failure cannot create a baseline", () => {
  const root = fixture();
  writeFileSync(resolve(root, ".planning/PLAN.md"), "---\nphase: test\n---\n");
  assert.match(guard(root, "begin", 1).stderr, /files_modified/);
});

test("malformed baseline cannot verify successfully", () => {
  const root = fixture();
  begin(root);
  const baselinePath = resolve(root, ".git/gsd-guards/test-01.json");
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  delete baseline.files;
  writeFileSync(baselinePath, JSON.stringify(baseline));
  assert.match(guard(root, "verify", 1).stderr, /Malformed/);
});
