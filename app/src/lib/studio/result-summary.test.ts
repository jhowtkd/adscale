import { describe, expect, it } from "vitest";
import { summarizeStudioBatch } from "./result-summary";

describe("summarizeStudioBatch", () => {
  it("stays generating while the stage is still generation", () => {
    expect(summarizeStudioBatch(
      [{ status: "completed" }, { status: "failed" }],
      "generation",
    )).toEqual({ kind: "generating", ready: 1, failed: 1 });
  });

  it("marks an all-failed batch as failed", () => {
    expect(summarizeStudioBatch(
      [{ status: "failed" }, { status: "failed" }],
      "results",
    )).toEqual({ kind: "failed", ready: 0, failed: 2 });
  });

  it("does not call a mixed completed-and-failed batch ready", () => {
    expect(summarizeStudioBatch(
      [{ status: "completed" }, { status: "completed" }, { status: "failed" }],
      "results",
    )).toEqual({ kind: "partial", ready: 2, failed: 1 });
  });

  it("calls a fully completed batch ready", () => {
    expect(summarizeStudioBatch(
      [{ status: "completed" }, { status: "completed" }],
      "results",
    )).toEqual({ kind: "ready", ready: 2, failed: 0 });
  });
});
