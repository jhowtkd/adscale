import { describe, expect, it } from "vitest";
import {
  matrixForwardedArgs,
  matrixScenarioArgs,
  parseMatrixOnly,
  summarizeMatrix,
} from "./run-worker-journey-matrix";
import { HARNESS_SCENARIOS } from "./worker-journey-harness";

describe("worker-journey matrix", () => {
  it("covers every harness scenario by default", () => {
    expect(parseMatrixOnly([])).toEqual(HARNESS_SCENARIOS);
    expect(HARNESS_SCENARIOS).toHaveLength(7);
  });

  it("narrows with --only and rejects unknown rows", () => {
    expect(parseMatrixOnly(["--only", "replay,failure"])).toEqual(["replay", "failure"]);
    expect(() => parseMatrixOnly(["--only", "bogus"])).toThrow(/scenario/);
    expect(() => parseMatrixOnly(["--only"])).toThrow(/--only/);
  });

  it("forwards run flags but strips --only", () => {
    expect(
      matrixForwardedArgs(["--build", "--web-port", "3101", "--only", "replay", "--observe-ms", "1000"]),
    ).toEqual(["--build", "--web-port", "3101", "--observe-ms", "1000"]);
    expect(() => matrixForwardedArgs(["--web-port"])).toThrow(/--web-port/);
  });

  it("builds once, on the first scenario", () => {
    expect(matrixScenarioArgs("success", ["--build", "--observe-ms", "5"], true)).toEqual([
      "--scenario",
      "success",
      "--observe-ms",
      "5",
      "--build",
    ]);
    expect(matrixScenarioArgs("replay", ["--build"], false)).toEqual(["--scenario", "replay"]);
  });

  it("summarizes failures by scenario", () => {
    expect(
      summarizeMatrix([
        { scenario: "success", code: 0 },
        { scenario: "replay", code: 1 },
        { scenario: "restart", code: 2 },
      ]),
    ).toEqual({ ok: false, failed: ["replay", "restart"] });
    expect(summarizeMatrix([{ scenario: "success", code: 0 }])).toEqual({ ok: true, failed: [] });
  });
});
