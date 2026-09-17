import { pathToFileURL } from "node:url";
import {
  EXIT_OK,
  HARNESS_SCENARIOS,
  runCli,
  type WorkerJourneyScenario,
} from "./worker-journey-harness";

/**
 * Failure-matrix runner (ICE-02B): executes every worker-journey scenario
 * sequentially on one SHA and runtime, then exits nonzero when any row is
 * not VALID. The CI worker-journey check runs this; local iteration can
 * narrow it with --only.
 *
 * Flags (forwarded to each scenario): --build (first scenario only),
 * --web-port/--queue-port/--timeout-ms/--observe-ms, --only a,b,c.
 */

export interface MatrixScenarioResult {
  scenario: WorkerJourneyScenario;
  code: number;
}

export function summarizeMatrix(results: MatrixScenarioResult[]): {
  ok: boolean;
  failed: string[];
} {
  const failed = results.filter((result) => result.code !== EXIT_OK).map((result) => result.scenario);
  return { ok: failed.length === 0, failed };
}

export function parseMatrixOnly(argv: string[]): WorkerJourneyScenario[] {
  const flagIndex = argv.indexOf("--only");
  if (flagIndex < 0) return [...HARNESS_SCENARIOS];
  const raw = argv[flagIndex + 1] ?? "";
  const wanted = raw.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (wanted.length === 0) throw new Error("invalid --only: expected a comma-separated scenario list");
  for (const scenario of wanted) {
    if (!HARNESS_SCENARIOS.includes(scenario as WorkerJourneyScenario)) {
      throw new Error(`invalid --only scenario: ${JSON.stringify(scenario)}`);
    }
  }
  return wanted as WorkerJourneyScenario[];
}

export function matrixForwardedArgs(argv: string[]): string[] {
  const forwarded: string[] = [];
  const skipValue = new Set(["--web-port", "--queue-port", "--timeout-ms", "--observe-ms", "--only"]);
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--only") {
      i += 1;
      continue;
    }
    forwarded.push(flag);
    if (skipValue.has(flag)) {
      if (argv[i + 1] === undefined) throw new Error(`invalid ${flag}: expected a value`);
      forwarded.push(argv[i + 1]);
      i += 1;
    }
  }
  return forwarded;
}

export function matrixScenarioArgs(
  scenario: WorkerJourneyScenario,
  forwarded: string[],
  isFirst: boolean,
): string[] {
  const args = ["--scenario", scenario, ...forwarded.filter((entry) => entry !== "--build")];
  if (isFirst && forwarded.includes("--build")) args.push("--build");
  return args;
}

async function main(argv: string[], env: NodeJS.ProcessEnv): Promise<number> {
  let scenarios: WorkerJourneyScenario[];
  let forwarded: string[];
  try {
    scenarios = parseMatrixOnly(argv);
    forwarded = matrixForwardedArgs(argv);
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  const results: MatrixScenarioResult[] = [];
  for (let index = 0; index < scenarios.length; index += 1) {
    const scenario = scenarios[index];
    console.log(`\n=== worker-journey matrix: ${scenario} (${index + 1}/${scenarios.length}) ===`);
    const code = await runCli(matrixScenarioArgs(scenario, forwarded, index === 0), env);
    results.push({ scenario, code });
  }
  const summary = summarizeMatrix(results);
  console.log(
    `\nworker-journey matrix: ${summary.ok ? "VALID" : "INVALID"}` +
      (summary.ok ? "" : ` — failed: ${summary.failed.join(", ")}`),
  );
  return summary.ok ? 0 : 1;
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
  main(process.argv.slice(2), process.env).then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(2);
    },
  );
}
