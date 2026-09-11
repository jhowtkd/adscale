import { describe, expect, it } from "vitest";
import { projectPreparedPlanV1 } from "./prepared-plan";
import {
  carouselLayoutFamilyForRole,
  type CarouselLayoutPlan,
  type CarouselNarrativeRole,
  type CarouselPreparedSnapshotV1,
  type CarouselSlidePlanV1,
  type CarouselTextRegion,
  type CarouselVisualContractV1,
} from "./carousel-contracts";

const updatedAt = new Date("2026-08-30T12:00:00.000Z");
const factPack = {
  version: 1 as const,
  request: "private request",
  facts: [],
  brand: { requiredElements: [], prohibitedElements: [] },
  identity: { clientProfileId: "profile-1", brandName: "Marca" },
};

function work(toolKind: "variations" | "single" | "format_adaptation" | "restyle" | "carousel") {
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

function carouselRegion(): CarouselTextRegion {
  return { x: 80, y: 96, width: 864, height: 420, minFontPx: 42, maxFontPx: 82, align: "left" };
}

function carouselLayoutPlan(id: string, density: "high" | "medium" | "low"): CarouselLayoutPlan {
  return { id, density, primaryRegion: carouselRegion(), secondaryRegion: null, exactAssetSlots: [], backgroundInstruction: "Composição sem texto." };
}

function carouselVisualContract(): CarouselVisualContractV1 {
  return {
    version: 1,
    brandSnapshotHash: "brand-hash-1",
    temporaryReferenceId: null,
    palette: ["#101010"],
    typography: { fontAssetKey: null, fallbackFamily: "sans", authority: "fallback" },
    directionInstruction: null,
    layoutFamilies: {
      impact: carouselLayoutPlan("impact-v1", "high"),
      development: carouselLayoutPlan("development-v1", "medium"),
      respite: carouselLayoutPlan("respite-v1", "low"),
    },
    recurringMotifs: [],
    exactAssetKeys: [],
    prohibitedElements: [],
    safeAreaPx: 64,
    contractHash: "0".repeat(64),
  };
}

function carouselSlide(position: number, role: CarouselNarrativeRole): CarouselSlidePlanV1 {
  return {
    slideId: `slide-${position}`,
    position,
    role,
    purpose: "Propósito privado",
    primaryText: `Texto privado ${position}`,
    secondaryText: null,
    authority: "ai_proposal",
    sourceFactIds: [],
    layoutFamily: carouselLayoutFamilyForRole(role),
  };
}

function carouselSnapshot(preparedRevision: string): CarouselPreparedSnapshotV1 {
  return {
    version: 1,
    preparedRevision,
    deck: {
      version: 1,
      revision: "deck-r1",
      workId: "work-1",
      objective: "Objetivo privado",
      audience: null,
      tone: null,
      promise: "Promessa privada",
      format: "4:5",
      slides: [1, 2, 3, 4, 5].map((position) => carouselSlide(position, ["hook", "context", "problem", "argument", "cta"][position - 1] as CarouselNarrativeRole)),
    },
    visualContract: carouselVisualContract(),
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

  it("uses locale-neutral fallback keys while preserving supplied source labels", () => {
    const base = work("single");
    const fallbackPlan = projectPreparedPlanV1({
      ...base,
      inputSnapshot: {
        ...base.inputSnapshot,
        sources: [{ ...base.inputSnapshot!.sources[0], label: undefined }],
      },
    });
    expect(fallbackPlan?.materials[0]).toMatchObject({ labelKey: "material.reference" });
    expect(fallbackPlan?.materials[0]).not.toHaveProperty("label");
    expect(fallbackPlan?.outputs[0]).toMatchObject({ labelKey: "output.singlePiece" });
    expect(JSON.stringify(fallbackPlan)).not.toMatch(/Referência|Peça única|Novo estilo|Conservadora|Equilibrada|Ousada/);

    const namedPlan = projectPreparedPlanV1(base);
    expect(namedPlan?.materials[0]).toMatchObject({ label: "Produto" });
  });

  it.each([
    ["content-only", ["content"], ["brand_requirements", "source_content"]],
    ["style-only", ["style"], ["brand_requirements", "source_visual_identity"]],
    ["both", ["both"], ["brand_requirements", "source_content", "source_visual_identity"]],
    ["mixed content and style", ["content", "style"], ["brand_requirements", "source_content", "source_visual_identity"]],
  ] as const)("preserves variation sources with %s usage", (_description, usages, expectedPreserve) => {
    const base = work("variations");
    const source = base.inputSnapshot!.sources[0]!;
    const plan = projectPreparedPlanV1({
      ...base,
      inputSnapshot: {
        ...base.inputSnapshot,
        sources: usages.map((usage, index) => ({ ...source, sourceId: `source-${index}`, usage })),
      },
    });

    expect(plan?.preserve).toEqual(expectedPreserve);
  });

  it("returns null for a carousel work until the deck snapshot is frozen", () => {
    expect(projectPreparedPlanV1(work("carousel"))).toBeNull();
  });

  it("projects a frozen carousel deck as the carousel protocol", () => {
    const preparedRevision = "prepared-2026-08-30";
    const base = work("carousel");
    const carouselWork = {
      ...base,
      inputSnapshot: {
        ...base.inputSnapshot,
        sources: [{ sourceId: "style-1", updatedAt: updatedAt.toISOString(), assetKey: "key", mimeType: "image/png", label: "Estilo", usage: "style" as const, content: null, style: null }],
        carousel: carouselSnapshot(preparedRevision),
      },
    };
    const plan = projectPreparedPlanV1(carouselWork);
    expect(plan).toMatchObject({
      version: 1,
      workId: "work-1",
      preparedRevision,
      protocol: "carousel",
      outputCount: 5,
      formats: ["4:5"],
      preserve: ["verified_facts", "brand_requirements"],
      explore: ["composition", "hierarchy", "visual_language"],
    });
    expect(plan?.outputs).toEqual([1, 2, 3, 4, 5].map((position) => ({
      label: `Tela ${position}`,
      targetFormat: "4:5",
      directionId: null,
    })));
    expect(plan?.materials).toEqual([
      { sourceId: "style-1", label: "Estilo", role: "style", category: null, treatment: null },
    ]);
    const serialized = JSON.stringify(plan);
    expect(serialized).not.toContain("private request");
    expect(serialized).not.toContain("Objetivo privado");
    expect(serialized).not.toContain("Texto privado");
    expect(serialized).not.toContain("contractHash");
  });

  it("projects cover as one billed slide and interiors as the remaining deck", () => {
    const preparedRevision = "prepared-2026-08-30";
    const base = work("carousel");
    const coverPlan = projectPreparedPlanV1({
      ...base,
      inputSnapshot: {
        ...base.inputSnapshot,
        sources: [],
        carousel: { ...carouselSnapshot(preparedRevision), generationScope: "cover", scriptRevision: "script-1" },
      },
    });
    expect(coverPlan).toMatchObject({ protocol: "carousel", outputCount: 1 });
    expect(coverPlan?.outputs).toEqual([{ label: "Tela 1", targetFormat: "4:5", directionId: null }]);

    const interiorsPlan = projectPreparedPlanV1({
      ...base,
      inputSnapshot: {
        ...base.inputSnapshot,
        sources: [],
        carousel: { ...carouselSnapshot(preparedRevision), generationScope: "interiors", scriptRevision: "script-1" },
      },
    });
    expect(interiorsPlan).toMatchObject({ protocol: "carousel", outputCount: 4 });
    expect(interiorsPlan?.outputs.map((output) => output.label)).toEqual(["Tela 2", "Tela 3", "Tela 4", "Tela 5"]);
  });
});
