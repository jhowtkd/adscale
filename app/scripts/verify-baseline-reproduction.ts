/**
 * Controlled-baseline reproduction checker (ICE-05A). Compares an
 * independently authorized rerun report against the captured baseline:
 * same baseline, policy and inputs, identical artifact hashes.
 *
 * Usage:
 *   npx tsx scripts/verify-baseline-reproduction.ts <baseline.json> <reproduction.json>
 *
 * Exit codes: 0 reproduces exactly, 1 diverges or is malformed.
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { verifyBaselineReproduction } from "@/server/human-quality/baseline-reproduction";

function readJson(file: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  } catch {
    return null;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [baselineFile, reproductionFile] = process.argv.slice(2);
  if (!baselineFile || !reproductionFile) {
    console.error(
      "BASELINE-REPRODUCTION: usage: verify-baseline-reproduction.ts <baseline.json> <reproduction.json>",
    );
    process.exitCode = 1;
  } else {
    const baseline = readJson(baselineFile);
    const reproduction = readJson(reproductionFile);
    if (baseline === null || reproduction === null) {
      console.error("BASELINE-REPRODUCTION: unreadable input file");
      process.exitCode = 1;
    } else {
      const result = verifyBaselineReproduction(baseline, reproduction);
      if (result.ok) {
        console.log("[baseline-reproduction] PASS — rerun reproduces the baseline exactly");
      } else {
        for (const failure of result.failures) {
          console.error(`[baseline-reproduction] FAIL — ${failure}`);
        }
      }
      process.exitCode = result.ok ? 0 : 1;
    }
  }
}
