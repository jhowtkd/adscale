/**
 * Build Olhar release evidence JSON from a Cenbrap calibration artifact.
 *
 * Usage:
 *   npx tsx scripts/build-olhar-release-evidence.ts --calibration PATH --output PATH
 *   npx tsx scripts/build-olhar-release-evidence.ts --template  # allow template calibration input
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { CenbrapCalibrationReport } from "@/server/olhar-calibration/cenbrap-calibration";
import { buildOlharReleaseEvidence } from "@/server/olhar-calibration/olhar-release-evidence";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPO_ROOT = path.resolve(APP_ROOT, "..");
const PHASE_142_DIR = path.join(
  REPO_ROOT,
  ".planning/phases/142-cenbrap-calibration-and-release-evidence"
);
const PHASE_144_DIR = path.join(
  REPO_ROOT,
  ".planning/phases/144-cenbrap-corpus-seeding-and-calibration-rerun"
);

const DEFAULT_CALIBRATION = path.join(PHASE_142_DIR, "142-CENBRAP-CALIBRATION.json");
const DEFAULT_OUTPUT = path.join(PHASE_142_DIR, "142-EVIDENCE.json");
const DEFAULT_CONTACT_SHEET = path.join(PHASE_142_DIR, "142-CONTACT-SHEET.md");
const DEFAULT_CORPUS_MANIFEST = path.join(PHASE_144_DIR, "144-CORPUS-MANIFEST.json");

const SYNTHETIC_FIXTURE_CAVEAT =
  "All evaluated rows are synthetic_fixture — operational calibration only, not real customer evidence.";

interface CliOptions {
  calibration: string;
  output: string;
  contactSheet: string;
  corpusManifest: string;
  template: boolean;
}

interface CorpusManifest {
  sourcePolicy?: string;
  campaigns?: Array<{ sourceLabel?: string }>;
}

function usage(): string {
  return [
    "Usage: npx tsx scripts/build-olhar-release-evidence.ts [options]",
    "",
    "Options:",
    "  --calibration <path>      Calibration JSON input (default: 142-CENBRAP-CALIBRATION.json)",
    "  --output <path>           Evidence JSON output (default: 142-EVIDENCE.json)",
    "  --contact-sheet <path>    Contact sheet path recorded in evidence metadata",
    "  --corpus-manifest <path>  Corpus manifest for source-label caveats",
    "  --template                Allow building from template calibration (default: refuse)",
  ].join("\n");
}

function parseArgs(argv: string[]): CliOptions {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    process.exit(0);
  }

  const calibrationIndex = argv.indexOf("--calibration");
  const outputIndex = argv.indexOf("--output");
  const contactSheetIndex = argv.indexOf("--contact-sheet");
  const corpusManifestIndex = argv.indexOf("--corpus-manifest");

  return {
    calibration:
      calibrationIndex >= 0
        ? path.resolve(argv[calibrationIndex + 1] ?? "")
        : DEFAULT_CALIBRATION,
    output:
      outputIndex >= 0 ? path.resolve(argv[outputIndex + 1] ?? "") : DEFAULT_OUTPUT,
    contactSheet:
      contactSheetIndex >= 0
        ? path.resolve(argv[contactSheetIndex + 1] ?? "")
        : DEFAULT_CONTACT_SHEET,
    corpusManifest:
      corpusManifestIndex >= 0
        ? path.resolve(argv[corpusManifestIndex + 1] ?? "")
        : DEFAULT_CORPUS_MANIFEST,
    template: argv.includes("--template"),
  };
}

function toRepoRelative(absolutePath: string): string {
  const relative = path.relative(REPO_ROOT, absolutePath);
  return relative.startsWith("..") ? absolutePath : relative.split(path.sep).join("/");
}

function readJsonFile<T>(filePath: string, label: string): T {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    throw new Error(`Invalid JSON in ${label}: ${filePath}`);
  }
}

function assertCalibrationShape(
  calibration: CenbrapCalibrationReport
): asserts calibration is CenbrapCalibrationReport {
  if (calibration.schemaVersion !== 1) {
    throw new Error("Calibration schemaVersion must be 1");
  }
  if (calibration.mode !== "live" && calibration.mode !== "template") {
    throw new Error(`Unexpected calibration mode: ${String(calibration.mode)}`);
  }
  if (!calibration.metrics || !Array.isArray(calibration.sampleGuidance)) {
    throw new Error("Calibration JSON is missing metrics or sampleGuidance");
  }
}

function resolveSourceCaveats(
  corpusManifestPath: string,
  calibrationNotes: string[]
): string[] {
  const caveats: string[] = [];

  if (fs.existsSync(corpusManifestPath)) {
    const manifest = readJsonFile<CorpusManifest>(
      corpusManifestPath,
      "corpus manifest"
    );

    if (typeof manifest.sourcePolicy === "string" && manifest.sourcePolicy.length > 0) {
      caveats.push(manifest.sourcePolicy);
    }

    const hasSyntheticFixture = manifest.campaigns?.some(
      (entry) => entry.sourceLabel === "synthetic_fixture"
    );
    if (hasSyntheticFixture) {
      caveats.push(SYNTHETIC_FIXTURE_CAVEAT);
    }
  }

  for (const note of calibrationNotes) {
    if (note.toLowerCase().includes("synthetic_fixture")) {
      caveats.push(note);
    }
  }

  return [...new Set(caveats)];
}

function mergeAcceptedGaps(
  evidenceGaps: string[],
  sourceCaveats: string[]
): string[] {
  return [...new Set([...evidenceGaps, ...sourceCaveats])];
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const calibration = readJsonFile<CenbrapCalibrationReport>(
    options.calibration,
    "calibration"
  );

  assertCalibrationShape(calibration);

  if (calibration.mode === "template" && !options.template) {
    throw new Error(
      "Refusing to build live release evidence from template calibration. " +
        "Pass --template to allow template input, or provide a live calibration artifact."
    );
  }

  const capturedAt = new Date().toISOString();
  const calibrationSourcePath = toRepoRelative(options.calibration);
  const contactSheetPath = fs.existsSync(options.contactSheet)
    ? toRepoRelative(options.contactSheet)
    : null;

  const evidence = buildOlharReleaseEvidence({
    calibration,
    capturedAt,
    calibrationSourcePath,
    contactSheetPath,
  });

  const sourceCaveats = resolveSourceCaveats(
    options.corpusManifest,
    calibration.evidenceNotes ?? []
  );
  evidence.acceptedGaps = mergeAcceptedGaps(evidence.acceptedGaps, sourceCaveats);

  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(evidence, null, 2)}\n`);

  console.log(`Wrote Olhar release evidence to ${options.output}`);
  console.log(`Status=${evidence.status}`);
  console.log(
    `Campaigns=${evidence.artDirectionMetrics.evaluatedCampaignCount} ` +
      `derivations=${evidence.artDirectionMetrics.evaluatedDerivationCount} ` +
      `decisions=${evidence.artDirectionMetrics.humanDecisionCount} ` +
      `agreementRate=${evidence.artDirectionMetrics.agreementRate ?? "null"}`
  );

  if (sourceCaveats.length > 0) {
    console.log(`Source caveats: ${sourceCaveats.length}`);
  }
}

main();
