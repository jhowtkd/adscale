#!/usr/bin/env node

/**
 * Validates goal-agent staging evidence JSON against the graduation gate.
 *
 * Usage:
 *   node scripts/check-goal-agent-staging-evidence.mjs --evidence ../.planning/phases/goal-agent-staging-pilot/GOAL-AGENT-EVIDENCE.json
 */
import fs from "node:fs";
import path from "node:path";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const evidenceIndex = argv.indexOf("--evidence");
  if (evidenceIndex === -1 || !argv[evidenceIndex + 1]) {
    throw new Error("Missing --evidence <path>");
  }
  return {
    evidencePath: path.resolve(appDir, argv[evidenceIndex + 1]),
    requireGraduation: argv.includes("--graduation"),
  };
}

function main() {
  const { evidencePath, requireGraduation } = parseArgs(process.argv.slice(2));
  const raw = fs.readFileSync(evidencePath, "utf8");
  const evidence = JSON.parse(raw);
  const report = evidence.graduationReport;
  if (!report?.graduation) {
    console.error("✗ Evidence missing graduationReport.graduation");
    process.exit(1);
  }

  const automated = evidence.automatedScenarios ?? {};
  const missing = Object.entries(automated).filter(([, value]) => value !== "pass");
  if (missing.length > 0) {
    console.error(`✗ Automated scenarios incomplete: ${missing.map(([k]) => k).join(", ")}`);
    process.exit(1);
  }

  const validationClosed =
    evidence.status === "completed" && evidence.releaseGate?.status === "passed";

  if (!requireGraduation && validationClosed) {
    console.log("✓ Goal-agent validation phase closed (automated scenarios + release gate).");
    return;
  }

  const failures = [];
  if (!report.graduation.enoughObjectives) failures.push("startedObjectives < 20");
  if (!report.graduation.enoughClients) failures.push("distinctClients < 3");
  if (!report.graduation.enoughCompletion) failures.push("completionRate < 0.60");
  if (!report.graduation.noCriticalFailures) failures.push("critical failures > 0");

  if (failures.length > 0) {
    console.error(`✗ Graduation gate failed: ${failures.join(", ")}`);
    process.exit(1);
  }

  console.log("✓ Goal-agent staging evidence passes graduation gate.");
}

main();
