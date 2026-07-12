#!/usr/bin/env node
/**
 * Frozen-modules advisory gate.
 *
 * Reads docs/decisions/allowed-primary-destinations.json and warns when
 * the working tree touches any path under a frozen module without the
 * `frozen-exception:` prefix in the latest commit message. The gate is
 * advisory (exit 0) — it surfaces the touch so a human reviewer can
 * confirm it is a critical fix, not feature expansion.
 *
 * Usage:
 *   node app/scripts/check-frozen-modules.mjs                # uses git HEAD
 *   node app/scripts/check-frozen-modules.mjs --head <ref>   # custom ref
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
  const args = { head: "HEAD" };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--head") {
      args.head = argv[i + 1] ?? "HEAD";
      i += 1;
    } else if (token === "--help" || token === "-h") {
      console.log(
        "Usage: node app/scripts/check-frozen-modules.mjs [--head <git-ref>]"
      );
      process.exit(0);
    }
  }
  return args;
}

function readManifest() {
  if (!existsSync(manifestPath)) {
    console.warn(
      `FROZEN-MODULES: manifest not found at ${manifestPath}; skipping.`
    );
    return null;
  }
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

function changedFilesInHead(head) {
  // Compare against the commit's parent. For merge commits or root commits,
  // fall back to a single-commit diff.
  try {
    const out = execSync(`git diff --name-only ${head}^..${head} 2>/dev/null || git show --name-only --pretty=format: ${head}`, {
      cwd: repoRoot,
      encoding: "utf8",
    });
    return out
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    console.warn(
      `FROZEN-MODULES: could not read git diff for ${head}: ${error?.message ?? error}`
    );
    return [];
  }
}

function latestCommitMessage(head) {
  try {
    return execSync(`git log -1 --pretty=%B ${head}`, {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = readManifest();
  if (!manifest) return;

  const frozen = Array.isArray(manifest.frozenModules)
    ? manifest.frozenModules
    : [];
  const frozenPaths = frozen.flatMap((entry) =>
    (entry.paths ?? []).map((p) => ({ id: entry.id, path: p }))
  );

  if (frozenPaths.length === 0) {
    console.log("FROZEN-MODULES: no frozen paths declared; nothing to check.");
    return;
  }

  const changed = changedFilesInHead(args.head);
  const message = latestCommitMessage(args.head);
  const hasException = /^frozen-exception:/im.test(message);

  const hits = [];
  for (const file of changed) {
    for (const candidate of frozenPaths) {
      const rel = file.replace(/^app\//, ""); // manifest paths are app-relative
      if (rel === candidate.path || rel.startsWith(`${candidate.path}/`)) {
        hits.push({ id: candidate.id, path: rel });
      }
    }
  }

  if (hits.length === 0) {
    console.log(
      `FROZEN-MODULES: no frozen paths touched by ${args.head}.`
    );
    return;
  }

  for (const hit of hits) {
    console.warn(
      `FROZEN-MODULES (advisory): ${hit.path} is part of frozen module "${hit.id}". Only critical fixes are allowed during the convergence freeze.`
    );
  }

  if (!hasException) {
    console.warn(
      "FROZEN-MODULES: commit does not contain a `frozen-exception:` line. If this is a critical fix, document why in the commit message with that prefix."
    );
  } else {
    console.warn(
      "FROZEN-MODULES: commit carries `frozen-exception:` — reviewer to confirm the justification."
    );
  }
}

main();
