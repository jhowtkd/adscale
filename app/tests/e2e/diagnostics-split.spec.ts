import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Traceability split-topology smoke (#396): the diagnostics matrix CLI boots
 * the real split topology (web + local queue + worker on one SHA) and proves
 * traceability evidence for the journey. This spec runs the bounded `success`
 * row only and asserts it validates green; the full 7-row matrix runs in the
 * `diagnostics-split-matrix` CI job. API/journey-level only — no console-tab
 * UI assertions (the tab belongs to #394).
 *
 * Needs the same prerequisites as the other serial flows (migrated DATABASE_URL
 * plus the harness env) and the pinned Node major — it fails fast otherwise.
 */

function runMatrix(
  rows: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      "npx",
      ["tsx", "scripts/run-diagnostics-split-matrix.ts", "--only", rows],
      {
        cwd: path.resolve(__dirname, "../.."),
        timeout: 15 * 60 * 1000,
        maxBuffer: 16 * 1024 * 1024,
        env: process.env,
      },
      (error, stdout, stderr) => {
        resolve({
          code: typeof error?.code === "number" ? error.code : 0,
          stdout: String(stdout ?? ""),
          stderr: String(stderr ?? ""),
        });
      },
    );
  });
}

test.describe("Diagnostics split topology (#396)", () => {
  test("validates the success row on the split topology", async () => {
    test.setTimeout(16 * 60 * 1000);
    const run = await runMatrix("success");
    expect(
      `${run.stdout}\n${run.stderr}`,
      "matrix exit code for success",
    ).toBeTruthy();
    expect(run.code).toBe(0);
    const reportPath = path.resolve(
      __dirname,
      ".evidence/diagnostics-split-success.json",
    );
    expect(fs.existsSync(reportPath)).toBe(true);
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as {
      row: string;
      ok: boolean;
      failures: string[];
      validation: { ok: boolean; failures: string[] } | null;
    };
    expect(report.row).toBe("success");
    expect(report.failures).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.validation?.failures).toEqual([]);
    expect(report.validation?.ok).toBe(true);
  });
});
