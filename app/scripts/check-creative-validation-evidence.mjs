#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const phaseDir = resolve(repoRoot, ".planning/phases/123-visual-validation-gate");
const defaultEvidencePath = resolve(phaseDir, "123-EVIDENCE.json");
const templatePath = resolve(phaseDir, "123-EVIDENCE.template.json");
const VALID_STAGES = new Set(["before", "after", "final"]);

function usage() {
  return "Usage: node app/scripts/check-creative-validation-evidence.mjs --stage before|after|final [--evidence PATH]";
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function fail(errors) {
  for (const error of errors) {
    console.error(`CREATIVE-EVIDENCE: ${error}`);
  }
  process.exitCode = 1;
}

function resolveUnderRepo(relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new Error("path must be a non-empty string");
  }
  if (relativePath.includes("..")) {
    throw new Error(`path traversal rejected: ${relativePath}`);
  }
  const absolute = resolve(repoRoot, relativePath);
  const rootWithSep = repoRoot.endsWith(sep) ? repoRoot : `${repoRoot}${sep}`;
  if (!absolute.startsWith(rootWithSep) && absolute !== repoRoot) {
    throw new Error(`path escapes repo root: ${relativePath}`);
  }
  return absolute;
}

function loadMatrixKeys() {
  const script = `
    import { matrixKeys } from "./app/scripts/creative-validation-matrix.ts";
    console.log(JSON.stringify(matrixKeys()));
  `;
  const output = execFileSync("npx", ["tsx", "-e", script], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(output.trim());
}

function twelveCriteriaPresentViaTsx(capture) {
  const payload = JSON.stringify(capture);
  const script = `
    import { twelveCriteriaPresent } from "./app/src/server/ai/creative-validation-aggregation.ts";
    const capture = ${payload};
    process.stdout.write(twelveCriteriaPresent(capture) ? "true" : "false");
  `;
  const output = execFileSync("npx", ["tsx", "-e", script], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return output.trim() === "true";
}

function fidelityWarnings(capture) {
  const script = `
    import { FIDELITY_HARD_FAILURE_CODES } from "./app/src/server/ai/creative-validation-aggregation.ts";
    const capture = ${JSON.stringify(capture)};
    const hits = (capture.hardFailures ?? []).filter((f) => FIDELITY_HARD_FAILURE_CODES.has(f.code));
    process.stdout.write(JSON.stringify(hits.map((f) => f.code)));
  `;
  const output = execFileSync("npx", ["tsx", "-e", script], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(output.trim());
}

function parseArgs(argv) {
  const stageIndex = argv.indexOf("--stage");
  const evidenceIndex = argv.indexOf("--evidence");
  const stage = stageIndex >= 0 ? argv[stageIndex + 1] : undefined;
  const evidenceArg = evidenceIndex >= 0 ? argv[evidenceIndex + 1] : undefined;
  return {
    stage,
    evidencePath: evidenceArg ? resolve(repoRoot, evidenceArg) : defaultEvidencePath,
  };
}

function readEvidence(evidencePath) {
  if (!existsSync(evidencePath)) {
    throw new Error(
      `evidence file missing: ${evidencePath}. See ${templatePath} and complete operator capture (plan 123-03).`
    );
  }
  return JSON.parse(readFileSync(evidencePath, "utf8"));
}

function validateBeforeCaptures(evidence, matrixKeys, errors) {
  const beforeCaptures = evidence.beforeCaptures ?? [];
  const beforeByKey = new Map(beforeCaptures.map((capture) => [capture.key, capture]));

  if (beforeCaptures.length !== new Set(beforeCaptures.map((c) => c.key)).size) {
    errors.push("beforeCaptures keys must be unique");
  }

  for (const key of matrixKeys) {
    const capture = beforeByKey.get(key);
    if (!capture) {
      errors.push(`missing beforeCapture for matrix key ${key}`);
      continue;
    }
    if (capture.source !== "corpus") {
      errors.push(`${key} beforeCapture source must be corpus`);
    }
    if (typeof capture.corpusRefId !== "string" || capture.corpusRefId.length === 0) {
      errors.push(`${key} beforeCapture missing corpusRefId`);
    }
    if (typeof capture.sha256 !== "string" || capture.sha256.length !== 64) {
      errors.push(`${key} beforeCapture missing valid sha256`);
    }
    if (typeof capture.path !== "string" && typeof capture.public_url !== "string") {
      errors.push(`${key} beforeCapture requires path or public_url`);
    }
    if (typeof capture.path === "string") {
      try {
        const file = resolveUnderRepo(capture.path);
        if (existsSync(file)) {
          if (hashFile(file) !== capture.sha256) {
            errors.push(`${key} beforeCapture sha256 mismatch for ${capture.path}`);
          }
        } else if (!capture.public_url) {
          errors.push(`${key} beforeCapture path missing on disk and no public_url fallback`);
        }
      } catch (error) {
        errors.push(`${key} beforeCapture path invalid: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  for (const capture of beforeCaptures) {
    if (!matrixKeys.includes(capture.key)) {
      errors.push(`unexpected beforeCapture key ${capture.key}`);
    }
  }
}

function validateAfterCaptures(evidence, matrixKeys, errors, warnings) {
  const afterCaptures = evidence.afterCaptures ?? [];
  const afterByKey = new Map(afterCaptures.map((capture) => [capture.key, capture]));

  if (afterCaptures.length !== new Set(afterCaptures.map((c) => c.key)).size) {
    errors.push("afterCaptures keys must be unique");
  }

  for (const key of matrixKeys) {
    const capture = afterByKey.get(key);
    if (!capture) {
      errors.push(`missing afterCapture for matrix key ${key}`);
      continue;
    }
    if (capture.source !== "regenerated") {
      errors.push(`${key} afterCapture source must be regenerated`);
    }
    if (typeof capture.qualityScore !== "number") {
      errors.push(`${key} afterCapture missing qualityScore`);
    }
    if (typeof capture.qualityVerdict !== "string" || capture.qualityVerdict.length === 0) {
      errors.push(`${key} afterCapture missing qualityVerdict`);
    }
    if (!Array.isArray(capture.hardFailures)) {
      errors.push(`${key} afterCapture hardFailures must be an array`);
    }
    if (!capture.qa?.checklist) {
      errors.push(`${key} afterCapture missing qa.checklist`);
    }
    if (!capture.score?.scoreBreakdown) {
      errors.push(`${key} afterCapture missing score.scoreBreakdown`);
    }
    if (typeof capture.path !== "string") {
      errors.push(`${key} afterCapture missing path`);
      continue;
    }
    if (!capture.path.includes("validation-after/")) {
      errors.push(`${key} afterCapture path must be under validation-after/`);
    }
    if (typeof capture.sha256 !== "string" || capture.sha256.length !== 64) {
      errors.push(`${key} afterCapture missing valid sha256`);
    }
    try {
      const file = resolveUnderRepo(capture.path);
      if (!file.includes(`${sep}validation-after${sep}`)) {
        errors.push(`${key} afterCapture resolved path must stay under validation-after`);
      }
      if (!existsSync(file)) {
        errors.push(`${key} afterCapture artifact missing: ${capture.path}`);
      } else if (hashFile(file) !== capture.sha256) {
        errors.push(`${key} afterCapture sha256 mismatch for ${capture.path}`);
      }
    } catch (error) {
      errors.push(`${key} afterCapture path invalid: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (capture.qa?.checklist && capture.score?.scoreBreakdown) {
      if (!twelveCriteriaPresentViaTsx(capture)) {
        errors.push(`${key} afterCapture missing required QA/score criteria (twelveCriteriaPresent)`);
      }
    }

    const fidelityHits = fidelityWarnings(capture);
    for (const code of fidelityHits) {
      warnings.push(`${key} afterCapture fidelity hard failure (warning only): ${code}`);
    }
  }

  for (const capture of afterCaptures) {
    if (!matrixKeys.includes(capture.key)) {
      errors.push(`unexpected afterCapture key ${capture.key}`);
    }
  }
}

function validateCommonSchema(evidence, errors) {
  if (evidence.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1");
  }
  if (evidence.seedSupported !== false) {
    errors.push("seedSupported must be false");
  }
  if (!evidence.pipeline || typeof evidence.pipeline !== "object") {
    errors.push("pipeline object required");
  }
}

try {
  const { stage, evidencePath } = parseArgs(process.argv);

  if (process.argv[2] !== "--stage" || !stage || !VALID_STAGES.has(stage)) {
    console.error(usage());
    process.exitCode = 1;
  } else if (stage === "final") {
    throw new Error("not implemented — complete in plan 123-04");
  } else {
    const evidence = readEvidence(evidencePath);
    const matrixKeys = loadMatrixKeys();
    const errors = [];
    const warnings = [];

    validateCommonSchema(evidence, errors);
    validateBeforeCaptures(evidence, matrixKeys, errors);

    if (stage === "after") {
      validateAfterCaptures(evidence, matrixKeys, errors, warnings);
    }

    if (warnings.length) {
      for (const warning of warnings) {
        console.warn(`CREATIVE-EVIDENCE: ${warning}`);
      }
    }

    if (errors.length) {
      fail(errors);
    } else if (stage === "before") {
      console.log(
        `CREATIVE-EVIDENCE before stage complete: ${evidence.beforeCaptures.length}/${matrixKeys.length} matrix keys validated.`
      );
    } else if (stage === "after") {
      console.log(
        `CREATIVE-EVIDENCE after stage complete: ${evidence.afterCaptures.length}/${matrixKeys.length} afterCaptures structurally valid.`
      );
    }
  }
} catch (error) {
  fail([error instanceof Error ? error.message : String(error)]);
}
