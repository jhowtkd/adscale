#!/usr/bin/env node
/**
 * Anti-expansion gate for the convergence milestone (Phase 0, step 5).
 *
 * This is a REAL gate. It exits non-zero when the working tree introduces
 * any new creative surface during the freeze.
 *
 * How it works (Gate 0 round 2):
 *
 * The frozen snapshot lives in docs/decisions/allowed-primary-destinations.json
 * under `snapshots`. The gate reads the snapshot from the **base ref**
 * (default origin/main), NOT from the PR's own checkout — otherwise a
 * PR could add a new route AND update the snapshot in the same commit
 * and the gate would silently pass.
 *
 * It then walks the current tree and reports any of:
 *   1. new top-level dashboard route group under src/app/(dashboard)/
 *   2. new dashboard page/route file (any depth)
 *   3. new top-level API route tree under src/app/api/
 *   4. new nested API route tree (e.g. src/app/api/assistant/<new>/
 *      with its own route.ts where none existed at base)
 *   5. new .ts/.tsx file under src/server/ai/ (the heuristic filter is
 *      GONE — every new file in the creative-pipeline directory is
 *      flagged; name-matching games cannot bypass)
 *
 * Security: every git invocation uses execFileSync with an argument
 * array. The --base ref cannot inject shell commands.
 *
 * Usage:
 *   node app/scripts/check-primary-destinations.mjs                # enforce vs origin/main
 *   node app/scripts/check-primary-destinations.mjs --base main    # enforce vs main
 *   node app/scripts/check-primary-destinations.mjs --init-snapshot # bootstrap
 *
 * Plano de convergência, Fase 0, passo 5.
 */
import { execFileSync } from "node:child_process";
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { dirname, resolve, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const appDir = resolve(repoRoot, "app");
const manifestPath = resolve(
  repoRoot,
  "docs/decisions/allowed-primary-destinations.json"
);
const DEFAULT_BASE = "origin/main";

function parseArgs(argv) {
  const args = { initSnapshot: false, base: DEFAULT_BASE };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--init-snapshot") {
      args.initSnapshot = true;
    } else if (token === "--base") {
      args.base = argv[i + 1] ?? DEFAULT_BASE;
      i += 1;
    } else if (token === "--help" || token === "-h") {
      console.log(
        "Usage: node app/scripts/check-primary-destinations.mjs [--base <ref> | --init-snapshot]"
      );
      process.exit(0);
    }
  }
  return args;
}

/**
 * Run git with an argument array (no shell interpolation).
 */
function git(args, { fatal = true } = {}) {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: fatal ? "pipe" : ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    if (fatal) {
      const stderr = error?.stderr?.toString?.() ?? "";
      console.error(
        `PRIMARY-DESTINATIONS: git ${args.join(" ")} failed: ${error?.message ?? error}${stderr ? ` (${stderr.trim()})` : ""}`
      );
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Read the manifest JSON from the base ref. Returns { manifest, present }.
 * `present` is false when the base ref doesn't carry the manifest yet —
 * which is the legitimate bootstrap case for the FIRST convergence PR.
 * Callers decide how to handle that case.
 */
function readBaseManifest(base) {
  try {
    git(["rev-parse", "--verify", base], { fatal: false });
  } catch {
    console.error(
      `PRIMARY-DESTINATIONS: base ref "${base}" not found locally. Run "git fetch" or pass --base <local-ref>.`
    );
    process.exit(1);
  }
  const manifestRel = "docs/decisions/allowed-primary-destinations.json";
  try {
    const blob = git(["show", `${base}:${manifestRel}`], { fatal: false });
    return { manifest: JSON.parse(blob), present: true };
  } catch {
    return { manifest: null, present: false };
  }
}

function listDashboardRouteGroups() {
  const dashboardDir = resolve(appDir, "src/app/(dashboard)");
  if (!existsSync(dashboardDir)) return [];
  return readdirSync(dashboardDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function listApiRouteTrees() {
  const apiDir = resolve(appDir, "src/app/api");
  if (!existsSync(apiDir)) return [];
  return readdirSync(apiDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Recursively collect page/route file paths under a directory, relative
 * POSIX paths. Captures nested files, not just top-level groups.
 */
function listPageRouteFilesUnder(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  const visit = (d, depth) => {
    if (depth > 10) return;
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        visit(full, depth + 1);
      } else if (
        entry.isFile() &&
        (entry.name === "page.tsx" ||
          entry.name === "page.ts" ||
          entry.name === "route.ts")
      ) {
        out.push(relative(dir, full).split(sep).join("/"));
      }
    }
  };
  visit(dir, 0);
  return out.sort();
}

/**
 * List EVERY .ts/.tsx file under a directory. The round-2 gate does not
 * use a name heuristic — any new file in the creative-pipeline directory
 * is flagged, so naming games can't bypass it.
 */
function listAllSourceFilesUnder(dir, { maxDepth = 8 } = {}) {
  if (!existsSync(dir)) return [];
  const out = [];
  const visit = (d, depth) => {
    if (depth > maxDepth) return;
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        visit(full, depth + 1);
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
      ) {
        out.push(relative(dir, full).split(sep).join("/"));
      }
    }
  };
  visit(dir, 0);
  return out.sort();
}

function asSet(value) {
  return new Set(Array.isArray(value) ? value : []);
}

function diff(current, snapshot) {
  const snapshotSet = asSet(snapshot);
  return current.filter((name) => !snapshotSet.has(name));
}

function readManifestFromWorkingTree() {
  if (!existsSync(manifestPath)) {
    console.error(
      `PRIMARY-DESTINATIONS: manifest not found at ${manifestPath}. Run from repo root.`
    );
    process.exit(1);
  }
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    console.error(
      `PRIMARY-DESTINATIONS: manifest is not valid JSON: ${error?.message ?? error}`
    );
    process.exit(1);
  }
}

function validateManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== "object") {
    return ["manifest must be a JSON object."];
  }
  if (manifest.schemaVersion !== 1) {
    errors.push(
      `manifest.schemaVersion must equal 1 (got ${String(manifest.schemaVersion)}).`
    );
  }
  if (!Array.isArray(manifest.allowedPrimaryDestinations)) {
    return ["manifest.allowedPrimaryDestinations must be an array."];
  }
  if (manifest.allowedPrimaryDestinations.length === 0) {
    errors.push(
      "manifest.allowedPrimaryDestinations must list at least one allowed destination."
    );
  }
  const seenIds = new Set();
  for (const entry of manifest.allowedPrimaryDestinations) {
    if (!entry || typeof entry !== "object") {
      errors.push(`entry is not an object: ${JSON.stringify(entry)}`);
      continue;
    }
    for (const requiredField of ["id", "kind", "description"]) {
      if (!entry[requiredField]) {
        errors.push(
          `entry missing required field "${requiredField}": ${JSON.stringify(entry)}`
        );
      }
    }
    if (entry.id && seenIds.has(entry.id)) {
      errors.push(`duplicate allowedPrimaryDestinations id: ${entry.id}`);
    }
    if (entry.id) seenIds.add(entry.id);
  }
  return errors;
}

function buildCurrentSnapshot() {
  const dashboardDir = resolve(appDir, "src/app/(dashboard)");
  const apiDir = resolve(appDir, "src/app/api");
  const aiDir = resolve(appDir, "src/server/ai");
  return {
    dashboardRouteGroups: listDashboardRouteGroups(),
    dashboardPageFiles: listPageRouteFilesUnder(dashboardDir),
    apiRouteTrees: listApiRouteTrees(),
    apiRouteFiles: listPageRouteFilesUnder(apiDir),
    serverAiModules: listAllSourceFilesUnder(aiDir),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const workingManifest = readManifestFromWorkingTree();
  const manifestErrors = validateManifest(workingManifest);
  if (manifestErrors.length > 0) {
    for (const error of manifestErrors) {
      console.error(`PRIMARY-DESTINATIONS: ${error}`);
    }
    process.exit(1);
  }

  const current = buildCurrentSnapshot();

  // Bootstrap mode: capture the working tree as the snapshot.
  if (args.initSnapshot) {
    workingManifest.snapshots = {
      ...current,
      capturedAt: new Date().toISOString(),
    };
    writeFileSync(manifestPath, `${JSON.stringify(workingManifest, null, 2)}\n`);
    console.log(
      `PRIMARY-DESTINATIONS: snapshot initialized at ${manifestPath} ` +
        `(dashboard groups: ${current.dashboardRouteGroups.length}, dashboard pages: ${current.dashboardPageFiles.length}, api trees: ${current.apiRouteTrees.length}, api routes: ${current.apiRouteFiles.length}, ai modules: ${current.serverAiModules.length}).`
    );
    console.log(
      "PRIMARY-DESTINATIONS: commit this manifest. The gate enforces from the base ref's snapshot, not this one."
    );
    return;
  }

  // Enforce: snapshot comes from BASE, not from the PR's own manifest.
  const { manifest: baseManifest, present: baseHasManifest } =
    readBaseManifest(args.base);

  if (!baseHasManifest) {
    // Bootstrap case: base doesn't have the manifest yet. This is the
    // legitimate state during the FIRST convergence PR that introduces
    // the freeze. We CANNOT enforce against a non-existent snapshot,
    // and silently passing would be unsafe. Fail closed with a clear
    // bootstrap instruction.
    console.error(
      `PRIMARY-DESTINATIONS: base ref "${args.base}" does not contain docs/decisions/allowed-primary-destinations.json.`
    );
    console.error(
      "PRIMARY-DESTINATIONS: this is expected ONLY for the first convergence PR that bootstraps the freeze. To proceed:"
    );
    console.error(
      "  1. On the base branch, run `node app/scripts/check-primary-destinations.mjs --init-snapshot`, commit the manifest, and merge."
    );
    console.error(
      "  2. Subsequent PRs will enforce against that base snapshot automatically."
    );
    console.error(
      "  3. For the bootstrap PR itself, set PRIMARY_DESTINATIONS_ALLOW_BOOTSTRAP=1 to acknowledge the one-time bypass."
    );
    if (process.env.PRIMARY_DESTINATIONS_ALLOW_BOOTSTRAP === "1") {
      console.warn(
        "PRIMARY-DESTINATIONS (advisory): PRIMARY_DESTINATIONS_ALLOW_BOOTSTRAP=1 set. Bootstrap bypass active. Reviewer must confirm this is the legit freeze-bootstrap PR."
      );
      return;
    }
    process.exit(1);
  }

  if (!baseManifest.snapshots) {
    console.error(
      `PRIMARY-DESTINATIONS: base ref "${args.base}" manifest has no \`snapshots\` block. Bootstrap on base first (--init-snapshot), merge that, then enforce.`
    );
    process.exit(1);
  }
  const base = baseManifest.snapshots;

  const failures = [];

  const newDashboardGroups = diff(
    current.dashboardRouteGroups,
    base.dashboardRouteGroups
  );
  if (newDashboardGroups.length > 0) {
    failures.push(
      `new top-level dashboard route group(s): ${newDashboardGroups.join(", ")}.`
    );
  }

  const newDashboardPages = diff(
    current.dashboardPageFiles,
    base.dashboardPageFiles
  );
  if (newDashboardPages.length > 0) {
    failures.push(
      `new dashboard page/route file(s): ${newDashboardPages.join(", ")}. A new dashboard page would re-introduce a competing creative journey.`
    );
  }

  const newApiTrees = diff(current.apiRouteTrees, base.apiRouteTrees);
  if (newApiTrees.length > 0) {
    failures.push(
      `new top-level API route tree(s): ${newApiTrees.join(", ")}.`
    );
  }

  const newApiRoutes = diff(current.apiRouteFiles, base.apiRouteFiles);
  if (newApiRoutes.length > 0) {
    failures.push(
      `new API route file(s) (incl. nested): ${newApiRoutes.join(", ")}. Nested routes under an existing tree are still expansion and require an exception.`
    );
  }

  const newAiModules = diff(current.serverAiModules, base.serverAiModules);
  if (newAiModules.length > 0) {
    failures.push(
      `new file(s) under src/server/ai/: ${newAiModules.join(
        ", "
      )}. Any new file in the creative-pipeline directory is flagged (no name heuristic). Route through the canonical pipeline (Fase 3) or add an approved exception.`
    );
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`PRIMARY-DESTINATIONS: ${failure}`);
    }
    console.error(
      `PRIMARY-DESTINATIONS: gate failed (base ref: ${args.base}). The freeze snapshot on base must be updated through an APPROVED exception, not on this PR.`
    );
    process.exit(1);
  }

  console.log(
    `PRIMARY-DESTINATIONS: no expansion detected vs base "${args.base}". ` +
      `${current.dashboardRouteGroups.length} dashboard group(s); ${current.dashboardPageFiles.length} dashboard page(s); ${current.apiRouteTrees.length} api tree(s); ${current.apiRouteFiles.length} api route(s); ${current.serverAiModules.length} ai module(s).`
  );
}

main();
