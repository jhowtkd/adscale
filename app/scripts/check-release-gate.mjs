#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const phaseDir = resolve(repoRoot, ".planning/phases/114-visual-regression-and-release-gate");
const evidencePath = resolve(phaseDir, "114-EVIDENCE.json");
const scenarios = [
  "SCN-DASHBOARD",
  "SCN-CAMPAIGN-LIST",
  "SCN-CAMPAIGN-WORKSPACE",
  "SCN-VARIATIONS-WORKSPACE",
  "SCN-LIBRARY",
  "SCN-TEMPLATES",
  "SCN-FEEDBACK",
  "SCN-SETTINGS",
];
const layoutVariants = ["390x844", "768x844", "1024x900", "1280x900", "1440x900", "1920x900", "1280x480"];
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

export const EXPECTED_LAYOUT_KEYS = scenarios.flatMap((scenario) =>
  layoutVariants.map((viewport) => `${scenario}@${viewport}`),
);
export const EXPECTED_A11Y_KEYS = a11yVariants.flatMap(([viewport, browser]) =>
  a11yRoutes.map((route) => `${route}@${viewport}:${browser}`),
);
export const EXPECTED_INTERACTION_KEYS = a11yVariants.map(
  ([viewport, browser]) => `login-interaction@${viewport}:${browser}`,
);

function validateUniqueChecks(errors, checks, expectedKeys, label, validate) {
  for (const key of expectedKeys) {
    const matches = checks.filter((check) => check.key === key);
    if (matches.length === 0) errors.push(`missing ${label} check ${key}`);
    else if (matches.length > 1) errors.push(`duplicate ${label} check ${key}`);
    else validate(matches[0], key, errors);
  }
  for (const check of checks) {
    if (!expectedKeys.includes(check.key)) errors.push(`unexpected ${label} check ${check.key}`);
  }
}

export function validateReleaseEvidence(evidence, { preflight = false } = {}) {
  const errors = [];
  const layoutChecks = evidence.layoutChecks ?? [];
  const a11yChecks = evidence.a11yChecks ?? [];
  const interactionChecks = evidence.interactionChecks ?? [];

  validateUniqueChecks(errors, layoutChecks, EXPECTED_LAYOUT_KEYS, "layout", (check, key) => {
    if (check.result !== "pass") errors.push(`${key} result is ${check.result}`);
  });

  validateUniqueChecks(errors, a11yChecks, EXPECTED_A11Y_KEYS, "a11y", (check, key) => {
    const blocking = check.blockingIncomplete ?? check.blockingViolations ?? 0;
    if (check.result !== "pass" || check.violations !== 0 || blocking !== 0) {
      errors.push(`a11y ${key} failed with ${blocking} blocking findings`);
    }
  });

  validateUniqueChecks(errors, interactionChecks, EXPECTED_INTERACTION_KEYS, "interaction", (check, key) => {
    const valid = check.result === "pass"
      && check.mainCount === 1
      && check.skipLinkCount === 1
      && Array.isArray(check.invalidLabelledBy)
      && check.invalidLabelledBy.length === 0
      && check.focusOrder === true
      && check.accessibleControls === true
      && check.textResizeOverflowX <= 2
      && check.lowHeightOverflowX <= 2
      && check.touchTargetMin >= 44;
    if (!valid) errors.push(`interaction ${key} failed`);
  });

  for (const id of ["RESP-07", "QA-15", "QA-16"]) {
    if (evidence.requirements?.[id]?.result !== "pass") errors.push(`requirement ${id} not marked pass`);
  }

  const automated = evidence.automated ?? {};
  for (const step of ["unit", "lint", "build", "visual-release"]) {
    if (automated[step] !== "pass") errors.push(`automated.${step} must be pass`);
  }

  if (!preflight) {
    const qa17 = evidence.requirements?.["QA-17"];
    if (qa17?.result !== "pass") errors.push("requirement QA-17 not marked pass");
    if (qa17?.a11y !== "pass") errors.push("requirement QA-17 a11y not marked pass");
    if (qa17?.interaction !== "pass") errors.push("requirement QA-17 interaction not marked pass");
    if (qa17?.manualAssistiveTechnology !== "pass") errors.push("QA-17 manual assistive-technology acceptance is not pass");
    if (qa17?.manualZoom200 !== "pass") errors.push("QA-17 real 200% zoom acceptance is not pass");
    if (qa17?.manualDegradedStates !== "pass") errors.push("QA-17 degraded-state acceptance is not pass");
    if (typeof qa17?.manualEvidence !== "string" || !qa17.manualEvidence.trim()) errors.push("QA-17 manual evidence is missing");
    if (qa17?.expectedA11yChecks !== EXPECTED_A11Y_KEYS.length || qa17?.completedA11yChecks !== EXPECTED_A11Y_KEYS.length) {
      errors.push(`QA-17 requires ${EXPECTED_A11Y_KEYS.length}/${EXPECTED_A11Y_KEYS.length} a11y checks`);
    }
    if (qa17?.expectedInteractionChecks !== EXPECTED_INTERACTION_KEYS.length || qa17?.completedInteractionChecks !== EXPECTED_INTERACTION_KEYS.length) {
      errors.push(`QA-17 requires ${EXPECTED_INTERACTION_KEYS.length}/${EXPECTED_INTERACTION_KEYS.length} interaction checks`);
    }
    if (typeof evidence.verifiedAt !== "string" || !evidence.verifiedAt) errors.push("verifiedAt missing — evidence is not released");
  }

  return errors;
}

function fail(errors) {
  errors.forEach((error) => console.error(`RELEASE-GATE: ${error}`));
  process.exitCode = 1;
}

function main() {
  try {
    if (!existsSync(evidencePath)) {
      fail(["114-EVIDENCE.json missing — run playwright release gate first"]);
      return;
    }

    const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    const errors = validateReleaseEvidence(evidence, { preflight: process.argv.includes("--preflight") });
    if (errors.length) {
      fail(errors);
      return;
    }

    console.log(
      `Release gate evidence complete: ${EXPECTED_LAYOUT_KEYS.length} layout checks, ${EXPECTED_A11Y_KEYS.length} a11y checks, ${EXPECTED_INTERACTION_KEYS.length} interaction checks.`,
    );
  } catch (error) {
    fail([error instanceof Error ? error.message : String(error)]);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
