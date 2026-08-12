import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildBrandConsistencyEvidence,
  formatBrandConsistencyEvidence,
  type BrandConsistencyEvidence,
} from "@/server/creative-work/brand-consistency-evidence";

export function defaultEvidencePath(manifestPath: string): string {
  const extension = path.extname(manifestPath);
  const stem = extension
    ? manifestPath.slice(0, -extension.length)
    : manifestPath;
  return `${stem}.evidence.json`;
}

export function runBrandConsistencyValidation(input: {
  manifestPath: string;
  outputPath?: string;
  capturedAt?: string;
}): { report: BrandConsistencyEvidence; outputPath: string } {
  const manifest = JSON.parse(readFileSync(input.manifestPath, "utf8")) as unknown;
  const report = buildBrandConsistencyEvidence(manifest, input.capturedAt);
  const outputPath = input.outputPath ?? defaultEvidencePath(input.manifestPath);
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { report, outputPath };
}

function usage(): string {
  return "Usage: npm run validate:brand-consistency -- --manifest PATH [--out PATH]";
}

function parseArgs(argv: string[]): { manifestPath: string; outputPath?: string } {
  let manifestPath = "";
  let outputPath: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--manifest") manifestPath = argv[++index] ?? "";
    else if (arg === "--out") outputPath = argv[++index];
    else if (arg === "--help" || arg === "-h") throw new Error(usage());
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  if (!manifestPath) throw new Error(`--manifest is required\n${usage()}`);
  return { manifestPath: path.resolve(manifestPath), outputPath: outputPath && path.resolve(outputPath) };
}

export function main(argv = process.argv.slice(2)): number {
  try {
    const result = runBrandConsistencyValidation(parseArgs(argv));
    console.log(formatBrandConsistencyEvidence(result.report));
    console.log(`Structured evidence: ${result.outputPath}`);
    return result.report.status === "fail" ? 1 : 0;
  } catch (error) {
    console.error(`BRAND-CONSISTENCY: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
