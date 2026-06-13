#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const phaseDir = resolve(repoRoot, ".planning/phases/109-visual-foundations-and-baseline");
const evidencePath = resolve(phaseDir, "109-EVIDENCE.json");
const baselinePath = resolve(phaseDir, "109-BASELINE.md");
const requiredMasks = ["email", "user", "workspace", "client", "campaign-id", "timestamp", "generated-image"];
const validOwners = new Set(["110", "111", "112", "113"]);

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
  ...["account-dropdown", "settings-confirmation-dialog", "derivation-review-sheet"].flatMap((state) => variants("overlay", state, [390, 1440])),
  ...["sticky-popover-toast", "shell-backdrop-overlay-toast"].flatMap((state) => variants("layer-harness", state, [390, 1440])),
];

function hash(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function fail(errors) {
  errors.forEach((error) => console.error(`EVIDENCE: ${error}`));
  process.exitCode = 1;
}

try {
  if (process.argv[2] !== "--stage" || process.argv[3] !== "before") throw new Error("Usage: check-visual-evidence.mjs --stage before");
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  const errors = [];
  if (evidence.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (evidence.identity !== "visual-foundations@example.test") errors.push("identity must use visual-foundations@example.test");
  const cssHash = execFileSync("git", ["hash-object", "app/src/app/globals.css"], { cwd: repoRoot, encoding: "utf8" }).trim();
  if (evidence.before?.cssHash !== cssHash) errors.push("before CSS hash does not equal current globals.css hash");
  const keys = evidence.captures.map((capture) => capture.key);
  if (new Set(keys).size !== keys.length) errors.push("capture keys must be unique");
  for (const key of required) if (!keys.includes(key)) errors.push(`missing required capture ${key}`);
  for (const key of keys) if (!required.includes(key)) errors.push(`unexpected capture ${key}`);
  for (const capture of evidence.captures) {
    const file = resolve(repoRoot, capture.path);
    if (!existsSync(file)) errors.push(`${capture.key} artifact missing: ${capture.path}`);
    else if (hash(file) !== capture.sha256) errors.push(`${capture.key} artifact hash mismatch`);
    if (capture.result !== "pass") errors.push(`${capture.key} result must be pass`);
    for (const mask of requiredMasks) if (!capture.masks?.includes(mask)) errors.push(`${capture.key} missing mask ${mask}`);
    if (!["light", "dark"].includes(capture.theme)) errors.push(`${capture.key} invalid theme`);
    if (!["pt-BR", "en"].includes(capture.locale)) errors.push(`${capture.key} invalid locale`);
  }
  const themes = new Set(evidence.captures.map((capture) => capture.theme));
  const locales = new Set(evidence.captures.map((capture) => capture.locale));
  if (themes.size !== 2) errors.push("captures must collectively cover light and dark");
  if (locales.size !== 2) errors.push("captures must collectively cover pt-BR and en");
  for (const defect of evidence.defects ?? []) if (!validOwners.has(defect.owner)) errors.push(`${defect.id} has invalid deferred owner ${defect.owner}`);

  if (errors.length) fail(errors);
  else {
    const lines = evidence.captures.map((capture) => `| ${capture.scenario} | ${capture.state} | ${capture.viewport} | ${capture.theme} | ${capture.locale} | \`${capture.path}\` | pass |`);
    const defects = evidence.defects.map((defect) => `| ${defect.id} | ${defect.observation} | ${defect.owner} |`);
    writeFileSync(baselinePath, `# Phase 109 Before-change Baseline\n\nGenerated from \`109-EVIDENCE.json\`. The immutable pre-change \`globals.css\` blob is \`${cssHash}\`.\n\nSynthetic identity: \`visual-foundations@example.test\`. No production customer data is present.\n\n## Capture Matrix\n\n| Scenario | State | Width | Theme | Locale | Artifact | Result |\n|---|---|---:|---|---|---|---|\n${lines.join("\n")}\n\n## Observed Defects\n\n| ID | Observation | Deferred Owner Phase |\n|---|---|---:|\n${defects.join("\n")}\n`);
    console.log(`Visual before evidence complete: ${evidence.captures.length} captures, CSS ${cssHash}.`);
  }
} catch (error) {
  fail([error instanceof Error ? error.message : String(error)]);
}
