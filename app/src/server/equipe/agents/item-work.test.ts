// Item work (ticket 13): the schema SENT to the model is the shape only; the app validates the answer with the strict contract.

import { describe, expect, it } from "vitest";
import { workOutputWireSchemas } from "../module/agent-work-contract";
import { runItemWork } from "./item-work";
import { FakeModelClient } from "./testing";
import type { ModelCallUsage } from "./model-client";

const input = { caption: "legenda", facts: [], note: "nota", now: "2026-10-01T12:00:00.000Z", scheduledFor: null };
const run = (content: unknown) => {
  const client = new FakeModelClient([{ content: JSON.stringify(content) }]);
  const result = runItemWork({ kind: "review_caption", input, client, model: "claude-opus-5-5", effort: "high", onModelCall: async () => undefined });
  return { client, result };
};

describe("runItemWork review_caption", () => {
  it("teaches the four natures, routing and priority without rewriting or approving", async () => {
    const finding = { severity: "info", area: "text", message: "CTA ok.", suggestion: null };
    const { client, result } = run({ findings: [finding], summary: "Ok.", natures: ["none"] });
    await expect(result).resolves.toEqual({ findings: [finding], summary: "Ok.", natures: ["none"] });
    const prompt = client.requests[0]!.messages[0]!.content;
    for (const rule of [
      "Natureza das afirmações (separada da severidade):",
      "Prioridade (a mais grave prevalece): regulated_claim > commercial_condition > permanent_fact > none",
      "permanent_fact: fato permanente do negócio não autorizado (ex.: horário de funcionamento). Encaminhamento: confirmação pelo Aprovador como fato do negócio.",
      "commercial_condition: condição comercial não autorizada (preço, desconto, frete, brinde ou prazo). Encaminhamento: Item bloqueado; alteração somente pelo catálogo da oferta.",
      "regulated_claim: alegação regulada ou arriscada (ex.: promessa ou garantia de resultado). Encaminhamento: Item bloqueado; Escalonamento para qualidade, sem confirmação pelo cliente.",
      "none: sem nova afirmação factual ou comercial. Encaminhamento: revalidação sem encaminhamento comercial.",
      "Claims presentes nos fatos autorizados não precisam de nova confirmação.",
      "Revise a legenda sem reescrever.",
      "Falhas impeditivas têm severity blocking; observações têm warning; info é aceito.",
      "Nunca aprove publicação nem emita Recibo ou Aprovação humana.",
    ]) expect(prompt).toContain(rule);
    expect(client.requests[0]!.messages[1]!.content).toBe(JSON.stringify(input));
    expect(client.requests).toHaveLength(1);
  });

  it("sends the wire schema (no maxItems) and still parses with the strict one", async () => {
    const { client, result } = run({ findings: [], summary: "Ok.", natures: ["none"] });
    await expect(result).resolves.toEqual({ findings: [], summary: "Ok.", natures: ["none"] });
    expect(client.requests[0]!.output).toEqual({ name: "equipe_review_caption", schema: workOutputWireSchemas.review_caption });
  });

  it("does not throw away a paid answer that lists a nature twice: the repeat is one nature", async () => {
    const { result } = run({ findings: [], summary: "Ok.", natures: ["permanent_fact", "none", "permanent_fact", "none", "regulated_claim", "commercial_condition", "regulated_claim"] });
    await expect(result).resolves.toMatchObject({ natures: ["permanent_fact", "none", "regulated_claim", "commercial_condition"] });
  });

  it("still refuses an answer with no nature at all, or one the contract does not know", async () => {
    await expect(run({ findings: [], summary: "Ok.", natures: [] }).result).rejects.toThrow();
    await expect(run({ findings: [], summary: "Ok.", natures: ["outra"] }).result).rejects.toThrow();
  });
});

describe("runItemWork plan_adjustment", () => {
  it("teaches the claim natures while returning only the new caption for independent review", async () => {
    const client = new FakeModelClient([{ content: JSON.stringify({ caption: "Legenda ajustada." }) }]);
    const inputWithFacts = { ...input, facts: ["Aberto de segunda a sexta."] };
    const result = await runItemWork({ kind: "plan_adjustment", input: inputWithFacts, client,
      model: "muse-spark-1.3-contributor", effort: "high", onModelCall: async () => undefined });
    expect(result).toEqual({ caption: "Legenda ajustada." });
    const prompt = client.requests[0]!.messages[0]!.content;
    for (const rule of [
      "Corrija somente a legenda conforme a nota do cliente.",
      "Preserve fatos autorizados, não invente ofertas ou promessas e não introduza afirmações não autorizadas.",
      "Natureza das afirmações (separada da severidade):",
      "permanent_fact: fato permanente do negócio não autorizado (ex.: horário de funcionamento).",
      "commercial_condition: condição comercial não autorizada (preço, desconto, frete, brinde ou prazo).",
      "regulated_claim: alegação regulada ou arriscada (ex.: promessa ou garantia de resultado).",
      "Claims presentes nos fatos autorizados não precisam de nova confirmação.",
      "Devolva a legenda nova para revisão independente.",
      "Não aprove ou publique.",
    ]) expect(prompt).toContain(rule);
    expect(client.requests[0]!.messages[1]!.content).toBe(JSON.stringify(inputWithFacts));
    expect(client.requests).toHaveLength(1);
  });


  it.each([undefined, null, "a".repeat(64)])("reports the same learned hash (%s) captured before dispatch", async (setHash) => {
    const client = new FakeModelClient([{ content: JSON.stringify({ caption: "Legenda ajustada." }) }]);
    const calls: ModelCallUsage[] = [];
    const task: Parameters<typeof runItemWork>[0] = { kind: "plan_adjustment", input, client,
      model: "muse-spark-1.3-contributor", effort: "high", setHash, onModelCall: async call => { calls.push(call); } };
    const result = runItemWork(task);
    task.setHash = "b".repeat(64);
    await expect(result).resolves.toEqual({ caption: "Legenda ajustada." });
    expect(client.requests[0]?.setHash).toBe(setHash ?? null);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.setHash).toBe(setHash ?? null);
  });
});
