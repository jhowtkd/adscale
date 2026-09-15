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
