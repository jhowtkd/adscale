import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildCreativeWorkFactPack } from "@/server/creative-work/fact-pack";
import type { CreativeWorkItem, CreativeWorkSource } from "@/server/db/schema";
import type {
  CarouselDeckPlanV1,
  CarouselDraftStateV1,
} from "@/server/creative-work/carousel-contracts";

const repo = vi.hoisted(() => ({
  getCreativeWork: vi.fn(),
  updateCreativeWorkDraftIfUnchanged: vi.fn(),
}));
const brandKitMock = vi.hoisted(() => vi.fn());
const proposeMock = vi.hoisted(() => vi.fn());
const refundCreditsMock = vi.hoisted(() => vi.fn());
const inngestSendMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: (...args: unknown[]) => repo.getCreativeWork(...args),
  updateCreativeWorkDraftIfUnchanged: (...args: unknown[]) => repo.updateCreativeWorkDraftIfUnchanged(...args),
  withCreativeWorkPreparationLock: (_workspaceId: string, _workItemId: string, callback: (executor: object) => Promise<unknown>) =>
    callback({}),
}));
vi.mock("@/server/repositories/brand-kit", () => ({
  getBrandKit: (...args: unknown[]) => brandKitMock(...args),
}));
vi.mock("@/server/creative-work/carousel-editorial", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/creative-work/carousel-editorial")>();
  return { ...actual, proposeCarouselDraft: (...args: unknown[]) => proposeMock(...args) };
});
vi.mock("@/server/billing/credits", () => ({
  refundCredits: (...args: unknown[]) => refundCreditsMock(...args),
  canSpend: vi.fn(),
  recordUsage: vi.fn(),
  spend: vi.fn(),
  checkSpend: vi.fn(),
}));
vi.mock("@/server/jobs/client", () => ({
  inngest: { send: (...args: unknown[]) => inngestSendMock(...args) },
}));

import { CarouselEditorialPlanInvalidError } from "@/server/creative-work/carousel-editorial";
import { planCarouselWork } from "./plan-carousel-work";

const UPDATED_AT = "2026-08-30T12:00:00.000Z";

function work(overrides: Partial<CreativeWorkItem> = {}): CreativeWorkItem {
  return {
    id: "work-1",
    workspaceId: "workspace-1",
    clientProfileId: "profile-1",
    createdByUserId: "user-1",
    toolKind: "carousel",
    status: "draft",
    brief: null,
    format: "4:5",
    copy: null,
    request: "Grupo de terapia começa em agosto, vagas limitadas",
    settings: { targetFormats: [] },
    inputSnapshot: null,
    identitySnapshot: null,
    createdAt: new Date("2026-08-30T11:00:00.000Z"),
    updatedAt: new Date(UPDATED_AT),
    ...overrides,
  } as CreativeWorkItem;
}

function source(overrides: Partial<CreativeWorkSource> = {}): CreativeWorkSource {
  return {
    id: "source-1",
    workspaceId: "workspace-1",
    workItemId: "work-1",
    assetId: "asset-1",
    templateId: null,
    usage: "content",
    usageConfirmed: true,
    status: "ready",
    contentAnalysis: {
      product: "Grupo de terapia",
      offer: "Turmas de agosto",
      cta: { text: "Inscreva-se", style: "botão" },
      brandElements: [],
      keyVisual: "Sala de grupo",
      textContent: { headline: "Nova turma", bullets: ["Vagas limitadas"] },
      format: "4:5",
    },
    styleAnalysis: null,
    pieceReference: null,
    failureCode: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CreativeWorkSource;
}

function planOfFive(): CarouselDeckPlanV1 {
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
      { slideId: "s1", position: 1, role: "hook", purpose: "Abrir", primaryText: "Grupo de terapia começa em agosto", secondaryText: null, authority: "ai_proposal", sourceFactIds: [], layoutFamily: "impact" },
      { slideId: "s2", position: 2, role: "context", purpose: "Contexto", primaryText: "O grupo acontece no consultório", secondaryText: null, authority: "ai_proposal", sourceFactIds: [], layoutFamily: "development" },
      { slideId: "s3", position: 3, role: "argument", purpose: "Argumento", primaryText: "As vagas são limitadas", secondaryText: null, authority: "ai_proposal", sourceFactIds: [], layoutFamily: "development" },
      { slideId: "s4", position: 4, role: "evidence", purpose: "Evidência", primaryText: "O consultório organiza o grupo de terapia", secondaryText: null, authority: "ai_proposal", sourceFactIds: [], layoutFamily: "development" },
      { slideId: "s5", position: 5, role: "closing", purpose: "Fechar", primaryText: "Comece em agosto", secondaryText: null, authority: "ai_proposal", sourceFactIds: [], layoutFamily: "respite" },
    ],
  };
}

function questionsDraft(): CarouselDraftStateV1 {
  return {
    version: 1,
    revision: "questions-1",
    answers: {},
    blockingQuestions: [{
      id: "q-1",
      field: "offer",
      question: "Qual é a condição de entrada?",
      reason: "O pedido não declara oferta.",
    }],
    plan: null,
    changes: [],
  };
}

const baseInput = {
  workspaceId: "workspace-1",
  workItemId: "work-1",
  expectedUpdatedAt: UPDATED_AT,
  answers: {},
};

describe("planCarouselWork", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    brandKitMock.mockResolvedValue({
      name: "Cenbrap",
      toneOfVoice: "Acolhedor",
      requiredElements: null,
      prohibitedElements: null,
    });
    repo.updateCreativeWorkDraftIfUnchanged.mockResolvedValue({ ...work(), updatedAt: new Date("2026-08-30T12:00:01.000Z") });
    refundCreditsMock.mockResolvedValue({ status: "refunded" });
  });

  it("returns work_not_found for a work outside the workspace", async () => {
    repo.getCreativeWork.mockResolvedValue(null);

    const result = await planCarouselWork(baseInput);

    expect(result).toEqual({ ok: false, error: { code: "work_not_found" } });
    expect(proposeMock).not.toHaveBeenCalled();
  });

  it("returns work_not_carousel for a non-carousel tool kind", async () => {
    repo.getCreativeWork.mockResolvedValue({ work: work({ toolKind: "social_post" }), outputs: [], sources: [] });

    const result = await planCarouselWork(baseInput);

    expect(result).toEqual({ ok: false, error: { code: "work_not_carousel", details: { toolKind: "social_post" } } });
    expect(proposeMock).not.toHaveBeenCalled();
  });

  it("returns work_not_draft when the work left the draft state", async () => {
    repo.getCreativeWork.mockResolvedValue({ work: work({ status: "ready" }), outputs: [], sources: [] });

    const result = await planCarouselWork(baseInput);

    expect(result).toEqual({ ok: false, error: { code: "work_not_draft", details: { status: "ready" } } });
  });

  it("returns sources_not_ready while a source analysis is pending", async () => {
    repo.getCreativeWork.mockResolvedValue({
      work: work(),
      outputs: [],
      sources: [source(), source({ id: "source-2", status: "uploaded" })],
    });

    const result = await planCarouselWork(baseInput);

    expect(result).toEqual({ ok: false, error: { code: "sources_not_ready" } });
    expect(proposeMock).not.toHaveBeenCalled();
  });

  it("returns stale_input when expectedUpdatedAt does not match the persisted work", async () => {
    repo.getCreativeWork.mockResolvedValue({ work: work(), outputs: [], sources: [] });

    const result = await planCarouselWork({ ...baseInput, expectedUpdatedAt: "2026-08-30T11:59:59.000Z" });

    expect(result).toEqual({ ok: false, error: { code: "stale_input" } });
    expect(proposeMock).not.toHaveBeenCalled();
    expect(repo.updateCreativeWorkDraftIfUnchanged).not.toHaveBeenCalled();
  });

  it("builds the fact pack with mode social_post, content sources only, and merges answers into the request", async () => {
    const styleSource = source({
      id: "source-style",
      assetId: "asset-2",
      usage: "style",
      contentAnalysis: {
        product: "Referência visual secreta",
        offer: null,
        cta: null,
        brandElements: [],
        keyVisual: "Fundo azul",
        textContent: { headline: "Headline da referência", bullets: [] },
        format: "4:5",
      },
    });
    repo.getCreativeWork.mockResolvedValue({
      work: work(),
      outputs: [],
      sources: [source(), styleSource],
    });
    proposeMock.mockResolvedValue(questionsDraft());

    await planCarouselWork({ ...baseInput, answers: { publico: "Adultos" } });

    const call = proposeMock.mock.calls[0][0] as {
      request: string;
      answers: Record<string, string>;
      factPack: ReturnType<typeof buildCreativeWorkFactPack>;
    };
    expect(call.request).toContain("publico: Adultos");
    expect(call.request).toContain("Grupo de terapia começa em agosto");
    expect(call.answers).toEqual({ publico: "Adultos" });
    expect(call.factPack.request).toContain("publico: Adultos");
    expect(JSON.stringify(call.factPack.facts)).not.toContain("Referência visual secreta");
    expect(JSON.stringify(call.factPack.facts)).toContain("Grupo de terapia");
  });

  it("persists blocking questions with a null plan through the draft CAS", async () => {
    repo.getCreativeWork.mockResolvedValue({ work: work(), outputs: [], sources: [source()] });
    proposeMock.mockResolvedValue(questionsDraft());
    const persisted = { ...work(), updatedAt: new Date("2026-08-30T12:00:01.000Z") };
    repo.updateCreativeWorkDraftIfUnchanged.mockResolvedValue(persisted);

    const result = await planCarouselWork(baseInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.draft.plan).toBeNull();
    expect(result.value.draft.blockingQuestions).toHaveLength(1);
    expect(result.value.work.id).toBe("work-1");
    expect(repo.updateCreativeWorkDraftIfUnchanged).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      new Date(UPDATED_AT),
      { settings: { targetFormats: [], carouselDraft: questionsDraft() } },
      {},
    );
  });

  it("persists a 5-8 slide plan and returns its findings", async () => {
    repo.getCreativeWork.mockResolvedValue({ work: work(), outputs: [], sources: [source()] });
    const draft: CarouselDraftStateV1 = {
      version: 1,
      revision: "deck-r1",
      answers: {},
      blockingQuestions: [],
      plan: planOfFive(),
      changes: [],
    };
    proposeMock.mockResolvedValue(draft);

    const result = await planCarouselWork(baseInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.draft.plan?.slides).toHaveLength(5);
    expect(result.value.findings).toEqual([]);
    expect(repo.updateCreativeWorkDraftIfUnchanged).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      new Date(UPDATED_AT),
      expect.objectContaining({ settings: expect.objectContaining({ carouselDraft: draft }) }),
      {},
    );
  });

  it("keeps the last persisted draft and reports editorial_plan_invalid when the model response is invalid", async () => {
    repo.getCreativeWork.mockResolvedValue({ work: work(), outputs: [], sources: [source()] });
    proposeMock.mockRejectedValue(new CarouselEditorialPlanInvalidError("bad response"));

    const result = await planCarouselWork(baseInput);

    expect(result).toEqual({
      ok: false,
      error: { code: "editorial_plan_invalid", details: { message: "bad response" } },
    });
    expect(repo.updateCreativeWorkDraftIfUnchanged).not.toHaveBeenCalled();
  });

  it("returns stale_input when the draft CAS loses the race", async () => {
    repo.getCreativeWork.mockResolvedValue({ work: work(), outputs: [], sources: [source()] });
    proposeMock.mockResolvedValue(questionsDraft());
    repo.updateCreativeWorkDraftIfUnchanged.mockResolvedValue(null);

    const result = await planCarouselWork(baseInput);

    expect(result).toEqual({ ok: false, error: { code: "stale_input" } });
  });

  it("calls no billing, Inngest, or image provider seam", async () => {
    repo.getCreativeWork.mockResolvedValue({ work: work(), outputs: [], sources: [source()] });
    const draft: CarouselDraftStateV1 = {
      version: 1,
      revision: "deck-r1",
      answers: {},
      blockingQuestions: [],
      plan: planOfFive(),
      changes: [],
    };
    proposeMock.mockResolvedValue(draft);

    await planCarouselWork(baseInput);

    expect(refundCreditsMock).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();
  });
});
