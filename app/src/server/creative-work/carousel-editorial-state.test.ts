import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJsonStringify } from "./canonical-json";
import {
  hashCarouselEditorialContext,
  hashCarouselEditorialRevision,
  mergeCarouselEditorialForClientSettingsWrite as mergeAndRecomputeCarouselEditorial,
} from "./carousel-editorial-hash";
import {
  authorizeCarouselSlideClaim,
  canDispatchCarouselInteriors,
  CarouselGenerationGateError,
  hasCurrentApprovedCarouselCover,
  carouselEditorialCommandSchema,
  carouselEditorialStateSchema,
  invalidateCarouselApprovals,
  invalidateCarouselProductionApprovals,
  isMaterialCarouselEditorialMutation,
  mergeCarouselEditorialForClientSettingsWrite,
  readCarouselEditorial,
  storyboardCoversDeck,
  stripClientCarouselApprovals,
  toPublicCarouselEditorial,
  type CarouselEditorialState,
  type CarouselHook,
  type CarouselResearch,
  type SlideDirection,
} from "./carousel-editorial-state";

function researchFixture(overrides: Partial<CarouselResearch> = {}): CarouselResearch {
  return {
    status: "not_needed",
    question: "O grupo de terapia começa em agosto?",
    thesis: "O consultório abre grupo em agosto com vagas limitadas.",
    sources: [],
    claims: [],
    gaps: [],
    ...overrides,
  };
}

function hookFixture(id: string, headline: string): CarouselHook {
  return {
    id,
    headline,
    promise: `Promessa ${headline}`,
    narrative: `Percurso ${headline}`,
  };
}

function directionFixture(slideId: string): SlideDirection {
  return {
    slideId,
    learning: "O leitor entende a oferta",
    representation: "Tipografia com o fato principal",
    hierarchy: "Título, apoio, marca",
    transition: "Segue para o próximo argumento",
    claimIds: [],
  };
}

function approvedState(): CarouselEditorialState {
  const hooks = [
    hookFixture("hook-1", "Grupo de terapia em agosto"),
    hookFixture("hook-2", "Vagas limitadas no consultório"),
    hookFixture("hook-3", "Comece o cuidado em grupo"),
  ];
  const storyboard = ["slide-1", "slide-2", "slide-3", "slide-4", "slide-5"].map(directionFixture);
  const context = { request: "Grupo de terapia em agosto", sourceIds: ["source-1"] };
  const selectedHook = hooks[0];
  const deck = { revision: "script-1", slideIds: storyboard.map((item) => item.slideId) };
  return {
    version: 1,
    revision: hashCarouselEditorialRevision({
      context,
      selectedHook,
      deck,
      storyboard,
      caption: "Inscreva-se pelo WhatsApp",
    }),
    contextHash: hashCarouselEditorialContext(context),
    research: researchFixture(),
    hooks,
    recommendedHookId: "hook-1",
    recommendation: "Abre com o fato datado.",
    selectedHookId: "hook-1",
    storyboard,
    caption: "Inscreva-se pelo WhatsApp",
    approvedScriptRevision: "script-1",
    approvedCover: {
      slideId: "cover-1",
      scriptRevision: "script-1",
      preparedRevision: "prepared-1",
    },
    confirmedInteriorsRevision: "prepared-1",
  };
}

describe("carousel editorial state", () => {
  it("clears dependent approvals without touching research", () => {
    const state = approvedState();
    const changed = invalidateCarouselApprovals(state);
    expect(changed.approvedScriptRevision).toBeNull();
    expect(changed.approvedCover).toBeNull();
    expect(changed.confirmedInteriorsRevision).toBeNull();
    expect(changed.research).toEqual(state.research);
    expect(canDispatchCarouselInteriors(changed, "script-2", "prepared-2", "cover-1")).toBe(false);

    const visualOnly = invalidateCarouselProductionApprovals(state);
    expect(visualOnly.approvedScriptRevision).toBe("script-1");
    expect(visualOnly.approvedCover).toBeNull();
    expect(visualOnly.confirmedInteriorsRevision).toBeNull();
  });

  it("allows interiors dispatch only when every identity and revision matches", () => {
    const state = approvedState();
    expect(canDispatchCarouselInteriors(state, "script-1", "prepared-1", "cover-1")).toBe(true);
    expect(canDispatchCarouselInteriors(state, "script-2", "prepared-1", "cover-1")).toBe(false);
    expect(canDispatchCarouselInteriors(state, "script-1", "prepared-2", "cover-1")).toBe(false);
    expect(canDispatchCarouselInteriors(state, "script-1", "prepared-1", "cover-2")).toBe(false);
    expect(canDispatchCarouselInteriors(
      { ...state, confirmedInteriorsRevision: "prepared-other" },
      "script-1",
      "prepared-1",
      "cover-1",
    )).toBe(false);
    expect(canDispatchCarouselInteriors(
      { ...state, approvedScriptRevision: "script-other" },
      "script-1",
      "prepared-1",
      "cover-1",
    )).toBe(false);
  });

  it("treats cover approval as current without lote confirmation", () => {
    const state = approvedState();
    expect(hasCurrentApprovedCarouselCover(state, "script-1", "prepared-1", "cover-1")).toBe(true);
    expect(hasCurrentApprovedCarouselCover(
      { ...state, confirmedInteriorsRevision: null },
      "script-1",
      "prepared-1",
      "cover-1",
    )).toBe(true);
    expect(canDispatchCarouselInteriors(
      { ...state, confirmedInteriorsRevision: null },
      "script-1",
      "prepared-1",
      "cover-1",
    )).toBe(false);
  });

  it("authorizes cover claims whenever the script is approved, and interiors only after lote confirmation", () => {
    const state = approvedState();
    expect(authorizeCarouselSlideClaim({
      editorial: state,
      generationScope: "cover",
      scriptRevision: "script-1",
      preparedRevision: "prepared-1",
      slidePosition: 1,
      coverSlideId: "cover-1",
    })).toBe(true);
    expect(authorizeCarouselSlideClaim({
      editorial: { ...state, confirmedInteriorsRevision: null },
      generationScope: "cover",
      scriptRevision: "script-1",
      preparedRevision: "prepared-1",
      slidePosition: 3,
      coverSlideId: "cover-1",
    })).toBe(false);
    expect(authorizeCarouselSlideClaim({
      editorial: { ...state, confirmedInteriorsRevision: null },
      generationScope: "interiors",
      scriptRevision: "script-1",
      preparedRevision: "prepared-1",
      slidePosition: 3,
      coverSlideId: "cover-1",
    })).toBe(false);
    expect(authorizeCarouselSlideClaim({
      editorial: state,
      generationScope: "interiors",
      scriptRevision: "script-1",
      preparedRevision: "prepared-1",
      slidePosition: 3,
      coverSlideId: "cover-1",
    })).toBe(true);
    expect(authorizeCarouselSlideClaim({
      editorial: state,
      generationScope: "interiors",
      scriptRevision: "script-1",
      preparedRevision: "prepared-1",
      slidePosition: 1,
      coverSlideId: "cover-1",
    })).toBe(true);
    expect(authorizeCarouselSlideClaim({
      editorial: { ...state, approvedScriptRevision: null },
      generationScope: "interiors",
      scriptRevision: "script-1",
      preparedRevision: "prepared-1",
      slidePosition: 1,
      coverSlideId: "cover-1",
    })).toBe(false);
    expect(authorizeCarouselSlideClaim({
      editorial: state,
      generationScope: undefined,
      scriptRevision: "script-1",
      preparedRevision: "prepared-1",
      slidePosition: 1,
      coverSlideId: "cover-1",
    })).toBe(false);
    expect(new CarouselGenerationGateError({ reason: "missing_scope" }).code).toBe("invalid_generation_gate");
  });

  it("hashes revision over context, hook, deck, storyboard and caption, never approvals", () => {
    const state = approvedState();
    const context = { request: "Grupo de terapia em agosto", sourceIds: ["source-1"] };
    const selectedHook = state.hooks[0];
    const deck = { revision: "script-1", slideIds: state.storyboard.map((item) => item.slideId) };
    const expected = createHash("sha256")
      .update(canonicalJsonStringify({
        context,
        selectedHook,
        deck,
        storyboard: state.storyboard,
        caption: state.caption,
      }))
      .digest("hex");
    expect(state.revision).toBe(expected);
    expect(hashCarouselEditorialRevision({
      context,
      selectedHook,
      deck,
      storyboard: state.storyboard,
      caption: state.caption,
    })).toBe(expected);
    expect(hashCarouselEditorialRevision({
      context,
      selectedHook,
      deck,
      storyboard: state.storyboard,
      caption: state.caption,
    })).toBe(hashCarouselEditorialRevision({
      context,
      selectedHook,
      deck,
      storyboard: state.storyboard,
      caption: state.caption,
    }));
  });

  it("treats a missing envelope as a valid legacy read and refuses dispatch without it", () => {
    expect(readCarouselEditorial(undefined)).toBeNull();
    expect(readCarouselEditorial({ targetFormats: [] })).toBeNull();
    expect(readCarouselEditorial({ carouselEditorial: { version: 2 } })).toBeNull();
  });

  it("accepts an empty hook list or exactly three unique hook ids", () => {
    const empty = approvedState();
    empty.hooks = [];
    empty.recommendedHookId = null;
    empty.selectedHookId = null;
    empty.recommendation = null;
    expect(carouselEditorialStateSchema.parse(empty).hooks).toEqual([]);

    const three = approvedState();
    expect(carouselEditorialStateSchema.parse(three).hooks).toHaveLength(3);

    const duplicate = approvedState();
    duplicate.hooks[2] = { ...duplicate.hooks[2], id: duplicate.hooks[0].id };
    expect(carouselEditorialStateSchema.safeParse(duplicate).success).toBe(false);

    const two = approvedState();
    two.hooks = two.hooks.slice(0, 2);
    expect(carouselEditorialStateSchema.safeParse(two).success).toBe(false);
  });

  it("requires selection and recommendation to point into the hook list", () => {
    const state = approvedState();
    state.selectedHookId = "missing-hook";
    expect(carouselEditorialStateSchema.safeParse(state).success).toBe(false);
  });

  it("requires opened sources to carry an http(s) url and a server date, and provided sources a sourceId", () => {
    const openedOk = researchFixture({
      sources: [{
        id: "src-1",
        url: "https://example.com/estudo",
        sourceId: null,
        title: "Estudo",
        checkedOn: "2026-09-10T12:00:00.000Z",
        publicationDate: null,
        evidence: "O grupo começa em agosto.",
        limitations: [],
        access: "opened",
      }],
    });
    expect(carouselEditorialStateSchema.parse({ ...approvedState(), research: openedOk }).research.sources).toHaveLength(1);

    const openedBad = researchFixture({
      sources: [{
        id: "src-1",
        url: "ftp://example.com/estudo",
        sourceId: null,
        title: "Estudo",
        checkedOn: "2026-09-10T12:00:00.000Z",
        publicationDate: null,
        evidence: "fato",
        limitations: [],
        access: "opened",
      }],
    });
    expect(carouselEditorialStateSchema.safeParse({ ...approvedState(), research: openedBad }).success).toBe(false);

    const providedBad = researchFixture({
      sources: [{
        id: "src-2",
        url: null,
        sourceId: null,
        title: "Material interno",
        checkedOn: null,
        publicationDate: null,
        evidence: "fato",
        limitations: [],
        access: "provided",
      }],
    });
    expect(carouselEditorialStateSchema.safeParse({ ...approvedState(), research: providedBad }).success).toBe(false);
  });

  it("covers the deck slide ids exactly and maps a public envelope without extra keys", () => {
    const state = approvedState();
    expect(storyboardCoversDeck(state.storyboard, ["slide-1", "slide-2", "slide-3", "slide-4", "slide-5"])).toBe(true);
    expect(storyboardCoversDeck(state.storyboard, ["slide-1", "slide-2"])).toBe(false);
    const publicState = toPublicCarouselEditorial({
      ...state,
      extraSecret: "creative-work/work-1/secret.png",
    } as CarouselEditorialState & { extraSecret: string });
    expect(publicState).not.toHaveProperty("extraSecret");
    expect(publicState.approvedCover).toEqual(state.approvedCover);
  });

  it("does not treat a no-op autosave as a material mutation", () => {
    const state = approvedState();
    const settings = { targetFormats: [] as Array<"1:1" | "4:5" | "9:16">, carouselDraft: { revision: "script-1" }, carouselEditorial: state };
    expect(isMaterialCarouselEditorialMutation({
      persistedRequest: "Tema",
      incomingRequest: "Tema",
      persistedSettings: settings,
      incomingSettings: settings,
    })).toBe(false);
    expect(isMaterialCarouselEditorialMutation({
      persistedRequest: "Tema",
      incomingRequest: "Tema novo",
      persistedSettings: settings,
      incomingSettings: settings,
    })).toBe(true);
  });

  it("restores persisted approvals when a client forges them on a no-op write", () => {
    const state = approvedState();
    const persisted = { targetFormats: [] as Array<"1:1" | "4:5" | "9:16">, carouselEditorial: state };
    const forged = stripClientCarouselApprovals({
      ...state,
      approvedScriptRevision: "forged",
      approvedCover: { slideId: "forged", scriptRevision: "forged", preparedRevision: "forged" },
      confirmedInteriorsRevision: "forged",
    }, state);
    expect(forged.approvedScriptRevision).toBe("script-1");
    expect(forged.approvedCover).toEqual(state.approvedCover);
    expect(forged.confirmedInteriorsRevision).toBe("prepared-1");

    const merged = mergeCarouselEditorialForClientSettingsWrite({
      persistedRequest: "Tema",
      incomingRequest: "Tema",
      persistedSettings: persisted,
      incomingSettings: {
        targetFormats: [],
        carouselEditorial: {
          ...state,
          approvedScriptRevision: "forged",
          approvedCover: { slideId: "forged", scriptRevision: "forged", preparedRevision: "forged" },
          confirmedInteriorsRevision: "forged",
        },
      },
    });
    expect(merged.carouselEditorial?.approvedScriptRevision).toBe("script-1");
    expect(merged.carouselEditorial?.approvedCover).toEqual(state.approvedCover);
  });

  it("invalidates approvals when the request or textual deck changes", () => {
    const state = approvedState();
    const merged = mergeCarouselEditorialForClientSettingsWrite({
      persistedRequest: "Tema",
      incomingRequest: "Tema revisado",
      persistedSettings: { targetFormats: [], carouselEditorial: state },
      incomingSettings: { targetFormats: [], carouselEditorial: state },
    });
    expect(merged.carouselEditorial?.approvedScriptRevision).toBeNull();
    expect(merged.carouselEditorial?.approvedCover).toBeNull();
    expect(merged.carouselEditorial?.confirmedInteriorsRevision).toBeNull();
    expect(merged.carouselEditorial?.research).toEqual(state.research);
  });

  it("recomputes revision and contextHash after a material autosave without hashing approvals", () => {
    const state = approvedState();
    const merged = mergeAndRecomputeCarouselEditorial({
      persistedRequest: "Tema",
      incomingRequest: "Tema revisado",
      persistedSettings: { targetFormats: [], carouselDraft: { revision: "script-1" }, carouselEditorial: state },
      incomingSettings: { targetFormats: [], carouselDraft: { revision: "script-2" }, carouselEditorial: state },
    });
    const expectedContext = { request: "Tema revisado" };
    expect(merged.carouselEditorial?.approvedScriptRevision).toBeNull();
    expect(merged.carouselEditorial?.revision).not.toBe(state.revision);
    expect(merged.carouselEditorial?.contextHash).toBe(hashCarouselEditorialContext(expectedContext));
    expect(merged.carouselEditorial?.revision).toBe(hashCarouselEditorialRevision({
      context: expectedContext,
      selectedHook: state.hooks[0],
      deck: { revision: "script-2" },
      storyboard: state.storyboard,
      caption: state.caption,
    }));
  });

  it("limits revise instructions and evidence, and parses known commands", () => {
    expect(carouselEditorialCommandSchema.parse({ kind: "propose_hooks" })).toEqual({ kind: "propose_hooks" });
    expect(carouselEditorialCommandSchema.parse({ kind: "select_hook", hookId: "hook-1" }).kind).toBe("select_hook");
    expect(carouselEditorialCommandSchema.safeParse({
      kind: "revise_script",
      instruction: "x".repeat(1001),
    }).success).toBe(false);
  });
});
