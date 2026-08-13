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
  delete process.env.E2E_PROVIDER_EVIDENCE_PATH;
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("run-brand-consistency-validation", () => {
  it("executes the controlled replay and hashes the generated artifact", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "adscale-brand-baseline-"));
    temporaryDirectories.push(directory);
    process.env.E2E_PROVIDER_EVIDENCE_PATH = path.join(directory, "provider-calls.jsonl");
    const manifestPath = path.join(directory, "fixtures.json");
    const manifest = {
      version: 1,
      pilotId: "fixtures",
      brandName: "Acme",
      provenance: { source: "synthetic_fixture" },
      requests: [
        {
          requestId: "fixture-square",
          requestText: "Post institucional quadrado",
          format: "1:1",
          contentPattern: "text_led_ad",
          effectivePrompt: "replaced by the canonical prompt",
          selectedReferences: [
            { referenceId: "fixture-style", reason: "approved fixture" },
          ],
          observedHardFailures: [],
          humanVerdict: "pending",
          capturedAt: "2026-08-12T12:00:00.000Z",
          replay: {
            brief: {
              theme: "Institucional",
              objective: "Apresentar a marca",
              audience: "",
              offer: null,
            },
            copy: {
              headline: "Conheça a marca",
              body: "Uma apresentação institucional.",
              cta: "Saiba mais",
            },
          },
        },
      ],
    };
    writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");

    const result = await runBrandConsistencyValidation({
      manifestPath,
      capturedAt: "2026-08-12T12:00:00.000Z",
    });

    expect(result.outputPath).toBe(defaultEvidencePath(manifestPath));
    expect(JSON.parse(readFileSync(result.outputPath, "utf8"))).toMatchObject({
      schemaVersion: 1,
      reportType: "brand-consistency-baseline",
      status: "human_needed",
      execution: {
        provider: "e2e-controlled-replay",
        paidGeneration: false,
        providerCalls: 1,
      },
      generatedAt: "2026-08-12T12:00:00.000Z",
    });
    expect(result.report.requests[0]?.result.artifact).toMatchObject({
      mimeType: "image/png",
      width: 1080,
      height: 1080,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(result.report.requests[0]?.hashes.result).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps comparison hashes stable across repeated controlled runs", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "adscale-brand-repeat-"));
    temporaryDirectories.push(directory);
    const manifestPath = path.resolve(
      process.cwd(),
      "../.planning/validation/brand-consistency-baseline.manifest.json",
    );

    const first = await runBrandConsistencyValidation({
      manifestPath,
      outputPath: path.join(directory, "first.json"),
      capturedAt: "2026-08-13T12:00:00.000Z",
    });
    const second = await runBrandConsistencyValidation({
      manifestPath,
      outputPath: path.join(directory, "second.json"),
      capturedAt: "2026-08-13T12:05:00.000Z",
    });

    expect(second.report.hashes).toEqual(first.report.hashes);
    expect(second.report.requests.map((request) => request.hashes))
      .toEqual(first.report.requests.map((request) => request.hashes));
  });
});
