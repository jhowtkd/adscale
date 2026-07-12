#!/usr/bin/env node
/**
 * Anti-expansion gate for the convergence milestone (Phase 0, step 5).
 *
 * What this script enforces:
 *
 * 1. The allowlist manifest at docs/decisions/allowed-primary-destinations.json
 *    is valid: schemaVersion, at least one allowedPrimaryDestinations entry,
 *    and every entry has an id, kind and description.
 *
 * 2. No NEW dashboard route group is introduced under
 *    src/app/(dashboard)/ beyond what already existed at the freeze point.
 *    New top-level dashboards would silently re-introduce competing
 *    journeys, which is exactly what the convergence milestone forbids.
 *
 * 3. No NEW top-level generator module appears under src/server/ai/ that
 *    looks like a creative pipeline (heuristics: file name starts with a
 *    generator verb and isn't on the frozen list). The intent is to flag,
 *    not to be perfectly precise — the gate is advisory for new files
 *    (exit 0 unless the manifest is broken), and a human reviews flagged
 *    items at PR time.
 *
 * The script is read-only. It writes nothing. It exits non-zero only when
 * the allowlist itself is broken or when a new top-level dashboard route
 * group has appeared. New files inside existing routes are surfaced as
 * informational warnings, not failures, because they may be legitimate.
 *
 * Usage:
 *   node app/scripts/check-primary-destinations.mjs
 *   node app/scripts/check-primary-destinations.mjs --manifest <path>
 *
 * Plano de convergência, Fase 0, passo 5.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const defaultManifestPath = resolve(
  repoRoot,
  "docs/decisions/allowed-primary-destinations.json"
);

function parseArgs(argv) {
  const args = { manifestPath: defaultManifestPath };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--manifest") {
      args.manifestPath = resolve(argv[i + 1] ?? "");
      i += 1;
    } else if (token === "--help" || token === "-h") {
      console.log(
        "Usage: node app/scripts/check-primary-destinations.mjs [--manifest PATH]"
      );
      process.exit(0);
    }
  }
  return args;
}

function fail(errors) {
  for (const error of errors) {
    console.error(`PRIMARY-DESTINATIONS: ${error}`);
  }
  process.exitCode = 1;
}

function warn(message) {
  console.warn(`PRIMARY-DESTINATIONS (advisory): ${message}`);
}

function listDashboardRouteGroups() {
  const dashboardDir = resolve(repoRoot, "app/src/app/(dashboard)");
  if (!existsSync(dashboardDir)) return [];
  return readdirSync(dashboardDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function listServerAiModules() {
  const aiDir = resolve(repoRoot, "app/src/server/ai");
  if (!existsSync(aiDir)) return [];
  return readdirSync(aiDir).filter((entry) => entry.endsWith(".ts"));
}

/**
 * Dashboard route groups that existed at the freeze point (2026-07-12).
 * Captured by listing the (dashboard) folder at Gate 0 time. Adding to
 * this set requires an approved exception after Gate 8.
 */
const FROZEN_DASHBOARD_GROUPS = new Set([
  "admin",
  "assistant",
  "brand-kit",
  "campaigns",
  "dashboard",
  "docs",
  "feedback",
  "library",
  "quick-tools",
  "settings",
  "templates",
]);

const KNOWN_FROZEN_AI_FILES = new Set([
  "landing-page.ts",
  "persona-simulator.ts",
]);

function looksLikeNewCreativePipeline(fileName) {
  if (KNOWN_FROZEN_AI_FILES.has(fileName)) return false;
  // Heuristic: generator-style names that aren't already known.
  return /^(generate|build|run|create|produce|derive|orchestrate).*(pipeline|flow|engine|generator|chain)\./.test(
    fileName
  );
}

function validateManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== "object") {
    errors.push("manifest must be a JSON object.");
    return errors;
  }
  if (manifest.schemaVersion !== 1) {
    errors.push(
      `manifest.schemaVersion must equal 1 (got ${String(
        manifest.schemaVersion
      )}).`
    );
  }
  if (!Array.isArray(manifest.allowedPrimaryDestinations)) {
    errors.push("manifest.allowedPrimaryDestinations must be an array.");
    return errors;
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
          `entry missing required field "${requiredField}": ${JSON.stringify(
            entry
          )}`
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
  if (!existsSync(args.manifestPath)) {
    return fail([
      `manifest not found at ${args.manifestPath}. Run from repo root or pass --manifest.`,
    ]);
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(args.manifestPath, "utf8"));
  } catch (error) {
    return fail([
      `manifest is not valid JSON: ${error?.message ?? error}`,
    ]);
  }

  const manifestErrors = validateManifest(manifest);
  if (manifestErrors.length > 0) return fail(manifestErrors);

  // (2) Detect new top-level dashboard route groups.
  const dashboardGroups = listDashboardRouteGroups();
  const newDashboardGroups = dashboardGroups.filter(
    (group) => !FROZEN_DASHBOARD_GROUPS.has(group)
  );
  if (newDashboardGroups.length > 0) {
    fail([
      `new top-level dashboard route group(s) detected during convergence freeze: ${newDashboardGroups.join(
        ", "
      )}. The allowlist must be updated with an approved exception before this is allowed.`,
    ]);
  }

  // (3) Advisory: flag any new generator-style file under src/server/ai.
  const aiModules = listServerAiModules();
  for (const file of aiModules) {
    if (looksLikeNewCreativePipeline(file)) {
      warn(
        `possible new creative pipeline module detected: src/server/ai/${file}. Confirm it is not a duplicate of the canonical pipeline or add an approved exception.`
      );
    }
  }

  console.log(
    `PRIMARY-DESTINATIONS: manifest valid; ${manifest.allowedPrimaryDestinations.length} destination(s) allowed; ${dashboardGroups.length} dashboard group(s); ${aiModules.length} ai module(s).`
  );
}

main();
