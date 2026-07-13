/**
 * Per-scenario evidence collectors for Phase 6 Gate 6 UAT.
 * Snapshots at scenario start; only deltas count as that scenario's errors.
 */
import fs from "node:fs";
import path from "node:path";
import type { ConsoleMessage, Page, Response } from "@playwright/test";

export type ScenarioStatus = "pass" | "fail" | "blocked" | "not_executed";

export type ScenarioResult = {
  id: string;
  title: string;
  status: ScenarioStatus;
  url?: string;
  viewport: string;
  notes: string;
  screenshot?: string;
  consoleErrors: string[];
  networkErrors: string[];
  createdIds?: Record<string, string>;
};

const EVIDENCE_DIR = path.resolve(
  __dirname,
  "../../../../docs/plans/uat-50-evidence"
);

export function ensureEvidenceDir() {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

export function evidencePath(...parts: string[]) {
  return path.join(EVIDENCE_DIR, ...parts);
}

/** Network noise that never fails a scenario */
const NETWORK_ALLOW = [
  /favicon/i,
  /hot-update/i,
  /__nextjs/i,
  /webpack/i,
  /sourcemap/i,
  /_next\/static/i,
];

/** Console noise that never fails a scenario */
const CONSOLE_ALLOW = [
  /Download the React DevTools/i,
  /\[HMR\]/i,
  /\[Fast Refresh\]/i,
  /Failed to load resource: the server responded with a status of 4\d\d/i, // duplicated by network list
  /Some page content is not contained by landmarks/i, // axe noise in shell
  /No skip link target/i,
  /Element does not have text that is visible to screen readers/i,
];

export class ScenarioCollectors {
  private console: string[] = [];
  private network: string[] = [];
  private consoleMark = 0;
  private networkMark = 0;
  private attached = false;

  attach(page: Page) {
    if (this.attached) return;
    this.attached = true;
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "error") this.console.push(msg.text());
    });
    page.on("pageerror", (err) => {
      this.console.push(String(err.message ?? err));
    });
    page.on("response", (res: Response) => {
      if (res.status() < 400) return;
      const url = res.url();
      if (NETWORK_ALLOW.some((re) => re.test(url))) return;
      this.network.push(`${res.status()} ${res.request().method()} ${url}`);
    });
  }

  /** Call at the start of each scenario so prior errors are excluded. */
  mark() {
    this.consoleMark = this.console.length;
    this.networkMark = this.network.length;
  }

  deltaConsole(): string[] {
    return this.console.slice(this.consoleMark);
  }

  deltaNetwork(): string[] {
    return this.network.slice(this.networkMark);
  }

  unexpectedConsole(): string[] {
    return this.deltaConsole().filter(
      (line) => !CONSOLE_ALLOW.some((re) => re.test(line))
    );
  }

  unexpectedNetwork(): string[] {
    return this.deltaNetwork();
  }

  /**
   * Downgrade pass → fail when unexpected console/network errors appeared.
   * Blocked stays blocked (external/env).
   */
  applyHardGates(result: ScenarioResult): ScenarioResult {
    if (result.status === "blocked" || result.status === "not_executed") {
      return {
        ...result,
        consoleErrors: this.unexpectedConsole(),
        networkErrors: this.unexpectedNetwork(),
      };
    }
    const consoleErrors = this.unexpectedConsole();
    const networkErrors = this.unexpectedNetwork();
    if (consoleErrors.length || networkErrors.length) {
      return {
        ...result,
        status: "fail",
        notes: `${result.notes} | unexpected errors: console=${consoleErrors.length} network=${networkErrors.length}`,
        consoleErrors,
        networkErrors,
      };
    }
    return { ...result, consoleErrors, networkErrors };
  }
}

export async function shot(page: Page, name: string): Promise<string> {
  ensureEvidenceDir();
  const file = evidencePath(`${name}.png`);
  await page.screenshot({ path: file, fullPage: false, timeout: 15_000 });
  return file;
}

/** Persist immediately so worker restarts after a hard fail don't wipe prior scenarios. */
export function appendResult(result: ScenarioResult, account: string) {
  ensureEvidenceDir();
  const reportPath = evidencePath("RESULTS.json");
  let existing: ScenarioResult[] = [];
  try {
    existing = JSON.parse(fs.readFileSync(reportPath, "utf8")) as ScenarioResult[];
    if (!Array.isArray(existing)) existing = [];
  } catch {
    existing = [];
  }
  // replace same id (re-run) else append
  const idx = existing.findIndex((r) => r.id === result.id);
  if (idx >= 0) existing[idx] = result;
  else existing.push(result);
  writeResults(existing, account);
}

export function writeResults(results: ScenarioResult[], account: string) {
  ensureEvidenceDir();
  const reportPath = evidencePath("RESULTS.json");
  const mdPath = evidencePath("RESULTS.md");
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

  const pass = results.filter((r) => r.status === "pass").length;
  const fail = results.filter((r) => r.status === "fail").length;
  const blocked = results.filter((r) => r.status === "blocked").length;
  const notExec = results.filter((r) => r.status === "not_executed").length;

  const lines = [
    "# Phase 6 Item 50 UAT Results",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Account: \`${account}\``,
    "",
    "> Honest status: scenarios are only **pass** when the full path was executed and hard gates (console/network) are clean. Opening a screen is not a pass.",
    "",
    "| ID | Status | Title | Notes |",
    "|----|--------|-------|-------|",
    ...results.map(
      (r) =>
        `| ${r.id} | **${r.status}** | ${r.title} | ${r.notes.replace(/\|/g, "/").slice(0, 200)} |`
    ),
    "",
    `Pass: ${pass} · Fail: ${fail} · Blocked: ${blocked} · Not executed: ${notExec}`,
    "",
    "## Gate 6",
    fail > 0 || blocked > 0 || notExec > 0
      ? "**NOT REQUESTED** — incomplete UAT or fails remain."
      : "Ready for approval.",
    "",
  ];
  fs.writeFileSync(mdPath, lines.join("\n"));
}
