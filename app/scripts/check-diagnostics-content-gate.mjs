#!/usr/bin/env node
/**
 * Diagnostics content-policy gate (jhowtkd/adscale#391, criterion 7).
 *
 * Real-content capture stays blocked until the data owner approves the
 * content policy (mode + allowlist) and remote deletion is proven by
 * re-query. This check reads the approval receipt produced by that human
 * process from the file named by DIAGNOSTICS_CONTENT_POLICY_RECEIPT and
 * validates it. It is a REAL check, not a stub:
 *   - exit 0 STATUS=PASS    receipt present, schema-valid, deletion proven
 *   - exit 2 STATUS=BLOCKED no receipt configured (no data-owner approval:
 *                           the expected state until the gate is approved)
 *   - exit 1 STATUS=FAIL    receipt present but missing/invalid/unproven
 *
 * Receipt schema (JSON):
 *   { policyVersion: "v1", approvedBy: <non-empty string>,
 *     approvedAt: <ISO date>,
 *     retentionWindows: { diagnosticIndexDays: 30, aiTracesDays: 7,
 *                         accessAuditDays: 90 },
 *     deletionProof: { endpoint: string, traceIds: [<non-empty strings>],
 *                      requeriedAt: <ISO date>, allConfirmed: true },
 *     allowlistedWorkspaces: [<non-empty strings>] }
 *
 * Usage:
 *   node app/scripts/check-diagnostics-content-gate.mjs
 *   DIAGNOSTICS_CONTENT_POLICY_RECEIPT=/path/to/receipt.json node app/scripts/check-diagnostics-content-gate.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

const EXPECTED_WINDOWS = {
  diagnosticIndexDays: 30,
  aiTracesDays: 7,
  accessAuditDays: 90,
};

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
  console.log("capture_authorized=false");
  process.exit(2);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function main() {
  const receiptPath = (process.env.DIAGNOSTICS_CONTENT_POLICY_RECEIPT ?? "").trim();
  if (!receiptPath) {
    blocked(
      "DIAGNOSTICS_CONTENT_POLICY_RECEIPT is not set: no data-owner approval in this environment",
    );
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
  if (receipt.policyVersion !== "v1") {
    problems.push('policyVersion must equal "v1"');
  }
  if (!isNonEmptyString(receipt.approvedBy)) {
    problems.push("approvedBy must be a non-empty string");
  }
  if (!isIsoDate(receipt.approvedAt)) {
    problems.push("approvedAt must be a valid ISO date");
  }
  const windows = receipt.retentionWindows ?? {};
  for (const [key, expected] of Object.entries(EXPECTED_WINDOWS)) {
    if (windows[key] !== expected) {
      problems.push(`retentionWindows.${key} must equal ${expected}`);
    }
  }
  const proof = receipt.deletionProof;
  if (proof === null || typeof proof !== "object") {
    problems.push("deletionProof must be an object");
  } else {
    if (!isNonEmptyString(proof.endpoint)) {
      problems.push("deletionProof.endpoint must be a non-empty string");
    }
    if (
      !Array.isArray(proof.traceIds) ||
      proof.traceIds.length === 0 ||
      !proof.traceIds.every(isNonEmptyString)
    ) {
      problems.push("deletionProof.traceIds must be a non-empty array of strings");
    }
    if (!isIsoDate(proof.requeriedAt)) {
      problems.push("deletionProof.requeriedAt must be a valid ISO date");
    }
    if (proof.allConfirmed !== true) {
      problems.push("deletionProof.allConfirmed must be true");
    }
  }
  if (
    !Array.isArray(receipt.allowlistedWorkspaces) ||
    receipt.allowlistedWorkspaces.length === 0 ||
    !receipt.allowlistedWorkspaces.every(isNonEmptyString)
  ) {
    problems.push("allowlistedWorkspaces must be a non-empty array of strings");
  }
  if (problems.length > 0) {
    fail(problems.join("; "));
  }

  console.log("STATUS=PASS");
  console.log(`policyVersion=${receipt.policyVersion}`);
  console.log(`approvedBy=${receipt.approvedBy}`);
  console.log(`approvedAt=${receipt.approvedAt}`);
  console.log(
    `retentionWindows=${EXPECTED_WINDOWS.diagnosticIndexDays}d/${EXPECTED_WINDOWS.aiTracesDays}d/${EXPECTED_WINDOWS.accessAuditDays}d`,
  );
  console.log(`deletionProofTraces=${receipt.deletionProof.traceIds.length}`);
  console.log(`allowlistedWorkspaces=${receipt.allowlistedWorkspaces.join(",")}`);
  console.log(`head=${headSha()}`);
  console.log("capture_authorized=true");
}

main();
