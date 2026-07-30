import { beforeEach, describe, expect, it, vi } from "vitest";

const getWorkMock = vi.hoisted(() => vi.fn());
const createCompletionMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: (...args: unknown[]) => getWorkMock(...args),
}));
vi.mock("@/server/ai/utils", () => ({
  getOpenAI: () => ({ chat: { completions: { create: createCompletionMock } } }),
}));
vi.mock("@/server/ai/providers/e2e-controlled-provider", () => ({
  isE2EControlledProviderEnabled: () => false,
}));

import { suggestCreativeDirections } from "./suggest-creative-directions";

const WORK_ID = "11111111-1111-4111-8111-111111111111";

function workAggregate() {
  return {
    work: { id: WORK_ID, request: "Campanha de matrícula", status: "draft", toolKind: "variations" },
    outputs: [],
    sources: [{
      id: "source-1",
      status: "ready",
      usage: "both",
      contentAnalysis: { product: "Curso", offer: "20%", cta: { text: "Inscreva-se", style: "botão" } },
      styleAnalysis: { mood: "acolhedor", composition: "centralizada" },
    }],
  };
}

describe("suggestCreativeDirections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWorkMock.mockResolvedValue(workAggregate());
    createCompletionMock.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ directions: [
        { label: "Oferta em primeiro plano", instruction: "Destaque a oferta com hierarquia imediata.", safetyBand: "safe" },
        { label: "Prova social", instruction: "Use sinais visuais de confiança sem inventar depoimentos.", safetyBand: "safe" },
        { label: "Ritmo editorial", instruction: "Organize a informação como uma capa editorial clara.", safetyBand: "safe" },
        { label: "Contraste ousado", instruction: "Aumente o contraste visual preservando a leitura da marca.", safetyBand: "experimental" },
        { label: "CTA destacado", instruction: "Dê ao CTA uma posição e uma forma fáceis de identificar.", safetyBand: "safe" },
      ] }) } }],
    });
  });

  it("returns five contextual directions with stable UUID ids and no billing call", async () => {
    const first = await suggestCreativeDirections({ workspaceId: "workspace-1", workItemId: WORK_ID });
    const second = await suggestCreativeDirections({ workspaceId: "workspace-1", workItemId: WORK_ID });

    expect(first).toEqual(second);
    if (!first.ok) throw new Error("expected ok result");
    expect(first.directions).toHaveLength(5);
    expect(first.directions.every((direction) => direction.provenance === "ai-suggestion")).toBe(true);
    expect(first.directions.every((direction) => /^[0-9a-f-]{36}$/.test(direction.id))).toBe(true);
    expect(createCompletionMock).toHaveBeenCalledTimes(2);
  });

  it("returns five local directions when the text provider fails", async () => {
    createCompletionMock.mockRejectedValue(new Error("provider unavailable"));

    const result = await suggestCreativeDirections({ workspaceId: "workspace-1", workItemId: WORK_ID });

    if (!result.ok) throw new Error("expected ok result");
    expect(result.directions).toHaveLength(5);
    expect(result.directions.map((direction) => direction.label)).toEqual([
      "Conservadora", "Equilibrada", "Ousada", "Foco no produto", "Foco na oferta",
    ]);
  });

  it("rejects a work outside the workspace scope without calling the provider", async () => {
    getWorkMock.mockResolvedValue(null);
    await expect(suggestCreativeDirections({ workspaceId: "workspace-1", workItemId: WORK_ID }))
      .resolves.toEqual({ ok: false, error: { code: "work_not_found" } });
    expect(createCompletionMock).not.toHaveBeenCalled();
  });

  it("rejects a work that already left the draft state", async () => {
    const aggregate = workAggregate();
    aggregate.work.status = "generating";
    getWorkMock.mockResolvedValue(aggregate);
    await expect(suggestCreativeDirections({ workspaceId: "workspace-1", workItemId: WORK_ID }))
      .resolves.toEqual({ ok: false, error: { code: "work_not_draft", status: "generating" } });
    expect(createCompletionMock).not.toHaveBeenCalled();
  });

  it("rejects a work whose intent does not support variations", async () => {
    const aggregate = workAggregate();
    aggregate.work.toolKind = "social_post";
    getWorkMock.mockResolvedValue(aggregate);
    await expect(suggestCreativeDirections({ workspaceId: "workspace-1", workItemId: WORK_ID }))
      .resolves.toEqual({ ok: false, error: { code: "intent_not_supported", toolKind: "social_post" } });
    expect(createCompletionMock).not.toHaveBeenCalled();
  });

  it("rejects a work without any ready source", async () => {
    const aggregate = workAggregate();
    aggregate.sources[0].status = "analyzing";
    getWorkMock.mockResolvedValue(aggregate);
    await expect(suggestCreativeDirections({ workspaceId: "workspace-1", workItemId: WORK_ID }))
      .resolves.toEqual({ ok: false, error: { code: "source_not_ready" } });
    expect(createCompletionMock).not.toHaveBeenCalled();
  });
});
