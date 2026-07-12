#!/usr/bin/env node
/**
 * Frozen-modules gate (Phase 0, step 2).
 *
 * Reads docs/decisions/allowed-primary-destinations.json and FAILS
 * (non-zero) when ANY commit in the review range touches a path under
 * a frozen module without a `frozen-exception:` line in that commit's
 * message justifying the change.
 *
 * Review range (Gate 0 round 2):
 * - Default: merge-base(<base>, HEAD)..HEAD, where <base> defaults to
 *   origin/main. This catches frozen edits in ANY commit of the PR,
 *   not just the tip. Override with --base <ref>.
 * - Local-only mode: --range <since>..<until> for ad-hoc checks.
 *
 * This is a hard gate. A frozen module may only receive critical fixes
 * during the convergence milestone. The exception line must appear in
 * the body of the commit that touches the frozen file, so a reviewer
 * can see why.
 *
 * Security: all git invocations use execFileSync with argument arrays,
 * never interpolated shell strings — refs from --base / --range cannot
 * inject commands.
 *
 * Usage:
 *   node app/scripts/check-frozen-modules.mjs                       # merge-base(origin/main)..HEAD
 *   node app/scripts/check-frozen-modules.mjs --base main           # merge-base(main..HEAD)
 *   node app/scripts/check-frozen-modules.mjs --range abc123..def456
 *
 * Plano de convergência, Fase 0, passo 2.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const manifestPath = resolve(
  repoRoot,
  "docs/decisions/allowed-primary-destinations.json"
);

function parseArgs(argv) {
  const args = { base: "origin/main", range: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--base") {
      args.base = argv[i + 1] ?? "origin/main";
      args.range = null;
      i += 1;
    } else if (token === "--range") {
      args.range = argv[i + 1] ?? null;
      i += 1;
    } else if (token === "--help" || token === "-h") {
      console.log(
        "Usage: node app/scripts/check-frozen-modules.mjs [--base <ref> | --range <since>..<until>]"
      );
      process.exit(0);
    }
  }
  return args;
}

function readManifest() {
  if (!existsSync(manifestPath)) {
    console.error(`FROZEN-MODULES: manifest not found at ${manifestPath}.`);
    process.exit(1);
  }
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    console.error(
      `FROZEN-MODULES: manifest is not valid JSON: ${error?.message ?? error}`
    );
    process.exit(1);
  }
}

/**
 * Run git with argument array (no shell interpolation). Throws on
 * non-zero exit; callers decide whether to treat as fatal.
 */
function git(args, { fatal = true } = {}) {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: fatal ? "pipe" : ["pipe", "pipe", "pipe"],
    }).toString();
  } catch (error) {
    if (fatal) {
      const stderr = error?.stderr?.toString?.() ?? "";
      console.error(
        `FROZEN-MODULES: git ${args.join(" ")} failed: ${error?.message ?? error}${stderr ? ` (${stderr.trim()})` : ""}`
      );
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Resolve the review range.
 *   --range X..Y -> [X, Y]
 *   --base B     -> [merge-base(B, HEAD), HEAD]
 *
 * Using merge-base (not B directly) means only commits unique to the
 * branch are inspected; long-lived branches don't get penalized for
 * ancient history.
 */
function resolveRange(args) {
  if (args.range) {
    const match = /^(.+?)\.\.(.+)$/.exec(args.range);
    if (!match) {
      console.error(
        `FROZEN-MODULES: invalid --range. Expected <since>..<until>, got "${args.range}".`
      );
      process.exit(2);
    }
    return { since: match[1], until: match[2] };
  }
  const base = args.base;
  // Confirm the base ref exists locally (origin/main is fetched by CI).
  try {
    git(["rev-parse", "--verify", base], { fatal: false });
  } catch {
    console.error(
      `FROZEN-MODULES: base ref "${base}" not found. Run "git fetch" or pass --base <local-ref>.`
    );
    process.exit(1);
  }
  const mergeBase = git(["merge-base", base, "HEAD"]).trim();
  if (!mergeBase) {
    console.error(
      `FROZEN-MODULES: could not compute merge-base(${base}, HEAD).`
    );
    process.exit(1);
  }
  return { since: mergeBase, until: "HEAD" };
}

/**
 * Enumerate the commits in range and the files each one touched. Each
 * returned entry has { sha, files[], message } so we can check the
 * exception clause PER COMMIT (not globally).
 */
function commitsInRange(since, until) {
  // %x00 is a NUL separator; %x1f is unit separator. Robust against
  // commit messages containing newlines or any printable character.
  const raw = git([
    "log",
    `--format=%H%x1f%B%x00`, // hash, US, full body, NUL
    `${since}..${until}`,
  ]);
  const commits = [];
  for (const chunk of raw.split("\0")) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const [sha, ...bodyParts] = trimmed.split("\x1f");
    if (!sha) continue;
    const body = bodyParts.join("\x1f");
    const files = git([
      "diff-tree",
      "--no-commit-id",
      "--name-only",
      "-r",
      sha,
    ])
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    commits.push({ sha, files, message: body });
  }
  return commits;
}

function matchFrozenPath(relFilePath, frozenPaths) {
  // Manifest paths are app-relative; git paths may be app-prefixed.
  const rel = relFilePath.replace(/^app\//, "");
  return frozenPaths.find(
    (candidate) => rel === candidate.path || rel.startsWith(`${candidate.path}/`)
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = readManifest();
  const frozen = Array.isArray(manifest.frozenModules)
    ? manifest.frozenModules
    : [];
  if (frozen.length === 0) {
    console.log("FROZEN-MODULES: no frozen modules declared; nothing to check.");
    return;
  }
  const frozenPaths = frozen.flatMap((entry) =>
    (entry.paths ?? []).map((p) => ({ id: entry.id, path: p }))
  );

  const { since, until } = resolveRange(args);
  const commits = commitsInRange(since, until);

  if (commits.length === 0) {
    console.log(
      `FROZEN-MODULES: no commits in range ${since}..${until}; nothing to check.`
    );
    return;
  }

  const violations = [];
  for (const commit of commits) {
    const hits = [];
    for (const file of commit.files) {
      const match = matchFrozenPath(file, frozenPaths);
      if (match) hits.push({ id: match.id, gitPath: file });
    }
    if (hits.length === 0) continue;
    const hasException = /^frozen-exception:/im.test(commit.message);
    if (!hasException) {
      violations.push({
        sha: commit.sha.slice(0, 10),
        hits,
        messageFirstLine: commit.message.split("\n")[0].slice(0, 100),
      });
    }
  }

  if (violations.length === 0) {
    console.log(
      `FROZEN-MODULES: reviewed ${commits.length} commit(s) in ${since.slice(0, 10)}..${until.slice(0, 10)}; no freeze violations.`
    );
    return;
  }

  for (const v of violations) {
    for (const hit of v.hits) {
      console.error(
        `FROZEN-MODULES: ${hit.gitPath} (frozen module "${hit.id}") touched by commit ${v.sha} without \`frozen-exception:\` — "${v.messageFirstLine}".`
      );
    }
  }
  console.error(
    "FROZEN-MODULES: gate failed. Amend each offending commit with a `frozen-exception:` line justifying the critical fix, or revert the change."
  );
  process.exit(1);
}

main();
