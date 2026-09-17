/**
 * Experiment manifest checker (ICE-05A). Validates the decision binding for
 * one quality-release experiment: single feature, compatible baseline,
 * equivalent inputs, origin, authorization, verified measurements, blind
 * packages and gate reports — and rejects any approval the evidence does
 * not support. Quality-recovery gates are evaluated by re-running the
 * existing checker's pure evaluation, never a reimplementation.
 *
 * Usage:
 *   npx tsx scripts/check-experiment-manifest.ts <manifest.json>
 *
 * Exit codes:
 *   0 — the manifest is valid and its conclusion is supported.
 *   2 — the manifest is pending (prepared package, no conclusion yet).
 *   1 — the manifest is invalid or its conclusion is unsupported.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { evaluateGate } from "./check-creative-work-quality-recovery-gate";
import { validateExperimentManifest } from "@/server/human-quality/experiment-manifest";

function readJson(ref: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(ref, "utf8")) as unknown;
  } catch {
    return null;
  }
}

export function runExperimentManifestCheck(file: string): {
  code: 0 | 1 | 2;
  detail: string;
} {
  const manifest = readJson(file);
  if (manifest === null) {
    return { code: 1, detail: `manifest is missing or not valid JSON: ${file}` };
  }
  const baseDir = path.dirname(path.resolve(file));
  const resolve = (ref: string): unknown | null =>
    readJson(path.isAbsolute(ref) ? ref : path.join(baseDir, ref));
  const result = validateExperimentManifest(
    manifest,
    resolve,
    (evidence) => evaluateGate(evidence),
  );
  if (!result.ok) {
    return { code: 1, detail: result.failures.join("; ") };
  }
  const decision = (manifest as { conclusion?: { decision?: unknown } }).conclusion?.decision;
  if (decision === "pending") {
    return { code: 2, detail: "PENDING experiment: package prepared, conclusion not drawn" };
  }
  return { code: 0, detail: `manifest valid; conclusion: ${String(decision)}` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) {
    console.error("EXPERIMENT-MANIFEST: usage: check-experiment-manifest.ts <manifest.json>");
    process.exitCode = 1;
  } else {
    const outcome = runExperimentManifestCheck(file);
    console.log(
      `[experiment-manifest] ${outcome.code === 0 ? "PASS" : outcome.code === 2 ? "PENDING" : "FAIL"} — ${outcome.detail}`,
    );
    process.exitCode = outcome.code;
  }
}
