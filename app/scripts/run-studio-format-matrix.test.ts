import { describe, expect, it } from "vitest";
import {
  evidenceForOutput,
  MATRIX_DELIVERY_DIMS,
  MATRIX_LEGACY_TOURNAMENT_CALLS,
  parseMatrixArgs,
  parseProviderEvidence,
  validateMatrixOutput,
} from "./run-studio-format-matrix";

describe("studio format matrix (ICE-04B)", () => {
  it("always boots the success topology and passes other flags through", () => {
    const args = parseMatrixArgs(["--build", "--web-port", "3101"]);
    expect(args.scenario).toBe("success");
    expect(args.build).toBe(true);
    expect(args.webPort).toBe(3101);
    expect(() => parseMatrixArgs(["--scenario", "no-worker"])).toThrow(/--scenario/);
  });

  it("pins exact delivery dimensions per format", () => {
    expect(MATRIX_DELIVERY_DIMS).toEqual({
      "1:1": { width: 1080, height: 1080 },
      "4:5": { width: 1080, height: 1350 },
      "9:16": { width: 1080, height: 1920 },
      "3:4": { width: 1080, height: 1440 },
    });
  });

  it("parses provider evidence and matches rows by output prefix", () => {
    const calls = parseProviderEvidence(
      [
        JSON.stringify({
          outputPrefix: "creative-work/out-1",
          generationMode: "social_post",
          dimensions: { width: 1080, height: 1440 },
        }),
        "not-json{{{",
        JSON.stringify({ outputPrefix: "creative-work/out-2", generationMode: "x" }),
      ].join("\n"),
    );
    expect(calls).toHaveLength(2);
    expect(evidenceForOutput(calls, "out-1")).toEqual([
      {
        outputPrefix: "creative-work/out-1",
        generationMode: "social_post",
        dimensions: { width: 1080, height: 1440 },
      },
    ]);
    expect(evidenceForOutput(calls, "out-2")[0]?.dimensions).toBeNull();
  });

  it("accepts a fully converged 3:4 output", () => {
    expect(
      validateMatrixOutput("single:3:4", "3:4", {
        outputId: "out-1",
        targetFormat: "3:4",
        completed: true,
        providerCalls: 1,
        providerDims: { width: 1080, height: 1440 },
        byteDims: { width: 1080, height: 1440 },
      }),
    ).toEqual([]);
  });

  it("fails loudly on every divergence class", () => {
    expect(
      validateMatrixOutput("single:3:4", "3:4", {
        outputId: "out-1",
        targetFormat: "4:5",
        completed: false,
        providerCalls: 2,
        providerDims: { width: 1080, height: 1350 },
        byteDims: { width: 1080, height: 1350 },
      }),
    ).toEqual([
      "single:3:4:out-1:not_completed",
      "single:3:4:out-1:format_mismatch:expected_3:4:got_4:5",
      "single:3:4:out-1:provider_calls:2",
      "single:3:4:out-1:provider_dims_mismatch",
      "single:3:4:out-1:byte_dims_mismatch",
    ]);
  });

  it("expects the legacy tournament size on adaptation legs", () => {
    expect(MATRIX_LEGACY_TOURNAMENT_CALLS).toBe(3);
    const converged = {
      outputId: "out-9",
      targetFormat: "3:4",
      completed: true,
      providerCalls: 3,
      providerDims: { width: 1080, height: 1440 },
      byteDims: { width: 1080, height: 1440 },
    };
    expect(validateMatrixOutput("adapt:1:1+3:4", "3:4", converged, MATRIX_LEGACY_TOURNAMENT_CALLS)).toEqual([]);
    expect(validateMatrixOutput("adapt:1:1+3:4", "3:4", converged)).toEqual([
      "adapt:1:1+3:4:out-9:provider_calls:3",
    ]);
  });
});
