/**
 * 3:4 enablement gate validator (ICE-04B).
 *
 * This script is a VALIDATOR ONLY. It checks a completed enablement evidence
 * file: web and worker ran the same delivery SHA, the studio format matrix
 * passed on that SHA, a human reviewer judged every format's composition
 * and dimensions against real artifacts, and an authorized provider smoke
 * passed under a separate authorization. The validator never runs the
 * matrix, never calls a provider, and never fabricates verdicts.
 *
 * Usage:
 *   npx tsx scripts/check-34-enablement-evidence.ts <evidence-file.json>
 *
 * Exit codes:
 *   0 — the evidence file satisfies the enablement predicate.
 *   2 — the evidence file is still pending (template state) or fails.
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export const ENABLEMENT_MATRIX_FORMATS = ["1:1", "4:5", "9:16", "3:4"] as const;
export type EnablementMatrixFormat = (typeof ENABLEMENT_MATRIX_FORMATS)[number];

export type EnablementVisualEntry = {
  format: EnablementMatrixFormat;
  reviewer: string | null;
  /** Creative-work / output ids of the judged artifacts. */
  artifactIds: string[];
  /** Human verdict: layout intact, no stretch, no crop surprise. */
  compositionIntact: boolean | null;
  /** Human verdict: delivered bytes at the format's delivery dimensions. */
  dimensionsOk: boolean | null;
};

export type EnablementProviderSmoke = {
  /** Who authorized the billable smoke run. Never invented. */
  authorizedBy: string | null;
  executedAt: string | null;
  reportRef: string | null;
  outcome: "pass" | "fail" | null;
};

export type ThreeFourEnablementEvidence = {
  schemaVersion: 1;
  status: "pending_enablement" | "completed";
  /** Delivery SHA the web deploy ran. */
  webSha: string | null;
  /** Delivery SHA the worker deploy ran — must match webSha. */
  workerSha: string | null;
  matrixReport: string | null;
  /** SHA recorded in the matrix report — must match webSha. */
  matrixSha: string | null;
  matrixOk: boolean | null;
  visualEntries: EnablementVisualEntry[];
  providerSmoke: EnablementProviderSmoke | null;
};

export function validateEnablementEvidenceShape(evidence: ThreeFourEnablementEvidence): void {
  if (evidence.schemaVersion !== 1) {
    throw new Error(`3:4 enablement evidence requires schemaVersion 1; got ${evidence.schemaVersion ?? "none"}`);
  }
  if (!evidence.webSha || !evidence.workerSha) {
    throw new Error("3:4 enablement evidence needs both webSha and workerSha");
  }
  if (evidence.webSha !== evidence.workerSha) {
    throw new Error(
      `3:4 enablement requires compatible deploys: web ${evidence.webSha} != worker ${evidence.workerSha}`,
    );
  }
  if (!evidence.matrixReport) {
    throw new Error("3:4 enablement evidence needs a matrixReport path");
  }
  if (evidence.matrixSha !== evidence.webSha) {
    throw new Error("3:4 enablement requires the matrix report from the same delivery SHA");
  }
  if (evidence.matrixOk !== true) {
    throw new Error("3:4 enablement requires a green format matrix (matrixOk: true)");
  }
  const seen = new Set((evidence.visualEntries ?? []).map((entry) => entry.format));
  const missing = ENABLEMENT_MATRIX_FORMATS.filter((format) => !seen.has(format));
  if (missing.length > 0) {
    throw new Error(`3:4 enablement is missing visual entries for: ${missing.join(", ")}`);
  }
  for (const entry of evidence.visualEntries) {
    if (!entry.reviewer || entry.reviewer.trim().length === 0) {
      throw new Error(`${entry.format} needs a human reviewer name`);
    }
    if (!Array.isArray(entry.artifactIds) || entry.artifactIds.length === 0) {
      throw new Error(`${entry.format} needs at least one artifact id`);
    }
    if (entry.compositionIntact !== true) {
      throw new Error(`${entry.format} needs a human composition-intact verdict`);
    }
    if (entry.dimensionsOk !== true) {
      throw new Error(`${entry.format} needs a human dimensions-ok verdict`);
    }
  }
  const smoke = evidence.providerSmoke;
  if (!smoke || !smoke.authorizedBy || smoke.authorizedBy.trim().length === 0) {
    throw new Error("3:4 enablement needs a provider smoke authorized by a named human");
  }
  if (!smoke.executedAt || !smoke.reportRef) {
    throw new Error("3:4 enablement needs the smoke execution date and report reference");
  }
  if (smoke.outcome !== "pass") {
    throw new Error("3:4 enablement needs a passing authorized provider smoke");
  }
}

export function runEnablementCheck(file: string): { accepted: boolean; detail: string } {
  const evidence = JSON.parse(fs.readFileSync(file, "utf8")) as ThreeFourEnablementEvidence;
  if (evidence.status === "pending_enablement") {
    return { accepted: false, detail: "PENDING enablement: evidence scaffolded, verdicts not filled" };
  }
  validateEnablementEvidenceShape(evidence);
  return {
    accepted: true,
    detail: `sha=${evidence.webSha} matrix=${evidence.matrixReport} smoke=${evidence.providerSmoke?.reportRef}`,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) {
    throw new Error("Usage: check-34-enablement-evidence.ts <evidence-file.json>");
  }
  try {
    const outcome = runEnablementCheck(file);
    console.log(`[34-enablement] ${outcome.accepted ? "PASS" : "FAIL"} — ${outcome.detail}`);
    process.exitCode = outcome.accepted ? 0 : 2;
  } catch (error) {
    console.log(`[34-enablement] FAIL — ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
