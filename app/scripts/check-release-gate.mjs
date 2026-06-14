#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const phaseDir = resolve(repoRoot, ".planning/phases/114-visual-regression-and-release-gate");
const evidencePath = resolve(phaseDir, "114-EVIDENCE.json");
const viewports = [390, 768, 1024, 1280, 1440, 1920];
const scenarios = [
  "SCN-DASHBOARD",
  "SCN-CAMPAIGN-LIST",
  "SCN-CAMPAIGN-WORKSPACE",
  "SCN-LIBRARY",
  "SCN-TEMPLATES",
  "SCN-RESTYLING",
  "SCN-QUICK-RESTYLING",
  "SCN-FEEDBACK",
  "SCN-SETTINGS",
];

function fail(errors) {
  errors.forEach((error) => console.error(`RELEASE-GATE: ${error}`));
  process.exitCode = 1;
}

try {
  const errors = [];
  if (!existsSync(evidencePath)) {
    fail(["114-EVIDENCE.json missing — run playwright release gate first"]);
    process.exit(1);
  }

  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  const layoutChecks = evidence.layoutChecks ?? [];
  const a11yChecks = evidence.a11yChecks ?? [];

  for (const scenario of scenarios) {
    for (const viewport of viewports) {
      const key = `${scenario}@${viewport}`;
      const check = layoutChecks.find((item) => item.key === key);
      if (!check) errors.push(`missing layout check ${key}`);
      else if (check.result !== "pass") errors.push(`${key} result is ${check.result}`);
    }
  }

  if (a11yChecks.length < 8) errors.push(`expected at least 8 a11y checks, found ${a11yChecks.length}`);
  for (const check of a11yChecks) {
    if (check.result !== "pass") errors.push(`a11y ${check.key} failed with ${check.blockingViolations} blocking violations`);
  }

  for (const id of ["RESP-07", "QA-15", "QA-16"]) {
    if (evidence.requirements?.[id]?.result !== "pass") errors.push(`requirement ${id} not marked pass`);
  }

  const automated = evidence.automated ?? {};
  for (const step of ["unit", "lint", "build"]) {
    if (automated[step] !== "pass") errors.push(`automated.${step} must be pass`);
  }

  if (errors.length) {
    fail(errors);
  } else {
    console.log(
      `Release gate evidence complete: ${layoutChecks.length} layout checks, ${a11yChecks.length} a11y checks.`,
    );
  }
} catch (error) {
  fail([error instanceof Error ? error.message : String(error)]);
}
