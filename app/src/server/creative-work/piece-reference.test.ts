import { describe, expect, it } from "vitest";
import {
  exactPieceReferenceAssets,
  isPieceReferenceReady,
  pieceReferenceDraftSchema,
  pieceReferenceTreatment,
} from "./piece-reference";

describe("piece reference contract", () => {
  it.each([
    ["person_or_character", "identity_preservation"],
    ["product_or_packaging", "recognizable_preservation"],
    ["additional_logo_or_seal", "exact_application"],
    ["required_object_or_scene", "required_presence"],
    ["graphic_or_texture", "visual_language"],
    ["style_reference", "style_direction"],
  ] as const)("maps %s to %s", (category, treatment) => {
    expect(pieceReferenceTreatment(category)).toBe(treatment);
  });

  it("requires a user choice after low-confidence automation", () => {
    expect(isPieceReferenceReady({
      version: 1, category: "product_or_packaging", classificationSource: "automatic",
      confidence: "low", userInstruction: null, hasTransparency: false,
    })).toBe(false);
  });

  it("accepts the same category once explicitly chosen", () => {
    expect(isPieceReferenceReady({
      version: 1, category: "product_or_packaging", classificationSource: "user",
      confidence: "low", userInstruction: null, hasTransparency: false,
    })).toBe(true);
  });

  it("blocks exact application without usable transparency", () => {
    expect(isPieceReferenceReady({
      version: 1, category: "additional_logo_or_seal", classificationSource: "user",
      confidence: "high", userInstruction: null, hasTransparency: false,
    })).toBe(false);
  });

  it("rejects instructions longer than 240 characters", () => {
    expect(pieceReferenceDraftSchema.safeParse({
      version: 1, category: "style_reference", classificationSource: "user",
      confidence: "high", userInstruction: "x".repeat(241), hasTransparency: false,
    }).success).toBe(false);
  });

  it("adapts only frozen exact references to the existing logo compositor", () => {
    const assets = exactPieceReferenceAssets([
      { sourceId: "exact", updatedAt: "now", assetKey: "piece/logo.png", mimeType: "image/png", label: "Selo", usage: "both", content: null, style: null, pieceReference: { version: 1, category: "additional_logo_or_seal", treatment: "exact_application", userInstruction: null, hasTransparency: true } },
      { sourceId: "visual", updatedAt: "now", assetKey: "piece/style.png", mimeType: "image/png", label: "Estilo", usage: "both", content: null, style: null, pieceReference: { version: 1, category: "style_reference", treatment: "style_direction", userInstruction: null, hasTransparency: false } },
    ], "4:5");
    expect(assets).toEqual([expect.objectContaining({ referenceId: "exact", assetKey: "piece/logo.png", label: "Selo", category: "logo", usageMode: "exact", mimeType: "image/png", hasAlpha: true, placement: expect.any(Object) })]);
  });

  it("keeps exact instructions for composition and gives colliding marks distinct deterministic corners", () => {
    const assets = exactPieceReferenceAssets([
      { sourceId: "exact-one", updatedAt: "now", assetKey: "piece/one.png", mimeType: "image/png", label: "Um", usage: "both", content: null, style: null, pieceReference: { version: 1, category: "additional_logo_or_seal", treatment: "exact_application", userInstruction: "No topo à direita", hasTransparency: true } },
      { sourceId: "exact-two", updatedAt: "now", assetKey: "piece/two.png", mimeType: "image/png", label: "Dois", usage: "both", content: null, style: null, pieceReference: { version: 1, category: "additional_logo_or_seal", treatment: "exact_application", userInstruction: "No topo à direita", hasTransparency: true } },
    ], "4:5");

    expect(assets.map((asset) => asset.placement?.gravity)).toEqual(["northeast", "southwest"]);
    expect(assets[0]?.compositionInstruction).toBe("No topo à direita");
  });

  it("allocates temporary exact marks around occupied Brand Training corners and blocks exhaustion", () => {
    const source = { sourceId: "exact", updatedAt: "now", assetKey: "piece/logo.png", mimeType: "image/png", label: "Selo", usage: "both" as const, content: null, style: null, pieceReference: { version: 1 as const, category: "additional_logo_or_seal" as const, treatment: "exact_application" as const, userInstruction: "No topo à direita", hasTransparency: true } };
    expect(exactPieceReferenceAssets([source], "4:5", ["northeast"])[0]?.placement?.gravity).toBe("southwest");
    expect(() => exactPieceReferenceAssets([source], "4:5", ["northwest", "northeast", "southwest", "southeast"])).toThrow("piece_reference_exact_placement_unavailable");
  });
});
