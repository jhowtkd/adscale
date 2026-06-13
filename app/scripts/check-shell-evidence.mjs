#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const evidencePath = path.join(
  root,
  ".planning/phases/110-app-shell-and-navigation/110-EVIDENCE.json",
);

if (!existsSync(evidencePath)) {
  console.error("Missing 110-EVIDENCE.json — run visual-shell Playwright suite first.");
  process.exit(1);
}

const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
const errors = [];
const checks = evidence.checks ?? [];
const requiredRoutes = ["/", "/campaigns", "/settings"];
const requiredViewports = [390, 768, 1280];

for (const route of requiredRoutes) {
  for (const viewport of requiredViewports) {
    const key = `${route}@${viewport}`;
    const row = checks.find((check) => check.key === key);
    if (!row) errors.push(`missing check ${key}`);
    else if (row.result !== "pass") errors.push(`${key} result ${row.result}`);
  }
}

for (const id of ["SHELL-01", "SHELL-02", "SHELL-03", "SHELL-04", "SHELL-05"]) {
  if (evidence.requirements?.[id]?.result !== "pass") errors.push(`${id} not pass`);
}

if (!(evidence.resolvedDefects ?? []).includes("DEFECT-LANDMARKS")) {
  errors.push("DEFECT-LANDMARKS not resolved in 110 evidence");
}

const basePath = path.join(
  root,
  ".planning/phases/109-visual-foundations-and-baseline/109-EVIDENCE.json",
);
if (existsSync(basePath)) {
  const base = JSON.parse(readFileSync(basePath, "utf8"));
  const landmark = (base.defects ?? []).find((defect) => defect.id === "DEFECT-LANDMARKS");
  if (!landmark || landmark.status !== "resolved") {
    errors.push("DEFECT-LANDMARKS not marked resolved in 109-EVIDENCE.json");
  }
}

if (errors.length) {
  console.error(`Shell evidence failed:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

console.log(`Shell evidence complete: ${checks.length} checks, 5 requirements pass, DEFECT-LANDMARKS resolved.`);
