#!/usr/bin/env node
/**
 * Convergence gate wrapper.
 *
 * Runs every Phase-0 gate in sequence and fails fast on the first
 * violation. Intended to be called from CI (`.github/workflows/ci.yml`)
 * and from the release gate so the freeze is enforced everywhere a
 * release is built.
 *
 * Gates:
 *   1. check-primary-destinations.mjs  (anti-expansion)
 *   2. check-frozen-modules.mjs         (frozen modules, full branch range)
 *
 * The baseline capture is NOT part of this gate because it requires a
 * live DATABASE_URL and is run on demand by ops.
 *
 * Usage:
 *   node app/scripts/run-convergence-gate.mjs
 *
 * Plano de convergência, Fase 0, passo 5.
 */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const steps = [
  ["node", ["scripts/check-primary-destinations.mjs"], "anti-expansion gate"],
  ["node", ["scripts/check-frozen-modules.mjs"], "frozen-modules gate (full branch range)"],
];

for (const [command, args, label] of steps) {
  console.log(`\n==> convergence: ${label}`);
  try {
    execFileSync(command, args, { cwd: appDir, stdio: "inherit" });
  } catch {
    console.error(`\nCONVERGENCE-GATE: failed at "${label}".`);
    process.exit(1);
  }
}

console.log("\nCONVERGENCE-GATE: all gates passed.");
