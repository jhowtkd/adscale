import "./load-env";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildTemplateCalibrationReport,
  renderContactSheetMarkdown,
} from "@/server/olhar-calibration/cenbrap-calibration";
import { runCenbrapCalibration } from "@/server/olhar-calibration/service";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPO_ROOT = path.resolve(APP_ROOT, "..");
const DEFAULT_PHASE_DIR = path.join(
  REPO_ROOT,
  ".planning/phases/142-cenbrap-calibration-and-release-evidence"
);
const DEFAULT_OUTPUT = path.join(DEFAULT_PHASE_DIR, "142-CENBRAP-CALIBRATION.json");
const DEFAULT_CONTACT_SHEET = path.join(DEFAULT_PHASE_DIR, "142-CONTACT-SHEET.md");

interface CliOptions {
  output: string;
  contactSheet: string;
  allWorkspaces: boolean;
  workspaceId?: string;
  template: boolean;
}

function usage(): string {
  return [
    "Usage: npx tsx scripts/run-cenbrap-calibration.ts [options]",
    "",
    "Options:",
    "  --output <path>         Calibration JSON output",
    "  --contact-sheet <path>  Contact sheet markdown output",
    "  --all-workspaces        Scan all workspaces (default when no --workspace-id)",
    "  --workspace-id <id>     Scope to a single workspace",
    "  --template              Emit template artifact without requiring live DB data",
  ].join("\n");
}

function parseArgs(argv: string[]): CliOptions {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    process.exit(0);
  }

  const outputIndex = argv.indexOf("--output");
  const contactSheetIndex = argv.indexOf("--contact-sheet");
  const workspaceIndex = argv.indexOf("--workspace-id");
  const workspaceId =
    workspaceIndex >= 0 ? argv[workspaceIndex + 1]?.trim() : undefined;

  if (workspaceIndex >= 0 && !workspaceId) {
    throw new Error("--workspace-id requires a UUID value");
  }

  return {
    output:
      outputIndex >= 0
        ? path.resolve(argv[outputIndex + 1] ?? "")
        : DEFAULT_OUTPUT,
    contactSheet:
      contactSheetIndex >= 0
        ? path.resolve(argv[contactSheetIndex + 1] ?? "")
        : DEFAULT_CONTACT_SHEET,
    allWorkspaces: argv.includes("--all-workspaces") || !workspaceId,
    workspaceId,
    template: argv.includes("--template"),
  };
}

async function writeArtifacts(
  options: CliOptions,
  payload: ReturnType<typeof buildTemplateCalibrationReport>
): Promise<void> {
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.mkdirSync(path.dirname(options.contactSheet), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(payload, null, 2)}\n`);
  fs.writeFileSync(options.contactSheet, `${renderContactSheetMarkdown(payload)}\n`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const capturedAt = new Date().toISOString();

  if (options.template) {
    const report = buildTemplateCalibrationReport(capturedAt);
    await writeArtifacts(options, report);
    console.log(`Wrote template calibration JSON to ${options.output}`);
    console.log(`Wrote contact sheet to ${options.contactSheet}`);
    return;
  }

  try {
    const { report } = await runCenbrapCalibration({
      workspaceId: options.allWorkspaces ? undefined : options.workspaceId,
      capturedAt,
    });
    await writeArtifacts(options, report);
    console.log(`Wrote calibration JSON to ${options.output}`);
    console.log(`Wrote contact sheet to ${options.contactSheet}`);
    console.log(
      `Status=${report.status} campaigns=${report.metrics.evaluatedCampaignCount} derivations=${report.metrics.evaluatedDerivationCount} decisions=${report.metrics.decisionCount}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const report = buildTemplateCalibrationReport(capturedAt);
    report.evidenceNotes.push(
      `Live run failed (${message}) — emitted template artifact instead of failing dishonestly.`
    );
    await writeArtifacts(options, report);
    console.warn(
      `Live calibration unavailable (${message}); wrote template artifacts instead.`
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
