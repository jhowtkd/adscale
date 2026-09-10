import { describe, expect, it } from "vitest";
import type { CreativeWorkOutput } from "@/lib/hooks/use-creative-work";
import { hasUsableOutput, lineageRootId, outputLineage, outputSource, visualVersionNumber } from "./composer-outputs";

function output(overrides: Partial<CreativeWorkOutput>): CreativeWorkOutput {
  return {
    id: "o",
    workItemId: "work-1",
    creativeLevel: "balanced",
    targetFormat: "4:5",
    versionNumber: 1,
    parentOutputId: null,
    revisionInstruction: null,
    revisionAssetId: null,
    retryCount: 0,
    status: "completed",
    hasOutput: true,
    failureCode: null,
    quality: null,
    layerization: null,
    layerEditor: null,
    isSelected: false,
    createdAt: new Date("2026-09-10T00:00:00Z"),
    updatedAt: new Date("2026-09-10T00:00:00Z"),
    ...overrides,
  };
}

const root = output({ id: "root" });
const child = output({ id: "child", parentOutputId: "root", versionNumber: 2 });
const grandchild = output({ id: "grandchild", parentOutputId: "child", targetFormat: "9:16", versionNumber: 1 });
const outputs = [grandchild, root, child];

describe("outputLineage", () => {
  it("walks parents up to the root without cycles", () => {
    expect(outputLineage(outputs, grandchild).map((o) => o.id)).toEqual(["grandchild", "child", "root"]);
    expect(outputLineage(outputs, root).map((o) => o.id)).toEqual(["root"]);
  });
});

describe("lineageRootId", () => {
  it("resolves the shared root across formats", () => {
    expect(lineageRootId(outputs, grandchild)).toBe("root");
    expect(lineageRootId(outputs, root)).toBe("root");
  });
});

describe("visualVersionNumber", () => {
  it("counts from the visual lineage order, not the per-format versionNumber", () => {
    expect(visualVersionNumber(outputs, root)).toBe(1);
    expect(visualVersionNumber(outputs, child)).toBe(2);
    expect(visualVersionNumber(outputs, grandchild)).toBe(3);
  });
});

describe("hasUsableOutput", () => {
  it("requires a completed status with usable art", () => {
    expect(hasUsableOutput(root)).toBe(true);
    expect(hasUsableOutput(output({ id: "q", status: "queued", hasOutput: false, outputKey: null }))).toBe(false);
    expect(hasUsableOutput(output({ id: "o2", outputKey: null, hasOutput: undefined }))).toBe(false);
  });
});

describe("outputSource", () => {
  it("points to the authenticated download route", () => {
    expect(outputSource(root)).toBe("/api/creative-work/work-1/outputs/root/download");
  });
});
