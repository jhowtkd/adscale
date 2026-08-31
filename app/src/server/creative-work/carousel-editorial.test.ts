import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildCreativeWorkFactPack } from "./fact-pack";
import { createHash } from "node:crypto";
import type {
  CarouselDeckPlanV1,
  CarouselDraftStateV1,
  CarouselSlidePlanV1,
} from "./carousel-contracts";

const controlledProvider = vi.hoisted(() => ({ enabled: false }));
const chatCreateMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/ai/providers/e2e-controlled-provider", () => ({
  isE2EControlledProviderEnabled: () => controlledProvider.enabled,
}));
vi.mock("@/server/ai/utils", () => ({
  getOpenAI: () => ({ chat: { completions: { create: chatCreateMock } } }),
}));

import {
  CarouselEditorialPlanInvalidError,
  lintCarouselDeck,
  proposeCarouselDraft,
} from "./carousel-editorial";

const REQUEST =
  "Post para o consultório de Psicologia: grupo de terapia começa em agosto, vagas limitadas";

const factPack = buildCreativeWorkFactPack({
  request: REQUEST,
  mode: "social_post",
  sources: [],
  brand: { name: "Cenbrap", requiredElements: null, prohibitedElements: null },
  clientProfileId: "profile-1",
});

function slide(
  position: number,
  role: CarouselSlidePlanV1["role"],
  primaryText: string,
  secondaryText: string | null = null,
  layoutFamily: CarouselSlidePlanV1["layoutFamily"] = "development",
): CarouselSlidePlanV1 {
  return {
    slideId: `slide-${position}`,
    position,
    role,
    purpose: "Propósito do slide",
    primaryText,
    secondaryText,
    authority: "ai_proposal",
    sourceFactIds: [],
    layoutFamily,
  };
}

function goodDeck(): CarouselDeckPlanV1 {
  return {
    version: 1,
    revision: "deck-r1",
    workId: "work-1",
    objective: "Divulgar o grupo de terapia",
    audience: null,
    tone: null,
    promise: "Grupo de terapia em agosto",
    format: "4:5",
    slides: [
      slide(1, "hook", "Grupo de terapia começa em agosto", null, "impact"),
      slide(2, "context", "O grupo acontece no consultório"),
      slide(3, "argument", "As vagas são limitadas", "Grupos pequenos"),
      slide(4, "evidence", "O consultório organiza o grupo de terapia"),
      slide(5, "closing", "Comece em agosto", null, "respite"),
    ],
  };
}

function draftWithHumanSlide(slideId: string, primaryText: string): CarouselDraftStateV1 {
  const deck = goodDeck();
  const index = Number(slideId.split("-")[1]) - 1;
  deck.slides[index] = {
    ...deck.slides[index],
    slideId,
    primaryText,
    authority: "human_edit",
  };
  return {
    version: 1,
    revision: "draft-r1",
    answers: {},
    blockingQuestions: [],
    plan: deck,
    changes: [],
  };
}

const proposeInput = {
  workId: "work-1",
  request: REQUEST,
  answers: {},
  previous: null,
  factPack,
  toneOfVoice: null,
};

describe("lintCarouselDeck", () => {
  it("flags repeated normalized primary text as a blocking duplicate_idea", () => {
    const deck = goodDeck();
    deck.slides[2].primaryText = "Grupo de terapia começa em agosto";

    expect(lintCarouselDeck({ deck, factPack })).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "duplicate_idea",
        path: "slides.2.primaryText",
        blocking: true,
      }),
    ]));
  });

  it("flags a hook promise that no slide ever resolves", () => {
    const deck = goodDeck();
    deck.promise = "Método exclusivo de vendas";

    expect(lintCarouselDeck({ deck, factPack })).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "unresolved_promise",
        path: "promise",
        blocking: true,
      }),
    ]));
  });

  it("flags primary plus secondary density above the region budget of the slide family", () => {
    const deck = goodDeck();
    deck.slides[0].primaryText = "Grupo de terapia começa em agosto no consultório. ".repeat(4);

    const findings = lintCarouselDeck({ deck, factPack });
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "text_density", path: "slides.0", blocking: false }),
    ]));
  });

  it("flags a CTA slide with no CTA or offer anywhere in the request or facts", () => {
    const deck = goodDeck();
    deck.slides[4].role = "cta";

    expect(lintCarouselDeck({ deck, factPack })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "forced_cta", blocking: true }),
    ]));
  });

  it("reports unsupported numbers and entities on the exact slide field", () => {
    const deck = goodDeck();
    deck.slides[1].primaryText = "50% de desconto em setembro";

    const findings = lintCarouselDeck({ deck, factPack });
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "unsupported_claim",
        path: "slides.1.primaryText",
        blocking: true,
        message: expect.stringContaining('"50%"'),
      }),
      expect.objectContaining({
        code: "unsupported_claim",
        path: "slides.1.primaryText",
        blocking: true,
        message: expect.stringContaining('"setembro"'),
      }),
    ]));
  });

  it("flags a generic phrase that could belong to any brand", () => {
    const deck = goodDeck();
    deck.slides[1].primaryText = "Transforme sua vida com o grupo";

    expect(lintCarouselDeck({ deck, factPack })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "generic_phrase", path: "slides.1.primaryText", blocking: false }),
    ]));
  });

  it("flags AI meta-language and a blase tone", () => {
    const deck = goodDeck();
    deck.slides[1].primaryText = "Neste post apresentamos o grupo de terapia";

    expect(lintCarouselDeck({ deck, factPack })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "blase_tone", path: "slides.1.primaryText", blocking: false }),
    ]));
  });

  it("flags a deck that keeps going after its closing slide", () => {
    const deck = goodDeck();
    deck.slides[2].role = "closing";

    expect(lintCarouselDeck({ deck, factPack })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "broken_transition", path: "slides.2.role", blocking: false }),
    ]));
  });

  it("returns no findings at all for a grounded concise deck", () => {
    expect(lintCarouselDeck({ deck: goodDeck(), factPack })).toEqual([]);
  });
});

describe("proposeCarouselDraft", () => {
  beforeEach(() => {
    controlledProvider.enabled = false;
    chatCreateMock.mockReset();
  });

  it("derives a deterministic five-slide plan from the request and facts under the controlled provider", async () => {
    controlledProvider.enabled = true;

    const draft = await proposeCarouselDraft(proposeInput);

    expect(draft.version).toBe(1);
    expect(draft.plan).not.toBeNull();
    expect(draft.plan?.slides).toHaveLength(5);
    expect(draft.plan?.slides[0].role).toBe("hook");
    expect(draft.plan?.slides.every((slide) => slide.authority === "ai_proposal")).toBe(true);
    expect(draft.blockingQuestions).toEqual([]);
    expect(draft.changes).toEqual([]);
    for (const slide of draft.plan?.slides ?? []) {
      expect(REQUEST.toLowerCase()).toContain(slide.primaryText.trim().toLowerCase());
    }
    const findings = lintCarouselDeck({ deck: draft.plan!, factPack });
    expect(findings.filter((finding) => finding.blocking)).toEqual([]);
  });

  it("derives stable slide ids from work and semantic position", async () => {
    controlledProvider.enabled = true;

    const first = await proposeCarouselDraft(proposeInput);
    const second = await proposeCarouselDraft(proposeInput);
    const otherWork = await proposeCarouselDraft({ ...proposeInput, workId: "work-2" });

    expect(first.plan?.slides.map((slide) => slide.slideId))
      .toEqual(second.plan?.slides.map((slide) => slide.slideId));
    expect(first.plan?.slides.map((slide) => slide.slideId))
      .not.toEqual(otherWork.plan?.slides.map((slide) => slide.slideId));
    for (const slideId of first.plan?.slides.map((slide) => slide.slideId) ?? []) {
      expect(slideId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    }
    const expected = createHash("sha256").update("work-1:carousel:1").digest("hex");
    expect(first.plan?.slides[0].slideId).toBe(
      `${expected.slice(0, 8)}-${expected.slice(8, 12)}-4${expected.slice(13, 16)}-8${expected.slice(17, 20)}-${expected.slice(20, 32)}`,
    );
  });

  it("keeps human text authoritative when a later proposal arrives", async () => {
    controlledProvider.enabled = true;

    const previous = draftWithHumanSlide("slide-2", "Texto humano aprovado");
    const next = await proposeCarouselDraft({ ...proposeInput, previous });
    expect(next.plan?.slides.find((slide) => slide.slideId === "slide-2")).toMatchObject({
      primaryText: "Texto humano aprovado",
      authority: "human_edit",
    });
  });

  it("returns one structured model call and never invents slide ids outside the stable scheme", async () => {
    chatCreateMock.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            kind: "deck",
            objective: "Divulgar o grupo",
            audience: null,
            tone: "Acolhedor",
            promise: "Grupo de terapia em agosto",
            slides: [
              { role: "hook", purpose: "Abrir", primaryText: "Grupo de terapia começa em agosto", secondaryText: null, sourceFactIds: [] },
              { role: "context", purpose: "Contexto", primaryText: "O grupo acontece no consultório", secondaryText: null, sourceFactIds: [] },
              { role: "argument", purpose: "Argumento", primaryText: "As vagas são limitadas", secondaryText: "Grupos pequenos", sourceFactIds: [] },
              { role: "evidence", purpose: "Evidência", primaryText: "O consultório organiza o grupo de terapia", secondaryText: null, sourceFactIds: [] },
              { role: "closing", purpose: "Fechamento", primaryText: "Comece em agosto", secondaryText: null, sourceFactIds: [] },
            ],
            changes: [
              { slideIndex: 2, field: "primaryText", before: "Antes", after: "O grupo acontece no consultório", reason: "Mais concreto" },
            ],
          }),
        },
      }],
    });

    const draft = await proposeCarouselDraft(proposeInput);

    expect(chatCreateMock).toHaveBeenCalledTimes(1);
    const call = chatCreateMock.mock.calls[0][0];
    expect(call.response_format).toBeDefined();
    expect(call.messages[0].role).toBe("system");
    expect(call.messages[0].content).toContain("Write in natural pt-BR. One main idea per slide.");
    expect(draft.plan?.slides).toHaveLength(5);
    expect(draft.plan?.slides[0].layoutFamily).toBe("impact");
    expect(draft.changes[0]).toEqual(expect.objectContaining({
      slideId: draft.plan?.slides[1].slideId,
      field: "primaryText",
      status: "pending",
    }));
  });

  it("returns blocking questions with a null plan when the model asks instead of drafting", async () => {
    chatCreateMock.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            kind: "questions",
            questions: [{
              id: "q-1",
              field: "offer",
              question: "Qual é a condição de entrada do grupo?",
              reason: "O pedido não declara oferta ou preço.",
            }],
          }),
        },
      }],
    });

    const draft = await proposeCarouselDraft({ ...proposeInput, answers: { publico: "Adultos" } });

    expect(draft.plan).toBeNull();
    expect(draft.blockingQuestions).toHaveLength(1);
    expect(draft.blockingQuestions[0]).toEqual(expect.objectContaining({ field: "offer" }));
    expect(draft.changes).toEqual([]);
    expect(draft.answers).toEqual({ publico: "Adultos" });
  });

  it("raises editorial_plan_invalid instead of guessing when the model response is invalid", async () => {
    chatCreateMock.mockResolvedValue({
      choices: [{ message: { content: "{ definitivamente não é json" } }],
    });

    await expect(proposeCarouselDraft(proposeInput)).rejects.toMatchObject({
      name: "CarouselEditorialPlanInvalidError",
      code: "editorial_plan_invalid",
    });
    expect(chatCreateMock).toHaveBeenCalledTimes(1);
  });

  it("raises editorial_plan_invalid when the response does not match the discriminated union", async () => {
    chatCreateMock.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({ kind: "deck", objective: "x", slides: [] }),
        },
      }],
    });

    await expect(proposeCarouselDraft(proposeInput)).rejects.toBeInstanceOf(
      CarouselEditorialPlanInvalidError,
    );
  });
});
