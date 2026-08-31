import { describe, expect, it } from "vitest";
import { projectPreparedPlanV1 } from "./prepared-plan";

const updatedAt = new Date("2026-08-30T12:00:00.000Z");
const factPack = {
  version: 1 as const,
  request: "private request",
  facts: [],
  brand: { requiredElements: [], prohibitedElements: [] },
  identity: { clientProfileId: "profile-1", brandName: "Marca" },
};

function work(toolKind: "variations" | "single" | "format_adaptation" | "restyle") {
  return {
    id: "work-1", toolKind, format: "4:5" as const, updatedAt,
    inputSnapshot: {
      factPack,
      request: "private request",
      settings: { targetFormats: toolKind === "format_adaptation" ? ["1:1", "9:16"] as const : [] },
      sources: toolKind === "single" ? [{ sourceId: "ref-1", updatedAt: updatedAt.toISOString(), assetKey: "key", mimeType: "image/png", label: "Produto", usage: "both" as const, content: null, style: null, pieceReference: { version: 1 as const, category: "product_or_packaging" as const, treatment: "recognizable_preservation" as const, userInstruction: null, hasTransparency: false } }]
        : toolKind === "restyle" ? [
          { sourceId: "art", updatedAt: updatedAt.toISOString(), assetKey: "key", mimeType: "image/png", label: "Arte", usage: "content" as const, content: null, style: null },
          { sourceId: "style", updatedAt: updatedAt.toISOString(), assetKey: "key", mimeType: "image/png", label: "Estilo", usage: "style" as const, content: null, style: null },
        ] : [{ sourceId: "art", updatedAt: updatedAt.toISOString(), assetKey: "key", mimeType: "image/png", label: "Arte", usage: "both" as const, content: null, style: null }],
    },
  };
}

describe("projectPreparedPlanV1", () => {
  it.each(["variations", "single", "format_adaptation", "restyle"] as const)("projects %s without raw input or credits", (toolKind) => {
    const plan = projectPreparedPlanV1(work(toolKind));
    expect(plan).toMatchObject({ version: 1, workId: "work-1", preparedRevision: updatedAt.toISOString(), protocol: toolKind });
    expect(JSON.stringify(plan)).not.toContain("private request");
    expect(JSON.stringify(plan)).not.toContain("credits");
  });

  it("maps single treatment exactly and rejects legacy snapshots", () => {
    const plan = projectPreparedPlanV1(work("single"));
    expect(plan?.materials[0]).toMatchObject({ role: "piece_reference", treatment: "recognizable_preservation" });
    expect(plan?.preserve).toContain("piece_reference_recognizability");
    expect(projectPreparedPlanV1({ ...work("single"), inputSnapshot: { ...work("single").inputSnapshot, factPack: undefined } })).toBeNull();
  });
});
