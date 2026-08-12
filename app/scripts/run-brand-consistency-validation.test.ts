import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  defaultEvidencePath,
  runBrandConsistencyValidation,
} from "./run-brand-consistency-validation";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("run-brand-consistency-validation", () => {
  it("writes structured evidence and keeps the human-readable run separate", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "adscale-brand-baseline-"));
    temporaryDirectories.push(directory);
    const manifestPath = path.join(directory, "fixtures.json");
    const manifest = {
      version: 1,
      pilotId: "fixtures",
      brandName: "Acme",
      provenance: { source: "synthetic_fixture" },
      requests: [],
    };
    writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");

    const result = runBrandConsistencyValidation({
      manifestPath,
      capturedAt: "2026-08-12T12:00:00.000Z",
    });

    expect(result.outputPath).toBe(defaultEvidencePath(manifestPath));
    expect(JSON.parse(readFileSync(result.outputPath, "utf8"))).toMatchObject({
      schemaVersion: 1,
      reportType: "brand-consistency-baseline",
      status: "human_needed",
      execution: { paidGeneration: false, providerCalls: 0 },
      generatedAt: "2026-08-12T12:00:00.000Z",
    });
  });
});
