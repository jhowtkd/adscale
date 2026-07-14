import { describe, expect, it } from "vitest";
import { failureResultFromTest } from "./e2e/support/uat-evidence";

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
