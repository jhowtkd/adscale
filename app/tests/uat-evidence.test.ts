import { describe, expect, it } from "vitest";
import {
  expectedGate6EvidenceKeys,
  failureResultFromTest,
  isGate6EvidenceComplete,
  type ScenarioResult,
} from "./e2e/support/uat-evidence";

describe("failureResultFromTest", () => {
  it("turns an unhandled UAT exception into a failed scenario result", () => {
    expect(
      failureResultFromTest({
        title: "S03 create post → generate → list",
        status: "failed",
        errorMessage: "Generate button was not visible",
        projectName: "serial-flows",
      })
    ).toMatchObject({
      id: "S03",
      status: "fail",
      viewport: "serial-flows",
      notes: "Unhandled test failure: Generate button was not visible",
    });
  });

  it("ignores successful, skipped, and non-UAT tests", () => {
    expect(
      failureResultFromTest({
        title: "S03 create post",
        status: "passed",
        projectName: "serial-flows",
      })
    ).toBeNull();
    expect(
      failureResultFromTest({
        title: "S03 create post",
        status: "skipped",
        projectName: "serial-flows",
      })
    ).toBeNull();
    expect(
      failureResultFromTest({
        title: "unrelated test",
        status: "failed",
        projectName: "serial-flows",
      })
    ).toBeNull();
  });
});

describe("Gate 6 evidence matrix", () => {
  const resultFor = (key: string): ScenarioResult => {
    const [id, viewport] = key.split("@");
    return {
      id,
      title: id,
      status: "pass",
      viewport,
      notes: "ok",
      consoleErrors: [],
      networkErrors: [],
    };
  };

  it("requires 13 scenarios at four viewports and mobile navigation at two", () => {
    const keys = expectedGate6EvidenceKeys();
    expect(keys).toHaveLength(54);
    expect(keys).toContain("S01@1280x800");
    expect(keys).toContain("S14@360x800");
    expect(keys).toContain("S13@390x844");
    expect(keys).not.toContain("S13@1440x900");
  });

  it("does not declare the gate complete with a missing or failed matrix row", () => {
    const all = expectedGate6EvidenceKeys().map(resultFor);
    expect(isGate6EvidenceComplete(all)).toBe(true);
    expect(isGate6EvidenceComplete(all.slice(1))).toBe(false);
    expect(
      isGate6EvidenceComplete([
        ...all.slice(0, -1),
        { ...all.at(-1)!, status: "fail" },
      ])
    ).toBe(false);
    expect(
      isGate6EvidenceComplete([
        ...all,
        { ...all[0], id: "S99", status: "fail" },
      ])
    ).toBe(false);
  });
});
