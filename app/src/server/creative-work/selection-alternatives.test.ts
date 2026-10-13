import { describe, expect, it } from "vitest";
import { eligibleSelectionAlternatives } from "./selection-alternatives";
import type { CreativeWorkOutput } from "../db/schema";

const output = (id: string, changes: Partial<CreativeWorkOutput> = {}): CreativeWorkOutput => ({
  id, workspaceId: "workspace", workItemId: "work", generationCorrelationId: "generation",
  parentOutputId: null, revisionContext: null, revisionInstruction: null, revisionAssetId: null,
  targetFormat: "4:5", status: "completed", outputKey: `test/${id}`, quality: { schemaVersion: 1, objectiveVerdict: "pass" },
  ...changes,
} as CreativeWorkOutput);

describe("eligible alternatives at human selection", () => {
  it("considers complete selectable sisters in the same frozen generation and format across creative levels/directions", () => {
    const chosen = output("chosen");
    const sister = output("sister", { creativeLevel: "bold", directionId: "different-direction" });
    expect(eligibleSelectionAlternatives(chosen, [chosen, sister])).toEqual([sister]);
  });
  it.each([
    { status: "queued" }, { status: "processing" }, { status: "failed" }, { outputKey: null },
    { targetFormat: "9:16" }, { generationCorrelationId: "other-generation" }, { workItemId: "other-work" }, { workspaceId: "other-workspace" },
    { quality: { schemaVersion: 1, objectiveVerdict: "fail" } },
    { parentOutputId: "chosen" }, { parentOutputId: "child" },
  ] as Partial<CreativeWorkOutput>[])("excludes unavailable or noncomparable outputs %j", (changes) => {
    const chosen = output("chosen");
    expect(eligibleSelectionAlternatives(chosen, [chosen, output("invalid", changes)])).toEqual([]);
  });

  it("compares revision sisters only with the same base and frozen request, excluding ancestors and unrelated branches", () => {
    const context: NonNullable<CreativeWorkOutput["revisionContext"]> = {
      version: 1, reviewRevision: 1, sourceOutputId: "11111111-1111-4111-8111-111111111111", sourceOutputVersion: 1,
      action: "refine", targetFormat: "4:5", instruction: "refine headline",
      revisionAssetId: "22222222-2222-4222-8222-222222222222", annotations: [],
    };
    const chosen = output("chosen", { parentOutputId: "base", revisionInstruction: "refine headline",
      revisionContext: context, revisionAssetId: context.revisionAssetId });
    const sister = output("sister", { ...chosen, id: "sister", generationCorrelationId: "other-operation", revisionContext: { ...context } });
    expect(eligibleSelectionAlternatives(chosen, [chosen, output("base"), sister,
      output("descendant", { parentOutputId: "chosen" }), output("other-base", { ...chosen, id: "other-base", parentOutputId: "unrelated" }),
      output("different-request", { ...chosen, id: "different-request", revisionInstruction: "change photo" }),
      output("different-context", { ...chosen, id: "different-context", revisionContext: { ...context, action: "variation" } }),
      output("historical-context", { ...chosen, id: "historical-context", revisionContext: null }),
      output("different-asset", { ...chosen, id: "different-asset", revisionAssetId: "33333333-3333-4333-8333-333333333333" }),
    ])).toEqual([sister]);
  });
  it("compares historical null contexts by their separate revision asset, without equating null to a known context", () => {
    const chosen = output("chosen", { parentOutputId: "base", revisionInstruction: "same request", revisionAssetId: "asset-a" });
    const sister = output("sister", { ...chosen, id: "sister" });
    const context: NonNullable<CreativeWorkOutput["revisionContext"]> = {
      version: 1, reviewRevision: 1, sourceOutputId: "11111111-1111-4111-8111-111111111111", sourceOutputVersion: 1,
      action: "refine", targetFormat: "4:5", instruction: "same request", revisionAssetId: null, annotations: [],
    };
    expect(eligibleSelectionAlternatives(chosen, [chosen, sister,
      output("different-asset", { ...chosen, id: "different-asset", revisionAssetId: "asset-b" }),
      output("known-context", { ...chosen, id: "known-context", revisionContext: context }),
    ])).toEqual([sister]);
  });

});
