#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const appDir = resolve(repoRoot, "app");
const phaseDir = resolve(repoRoot, ".planning/phases/123-visual-validation-gate");
const defaultEvidencePath = resolve(phaseDir, "123-EVIDENCE.json");
const templatePath = resolve(phaseDir, "123-EVIDENCE.template.json");
const baselinePath = resolve(phaseDir, "123-BASELINE.md");
const verificationPath = resolve(phaseDir, "123-VERIFICATION.md");
const VALID_STAGES = new Set(["before", "after", "final"]);
const MEAN_QUALITY_THRESHOLD = 75;
const FACTUAL_FIDELITY_THRESHOLD = 0.95;

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
    import { matrixKeys } from "./scripts/creative-validation-matrix.ts";
    console.log(JSON.stringify(matrixKeys()));
  `;
  const output = execFileSync("npx", ["tsx", "-e", script], {
    cwd: appDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(output.trim());
}

function twelveCriteriaPresentViaTsx(capture) {
  const payload = JSON.stringify(capture);
  const script = `
    import { twelveCriteriaPresent } from "./src/server/ai/creative-validation-aggregation.ts";
    const capture = ${payload};
    process.stdout.write(twelveCriteriaPresent(capture) ? "true" : "false");
  `;
  const output = execFileSync("npx", ["tsx", "-e", script], {
    cwd: appDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return output.trim() === "true";
}

function fidelityHits(capture) {
  const script = `
    import { FIDELITY_HARD_FAILURE_CODES } from "./src/server/ai/creative-validation-aggregation.ts";
    const capture = ${JSON.stringify(capture)};
    const hits = (capture.hardFailures ?? []).filter((f) => FIDELITY_HARD_FAILURE_CODES.has(f.code));
    process.stdout.write(JSON.stringify(hits.map((f) => f.code)));
  `;
  const output = execFileSync("npx", ["tsx", "-e", script], {
    cwd: appDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(output.trim());
}

function currentPromptHash() {
  return execFileSync("git", ["hash-object", "app/src/server/ai/prompt-builder.ts"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}

function computeAggregateViaTsx(afterCaptures) {
  const script = `
    import { computeCreativeValidationAggregate } from "./src/server/ai/creative-validation-aggregation.ts";
    const afterCaptures = ${JSON.stringify(afterCaptures)};
    process.stdout.write(JSON.stringify(computeCreativeValidationAggregate(afterCaptures)));
  `;
  const output = execFileSync("npx", ["tsx", "-e", script], {
    cwd: appDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(output.trim());
}

function assertThresholdsViaTsx(aggregate) {
  const script = `
    import { assertThresholdsMet } from "./src/server/ai/creative-validation-aggregation.ts";
    const aggregate = ${JSON.stringify(aggregate)};
    try {
      assertThresholdsMet(aggregate);
      process.stdout.write("ok");
    } catch (error) {
      process.stdout.write(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  `;
  try {
    execFileSync("npx", ["tsx", "-e", script], {
      cwd: appDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return null;
  } catch (error) {
    const stderr = error?.stderr?.toString?.() ?? "";
    const stdout = error?.stdout?.toString?.() ?? "";
    return (stdout || stderr || error.message || "threshold assertion failed").trim();
  }
}

function dimensionMeans(capture) {
  const breakdown = capture.score?.scoreBreakdown ?? {};
  const info = capture.qa?.checklist?.informationPreservation?.status ?? "—";
  const brief = capture.qa?.checklist?.briefMatch?.status ?? "—";
  return {
    informationPreservation: breakdown.informationPreservation ?? "—",
    briefMatch: breakdown.briefMatch ?? "—",
    qaInformationPreservation: info,
    qaBriefMatch: brief,
  };
}

function writeBaseline(evidence, aggregate, matrixKeys) {
  mkdirSync(phaseDir, { recursive: true });
  const beforeByKey = new Map((evidence.beforeCaptures ?? []).map((c) => [c.key, c]));
  const afterByKey = new Map((evidence.afterCaptures ?? []).map((c) => [c.key, c]));
  const rows = matrixKeys.map((key) => {
    const before = beforeByKey.get(key);
    const after = afterByKey.get(key);
    const dims = after ? dimensionMeans(after) : null;
    const fidelityCodes = after ? fidelityHits(after) : [];
    return `| ${key} | ${before?.corpusRefId ?? "—"} | ${before?.qualityScore ?? "—"} | ${after?.qualityScore ?? "—"} | ${after?.qualityVerdict ?? "—"} | ${fidelityCodes.length ? fidelityCodes.join(", ") : "—"} | ${dims ? `${dims.informationPreservation}/${dims.briefMatch}` : "—"} |`;
  });
  writeFileSync(
    baselinePath,
    `# Phase 123 Creative Validation Baseline\n\n` +
      `Generated from \`123-EVIDENCE.json\` at ${new Date().toISOString()}.\n\n` +
      `**seedSupported:** ${evidence.seedSupported}\n` +
      `**promptHash:** \`${evidence.pipeline?.promptHash ?? "missing"}\`\n` +
      `**openaiImageModel:** ${evidence.pipeline?.openaiImageModel ?? "—"}\n\n` +
      `## Aggregate (after captures)\n\n` +
      `| Metric | Value | Threshold |\n|---|---:|---:|\n` +
      `| meanQualityScore | ${aggregate.meanQualityScore.toFixed(2)} | ≥${MEAN_QUALITY_THRESHOLD} |\n` +
      `| factualFidelityRate | ${aggregate.factualFidelityRate.toFixed(3)} (${aggregate.fidelityPassCount}/${aggregate.totalCount}) | ≥${FACTUAL_FIDELITY_THRESHOLD} |\n\n` +
      `## Before / After Matrix\n\n` +
      `| Key | Corpus Ref | Before Score | After Score | Verdict | Fidelity Hard Failures | Score info/brief |\n|---|---|---:|---:|---|---|---|\n` +
      `${rows.join("\n")}\n`
  );
}

function buildRequirementRows(evidence, aggregate, structuralPass, thresholdError, fidelityErrors) {
  const finalCmd = "node app/scripts/check-creative-validation-evidence.mjs --stage final";
  const releaseCmd = "cd app && node scripts/run-creative-release-gate.mjs";
  const qa18Pass = structuralPass;
  const qa19Pass = !thresholdError;
  const qa20Pass = fidelityErrors.length === 0;
  const qa21Result = evidence.automated?.["creative-release-gate"] ?? "pending";

  return [
    {
      id: "QA-18",
      result: qa18Pass ? "pass" : "fail",
      automated: `node app/scripts/check-creative-validation-evidence.mjs --stage before && --stage after`,
      note: `${evidence.beforeCaptures?.length ?? 0}/${evidence.afterCaptures?.length ?? 0} paired matrix keys`,
    },
    {
      id: "QA-19",
      result: qa19Pass ? "pass" : "gaps_found",
      automated: finalCmd,
      note: `meanQualityScore=${aggregate.meanQualityScore.toFixed(2)} (≥${MEAN_QUALITY_THRESHOLD}); factualFidelityRate=${aggregate.factualFidelityRate.toFixed(3)} (≥${FACTUAL_FIDELITY_THRESHOLD})`,
    },
    {
      id: "QA-20",
      result: qa20Pass ? "pass" : "gaps_found",
      automated: finalCmd,
      note: fidelityErrors.length
        ? `${fidelityErrors.length} after capture(s) with fidelity hard failures`
        : "zero fidelity hard failures on after set",
    },
    {
      id: "QA-21",
      result: qa21Result === "pass" ? "pass" : qa21Result === "fail" ? "gaps_found" : "pending",
      automated: releaseCmd,
      note: "npm test + lint + build + final evidence check",
    },
  ];
}

function writeVerification(evidence, aggregate, requirementRows, overallStatus) {
  mkdirSync(phaseDir, { recursive: true });
  const gapRows = requirementRows
    .filter((row) => row.result === "gaps_found" || row.result === "fail")
    .map((row) => `- **${row.id}:** ${row.note}`)
    .join("\n");
  const requirementTable = requirementRows
    .map((row) => `| ${row.id} | ${row.result} | \`${row.automated}\` | ${row.note} |`)
    .join("\n");
  const conclusion =
    overallStatus === "passed"
      ? "All four Phase 123 success criteria met on committed evidence. Milestone v12.3 visual validation gate is closable from CI without live OpenAI."
      : overallStatus === "human_needed"
        ? "Infrastructure and regression gate are in place; operator must refresh after captures until QA-19/QA-20 thresholds pass."
        : "Evidence infrastructure complete; committed after captures do not yet meet QA-19/QA-20 quality and fidelity thresholds. Operator regeneration required before milestone closure.";

  writeFileSync(
    verificationPath,
    `---\nphase: 123-visual-validation-gate\nverified: ${new Date().toISOString()}\nstatus: ${overallStatus}\n---\n\n` +
      `# Phase 123: Visual Validation Gate Verification Report\n\n` +
      `**Phase Goal:** Milestone fecha com evidência visual controlada de que o pipeline corrigido atinge metas de qualidade e fidelidade factual antes do release.\n\n` +
      `**seedSupported:** false (OpenAI image API lacks deterministic seed)\n` +
      `**promptHash:** \`${evidence.pipeline?.promptHash ?? "missing"}\`\n` +
      `**capturedAt:** ${evidence.capturedAt ?? "—"}\n\n` +
      `## Aggregate Scores\n\n` +
      `| Metric | Value | Threshold | Met |\n|---|---:|---:|:---:|\n` +
      `| meanQualityScore | ${aggregate.meanQualityScore.toFixed(2)} | ≥${MEAN_QUALITY_THRESHOLD} | ${aggregate.meanQualityScore >= MEAN_QUALITY_THRESHOLD ? "✓" : "✗"} |\n` +
      `| factualFidelityRate | ${aggregate.factualFidelityRate.toFixed(3)} (${aggregate.fidelityPassCount}/${aggregate.totalCount}) | ≥${FACTUAL_FIDELITY_THRESHOLD} | ${aggregate.factualFidelityRate >= FACTUAL_FIDELITY_THRESHOLD ? "✓" : "✗"} |\n\n` +
      `## Requirement Evidence\n\n` +
      `| Requirement | Result | Automated Command | Notes |\n|---|---|---|---|\n` +
      `${requirementTable}\n\n` +
      (gapRows ? `## Gaps Found\n\n${gapRows}\n\n` : "") +
      `## Goal-Backward Conclusion\n\n${conclusion}\n`
  );
}

function updateEvidenceArtifacts(evidence, evidencePath, aggregate, requirementRows) {
  evidence.aggregate = aggregate;
  evidence.requirements = requirementRows.map(({ id, result, automated, note }) => ({
    id,
    result,
    automated,
    note,
  }));
  evidence.verifiedAt = new Date().toISOString();
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
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

function readEvidence(evidencePath, stage) {
  if (!existsSync(evidencePath)) {
    const afterHint =
      stage === "after"
        ? " afterCaptures will be required for every matrix key once evidence exists."
        : "";
    throw new Error(
      `evidence file missing: ${evidencePath}.${afterHint} See ${templatePath} and complete operator capture (plan 123-03).`
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

function validateAfterCaptures(evidence, matrixKeys, errors, warnings, { fidelityAsError = false } = {}) {
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

    const hits = fidelityHits(capture);
    for (const code of hits) {
      const message = `${key} afterCapture fidelity hard failure: ${code}`;
      if (fidelityAsError) {
        errors.push(message);
      } else {
        warnings.push(`${message} (warning only)`);
      }
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

function validateFinalThresholdsAndPrompt(evidence, errors) {
  const afterCaptures = evidence.afterCaptures ?? [];
  if (afterCaptures.length === 0) {
    errors.push("afterCaptures required for final stage");
    return {
      meanQualityScore: 0,
      factualFidelityRate: 0,
      fidelityPassCount: 0,
      totalCount: 0,
    };
  }

  const aggregate = computeAggregateViaTsx(afterCaptures);
  const thresholdError = assertThresholdsViaTsx(aggregate);
  if (thresholdError) {
    errors.push(thresholdError);
  }

  const promptHash = currentPromptHash();
  if (!evidence.pipeline?.promptHash) {
    errors.push("pipeline.promptHash missing");
  } else if (evidence.pipeline.promptHash !== promptHash && !evidence.pipeline.staleRefreshNote) {
    errors.push(
      `pipeline.promptHash stale (evidence=${evidence.pipeline.promptHash}, current=${promptHash}); set pipeline.staleRefreshNote after operator refresh`
    );
  }

  return aggregate;
}

try {
  const { stage, evidencePath } = parseArgs(process.argv);

  if (process.argv[2] !== "--stage" || !stage || !VALID_STAGES.has(stage)) {
    console.error(usage());
    process.exitCode = 1;
  } else {
    const evidence = readEvidence(evidencePath, stage);
    const matrixKeys = loadMatrixKeys();
    const errors = [];
    const warnings = [];

    validateCommonSchema(evidence, errors);
    validateBeforeCaptures(evidence, matrixKeys, errors);

    if (stage === "after") {
      validateAfterCaptures(evidence, matrixKeys, errors, warnings);
    }

    if (stage === "final") {
      validateAfterCaptures(evidence, matrixKeys, errors, warnings, { fidelityAsError: true });
      const structuralErrorsBeforeThresholds = errors.length;
      const aggregate = validateFinalThresholdsAndPrompt(evidence, errors);
      const fidelityErrors = errors.filter((e) => e.includes("fidelity hard failure"));
      const thresholdError = errors.find(
        (e) => e.includes("meanQualityScore") || e.includes("factualFidelityRate")
      );
      const structuralPass = structuralErrorsBeforeThresholds === 0;
      const overallStatus =
        errors.length === 0 ? "passed" : structuralPass ? "gaps_found" : "gaps_found";

      writeBaseline(evidence, aggregate, matrixKeys);
      const requirementRows = buildRequirementRows(
        evidence,
        aggregate,
        structuralPass,
        thresholdError,
        fidelityErrors
      );
      writeVerification(evidence, aggregate, requirementRows, overallStatus);
      updateEvidenceArtifacts(evidence, evidencePath, aggregate, requirementRows);

      if (errors.length === 0) {
        console.log(
          `CREATIVE-EVIDENCE final stage complete: ${matrixKeys.length} paired keys, thresholds met, QA-18–20 pass.`
        );
      } else {
        console.error(
          `CREATIVE-EVIDENCE final stage: artifacts written (${baselinePath}, ${verificationPath}); ${errors.length} check(s) failed.`
        );
      }
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
