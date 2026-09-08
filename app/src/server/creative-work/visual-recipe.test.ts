import { describe, expect, it } from "vitest";
import {
  applyAuthorizedFields,
  assertRecipeBrand,
  extractVisualRecipe,
  frozenExactBoxes,
  isVisualRecipeCandidate,
  recipeGeometryFingerprint,
  visualRecipeOrigin,
} from "./visual-recipe";

const logoBox = { left: 48, top: 1180, width: 216, height: 72 };
const headlineBox = { left: 64, top: 80, width: 952, height: 140 };

function structuredQuality() {
  return {
    exactComposition: {
      version: 1,
      format: "4:5",
      dimensions: { width: 1080, height: 1350 },
      composed: [{
        referenceId: "ref-logo",
        assetKey: "brands/a/logo.png",
        label: "Logo",
        category: "logo",
        gravity: "southwest",
        widthRatio: 0.2,
        clearspacePx: 38,
        contrast: 2,
        usedBackdrop: false,
        box: logoBox,
        sourceSha256: "abc123",
        policy: { required: true, omissible: false, preferredGravity: "southwest", minContrast: 1.6 },
      }],
      omitted: [],
      blocked: [],
    },
    textComposition: {
      version: 2,
      execution: "deterministic",
      format: "4:5",
      dimensions: { width: 1080, height: 1350 },
      requestedLayout: "top",
      appliedLayout: "top",
      typographyPlan: { execution: "deterministic", fontAssetKey: "font-brand-sans" },
      copy: { headline: "Turma de setembro", body: "Vagas abertas", cta: "Inscreva-se" },
      layers: [
        { role: "headline", box: headlineBox },
        { role: "body", box: { left: 64, top: 240, width: 952, height: 80 } },
        { role: "cta", box: { left: 64, top: 340, width: 320, height: 56 } },
      ],
    },
  };
}

describe("visual recipe", () => {
  it("extracts a structured approved piece and rejects raster-only outputs", () => {
    const structured = extractVisualRecipe({
      workId: "work-1",
      outputId: "out-1",
      clientProfileId: "brand-a",
      isSelected: true,
      format: "4:5",
      quality: structuredQuality(),
    });
    expect(structured.ok).toBe(true);
    if (!structured.ok) return;
    expect(structured.recipe.logo.box).toEqual(logoBox);
    expect(structured.recipe.fontAssetKey).toBe("font-brand-sans");
    expect(structured.recipe.layout).toBe("top");
    expect(structured.recipe.originWorkId).toBe("work-1");

    expect(extractVisualRecipe({
      workId: "work-1",
      outputId: "out-raster",
      clientProfileId: "brand-a",
      isSelected: true,
      format: "4:5",
      quality: { qualityScore: 80 },
    }).error).toBe("raster_only");
  });

  it("keeps fonts, logo and geometry when authorized copy fields change", () => {
    const extracted = extractVisualRecipe({
      workId: "work-1",
      outputId: "out-1",
      clientProfileId: "brand-a",
      isSelected: true,
      format: "4:5",
      quality: structuredQuality(),
    });
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;

    const next = applyAuthorizedFields(extracted.recipe, {
      headline: "Turma de outubro",
      cta: "Garantir vaga",
    });
    expect(next.fields.headline).toBe("Turma de outubro");
    expect(next.fields.body).toBe("Vagas abertas");
    expect(next.fields.cta).toBe("Garantir vaga");
    expect(recipeGeometryFingerprint(next)).toBe(recipeGeometryFingerprint(extracted.recipe));
    expect(next.fontAssetKey).toBe(extracted.recipe.fontAssetKey);
    expect(next.logo).toEqual(extracted.recipe.logo);
  });

  it("does not let another brand use a recipe implicitly", () => {
    expect(assertRecipeBrand({ recipeBrandId: "brand-a", requestedBrandId: "brand-b" })).toEqual({
      ok: false,
      error: "brand_mismatch",
    });
    expect(assertRecipeBrand({ recipeBrandId: "brand-a", requestedBrandId: "brand-a" })).toEqual({ ok: true });
  });

  it("records recipe origin and version on a new piece", () => {
    expect(visualRecipeOrigin({
      recipeId: "recipe-1",
      version: 3,
      originWorkId: "work-1",
      originOutputId: "out-1",
    })).toEqual({
      recipeId: "recipe-1",
      version: 3,
      originWorkId: "work-1",
      originOutputId: "out-1",
    });
  });

  it("maps frozen logo boxes from the recipe snapshot", () => {
    const extracted = extractVisualRecipe({
      workId: "work-1",
      outputId: "out-1",
      clientProfileId: "brand-a",
      isSelected: true,
      format: "4:5",
      quality: structuredQuality(),
    });
    if (!extracted.ok) throw new Error("expected structured recipe");
    expect(frozenExactBoxes(extracted.recipe)).toEqual({
      "brands/a/logo.png": logoBox,
    });
    expect(isVisualRecipeCandidate({
      format: "4:5",
      quality: structuredQuality(),
      clientProfileId: "brand-a",
    })).toBe(true);
    expect(isVisualRecipeCandidate({
      format: "4:5",
      quality: { raster: true },
    })).toBe(false);
  });

  it("requires an approved (selected) output before saving a recipe", () => {
    expect(extractVisualRecipe({
      workId: "work-1",
      outputId: "out-1",
      clientProfileId: "brand-a",
      isSelected: false,
      format: "4:5",
      quality: structuredQuality(),
    }).error).toBe("output_not_selected");
  });
});
