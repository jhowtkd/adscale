#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { rejectEmptyVisualSuccess } from "./lib/evidence-honesty.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const phaseDir = resolve(repoRoot, ".planning/phases/109-visual-foundations-and-baseline");
const evidencePath = resolve(phaseDir, "109-EVIDENCE.json");
const baselinePath = resolve(phaseDir, "109-BASELINE.md");
const verificationPath = resolve(phaseDir, "109-VERIFICATION.md");
const requiredMasks = ["email", "user", "workspace", "client", "campaign-id", "timestamp", "generated-image"];
const validOwners = new Set(["110", "111", "112", "113"]);
const requiredRequirements = ["FOUND-01", "FOUND-02", "FOUND-03", "FOUND-04", "FOUND-05", "QA-14"];

function variants(scenario, state, widths) {
  return widths.map((width) => `${scenario}:${state}:${width}`);
}

const required = [
  ...variants("dashboard", "populated", [390, 1024, 1440, 1920]),
  ...["empty", "loading", "error"].flatMap((state) => variants("dashboard", state, [390, 768, 1280])),
  ...variants("campaign-list", "dense", [390, 768, 1280, 1920]),
  ...["empty", "loading", "error"].flatMap((state) => variants("campaign-list", state, [390, 768, 1280])),
  ...variants("workspace", "populated", [390, 1024, 1440]),
  ...["loading", "error"].flatMap((state) => variants("workspace", state, [390, 1024])),
  ...["normal", "validation-error"].flatMap((state) => variants("settings", state, [390, 768, 1280])),
  ...["account-dropdown", "settings-confirmation-dialog", "derivation-review-sheet"].flatMap((state) =>
    variants("overlay", state, [390, 1440]),
  ),
  ...["sticky-popover-toast", "shell-backdrop-overlay-toast"].flatMap((state) =>
    variants("layer-harness", state, [390, 1440]),
  ),
];

const overlayKeys = new Set(
  [
    ...["account-dropdown", "settings-confirmation-dialog", "derivation-review-sheet"].flatMap((state) =>
      variants("overlay", state, [390, 1440]),
    ),
    ...["sticky-popover-toast", "shell-backdrop-overlay-toast"].flatMap((state) =>
      variants("layer-harness", state, [390, 1440]),
    ),
  ],
);

function hash(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function currentCssHash() {
  return execFileSync("git", ["hash-object", "app/src/app/globals.css"], { cwd: repoRoot, encoding: "utf8" }).trim();
}

function fail(errors) {
  errors.forEach((error) => console.error(`EVIDENCE: ${error}`));
  process.exitCode = 1;
}

function validateCaptureSet(captures, suffix, errors, { requirePass = true } = {}) {
  const keys = captures.map((capture) => capture.key);
  if (new Set(keys).size !== keys.length) errors.push(`${suffix} capture keys must be unique`);
  for (const capture of captures) {
    const file = resolve(repoRoot, capture.path);
    if (!capture.path.includes(`-${suffix}.png`)) errors.push(`${capture.key} ${suffix} path must use -${suffix}.png`);
    if (!existsSync(file)) errors.push(`${capture.key} ${suffix} artifact missing: ${capture.path}`);
    else if (hash(file) !== capture.sha256) errors.push(`${capture.key} ${suffix} artifact hash mismatch`);
    if (requirePass && capture.result !== "pass" && capture.result !== "deferred") {
      errors.push(`${capture.key} ${suffix} result must be pass or deferred`);
    }
    for (const mask of requiredMasks) {
      if (!capture.masks?.includes(mask)) errors.push(`${capture.key} ${suffix} missing mask ${mask}`);
    }
    if (!["light", "dark"].includes(capture.theme)) errors.push(`${capture.key} ${suffix} invalid theme`);
    if (!["pt-BR", "en"].includes(capture.locale)) errors.push(`${capture.key} ${suffix} invalid locale`);
  }
}

function writeBaseline(evidence, cssHash, label) {
  const lines = evidence.captures.map(
    (capture) =>
      `| ${capture.scenario} | ${capture.state} | ${capture.viewport} | ${capture.theme} | ${capture.locale} | \`${capture.path}\` | pass |`,
  );
  const afterLines = (evidence.afterCaptures ?? []).map(
    (capture) =>
      `| ${capture.scenario} | ${capture.state} | ${capture.viewport} | ${capture.theme} | ${capture.locale} | \`${capture.path}\` | ${capture.result} |`,
  );
  const defects = (evidence.defects ?? []).map(
    (defect) => `| ${defect.id} | ${defect.observation} | ${defect.owner} |`,
  );
  writeFileSync(
    baselinePath,
    `# Phase 109 Visual Baseline (${label})\n\n` +
      `Before CSS hash: \`${evidence.before?.cssHash ?? "missing"}\`\n` +
      `After CSS hash: \`${evidence.after?.cssHash ?? "pending"}\`\n\n` +
      `Synthetic identity: \`visual-foundations@example.test\`.\n\n` +
      `## Before Capture Matrix\n\n` +
      `| Scenario | State | Width | Theme | Locale | Artifact | Result |\n|---|---|---:|---|---|---|---|\n` +
      `${lines.join("\n")}\n\n` +
      (afterLines.length
        ? `## After Capture Matrix\n\n| Scenario | State | Width | Theme | Locale | Artifact | Result |\n|---|---|---:|---|---|---|---|\n${afterLines.join("\n")}\n\n`
        : "") +
      `## Observed Defects\n\n| ID | Observation | Deferred Owner Phase |\n|---|---|---:|\n${defects.join("\n")}\n`,
  );
}

function writeVerification(evidence) {
  const requirementRows = (evidence.requirements ?? [])
    .map((row) => `| ${row.id} | ${row.result} | ${row.automated ?? ""} | ${row.browser ?? ""} | ${row.manual ?? ""} |`)
    .join("\n");
  writeFileSync(
    verificationPath,
    `# Phase 109 Verification\n\n` +
      `Generated from validated \`109-EVIDENCE.json\`.\n\n` +
      `Before CSS: \`${evidence.before.cssHash}\`\n` +
      `After CSS: \`${evidence.after.cssHash}\`\n` +
      `Paired captures: ${evidence.captures.length} before / ${evidence.afterCaptures.length} after\n\n` +
      `## Requirement Evidence\n\n` +
      `| Requirement | Result | Automated | Browser | Manual |\n|---|---|---|---|---|\n` +
      `${requirementRows}\n\n` +
      `## Goal-Backward Conclusion\n\n` +
      `Phase 109 establishes canonical visual contracts, primitive proof, ownership inventory, and paired browser evidence ` +
      `without migrating routes. Deferred shell, contrast, and Brand Kit dialog defects remain owned by Phases 110-113.\n`,
  );
}

function ensureFinalRequirements(evidence, errors) {
  if (!evidence.requirements?.length) {
    errors.push("missing requirements must not be auto-passed");
    return;
  }
}

try {
  const stage = process.argv[3];
  const section = process.argv.includes("--section") ? process.argv[process.argv.indexOf("--section") + 1] : "all";
  if (process.argv[2] !== "--stage" || !["before", "after", "final"].includes(stage)) {
    throw new Error("Usage: check-visual-evidence.mjs --stage before|after|final [--section overlays]");
  }

  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  const errors = [];
  const cssHash = currentCssHash();
  rejectEmptyVisualSuccess(evidence, errors, "109-EVIDENCE");

  if (evidence.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (evidence.identity !== "visual-foundations@example.test") {
    errors.push("identity must use visual-foundations@example.test");
  }

  if (stage === "before") {
    if (evidence.before?.cssHash !== cssHash) errors.push("before CSS hash does not equal current globals.css hash");
    const keys = evidence.captures.map((capture) => capture.key);
    const requiredKeys = section === "overlays" ? [...overlayKeys] : required;
    for (const key of requiredKeys) if (!keys.includes(key)) errors.push(`missing required capture ${key}`);
    for (const key of keys) if (!required.includes(key)) errors.push(`unexpected capture ${key}`);
    validateCaptureSet(evidence.captures, "before", errors);
    const themes = new Set(evidence.captures.map((capture) => capture.theme));
    const locales = new Set(evidence.captures.map((capture) => capture.locale));
    if (themes.size !== 2) errors.push("captures must collectively cover light and dark");
    if (locales.size !== 2) errors.push("captures must collectively cover pt-BR and en");
    for (const defect of evidence.defects ?? []) {
      if (!validOwners.has(defect.owner)) errors.push(`${defect.id} has invalid deferred owner ${defect.owner}`);
    }
    if (!errors.length) {
      writeBaseline(evidence, cssHash, "before");
      console.log(`Visual before evidence complete: ${evidence.captures.length} captures, CSS ${cssHash}.`);
    }
  }

  if (stage === "after") {
    if (!evidence.before?.cssHash) errors.push("before.cssHash missing");
    if (!evidence.afterCaptures?.length) errors.push("afterCaptures missing");
    if (evidence.after?.cssHash !== cssHash) errors.push("after CSS hash does not equal current globals.css hash");
    if (evidence.before?.cssHash === evidence.after?.cssHash) {
      errors.push("after CSS hash must differ from before CSS hash");
    }
    const beforeKeys = new Set(evidence.captures.map((capture) => capture.key));
    const afterKeys = evidence.afterCaptures?.map((capture) => capture.key) ?? [];
    const requiredKeys =
      section === "overlays"
        ? [...overlayKeys]
        : required.filter((key) => !overlayKeys.has(key));
    for (const key of requiredKeys) {
      if (!beforeKeys.has(key)) errors.push(`missing before capture for ${key}`);
      if (!afterKeys.includes(key)) errors.push(`missing after capture for ${key}`);
    }
    validateCaptureSet(evidence.captures, "before", errors, { requirePass: true });
    validateCaptureSet(evidence.afterCaptures ?? [], "after", errors, { requirePass: true });
    for (const key of afterKeys) if (!required.includes(key)) errors.push(`unexpected after capture ${key}`);
    if (!errors.length) {
      writeBaseline(evidence, cssHash, "after");
      const count = section === "overlays" ? overlayKeys.size : required.length;
      console.log(
        `Visual after evidence complete: ${evidence.afterCaptures.length}/${count} ${section} keys, CSS ${cssHash}.`,
      );
    }
  }

  if (stage === "final") {
    if (!evidence.before?.cssHash || !evidence.after?.cssHash) errors.push("before/after cssHash required");
    if (evidence.before.cssHash === evidence.after.cssHash) errors.push("before and after cssHash must differ");
    if (evidence.after.cssHash !== cssHash) errors.push("after cssHash stale vs current globals.css");
    const beforeKeys = new Set(evidence.captures.map((capture) => capture.key));
    const afterKeys = new Set((evidence.afterCaptures ?? []).map((capture) => capture.key));
    for (const key of required) {
      if (!beforeKeys.has(key)) errors.push(`final missing before key ${key}`);
      if (!afterKeys.has(key)) errors.push(`final missing after key ${key}`);
    }
    validateCaptureSet(evidence.captures, "before", errors);
    validateCaptureSet(evidence.afterCaptures ?? [], "after", errors);
    ensureFinalRequirements(evidence, errors);
    const ids = evidence.requirements.map((row) => row.id);
    if (new Set(ids).size !== requiredRequirements.length) errors.push("requirements must include FOUND-01..05 and QA-14 once");
    for (const row of evidence.requirements) {
      if (row.result !== "pass") errors.push(`${row.id} must be pass at final stage`);
    }
    for (const defect of evidence.defects ?? []) {
      if (!validOwners.has(defect.owner)) errors.push(`${defect.id} invalid owner ${defect.owner}`);
    }
    if (!errors.length) {
      writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
      writeBaseline(evidence, cssHash, "final");
      writeVerification(evidence);
      console.log(`Visual final evidence complete: ${required.length} paired keys, 6 requirements pass.`);
    }
  }

  if (errors.length) fail(errors);
} catch (error) {
  fail([error instanceof Error ? error.message : String(error)]);
}
