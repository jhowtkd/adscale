#!/usr/bin/env node
/**
 * Diagnostics staging receipt gate (jhowtkd/adscale#384, criterion 6).
 *
 * The traceability track requires proof that a synthetic diagnostic event
 * emitted per process (web + worker) in staging was actually received
 * (IDs, SHA, time) — a "trace sent" log is not evidence.
 *
 * This check reads the receipt produced by the staging run from the file
 * named by DIAGNOSTICS_STAGING_RECEIPT and validates it. It is a REAL
 * check, not a stub:
 *   - exit 0 STATUS=PASS    receipt present and schema-valid
 *   - exit 2 STATUS=BLOCKED no receipt configured (no staging access:
 *                           the expected state until rollout is authorized)
 *   - exit 1 STATUS=FAIL    receipt present but missing/invalid
 *
 * Receipt schema (JSON):
 *   { environment: "staging", dataOrigin: "synthetic", releaseSha: string,
 *     receivedAt: <ISO date>, processes: ["web", "worker"],
 *     eventIds: [<non-empty hex/uuid strings>] }
 *
 * Usage:
 *   node app/scripts/check-diagnostics-staging-gate.mjs
 *   DIAGNOSTICS_STAGING_RECEIPT=/path/to/receipt.json node app/scripts/check-diagnostics-staging-gate.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

function headSha() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

function fail(reason) {
  console.log("STATUS=FAIL");
  console.log(`reason=${reason}`);
  console.log(`head=${headSha()}`);
  process.exit(1);
}

function blocked(reason) {
  console.log("STATUS=BLOCKED");
  console.log(`reason=${reason}`);
  console.log(`head=${headSha()}`);
  console.log("rollout_authorized=false");
  process.exit(2);
}

function main() {
  const receiptPath = (process.env.DIAGNOSTICS_STAGING_RECEIPT ?? "").trim();
  if (!receiptPath) {
    blocked("DIAGNOSTICS_STAGING_RECEIPT is not set: no staging receipt configured in this environment");
  }
  if (!existsSync(receiptPath)) {
    fail(`receipt file not found: ${receiptPath}`);
  }
  let receipt;
  try {
    receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  } catch (error) {
    fail(`receipt is not valid JSON: ${error?.message ?? error}`);
  }

  const problems = [];
  if (receipt.environment !== "staging") problems.push("environment must equal \"staging\"");
  if (receipt.dataOrigin !== "synthetic") problems.push("dataOrigin must equal \"synthetic\"");
  if (typeof receipt.releaseSha !== "string" || receipt.releaseSha.length < 7) {
    problems.push("releaseSha must be a string of at least 7 chars");
  }
  if (typeof receipt.receivedAt !== "string" || Number.isNaN(Date.parse(receipt.receivedAt))) {
    problems.push("receivedAt must be a valid ISO date");
  }
  for (const proc of ["web", "worker"]) {
    if (!Array.isArray(receipt.processes) || !receipt.processes.includes(proc)) {
      problems.push(`processes must include "${proc}"`);
    }
  }
  if (
    !Array.isArray(receipt.eventIds) ||
    receipt.eventIds.length === 0 ||
    !receipt.eventIds.every((id) => typeof id === "string" && id.length > 0)
  ) {
    problems.push("eventIds must be a non-empty array of strings");
  }
  if (problems.length > 0) {
    fail(problems.join("; "));
  }

  console.log("STATUS=PASS");
  console.log(`environment=${receipt.environment}`);
  console.log(`dataOrigin=${receipt.dataOrigin}`);
  console.log(`releaseSha=${receipt.releaseSha}`);
  console.log(`receivedAt=${receipt.receivedAt}`);
  console.log(`processes=${receipt.processes.join(",")}`);
  console.log(`eventCount=${receipt.eventIds.length}`);
  console.log(`head=${headSha()}`);
}

main();
