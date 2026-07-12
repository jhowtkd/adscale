#!/usr/bin/env node
/**
 * Anti-expansion gate for the convergence milestone (Phase 0, step 5).
 *
 * This is a REAL gate. It exits non-zero when the working tree introduces
 * any of the following during the freeze:
 *
 *   1. A new top-level dashboard route group under src/app/(dashboard)/
 *      not present in the frozen snapshot.
 *   2. A new dashboard page/route file (page.tsx/page.ts/route.ts) not
 *      present in the frozen snapshot. Settings/admin/library/etc. are
 *      captured at bootstrap and therefore permitted; only NEW pages
 *      added after the freeze fail.
 *   3. A new top-level API route tree under src/app/api/* not present
 *      in the frozen snapshot (e.g. src/app/api/newsletter/). New routes
 *      inside an existing allowlisted tree are permitted.
 *   4. A new generator-style module under src/server/ai/ not present in
 *      the frozen snapshot and matching the pipeline-name heuristic.
 *
 * Snapshots live in docs/decisions/allowed-primary-destinations.json
 * under `snapshots` (frozen lists captured at Gate 0). The gate diffs
 * the current tree against those lists. Items missing from the snapshot
 * are filled in lazily ONLY when --init-snapshot is passed, so the gate
 * can be bootstrapped once and then enforced.
 *
 * Usage:
 *   node app/scripts/check-primary-destinations.mjs                # enforce
 *   node app/scripts/check-primary-destinations.mjs --init-snapshot # bootstrap
 *
 * Plano de convergência, Fase 0, passo 5.
 */
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

function parseArgs(argv) {
  const args = { initSnapshot: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--init-snapshot") {
      args.initSnapshot = true;
    } else if (token === "--help" || token === "-h") {
      console.log(
        "Usage: node app/scripts/check-primary-destinations.mjs [--init-snapshot]"
      );
      process.exit(0);
    }
  }
  return args;
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
  // Top-level subtrees under src/app/api (e.g. campaigns, derivations,
  // assistant, creative-work, templates, ...). A new subtree here means
  // a new resource family appeared.
  const apiDir = resolve(appDir, "src/app/api");
  if (!existsSync(apiDir)) return [];
  return readdirSync(apiDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function listServerAiModules() {
  const aiDir = resolve(appDir, "src/server/ai");
  if (!existsSync(aiDir)) return [];
  return readdirSync(aiDir).filter((f) => f.endsWith(".ts")).sort();
}

/**
 * Recursively collect page/route file paths under a Next.js app directory.
 * Each entry is the relative path from that directory (POSIX separators).
 * Used to detect NEW page/route files added after the freeze snapshot —
 * not to ban pages outside allowlisted groups (settings/admin/etc. are
 * legitimate app-shell pages, not creative journeys).
 */
function listPageRouteFilesUnder(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  const visit = (d, depth) => {
    if (depth > 8) return;
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

const PIPELINE_HEURISTIC =
  /^(generate|build|run|create|produce|derive|orchestrate|synthesize|render).*(pipeline|flow|engine|generator|chain)\./;

function looksLikeNewCreativePipeline(fileName) {
  return PIPELINE_HEURISTIC.test(fileName);
}

function asSet(value) {
  return new Set(Array.isArray(value) ? value : []);
}

function diff(current, snapshot) {
  const snapshotSet = asSet(snapshot);
  return current.filter((name) => !snapshotSet.has(name));
}

function readManifest() {
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = readManifest();
  const manifestErrors = validateManifest(manifest);
  if (manifestErrors.length > 0) {
    for (const error of manifestErrors) {
      console.error(`PRIMARY-DESTINATIONS: ${error}`);
    }
    process.exit(1);
  }

  const snapshots = manifest.snapshots ?? {};

  const dashboardDir = resolve(appDir, "src/app/(dashboard)");
  const currentDashboardGroups = listDashboardRouteGroups();
  const currentApiTrees = listApiRouteTrees();
  const currentAiModules = listServerAiModules();
  const currentDashboardPages = listPageRouteFilesUnder(dashboardDir);

  const newDashboardGroups = diff(
    currentDashboardGroups,
    snapshots.dashboardRouteGroups
  );
  const newApiTrees = diff(currentApiTrees, snapshots.apiRouteTrees);
  const newAiModules = diff(currentAiModules, snapshots.serverAiModules).filter(
    looksLikeNewCreativePipeline
  );
  const newDashboardPages = diff(
    currentDashboardPages,
    snapshots.dashboardPageFiles
  );

  // Bootstrap mode: capture the current state as the frozen snapshot.
  if (args.initSnapshot) {
    manifest.snapshots = {
      dashboardRouteGroups: currentDashboardGroups,
      dashboardPageFiles: currentDashboardPages,
      apiRouteTrees: currentApiTrees,
      serverAiModules: currentAiModules,
      capturedAt: new Date().toISOString(),
    };
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(
      `PRIMARY-DESTINATIONS: snapshot initialized at ${manifestPath} ` +
        `(dashboard groups: ${currentDashboardGroups.length}, dashboard pages: ${currentDashboardPages.length}, api trees: ${currentApiTrees.length}, ai modules: ${currentAiModules.length}).`
    );
    console.log(
      "PRIMARY-DESTINATIONS: commit this manifest. From now on the gate will reject new entries."
    );
    return;
  }

  if (!manifest.snapshots) {
    console.error(
      "PRIMARY-DESTINATIONS: manifest has no `snapshots` block. Run with --init-snapshot first to capture the freeze point, commit, then enforce."
    );
    process.exit(1);
  }

  const failures = [];
  if (newDashboardGroups.length > 0) {
    failures.push(
      `new top-level dashboard route group(s): ${newDashboardGroups.join(
        ", "
      )}. Add to allowed-primary-destinations.json with an approved exception, or remove.`
    );
  }
  if (newApiTrees.length > 0) {
    failures.push(
      `new top-level API route tree(s): ${newApiTrees.join(
        ", "
      )}. Add to allowed-primary-destinations.json with an approved exception, or remove.`
    );
  }
  if (newAiModules.length > 0) {
    failures.push(
      `new generator-style module(s) under src/server/ai/: ${newAiModules.join(
        ", "
      )}. This looks like a new creative pipeline. Route through the canonical pipeline (Fase 3) instead, or add an approved exception.`
    );
  }
  if (newDashboardPages.length > 0) {
    failures.push(
      `new dashboard page/route file(s) not present at freeze: ${newDashboardPages.join(
        ", "
      )}. A new dashboard page would re-introduce a competing creative journey. Add to the snapshot with an approved exception, or route the work through an allowlisted destination.`
    );
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`PRIMARY-DESTINATIONS: ${failure}`);
    }
    console.error(
      "PRIMARY-DESTINATIONS: gate failed. Resolve the above or pass --init-snapshot only when bootstrapping."
    );
    process.exit(1);
  }

  console.log(
    `PRIMARY-DESTINATIONS: manifest valid; ${manifest.allowedPrimaryDestinations.length} destination(s) allowed; ` +
      `${currentDashboardGroups.length} dashboard group(s); ${currentDashboardPages.length} dashboard page(s); ${currentApiTrees.length} api tree(s); ${currentAiModules.length} ai module(s). No expansion detected.`
  );
}

main();
