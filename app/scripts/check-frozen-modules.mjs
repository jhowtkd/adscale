#!/usr/bin/env node
/**
 * Frozen-modules gate (Phase 0, step 2).
 *
 * Reads docs/decisions/allowed-primary-destinations.json and FAILS
 * (non-zero) when the working tree touches any path under a frozen
 * module without a `frozen-exception:` line in the commit message
 * that justifies the change.
 *
 * This is a hard gate, not advisory. A frozen module may only receive
 * critical fixes during the convergence milestone. The exception line
 * must appear (anywhere) in the commit body so a reviewer can see why.
 *
 * Usage:
 *   node app/scripts/check-frozen-modules.mjs                # checks HEAD
 *   node app/scripts/check-frozen-modules.mjs --head <ref>   # custom ref
 *   node app/scripts/check-frozen-modules.mjs --working-tree # checks HEAD..working tree
 *
 * Plano de convergência, Fase 0, passo 2.
 */
import { execSync } from "node:child_process";
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
  const args = { head: "HEAD", workingTree: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--head") {
      args.head = argv[i + 1] ?? "HEAD";
      args.workingTree = false;
      i += 1;
    } else if (token === "--working-tree") {
      args.workingTree = true;
    } else if (token === "--help" || token === "-h") {
      console.log(
        "Usage: node app/scripts/check-frozen-modules.mjs [--head <git-ref> | --working-tree]"
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

function changedFilesFromCommit(head) {
  try {
    const out = execSync(
      `git diff --name-only ${head}^..${head} 2>/dev/null || git show --name-only --pretty=format: ${head}`,
      { cwd: repoRoot, encoding: "utf8" }
    );
    return out
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    console.error(
      `FROZEN-MODULES: could not read git diff for ${head}: ${error?.message ?? error}`
    );
    process.exit(1);
  }
}

function changedFilesFromWorkingTree() {
  try {
    // Staged + unstaged against HEAD. Does not include untracked files
    // (we don't freeze by addition; check-primary-destinations handles that).
    const out = execSync("git diff --name-only HEAD", {
      cwd: repoRoot,
      encoding: "utf8",
    });
    return out
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    console.error(
      `FROZEN-MODULES: could not read working-tree diff: ${error?.message ?? error}`
    );
    process.exit(1);
  }
}

function commitMessage(head) {
  try {
    return execSync(`git log -1 --pretty=%B ${head}`, {
      cwd: repoRoot,
      encoding: "utf8",
    });
  } catch {
    return "";
  }
}

function matchFrozenPath(relFilePath, frozenPaths) {
  // Manifest paths are app-relative (e.g. "src/server/ai/landing-page.ts").
  // Git paths may be app-prefixed ("app/src/server/ai/landing-page.ts").
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

  const changed = args.workingTree
    ? changedFilesFromWorkingTree()
    : changedFilesFromCommit(args.head);

  const hits = [];
  for (const file of changed) {
    const match = matchFrozenPath(file, frozenPaths);
    if (match) hits.push({ id: match.id, gitPath: file });
  }

  if (hits.length === 0) {
    console.log(
      `FROZEN-MODULES: no frozen paths touched${
        args.workingTree ? " in working tree" : ` by ${args.head}`
      }.`
    );
    return;
  }

  const message = args.workingTree ? "" : commitMessage(args.head);
  const hasException = /^frozen-exception:/im.test(message);

  for (const hit of hits) {
    console.error(
      `FROZEN-MODULES: ${hit.gitPath} is part of frozen module "${hit.id}". Only critical fixes are allowed during the convergence freeze.`
    );
  }

  if (args.workingTree) {
    console.error(
      "FROZEN-MODULES: working-tree change touches frozen module(s). Stage into a commit whose message contains a `frozen-exception:` line justifying the critical fix, or revert the change."
    );
    process.exit(1);
  }

  if (!hasException) {
    console.error(
      `FROZEN-MODULES: commit ${args.head} touches frozen module(s) without a \`frozen-exception:\` line. Amend the commit message with that prefix and a one-line justification, or revert.`
    );
    process.exit(1);
  }

  // Exception present: warn but pass. Reviewer must confirm the fix is critical.
  console.error(
    `FROZEN-MODULES: commit ${args.head} carries \`frozen-exception:\` — proceeding, but reviewer must confirm the justification is a critical fix.`
  );
}

main();
