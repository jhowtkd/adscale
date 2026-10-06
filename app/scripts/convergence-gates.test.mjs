import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const sourceScript = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "check-frozen-modules.mjs"
);
const primaryDestinationsScript = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "check-primary-destinations.mjs"
);

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function write(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function setupRepository() {
  const root = mkdtempSync(join(tmpdir(), "adscale-convergence-gate-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Convergence Gate Test"]);
  write(join(root, "README.md"), "temporary gate test repository\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "initial repository"]);

  const scriptPath = join(root, "app/scripts/check-frozen-modules.mjs");
  mkdirSync(dirname(scriptPath), { recursive: true });
  copyFileSync(sourceScript, scriptPath);

  write(
    join(root, "docs/decisions/allowed-primary-destinations.json"),
    JSON.stringify({
      frozenModules: [
        {
          id: "landing_page",
          paths: ["src/server/ai/landing-page.ts"],
        },
      ],
    })
  );
  write(join(root, "app/src/server/ai/landing-page.ts"), "export const value = 1;\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "bootstrap freeze"]);
  const base = git(root, ["rev-parse", "HEAD"]);
  git(root, ["update-ref", "refs/remotes/origin/main", base]);
  git(root, ["switch", "-c", "feature"]);
  return root;
}

function runGate(root, githubEnv = {}) {
  // CI runs these tests inside a pull_request job: never let its GitHub variables leak into the fixtures.
  const env = { ...process.env };
  delete env.GITHUB_EVENT_NAME;
  delete env.GITHUB_SHA;
  return spawnSync(
    process.execPath,
    ["app/scripts/check-frozen-modules.mjs", "--base", "origin/main"],
    { cwd: root, encoding: "utf8", env: { ...env, ...githubEnv } }
  );
}

/** GitHub's refs/pull/N/merge: a merge of the PR head into the base, authored by GitHub. */
function syntheticPullRequestMerge(root) {
  git(root, ["switch", "--detach", "origin/main"]);
  git(root, ["merge", "--no-ff", "feature", "-m", "Merge feature into main"]);
  return git(root, ["rev-parse", "HEAD"]);
}

function setupPrimaryRepository() {
  const root = mkdtempSync(join(tmpdir(), "adscale-primary-gate-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Primary Gate Test"]);
  const scriptPath = join(root, "app/scripts/check-primary-destinations.mjs");
  mkdirSync(dirname(scriptPath), { recursive: true });
  copyFileSync(primaryDestinationsScript, scriptPath);
  write(join(root, "app/src/server/ai/already-on-base.ts"), "export const existing = true;\n");
  write(join(root, "docs/decisions/allowed-primary-destinations.json"), JSON.stringify({
    schemaVersion: 1,
    allowedPrimaryDestinations: [{ id: "home", kind: "primary", description: "Home" }],
    snapshots: {
      dashboardRouteGroups: [], dashboardPageFiles: [], apiRouteTrees: [], apiRouteFiles: [], serverAiModules: [],
    },
  }));
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "base with stale snapshot"]);
  git(root, ["update-ref", "refs/remotes/origin/main", git(root, ["rev-parse", "HEAD"])]);
  git(root, ["switch", "-c", "feature"]);
  return root;
}

function runPrimaryGate(root) {
  return spawnSync(process.execPath, ["app/scripts/check-primary-destinations.mjs", "--base", "origin/main"], {
    cwd: root, encoding: "utf8",
  });
}

test("primary gate tolerates stale snapshot entries that already exist on base", () => {
  const root = setupPrimaryRepository();
  const result = runPrimaryGate(root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /snapshot drift/i);
});

test("primary gate accepts base API trees but rejects feature routes and trees", () => {
  const root = setupPrimaryRepository();
  write(join(root, "app/src/app/api/library/favorites/route.ts"), "export const GET = () => null;\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "route already on base"]);
  git(root, ["update-ref", "refs/remotes/origin/main", git(root, ["rev-parse", "HEAD"])]);
  const accepted = runPrimaryGate(root);
  assert.equal(accepted.status, 0, accepted.stderr);
  write(join(root, "app/src/app/api/library/new/route.ts"), "export const GET = () => null;\n");
  write(join(root, "app/src/app/api/expansion/route.ts"), "export const GET = () => null;\n");
  const rejected = runPrimaryGate(root);
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /new top-level API route tree\(s\): expansion/);
  assert.match(rejected.stderr, /library\/new\/route.ts/);
});

test("primary gate still rejects an AI module introduced by the feature", () => {
  const root = setupPrimaryRepository();
  write(join(root, "app/src/server/ai/feature-expansion.ts"), "export const expansion = true;\n");
  const result = runPrimaryGate(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /feature-expansion\.ts/);
});

test("frozen policy comes from base and cannot be emptied by the feature branch", () => {
  const root = setupRepository();
  write(
    join(root, "docs/decisions/allowed-primary-destinations.json"),
    JSON.stringify({ frozenModules: [] })
  );
  write(join(root, "app/src/server/ai/landing-page.ts"), "export const value = 2;\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "attempt to bypass freeze"]);

  const result = runGate(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /landing-page\.ts/);
  assert.match(result.stderr, /without `frozen-exception:`/);
});

test("frozen-exception requires a non-empty justification", () => {
  const root = setupRepository();
  write(join(root, "app/src/server/ai/landing-page.ts"), "export const value = 2;\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "critical patch", "-m", "frozen-exception:"]);

  const result = runGate(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /without `frozen-exception:`/);
});

test("frozen-exception with a justification permits the critical fix", () => {
  const root = setupRepository();
  write(join(root, "app/src/server/ai/landing-page.ts"), "export const value = 2;\n");
  git(root, ["add", "."]);
  git(root, [
    "commit",
    "-m",
    "critical patch",
    "-m",
    "frozen-exception: fixes workspace data exposure",
  ]);

  const result = runGate(root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /no freeze violations/);
});

test("initial bootstrap is explicit when the base has no frozen policy", () => {
  const root = setupRepository();
  const baseWithoutPolicy = git(root, ["rev-parse", "HEAD^"]);
  git(root, ["update-ref", "refs/remotes/origin/main", baseWithoutPolicy]);

  const result = spawnSync(
    process.execPath,
    ["app/scripts/check-frozen-modules.mjs", "--base", "origin/main"],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PRIMARY_DESTINATIONS_ALLOW_BOOTSTRAP: "1" },
    }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /bootstrap bypass accepted/);
});

test("merge conflict changes are checked against the first parent", () => {
  const root = setupRepository();
  git(root, ["switch", "-c", "side"]);
  write(join(root, "app/src/server/ai/landing-page.ts"), "export const value = 2;\n");
  git(root, ["add", "."]);
  git(root, [
    "commit",
    "-m",
    "side critical fix",
    "-m",
    "frozen-exception: fixes side-specific production failure",
  ]);

  git(root, ["switch", "feature"]);
  write(join(root, "app/src/server/ai/landing-page.ts"), "export const value = 3;\n");
  git(root, ["add", "."]);
  git(root, [
    "commit",
    "-m",
    "feature critical fix",
    "-m",
    "frozen-exception: fixes feature-specific production failure",
  ]);
  const merge = spawnSync("git", ["merge", "side", "--no-edit"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.notEqual(merge.status, 0, "fixture must produce a merge conflict");
  write(join(root, "app/src/server/ai/landing-page.ts"), "export const value = 4;\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "merge side"]);

  const result = runGate(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /merge side/);
  assert.match(result.stderr, /landing-page\.ts/);
});

test("a pull_request run inspects the PR head, not GitHub's synthetic merge", () => {
  const root = setupRepository();
  write(join(root, "app/src/server/ai/landing-page.ts"), "export const value = 2;\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "justified fix", "-m", "frozen-exception: fixes a production failure"]);
  const merge = syntheticPullRequestMerge(root);

  // Without the GitHub context the merge itself is a commit without an exception.
  assert.equal(runGate(root).status, 1);
  const result = runGate(root, { GITHUB_EVENT_NAME: "pull_request", GITHUB_SHA: merge });
  assert.equal(result.status, 0, result.stderr);
});

test("a pull_request run still rejects a PR commit without an exception", () => {
  const root = setupRepository();
  write(join(root, "app/src/server/ai/landing-page.ts"), "export const value = 2;\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "unjustified change"]);
  const merge = syntheticPullRequestMerge(root);

  const result = runGate(root, { GITHUB_EVENT_NAME: "pull_request", GITHUB_SHA: merge });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unjustified change/);
});

test("only GitHub's exact checkout is treated as the synthetic merge", () => {
  const root = setupRepository();
  write(join(root, "app/src/server/ai/landing-page.ts"), "export const value = 2;\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "justified fix", "-m", "frozen-exception: fixes a production failure"]);
  syntheticPullRequestMerge(root);

  const result = runGate(root, { GITHUB_EVENT_NAME: "pull_request", GITHUB_SHA: "0".repeat(40) });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Merge feature into main/);
});

test("bootstrap cannot bypass a malformed policy on the base", () => {
  const root = setupRepository();
  git(root, ["switch", "-c", "malformed-base", "origin/main"]);
  write(join(root, "docs/decisions/allowed-primary-destinations.json"), "{invalid\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "corrupt policy fixture"]);
  const malformedBase = git(root, ["rev-parse", "HEAD"]);
  git(root, ["update-ref", "refs/remotes/origin/main", malformedBase]);
  git(root, ["switch", "feature"]);

  const result = spawnSync(
    process.execPath,
    ["app/scripts/check-frozen-modules.mjs", "--base", "origin/main"],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PRIMARY_DESTINATIONS_ALLOW_BOOTSTRAP: "1" },
    }
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /invalid JSON/);
});
