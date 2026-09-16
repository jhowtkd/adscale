import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * ICE-02A worker-journey gate: the shared harness boots the real split
 * topology (web + local queue + worker on one SHA) and proves, per scenario,
 * which executor ran a synthetic single piece. The CLI owns booting, driving
 * and validating; this spec only asserts both scenarios validate green.
 *
 * Needs the same prerequisites as the other serial flows (migrated DATABASE_URL
 * plus the harness env) and the pinned Node major — it fails fast otherwise.
 */

const SCENARIOS = ["success", "no-worker"] as const;

function runHarness(scenario: (typeof SCENARIOS)[number]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      "npx",
      ["tsx", "scripts/run-worker-journey-harness.ts", "--scenario", scenario],
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

test.describe("Worker journey topology (ICE-02A)", () => {
  for (const scenario of SCENARIOS) {
    test(`validates the ${scenario} scenario on the split topology`, async () => {
      test.setTimeout(16 * 60 * 1000);
      const run = await runHarness(scenario);
      expect(
        `${run.stdout}\n${run.stderr}`,
        `harness exit code for ${scenario}`,
      ).toBeTruthy();
      expect(run.code).toBe(0);
      const reportPath = path.resolve(
        __dirname,
        `.evidence/worker-journey-${scenario}.json`,
      );
      expect(fs.existsSync(reportPath)).toBe(true);
      const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as {
        evidence: { scenario: string } | null;
        validation: { ok: boolean; failures: string[] };
      };
      expect(report.evidence?.scenario).toBe(scenario);
      expect(report.validation.failures).toEqual([]);
      expect(report.validation.ok).toBe(true);
    });
  }
});
