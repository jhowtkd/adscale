import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/mcp/audit", () => ({ auditMcpCall: vi.fn() }));

const mocks = vi.hoisted(() => ({
  createDraft: vi.fn(),
  getWork: vi.fn(),
  getProfile: vi.fn(),
  getProfiles: vi.fn(),
  prepare: vi.fn(),
  generate: vi.fn(),
  select: vi.fn(),
  cancel: vi.fn(),
}));

const freePlan = vi.hoisted(() => ({ find: vi.fn(async (): Promise<{ accountId: string } | null> => null) }));
vi.mock("@/server/equipe/module/free-plan", () => ({ findFreePlanAccount: (...args: unknown[]) => (freePlan.find as (...a: unknown[]) => unknown)(...args) }));

vi.mock("@/server/repositories/creative-work", () => ({
  createCreativeWorkDraft: (...args: unknown[]) => mocks.createDraft(...args),
  getCreativeWork: (...args: unknown[]) => mocks.getWork(...args),
}));

vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: (...args: unknown[]) => mocks.getProfile(...args),
  getClientProfiles: (...args: unknown[]) => mocks.getProfiles(...args),
}));

vi.mock("@/server/application/prepare-creative-work", () => ({
  prepareCreativeWork: (...args: unknown[]) => mocks.prepare(...args),
}));

vi.mock("@/server/application/generate-creative-work", () => ({
  generateCreativeWork: (...args: unknown[]) => mocks.generate(...args),
}));

vi.mock("@/server/application/select-creative-work-output", () => ({
  selectCreativeWorkOutputCommand: (...args: unknown[]) => mocks.select(...args),
}));

vi.mock("@/server/application/cancel-creative-work-output", () => ({
  cancelCreativeWorkOutput: (...args: unknown[]) => mocks.cancel(...args),
}));

import {
  cancelarPeca,
  criarTrabalho,
  gerarPeca,
  lerPeca,
  listarPecas,
  selecionarPeca,
} from "./tools";

const ctx = { workspaceId: "ws-1", userId: "user-1", tokenPrefix: "adscale-mcp-abcd" };
const PROFILE_ID = "123e4567-e89b-12d3-a456-426614174000";

beforeEach(() => {
  vi.clearAllMocks();
  freePlan.find.mockReset();
  freePlan.find.mockResolvedValue(null);
});

describe("criarTrabalho", () => {
  it("resolve marca por nome e cria o rascunho", async () => {
    mocks.getProfiles.mockResolvedValue([{ id: PROFILE_ID, name: "Acme" }]);
    mocks.createDraft.mockResolvedValue({ id: "work-1", title: "Campanha" });
    const result = await criarTrabalho(ctx, { marca: "acme", pedido: "crie uma campanha" });
    expect(result).toEqual({
      ok: true,
      data: { trabalho_id: "work-1", titulo: "Campanha", marca: "Acme", protocolo: "single", formato: "4:5" },
    });
    expect(mocks.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({ clientProfileId: PROFILE_ID, intent: "single", createdByUserId: "user-1" })
    );
  });

  it("resolve marca por id", async () => {
    mocks.getProfile.mockResolvedValue({ id: PROFILE_ID, name: "Acme" });
    mocks.createDraft.mockResolvedValue({ id: "work-1", title: "t" });
    const result = await criarTrabalho(ctx, { marca: PROFILE_ID, pedido: "x" });
    expect(result.ok).toBe(true);
    expect(mocks.getProfiles).not.toHaveBeenCalled();
  });

  it("marca ambígua lista candidatas", async () => {
    mocks.getProfiles.mockResolvedValue([
      { id: "a", name: "Acme" },
      { id: "b", name: "ACME" },
    ]);
    const result = await criarTrabalho(ctx, { marca: "acme", pedido: "x" });
    expect(result).toEqual({
      ok: false,
      code: "marca_ambigua",
      message: expect.stringContaining("2 marcas"),
      details: { candidatas: [{ id: "a", nome: "Acme" }, { id: "b", nome: "ACME" }] },
    });
    expect(mocks.createDraft).not.toHaveBeenCalled();
  });

  it("protocolo e formato desconhecidos falham sem criar", async () => {
    mocks.getProfile.mockResolvedValue({ id: PROFILE_ID, name: "Acme" });
    expect((await criarTrabalho(ctx, { marca: PROFILE_ID, pedido: "x", protocolo: "novo" })).ok).toBe(false);
    expect((await criarTrabalho(ctx, { marca: PROFILE_ID, pedido: "x", formato: "21:9" })).ok).toBe(false);
    expect(mocks.createDraft).not.toHaveBeenCalled();
  });
});

describe("gerarPeca", () => {
  const baseWork = {
    id: "work-1",
    status: "draft",
    updatedAt: new Date("2026-09-15T10:00:00.000Z"),
    brief: { theme: "t" },
    copy: {},
    inputSnapshot: {},
  };

  it("gera com o updatedAt como preparedRevision e devolve job ids", async () => {
    mocks.getWork.mockResolvedValue({ work: baseWork, outputs: [] });
    mocks.generate.mockResolvedValue({
      ok: true,
      value: { outputs: [{ id: "out-1", status: "queued" }] },
    });
    const result = await gerarPeca(ctx, { trabalho_id: "work-1" });
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.generate).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      workItemId: "work-1",
      userId: "user-1",
      preparedRevision: "2026-09-15T10:00:00.000Z",
    });
    expect(result).toEqual({
      ok: true,
      data: {
        trabalho_id: "work-1",
        pecas: [{ peca_id: "out-1", status: "queued" }],
        dica_poll: expect.stringContaining("assíncrona"),
      },
    });
  });

  it("prepara sozinho quando o Trabalho ainda é rascunho cru", async () => {
    const raw = { ...baseWork, brief: null, copy: null, inputSnapshot: null };
    mocks.getWork
      .mockResolvedValueOnce({ work: raw, outputs: [] })
      .mockResolvedValueOnce({ work: baseWork, outputs: [] });
    mocks.prepare.mockResolvedValue({ ok: true, value: {} });
    mocks.generate.mockResolvedValue({ ok: true, value: { outputs: [] } });
    await gerarPeca(ctx, { trabalho_id: "work-1" });
    expect(mocks.prepare).toHaveBeenCalledWith({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(mocks.generate).toHaveBeenCalled();
  });

  it("recusa gerar duas vezes, apontando as Peças existentes", async () => {
    mocks.getWork.mockResolvedValue({ work: baseWork, outputs: [{ id: "out-1", status: "completed" }] });
    const result = await gerarPeca(ctx, { trabalho_id: "work-1" });
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ code: "trabalho_ja_gerado" });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("sem créditos vira erro legível, sem throw", async () => {
    mocks.getWork.mockResolvedValue({ work: baseWork, outputs: [] });
    mocks.generate.mockResolvedValue({ ok: false, error: { code: "credit_blocked" } });
    const result = await gerarPeca(ctx, { trabalho_id: "work-1" });
    expect(result).toEqual({ ok: false, code: "geracao_credit_blocked", message: "Sem créditos no workspace para gerar.", details: null });
  });

  describe("the free plan (ticket 11, part 2)", () => {
    const FREE_MESSAGE = "Na conta grátis, gerar peças faz parte do plano. Fale com a gente para conhecer o plano.";
    const freePayload = {
      reason: "free_plan",
      recommendedAction: "plan_request",
      accountId: "acc-free",
      amount: 50,
      balance: 500,
      analytics: { reasonCode: "free_plan", estimateCredits: 50 },
    };

    it.each([
      ["a spend result wrapping the payload", { ok: false, status: 402, conversionPayload: freePayload }],
      ["the payload itself", freePayload],
    ])("%s: says what the free plan is, not 'no credits', and keeps the details", async (_name, details) => {
      mocks.getWork.mockResolvedValue({ work: baseWork, outputs: [] });
      mocks.generate.mockResolvedValue({ ok: false, error: { code: "credit_blocked", details } });

      const result = await gerarPeca(ctx, { trabalho_id: "work-1" });

      expect(result).toEqual({ ok: false, code: "geracao_credit_blocked", message: FREE_MESSAGE, details });
    });

    it.each([
      ["another reason's payload", { ok: false, status: 402, conversionPayload: { ...freePayload, reason: "beta_exhausted", recommendedAction: "checkout", accountId: undefined } }],
      ["details that are not a payload", { reason: "free_plan" }],
      ["no details at all", null],
    ])("%s keeps the classic message", async (_name, details) => {
      mocks.getWork.mockResolvedValue({ work: baseWork, outputs: [] });
      mocks.generate.mockResolvedValue({ ok: false, error: { code: "credit_blocked", details: details ?? undefined } });

      const result = await gerarPeca(ctx, { trabalho_id: "work-1" });

      expect(result).toMatchObject({ ok: false, code: "geracao_credit_blocked", message: "Sem créditos no workspace para gerar." });
    });

    it("a free_plan payload under another failure code does not change that code's message", async () => {
      mocks.getWork.mockResolvedValue({ work: baseWork, outputs: [] });
      mocks.generate.mockResolvedValue({ ok: false, error: { code: "dispatch_failed", details: freePayload } });

      const result = await gerarPeca(ctx, { trabalho_id: "work-1" });

      expect(result).toMatchObject({ code: "geracao_dispatch_failed", message: "Fila de geração indisponível. Tente de novo em instantes." });
    });
  });
});

describe("listarPecas / lerPeca", () => {
  const output = {
    id: "out-1",
    status: "completed",
    targetFormat: "4:5",
    outputKey: "k",
    failureCode: null,
    quality: { verdict: "approved" },
    isSelected: true,
    selectedBy: "agent",
  };

  it("lista com o rastro de quem selecionou", async () => {
    mocks.getWork.mockResolvedValue({ work: { id: "work-1", status: "completed" }, outputs: [output] });
    const result = await listarPecas(ctx, { trabalho_id: "work-1" });
    expect(result).toEqual({
      ok: true,
      data: {
        trabalho_id: "work-1",
        status_trabalho: "completed",
        pecas: [
          {
            peca_id: "out-1",
            status: "completed",
            formato: "4:5",
            tem_imagem: true,
            falha: null,
            veredito: { verdict: "approved" },
            selecionada: true,
            selecionada_por: "agent",
          },
        ],
      },
    });
  });

  it("peca inexistente falha com código", async () => {
    mocks.getWork.mockResolvedValue({ work: { id: "work-1", status: "completed" }, outputs: [] });
    expect(await lerPeca(ctx, "work-1", "nope")).toMatchObject({ ok: false, code: "peca_nao_encontrada" });
  });
});

describe("selecionarPeca", () => {
  it("seleciona como agente, nunca como operador", async () => {
    mocks.select.mockResolvedValue({ ok: true, value: {} });
    const result = await selecionarPeca(ctx, { trabalho_id: "w", peca_id: "o" });
    expect(mocks.select).toHaveBeenCalledWith(
      expect.objectContaining({ selectedBy: "agent", outputId: "o" })
    );
    expect(result).toMatchObject({ ok: true, data: expect.objectContaining({ selecionada_por: "agent" }) });
  });

  it("reprovação objetiva e veredito inconclusivo viram mensagem clara", async () => {
    mocks.select.mockResolvedValue({ ok: false, error: { code: "objective_selection_blocked" } });
    expect(await selecionarPeca(ctx, { trabalho_id: "w", peca_id: "o" })).toMatchObject({
      ok: false,
      code: "selecao_objective_selection_blocked",
    });
    mocks.select.mockResolvedValue({ ok: false, error: { code: "objective_confirmation_required" } });
    const inconclusive = await selecionarPeca(ctx, { trabalho_id: "w", peca_id: "o" });
    expect(inconclusive).toMatchObject({ ok: false });
    expect((inconclusive as { message: string }).message).toContain("operador");
  });
});

describe("cancelarPeca", () => {
  it("cancela e repassa o refund", async () => {
    mocks.cancel.mockResolvedValue({ ok: true, value: { refunded: true } });
    expect(await cancelarPeca(ctx, { trabalho_id: "w", peca_id: "o" })).toEqual({
      ok: true,
      data: { peca_id: "o", cancelada: true, reembolsada: true },
    });
  });

  it("peça fora da janela de cancelamento explica", async () => {
    mocks.cancel.mockResolvedValue({ ok: false, error: { code: "output_not_cancellable", status: "completed" } });
    const result = await cancelarPeca(ctx, { trabalho_id: "w", peca_id: "o" });
    expect(result.ok).toBe(false);
    expect((result as { message: string }).message).toContain("completed");
  });
});

// Ticket 11, part 2: the free plan has no classic Trabalho; both tools refuse at the entry, before anything is written
// or the classic AI is called.
describe("the MCP tools on the free plan: refused at the entry", () => {
  const FREE_MESSAGE = "Na conta grátis, gerar peças faz parte do plano. Fale com a gente para conhecer o plano.";
  const refused = { ok: false, code: "plano_gratis", message: FREE_MESSAGE, details: { accountId: "acc-free" } };
  const baseWork = { id: "work-1", status: "draft", updatedAt: new Date("2026-09-15T10:00:00.000Z"), brief: { theme: "t" }, copy: {}, inputSnapshot: {} };

  beforeEach(() => {
    freePlan.find.mockResolvedValue({ accountId: "acc-free" });
  });

  it("criarTrabalho: plano_gratis with the account, nothing created, not even the brand is looked up", async () => {
    const result = await criarTrabalho(ctx, { marca: PROFILE_ID, pedido: "crie uma campanha" });

    expect(result).toEqual(refused);
    expect(freePlan.find).toHaveBeenCalledWith("ws-1");
    expect(mocks.createDraft).not.toHaveBeenCalled();
    expect(mocks.getProfile).not.toHaveBeenCalled();
    expect(mocks.getProfiles).not.toHaveBeenCalled();
  });

  it("gerarPeca: plano_gratis with the account, nothing read, prepared or generated", async () => {
    const result = await gerarPeca(ctx, { trabalho_id: "work-1" });

    expect(result).toEqual(refused);
    expect(freePlan.find).toHaveBeenCalledWith("ws-1");
    expect(mocks.getWork).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("refuses an invalid request too (the guard is the first thing the tools do)", async () => {
    expect(await criarTrabalho(ctx, { marca: PROFILE_ID, pedido: "x", protocolo: "novo" })).toEqual(refused);
  });

  it("the reading tools are not guarded: listing and reading pieces still work, and never ask the rule", async () => {
    mocks.getWork.mockResolvedValue({ work: baseWork, outputs: [] });

    const result = await listarPecas(ctx, { trabalho_id: "work-1" });

    expect(result.ok).toBe(true);
    expect(freePlan.find).not.toHaveBeenCalled();
  });

  it("a paid or classic workspace (null) creates and generates exactly as before", async () => {
    freePlan.find.mockResolvedValue(null);
    mocks.getProfile.mockResolvedValue({ id: PROFILE_ID, name: "Acme" });
    mocks.createDraft.mockResolvedValue({ id: "work-1", title: "t" });
    mocks.getWork.mockResolvedValue({ work: baseWork, outputs: [] });
    mocks.generate.mockResolvedValue({ ok: true, value: { outputs: [] } });

    expect((await criarTrabalho(ctx, { marca: PROFILE_ID, pedido: "x" })).ok).toBe(true);
    expect((await gerarPeca(ctx, { trabalho_id: "work-1" })).ok).toBe(true);

    expect(freePlan.find).toHaveBeenCalledTimes(2);
    expect(mocks.createDraft).toHaveBeenCalledTimes(1);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
});
