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
const a11yRoutes = [
  "login",
  "home",
  "creative-work",
  "dashboard",
  "campaign-list",
  "campaign-workspace",
  "variations-workspace",
  "library",
  "settings",
  "docs",
  "templates",
  "invite",
  "console",
];
const a11yVariants = [
  [390, "chromium"],
  [768, "chromium"],
  [1280, "chromium"],
  [390, "webkit"],
  [1280, "webkit"],
];
const expectedA11yKeys = a11yVariants.flatMap(([viewport, browser]) =>
  a11yRoutes.map((route) => `${route}@${viewport}:${browser}`),
);
const expectedInteractionKeys = a11yVariants.map(
  ([viewport, browser]) => `login-interaction@${viewport}:${browser}`,
);
const preflight = process.argv.includes("--preflight");

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
  const interactionChecks = evidence.interactionChecks ?? [];

  for (const scenario of scenarios) {
    for (const viewport of viewports) {
      const key = `${scenario}@${viewport}`;
      const check = layoutChecks.find((item) => item.key === key);
      if (!check) errors.push(`missing layout check ${key}`);
      else if (check.result !== "pass") errors.push(`${key} result is ${check.result}`);
    }
  }

  for (const key of expectedA11yKeys) {
    const matches = a11yChecks.filter((check) => check.key === key);
    if (matches.length === 0) errors.push(`missing a11y check ${key}`);
    else if (matches.length > 1) errors.push(`duplicate a11y check ${key}`);
    else {
      const check = matches[0];
      const blocking = check.blockingIncomplete ?? check.blockingViolations ?? 0;
      if (check.result !== "pass" || check.violations !== 0 || blocking !== 0) {
        errors.push(`a11y ${key} failed with ${blocking} blocking findings`);
      }
    }
  }

  for (const key of expectedInteractionKeys) {
    const matches = interactionChecks.filter((check) => check.key === key);
    if (matches.length === 0) errors.push(`missing interaction check ${key}`);
    else if (matches.length > 1) errors.push(`duplicate interaction check ${key}`);
    else {
      const check = matches[0];
      const valid = check.result === "pass"
        && check.mainCount === 1
        && check.skipLinkCount === 1
        && Array.isArray(check.invalidLabelledBy)
        && check.invalidLabelledBy.length === 0
        && check.focusOrder === true
        && check.accessibleControls === true
        && check.textZoomOverflowX <= 2
        && check.lowHeightOverflowX <= 2
        && check.touchTargetMin >= 44;
      if (!valid) errors.push(`interaction ${key} failed`);
    }
  }

  for (const id of ["RESP-07", "QA-15", "QA-16"]) {
    if (evidence.requirements?.[id]?.result !== "pass") errors.push(`requirement ${id} not marked pass`);
  }

  const automated = evidence.automated ?? {};
  for (const step of ["unit", "lint", "build", "visual-release"]) {
    if (automated[step] !== "pass") errors.push(`automated.${step} must be pass`);
  }

  const qa17 = evidence.requirements?.["QA-17"];
  if (!preflight) {
    if (qa17?.result !== "pass") errors.push("requirement QA-17 not marked pass");
    if (qa17?.a11y !== "pass") errors.push("requirement QA-17 a11y not marked pass");
    if (qa17?.interaction !== "pass") errors.push("requirement QA-17 interaction not marked pass");
    if (qa17?.manualAssistiveTechnology !== "pass") errors.push("QA-17 manual assistive-technology acceptance is not pass");
    if (qa17?.expectedA11yChecks !== expectedA11yKeys.length || qa17?.completedA11yChecks !== expectedA11yKeys.length) {
      errors.push(`QA-17 requires ${expectedA11yKeys.length}/${expectedA11yKeys.length} a11y checks`);
    }
    if (qa17?.expectedInteractionChecks !== expectedInteractionKeys.length || qa17?.completedInteractionChecks !== expectedInteractionKeys.length) {
      errors.push(`QA-17 requires ${expectedInteractionKeys.length}/${expectedInteractionKeys.length} interaction checks`);
    }
    if (typeof evidence.verifiedAt !== "string" || !evidence.verifiedAt) errors.push("verifiedAt missing — evidence is not released");
  }

  if (errors.length) {
    fail(errors);
  } else {
    console.log(
      `Release gate evidence complete: ${layoutChecks.length} layout checks, ${expectedA11yKeys.length} a11y checks, ${expectedInteractionKeys.length} interaction checks.`,
    );
  }
} catch (error) {
  fail([error instanceof Error ? error.message : String(error)]);
}
