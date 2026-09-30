// Pesquisa IA, free diagnosis (ticket 08): the model call itself — request shape,
// public-text-only messages, and how a bad answer fails.

import { describe, expect, it } from "vitest";
import { buildDiagnosisInput } from "../handoff/diagnosis";
import { diagnosisModelOutputSchema } from "../handoff/diagnosis-contract";
import { confirmedHandoff, INSTAGRAM_CAPTIONS, SITE_TEXT } from "../module/testing/diagnosis";
import { makeTestDeps } from "../module/testing/deps";
import { DIAGNOSIS_MAX_TOKENS, DIAGNOSIS_TIMEOUT_MS, runDiagnosis } from "./diagnosis";
import { EquipeModelRefusalError, EquipeModelTruncatedError, type ModelCallUsage } from "./model-client";
import { diagnosisSystemPrompt, diagnosisUserMessage } from "./prompts";
import { FakeModelClient } from "./testing";

const GOOD = {
  summary: { text: "Torrefação em Campinas.", evidence: [{ source: "site", quote: "Torramos café especial de origem única" }] },
  channels: [{ source: "site", message: "origem e assinatura", evidence: [{ source: "site", quote: "Torramos café especial de origem única" }] }],
  opportunities: [{ title: "Mostrar a origem", evidence: [{ source: "site", quote: "Torramos café especial de origem única" }] }],
  notFound: ["público-alvo"],
};

async function inputFor(options: Parameters<typeof confirmedHandoff>[1] = {}) {
  const f = await confirmedHandoff(makeTestDeps(), options);
  const [row] = await f.t.deps.uow.repos.handoffs.list(f.scope);
  return buildDiagnosisInput(row!);
}

describe("runDiagnosis", () => {
  it("asks the Pesquisa model for the structured diagnosis with the bounded request", async () => {
    const client = new FakeModelClient([{ content: JSON.stringify(GOOD) }]);
    const output = await runDiagnosis({ client, diagnosis: await inputFor() });
    expect(output).toEqual(GOOD);
    expect(client.requests).toHaveLength(1);
    const request = client.requests[0]!;
    expect(request).toMatchObject({
      model: "muse-spark-1.3-contributor", effort: "xhigh", maxTokens: DIAGNOSIS_MAX_TOKENS, timeoutMs: DIAGNOSIS_TIMEOUT_MS,
    });
    expect(DIAGNOSIS_MAX_TOKENS).toBe(16_000);
    expect(request.output?.name).toBe("equipe_diagnosis");
    expect(request.output?.schema).toBe(diagnosisModelOutputSchema);
    // the text bound the free admission needs is set by the task itself
    expect(request.inputTokenBound).toBeGreaterThan(0);
  });

  it("sends only public text: the hostile fixture leaves no user data in any message", async () => {
    const client = new FakeModelClient([{ content: JSON.stringify(GOOD) }]);
    await runDiagnosis({ client, diagnosis: await inputFor({ hostileUserData: true, name: null }) });
    const wire = JSON.stringify(client.requests[0]!.messages);
    for (const secret of ["SEGREDO-DO-USUARIO", "#010203", "cafeaurora.example", "Marca da Ana", "upload.png"]) expect(wire).not.toContain(secret);
    expect(wire).toContain("Torramos café especial");
    expect(wire).toContain(INSTAGRAM_CAPTIONS[0]!.slice(0, 30));
  });

  it("lists only the available sources (single source)", async () => {
    const siteOnly = new FakeModelClient([{ content: JSON.stringify(GOOD) }]);
    await runDiagnosis({ client: siteOnly, diagnosis: await inputFor({ instagram: null }) });
    const siteMessages = siteOnly.requests[0]!.messages;
    const siteUser = String(siteMessages.at(-1)!.content);
    expect(siteUser).toContain("Available sources: site");
    expect(siteUser).toContain('<source name="site">');
    expect(siteUser).not.toContain('<source name="instagram">');
    expect(siteUser).not.toContain("Bio:");

    const instagramOnly = new FakeModelClient([{ content: JSON.stringify(GOOD) }]);
    await runDiagnosis({ client: instagramOnly, diagnosis: await inputFor({ site: null }) });
    const igUser = String(instagramOnly.requests[0]!.messages.at(-1)!.content);
    expect(igUser).toContain("Available sources: instagram");
    expect(igUser).not.toContain('<source name="site">');
    expect(igUser).not.toContain(SITE_TEXT.slice(0, 30));
  });

  it("the system prompt forbids competitors and invented evidence", async () => {
    const client = new FakeModelClient([{ content: JSON.stringify(GOOD) }]);
    await runDiagnosis({ client, diagnosis: await inputFor() });
    const system = String(client.requests[0]!.messages[0]!.content);
    expect(client.requests[0]!.messages[0]!.role).toBe("system");
    expect(system).toMatch(/competitors/i);
    expect(system).toMatch(/EXACT excerpts/);
  });

  it("reports the usage of the call", async () => {
    const calls: ModelCallUsage[] = [];
    const client = new FakeModelClient([{ content: JSON.stringify(GOOD), usage: { inputTokens: 1200, outputTokens: 300 } }]);
    await runDiagnosis({ client, diagnosis: await inputFor(), onModelCall: async call => { calls.push(call); } });
    expect(calls).toEqual([{ model: "muse-spark-1.3-contributor", inputTokens: 1200, outputTokens: 300, cacheReadTokens: 0, cacheWriteTokens: 0 }]);
  });

  it("reports the usage even when the answer is then rejected", async () => {
    const calls: ModelCallUsage[] = [];
    const client = new FakeModelClient([{ content: "{", usage: { inputTokens: 10, outputTokens: 5 } }]);
    await expect(runDiagnosis({ client, diagnosis: await inputFor(), onModelCall: async call => { calls.push(call); } })).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });

  it("a refusal is a non-retryable failed task", async () => {
    const client = new FakeModelClient([{ content: null, stopReason: "refusal" }]);
    await expect(runDiagnosis({ client, diagnosis: await inputFor() })).rejects.toBeInstanceOf(EquipeModelRefusalError);
  });

  it("a cut answer (max_tokens) is never parsed as a diagnosis", async () => {
    const client = new FakeModelClient([{ content: JSON.stringify(GOOD), stopReason: "max_tokens" }]);
    await expect(runDiagnosis({ client, diagnosis: await inputFor() })).rejects.toBeInstanceOf(EquipeModelTruncatedError);
  });

  it("invalid JSON → diagnosis_invalid_json; wrong shape → diagnosis_schema_mismatch", async () => {
    await expect(runDiagnosis({ client: new FakeModelClient([{ content: "não é json" }]), diagnosis: await inputFor() })).rejects.toThrow("diagnosis_invalid_json");
    await expect(runDiagnosis({ client: new FakeModelClient([{ content: null }]), diagnosis: await inputFor() })).rejects.toThrow(/diagnosis_schema_mismatch/);
    await expect(runDiagnosis({ client: new FakeModelClient([{ content: JSON.stringify({ summary: "x" }) }]), diagnosis: await inputFor() })).rejects.toThrow(/diagnosis_schema_mismatch/);
    const badSource = { ...GOOD, opportunities: [{ title: "x", evidence: [{ source: "facebook", quote: "y" }] }] };
    await expect(runDiagnosis({ client: new FakeModelClient([{ content: JSON.stringify(badSource) }]), diagnosis: await inputFor() })).rejects.toThrow(/diagnosis_schema_mismatch/);
  });

  it("honours a model/effort override", async () => {
    const client = new FakeModelClient([{ content: JSON.stringify(GOOD) }]);
    await runDiagnosis({ client, diagnosis: await inputFor(), model: "outro-modelo", effort: "low" });
    expect(client.requests[0]).toMatchObject({ model: "outro-modelo", effort: "low" });
  });
});

describe("diagnosis prompt: raw text in <source>, identity in <context>", () => {
  const blocks = (message: string) => [...message.matchAll(/<source name="(\w+)">([\s\S]*?)<\/source>/g)].map(match => ({ name: match[1]!, body: match[2]! }));

  it("puts the name, colors and fonts in a <context> block and never inside a <source>", async () => {
    const message = diagnosisUserMessage(await inputFor());
    const context = /<context>([\s\S]*?)<\/context>/.exec(message)?.[1] ?? "";
    expect(context).toContain("brand name: Café Aurora");
    expect(context).toContain("colors read from the site: #6F4E37");
    expect(context).toContain("fonts read from the site: Inter");
    for (const block of blocks(message)) {
      expect(block.body).not.toMatch(/#6F4E37|colors read|fonts read|brand name/);
      expect(block.body).not.toContain("<context>");
    }
    expect(message.indexOf("<context>")).toBeLessThan(message.indexOf("<source"));
  });

  it("tags the Instagram bio and each caption, without server-made labels", async () => {
    const message = diagnosisUserMessage(await inputFor());
    const [ig] = blocks(message).filter(block => block.name === "instagram");
    expect(ig!.body).toContain("<bio>");
    expect(ig!.body.match(/<caption n="\d+">/g)).toEqual(['<caption n="1">', '<caption n="2">', '<caption n="3">']);
    expect(ig!.body).toContain(`<caption n="2">${INSTAGRAM_CAPTIONS[1]}</caption>`);
    expect(message).not.toMatch(/Bio:|Legenda \d/);
  });

  it("a single source only has its own <source>", async () => {
    const siteOnly = blocks(diagnosisUserMessage(await inputFor({ instagram: null })));
    expect(siteOnly.map(block => block.name)).toEqual(["site"]);
    const igOnly = blocks(diagnosisUserMessage(await inputFor({ site: null })));
    expect(igOnly.map(block => block.name)).toEqual(["instagram"]);
    expect(igOnly[0]!.body).not.toContain(SITE_TEXT.slice(0, 30));
  });

  it("the hostile fixture leaves no origin=user data anywhere, <context> included", async () => {
    const message = diagnosisUserMessage(await inputFor({ hostileUserData: true, name: null }));
    for (const secret of ["SEGREDO-DO-USUARIO", "#010203", "Marca da Ana", "upload.png"]) expect(message).not.toContain(secret);
    expect(message).not.toContain("brand name:");
  });

  it("omits <context> when there is nothing to say", async () => {
    const message = diagnosisUserMessage(await inputFor({ name: null, colors: [], fonts: [] }));
    expect(message).not.toContain("<context>");
  });

  it("the system prompt says <context> is not quotable", () => {
    expect(diagnosisSystemPrompt()).toContain("<context> is NOT quotable");
  });
});
