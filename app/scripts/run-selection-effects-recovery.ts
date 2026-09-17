import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  bootHarness,
  driveJourney,
  driveSelectionEffectsRecovery,
  EXIT_BOOTSTRAP_FAILED,
  EXIT_OK,
  EXIT_VALIDATION_FAILED,
  parseHarnessArgs,
  resolveHarnessConfig,
  seedHarnessFixture,
  stopHarness,
  type SelectionEffectsRecoveryReport,
} from "./worker-journey-harness";

/**
 * Selection-effects recovery E2E (ICE-03B). Reuses the shared harness boot
 * (web + queue + worker on one SHA) and journey driver, then runs the
 * recovery pass: approve a completed output and prove its obligations
 * converge to done while the approval is never shown as failed.
 */

export const RECOVERY_HELP = `selection-effects recovery E2E (ICE-03B): approve on the shared harness and prove convergence.

Usage:
  npx tsx scripts/run-selection-effects-recovery.ts [--build] [harness options]

The run always boots the success topology (worker included); --scenario is
not accepted here. Report: tests/e2e/.evidence/selection-effects-recovery.json
unless --report overrides it. Exit 0 converges, 1 fails validation, 2 fails bootstrap.`;

export function parseRecoveryArgs(argv: string[]): ReturnType<typeof parseHarnessArgs> {
  for (const flag of argv) {
    if (flag === "--scenario") {
      throw new Error("run-selection-effects-recovery boots the success topology; --scenario is not accepted");
    }
  }
  // The recovery pass needs completed outputs, so the journey always runs
  // the success scenario; every other harness flag passes through.
  return parseHarnessArgs(["--scenario", "success", ...argv]);
}

export interface RecoveryCliReport {
  recovery: SelectionEffectsRecoveryReport;
  meta: {
    baseUrl: string;
    queueUrl: string;
    runDir: string;
    workspaceId: string;
    workItemId: string;
    durationMs: number;
    startedAt: string;
  };
}

export async function runCli(argv: string[], env: NodeJS.ProcessEnv): Promise<number> {
  let args: ReturnType<typeof parseHarnessArgs>;
  try {
    args = parseRecoveryArgs(argv);
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}\n`);
    console.error(RECOVERY_HELP);
    return EXIT_BOOTSTRAP_FAILED;
  }
  if (args.help) {
    console.log(RECOVERY_HELP);
    return EXIT_OK;
  }
  const { config, problems } = resolveHarnessConfig(args, env);
  if (args.plan) {
    console.log(JSON.stringify({ plan: true, gate: "selection-effects-recovery", ...config, problems }, null, 2));
    return EXIT_OK;
  }
  if (problems.length > 0) {
    console.error(`error: cannot run recovery E2E:\n- ${problems.join("\n- ")}`);
    return EXIT_BOOTSTRAP_FAILED;
  }
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const reportPath = args.reportPath.includes("worker-journey-")
    ? path.resolve(process.cwd(), "tests/e2e/.evidence/selection-effects-recovery.json")
    : args.reportPath;
  const processes = await bootHarness(config);
  try {
    await seedHarnessFixture(config, processes);
    const { journey } = await driveJourney(config, processes, "terminal");
    const recovery = await driveSelectionEffectsRecovery(config, processes, journey);
    const report: RecoveryCliReport = {
      recovery,
      meta: {
        baseUrl: config.baseUrl,
        queueUrl: config.queueUrl,
        runDir: processes.runDir,
        workspaceId: journey.workspaceId,
        workItemId: journey.workItemId,
        durationMs: Date.now() - started,
        startedAt,
      },
    };
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ ok: recovery.ok, failures: recovery.failures, reportPath }));
    return recovery.ok ? EXIT_OK : EXIT_VALIDATION_FAILED;
  } finally {
    await stopHarness(processes);
  }
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  runCli(process.argv.slice(2), process.env).then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(2);
    },
  );
}
