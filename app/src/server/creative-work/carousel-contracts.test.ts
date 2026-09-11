import { describe, expect, it } from "vitest";
import type { CreativeWorkInputSnapshot } from "./contracts";
import { buildCreativeWorkFactPack } from "./fact-pack";
import {
  CAROUSEL_LAYOUT_FAMILIES,
  CAROUSEL_NARRATIVE_ROLES,
  CAROUSEL_SLIDE_STATUSES,
  carouselAnchorPositions,
  carouselDeckPlanSchema,
  carouselLayoutFamilyForRole,
  quoteCarouselDeck,
  quoteCarouselUnits,
  resolveCarouselPreparedSnapshot,
  validateCarouselDeckStructure,
  validateTextFieldsAgainstFactPack,
  type CarouselDeckPlanV1,
  type CarouselLayoutPlan,
  type CarouselNarrativeRole,
  type CarouselPreparedSnapshotV1,
  type CarouselSlidePlanV1,
  type CarouselTextRegion,
  type CarouselVisualContractV1,
} from "./carousel-contracts";

const FIVE_ROLES = ["hook", "context", "problem", "argument", "cta"] as const;
const EIGHT_ROLES = ["hook", "context", "problem", "argument", "evidence", "method", "bridge", "cta"] as const;

function slideAt(position: number, role: CarouselNarrativeRole, overrides: Partial<CarouselSlidePlanV1> = {}): CarouselSlidePlanV1 {
  return {
    slideId: `slide-${position}`,
    position,
    role,
    purpose: `Propósito da tela ${position}`,
    primaryText: `Texto da tela ${position}`,
    secondaryText: null,
    authority: "ai_proposal",
    sourceFactIds: [],
    layoutFamily: carouselLayoutFamilyForRole(role),
    ...overrides,
  };
}

function deckOf(count: number, roles: readonly CarouselNarrativeRole[] = FIVE_ROLES): CarouselDeckPlanV1 {
  return {
    version: 1,
    revision: "deck-r1",
    workId: "work-1",
    objective: "Gerar inscrições para o grupo de terapia",
    audience: null,
    tone: null,
    promise: "Cuide da sua mente com acompanhamento profissional",
    format: "4:5",
    slides: Array.from({ length: count }, (_, index) => slideAt(index + 1, roles[index] ?? "argument")),
  };
}

function region(overrides: Partial<CarouselTextRegion> = {}): CarouselTextRegion {
  return { x: 80, y: 96, width: 864, height: 420, minFontPx: 42, maxFontPx: 82, align: "left", ...overrides };
}

function layoutPlanFixture(id: string, density: "high" | "medium" | "low"): CarouselLayoutPlan {
  return { id, density, primaryRegion: region(), secondaryRegion: null, exactAssetSlots: [], backgroundInstruction: "Composição sem texto." };
}

function visualContractFixture(): CarouselVisualContractV1 {
  return {
    version: 1,
    brandSnapshotHash: "brand-hash-1",
    temporaryReferenceId: null,
    palette: ["#101010"],
    typography: { fontAssetKey: null, fallbackFamily: "sans", authority: "fallback" },
    directionInstruction: null,
    layoutFamilies: {
      impact: layoutPlanFixture("impact-v1", "high"),
      development: layoutPlanFixture("development-v1", "medium"),
      respite: layoutPlanFixture("respite-v1", "low"),
    },
    recurringMotifs: [],
    exactAssetKeys: [],
    prohibitedElements: [],
    safeAreaPx: 64,
    contractHash: "0".repeat(64),
  };
}

function preparedSnapshot(preparedRevision: string, deck: CarouselDeckPlanV1): CarouselPreparedSnapshotV1 {
  return { version: 1, preparedRevision, deck, visualContract: visualContractFixture() };
}

describe("carousel contracts", () => {
  it("publishes the narrative roles, layout families and slide statuses", () => {
    expect(CAROUSEL_NARRATIVE_ROLES).toEqual([
      "hook", "context", "problem", "argument", "evidence", "method", "bridge", "closing", "cta",
    ]);
    expect(CAROUSEL_LAYOUT_FAMILIES).toEqual(["impact", "development", "respite"]);
    expect(CAROUSEL_SLIDE_STATUSES).toEqual(["draft", "queued", "processing", "completed", "failed"]);
  });

  it.each([
    ["hook", "impact"],
    ["context", "development"],
    ["problem", "impact"],
    ["argument", "development"],
    ["evidence", "development"],
    ["method", "development"],
    ["bridge", "respite"],
    ["closing", "respite"],
    ["cta", "impact"],
  ] as Array<[CarouselNarrativeRole, CarouselLayoutFamily]>)(
    "maps %s slides to the %s rhythm family",
    (role, family) => {
      expect(carouselLayoutFamilyForRole(role)).toBe(family);
    },
  );

  it.each([
    [5, [1, 3, 5]],
    [6, [1, 3, 6]],
    [7, [1, 4, 7]],
    [8, [1, 4, 8]],
  ] as Array<[number, number[]]>)("selects cover, ceil-middle and closing for %i slides", (count, expected) => {
    expect(carouselAnchorPositions(count)).toEqual(expected);
  });

  it("throws for deck sizes outside the 5-8 range", () => {
    expect(() => carouselAnchorPositions(4)).toThrow();
    expect(() => carouselAnchorPositions(9)).toThrow();
  });

  it("quotes one credit unit per slide from the deck size", () => {
    expect(quoteCarouselDeck(5)).toEqual({ unitCount: 5, credits: 250 });
    expect(quoteCarouselDeck(8)).toEqual({ unitCount: 8, credits: 400 });
  });

  it("quotes an explicit billed unit count for cover and remaining interiors", () => {
    expect(quoteCarouselUnits(1)).toEqual({ unitCount: 1, credits: 50 });
    expect(quoteCarouselUnits(4)).toEqual({ unitCount: 4, credits: 200 });
    expect(quoteCarouselUnits(0)).toEqual({ unitCount: 0, credits: 0 });
  });

  it("accepts a valid five-slide deck", () => {
    const deck = deckOf(5, FIVE_ROLES);
    expect(carouselDeckPlanSchema.parse(deck)).toEqual(deck);
    expect(validateCarouselDeckStructure(deck)).toEqual([]);
  });

  it("accepts a valid eight-slide deck", () => {
    const deck = deckOf(8, EIGHT_ROLES);
    expect(carouselDeckPlanSchema.parse(deck)).toEqual(deck);
    expect(validateCarouselDeckStructure(deck)).toEqual([]);
  });

  it("rejects decks with fewer than five or more than eight slides", () => {
    expect(carouselDeckPlanSchema.safeParse(deckOf(4)).success).toBe(false);
    expect(carouselDeckPlanSchema.safeParse(deckOf(9)).success).toBe(false);
    for (const deck of [deckOf(4), deckOf(9)]) {
      expect(validateCarouselDeckStructure(deck)).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: "slides", code: "slide_count" }),
      ]));
    }
  });

  it("rejects a 9:16 format for carousel decks", () => {
    expect(carouselDeckPlanSchema.safeParse({ ...deckOf(5), format: "9:16" }).success).toBe(false);
    expect(validateCarouselDeckStructure({ ...deckOf(5), format: "9:16" } as unknown as CarouselDeckPlanV1))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ path: "format", code: "invalid_format" }),
      ]));
  });

  it("reports duplicate positions", () => {
    const deck = deckOf(5, FIVE_ROLES);
    deck.slides[2] = { ...deck.slides[2], position: 2 };
    expect(validateCarouselDeckStructure(deck)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "slides.2.position", code: "duplicate_position" }),
    ]));
  });

  it("reports duplicate slide ids", () => {
    const deck = deckOf(5, FIVE_ROLES);
    deck.slides[3] = { ...deck.slides[3], slideId: deck.slides[2].slideId };
    expect(validateCarouselDeckStructure(deck)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "slides.3.slideId", code: "duplicate_slide_id" }),
    ]));
  });

  it("requires the first slide to be the hook", () => {
    const deck = deckOf(5, FIVE_ROLES);
    deck.slides[0] = { ...deck.slides[0], role: "context" };
    expect(validateCarouselDeckStructure(deck)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "slides.0.role", code: "missing_hook" }),
    ]));
  });

  it("reports a second CTA slide", () => {
    const deck = deckOf(5, FIVE_ROLES);
    deck.slides[1] = { ...deck.slides[1], role: "cta" };
    expect(validateCarouselDeckStructure(deck)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "multiple_cta" }),
    ]));
  });

  it("reports blank copy", () => {
    const deck = deckOf(5, FIVE_ROLES);
    deck.slides[0] = { ...deck.slides[0], primaryText: "   " };
    expect(validateCarouselDeckStructure(deck)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "slides.0.primaryText", code: "blank_copy" }),
    ]));
  });

  it("resolves legacy snapshots without a carousel block to null", () => {
    const legacy = { request: "Promoção", settings: { targetFormats: [] }, sources: [] } as CreativeWorkInputSnapshot;
    expect(resolveCarouselPreparedSnapshot(legacy)).toBeNull();
    expect(resolveCarouselPreparedSnapshot(null)).toBeNull();
    expect(resolveCarouselPreparedSnapshot(undefined)).toBeNull();
    expect(resolveCarouselPreparedSnapshot({ ...legacy, carousel: { version: 99 } as never })).toBeNull();
  });

  it("round-trips a frozen carousel snapshot through the input snapshot", () => {
    const snapshot: CreativeWorkInputSnapshot = {
      request: "Carrossel do grupo de terapia",
      settings: { targetFormats: [] },
      sources: [],
      carousel: preparedSnapshot("prepared-1", deckOf(5, FIVE_ROLES)),
    };
    const restored = JSON.parse(JSON.stringify(snapshot)) as CreativeWorkInputSnapshot;
    expect(resolveCarouselPreparedSnapshot(restored)).toEqual(snapshot.carousel);
  });

  it("keeps legacy snapshots readable without generationScope and round-trips a scoped freeze", () => {
    const legacy = preparedSnapshot("prepared-1", deckOf(5, FIVE_ROLES));
    expect(resolveCarouselPreparedSnapshot({
      request: "Carrossel",
      settings: { targetFormats: [] },
      sources: [],
      carousel: legacy,
    })).toEqual(legacy);
    const scoped: CarouselPreparedSnapshotV1 = {
      ...legacy,
      generationScope: "cover",
      scriptRevision: "script-1",
      storyboard: [{
        slideId: "slide-1",
        learning: "A capa ancora a tese",
        representation: "Retrato com paleta aprovada",
        hierarchy: "Título e marca",
        transition: "Abre o argumento",
        claimIds: [],
      }],
      caption: "Inscreva-se pelo WhatsApp",
    };
    expect(resolveCarouselPreparedSnapshot({
      request: "Carrossel",
      settings: { targetFormats: [] },
      sources: [],
      carousel: scoped,
    })).toEqual(scoped);
  });
});

describe("validateTextFieldsAgainstFactPack", () => {
  const pack = buildCreativeWorkFactPack({
    request: "Post para o consultório de Psicologia: grupo de terapia começa em agosto, vagas limitadas",
    mode: "social_post",
    sources: [],
    brand: { name: "Cenbrap", requiredElements: null, prohibitedElements: null },
    clientProfileId: "profile-1",
  });

  it("reports the exact carousel slide field that invented a claim", () => {
    expect(validateTextFieldsAgainstFactPack([
      { field: "slides.2.primaryText", text: "50% de desconto em setembro" },
    ], pack)).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "slides.2.primaryText", value: "50%" }),
      expect.objectContaining({ field: "slides.2.primaryText", value: "setembro" }),
    ]));
  });

  it("accepts carousel copy grounded in the request", () => {
    expect(validateTextFieldsAgainstFactPack([
      { field: "slides.0.primaryText", text: "Grupo de terapia em agosto" },
      { field: "slides.1.primaryText", text: "Vagas limitadas no consultório" },
    ], pack)).toEqual([]);
  });
});
