// Pesquisa: structured output parsing over faked model responses.

import { describe, expect, it } from "vitest";
import { runResearch } from "./research";
import { FakeModelClient } from "./testing";

const MATERIALS = [
  { assetId: "asset-1", label: "Site da empresa", excerpt: "Entregamos em todo o Brasil em até 5 dias." },
  { assetId: "asset-2", label: "Tabela de preços", excerpt: "Plano anual: R$ 990." },
];

describe("runResearch", () => {
  it("parses facts with source plus a diagnosis", async () => {
    const client = new FakeModelClient([
      {
        content: JSON.stringify({
          facts: [
            { claim: "Entrega em até 5 dias para todo o Brasil", source: "Site da empresa", section: "logistics" },
            { claim: "Plano anual custa R$ 990", source: "Tabela de preços", section: null },
          ],
          diagnosis: "Oferta clara, falta prova social.",
        }),
        usage: { inputTokens: 500, outputTokens: 120 },
      },
    ]);
    let recorded: { model: string; inputTokens: number; outputTokens: number } | null = null;
    const output = await runResearch({
      client,
      materials: MATERIALS,
      onModelCall: async (call) => {
        recorded = call;
      },
    });
    expect(output.facts).toHaveLength(2);
    expect(output.facts[0]?.source).toBe("Site da empresa");
    expect(output.diagnosis).toBe("Oferta clara, falta prova social.");
    expect(recorded).toMatchObject({ inputTokens: 500, outputTokens: 120 });

    const request = client.requests[0];
    expect(request?.output).toMatchObject({ name: "equipe_research" });
    expect(request?.output?.schema).toBeDefined();
    expect(request?.model).toBe("muse-spark-1.3-contributor");
    expect(request?.effort).toBe("xhigh");
    expect(request?.maxTokens).toBe(16000);
    const userMessage = request?.messages.find((message) => message.role === "user");
    const text = userMessage && userMessage.role === "user" ? String(userMessage.content) : "";
    expect(text).toContain("Site da empresa");
    expect(text).toContain("Tabela de preços");
  });

  it("fails the task on refusal or truncation instead of parsing", async () => {
    const refused = new FakeModelClient([{ content: null, stopReason: "refusal" }]);
    await expect(runResearch({ client: refused, materials: MATERIALS })).rejects.toThrow(
      "research_refused",
    );
    const truncated = new FakeModelClient([{ content: `{"facts":`, stopReason: "max_tokens" }]);
    await expect(runResearch({ client: truncated, materials: MATERIALS })).rejects.toThrow(
      "research_truncated",
    );
  });

  it("refuses to run without materials", async () => {
    const client = new FakeModelClient([]);
    await expect(runResearch({ client, materials: [] })).rejects.toThrow("research_requires_materials");
    expect(client.requests).toHaveLength(0);
  });

  it("fails loudly on invalid JSON", async () => {
    const client = new FakeModelClient([{ content: "not json {" }]);
    await expect(runResearch({ client, materials: MATERIALS })).rejects.toThrow("research_invalid_json");
  });

  it("fails loudly when a fact has no source", async () => {
    const client = new FakeModelClient([
      { content: JSON.stringify({ facts: [{ claim: "Sourceless claim", section: null }], diagnosis: "ok" }) },
    ]);
    await expect(runResearch({ client, materials: MATERIALS })).rejects.toThrow("research_schema_mismatch");
  });
});
