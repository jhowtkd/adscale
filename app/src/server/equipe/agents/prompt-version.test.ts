import { createHash } from "node:crypto";
import { zodResponseFormat } from "openai/helpers/zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getEquipePromptVersion } from "./prompt-version";
import { EQUIPE_AGENT_TASK_KINDS } from "./roles";

afterEach(() => {
  vi.doUnmock("@/server/shared-skills-texts");
  vi.doUnmock("../domain/caption-triage");
  vi.doUnmock("@/server/brand-taste/learned-guidance");
  vi.resetModules();
});

async function captionReviewFixture(caption = "Abrimos às 9h", facts = ["Abrimos às 9h"]) {
  const [{ createEquipeAgents }, { MemoryLedgerStore }, { FakeModelClient }, { makeTestDeps, openTestAccount }, skills] = await Promise.all([
    import("./runner"), import("./ledger"), import("./testing"), import("../module/testing/deps"), import("@/server/shared-skills"),
  ]);
  const t = makeTestDeps();
  const account = await openTestAccount(t);
  const ledger = new MemoryLedgerStore();
  const client = new FakeModelClient([{ content: JSON.stringify({ findings: [], summary: "Fato autorizado.", natures: ["none"] }) }]);
  const input = { caption, facts, note: "", now: "2026-10-01T12:00:00.000Z", scheduledFor: null };
  expect(await createEquipeAgents({ moduleDeps: t.deps, ledger, client }).runTask({
    kind: "review_caption", workspaceId: account.workspaceId, accountId: account.accountId, input,
  })).toEqual({ ok: true, output: { findings: [], summary: "Fato autorizado.", natures: ["none"] } });
  expect(client.requests).toHaveLength(1);
  expect(ledger.entries).toHaveLength(1);
  expect(client.requests[0]!.messages[1]!.content).toBe(JSON.stringify(input));
  return { request: client.requests[0]!, recordedVersion: ledger.entries[0]!.promptVersion, composerVersion: skills.getCreativeWorkPromptVersion() };
}

async function visualReviewFixture(canonicalTexts?: readonly string[]) {
  if (canonicalTexts) vi.doMock("@/server/shared-skills-texts", async original => ({
    ...await original<typeof import("@/server/shared-skills-texts")>(),
    SHARED_SKILL_TEXTS: canonicalTexts,
  }));
  vi.resetModules();
  const [versions, prompts, { createEquipeAgents }, { MemoryLedgerStore }, { FakeModelClient }, { makeTestDeps, openTestAccount }] = await Promise.all([
    import("./prompt-version"), import("./prompts"), import("./runner"), import("./ledger"),
    import("./testing"), import("../module/testing/deps"),
  ]);
  const t = makeTestDeps();
  const account = await openTestAccount(t);
  const ledger = new MemoryLedgerStore();
  const client = new FakeModelClient([{ content: JSON.stringify({ findings: [], summary: "Imagem legível." }) }]);
  expect(await createEquipeAgents({ moduleDeps: t.deps, ledger, client }).runTask({
    kind: "review_visual", workspaceId: account.workspaceId, accountId: account.accountId,
    input: { imageUrl: "https://assets.example.test/peca.jpg", brief: "Marca Aurora" },
  })).toMatchObject({ ok: true, output: { findings: [], summary: "Imagem legível." } });
  expect(client.requests).toHaveLength(1);
  expect(ledger.entries).toHaveLength(1);
  return {
    recordedVersion: ledger.entries[0]!.promptVersion,
    diagnosisVersion: versions.getEquipePromptVersion("diagnosis").effective,
    request: client.requests[0]!,
    measurementPrompt: prompts.measurementSystemPrompt(),
  };
}

describe("Equipe prompt versions", () => {
  it("changes recorded versions for a learned-wrapper edit while preserving unused consumer bytes and cache", async () => {
    const before = await visualReviewFixture();
    vi.doMock("@/server/brand-taste/learned-guidance", async importOriginal => {
      const guidance = await importOriginal<typeof import("@/server/brand-taste/learned-guidance")>();
      return { ...guidance, LEARNED_GUIDANCE_WRAPPERS: {
        ...guidance.LEARNED_GUIDANCE_WRAPPERS,
        en: ["LEARNED PREFERENCES (changed):", guidance.LEARNED_GUIDANCE_WRAPPERS.en[1]],
      } };
    });
    const after = await visualReviewFixture();
    expect(after.recordedVersion).not.toBe(before.recordedVersion);
    expect(after.diagnosisVersion).not.toBe(before.diagnosisVersion);
    expect(JSON.stringify(after.request)).toBe(JSON.stringify(before.request));
    expect(after.measurementPrompt).toBe(before.measurementPrompt);
  });

  it.each(["path", "priority"])("derives caption instructions and the ledger version from domain %s", async change => {
    const before = await captionReviewFixture();
    const variable = await captionReviewFixture("Outra legenda", ["Outro fato autorizado"]);
    expect(variable.recordedVersion).toBe(before.recordedVersion);
    expect(variable.composerVersion).toBe(before.composerVersion);
    expect(variable.request.messages[0]).toEqual(before.request.messages[0]);

    vi.doMock("../domain/caption-triage", async original => {
      const domain = await original<typeof import("../domain/caption-triage")>();
      return {
        ...domain,
        PATH_BY_NATURE: change === "path" ? { ...domain.PATH_BY_NATURE, commercial_condition: "revalidate_only" } : domain.PATH_BY_NATURE,
        CLAIM_NATURE_PRIORITY: change === "priority" ? [...domain.CLAIM_NATURE_PRIORITY].reverse() : domain.CLAIM_NATURE_PRIORITY,
      };
    });
    vi.resetModules();
    const after = await captionReviewFixture();
    expect(after.request.messages[0]!.content).toContain(change === "path"
      ? "commercial_condition: condição comercial não autorizada (preço, desconto, frete, brinde ou prazo). Encaminhamento: revalidação sem encaminhamento comercial."
      : "Prioridade (a mais grave prevalece): none > permanent_fact > commercial_condition > regulated_claim");
    expect(after.recordedVersion).not.toBe(before.recordedVersion);
    expect(after.composerVersion).not.toBe(before.composerVersion);
    expect(after.recordedVersion).toMatch(/^equipe-prompts\/v7\+[0-9a-f]{64}$/);
    expect(after.request.messages[0]!.content).toMatch(/^equipe-prompts\/v7\n/);
    expect(after.request.messages[0]!.content).not.toContain("+");
    expect(after.request.messages[1]).toEqual(before.request.messages[1]);
    expect(zodResponseFormat(after.request.output!.schema, after.request.output!.name).json_schema)
      .toEqual(zodResponseFormat(before.request.output!.schema, before.request.output!.name).json_schema);
  });

  it("versions the caption fragment's static heading and subordination text", async () => {
    const before = await captionReviewFixture();
    vi.doMock("@/server/shared-skills-texts", async original => {
      const texts = await original<typeof import("@/server/shared-skills-texts")>();
      const rendered = texts.NATUREZA_DAS_AFIRMACOES.replace("Natureza das afirmações", "Classificação das afirmações")
        .replace("Claims presentes nos fatos autorizados", "Afirmações sustentadas pelos fatos autorizados");
      return { ...texts, NATUREZA_DAS_AFIRMACOES: rendered,
        SHARED_SKILL_TEXTS: texts.SHARED_SKILL_TEXTS.map(text => text === texts.NATUREZA_DAS_AFIRMACOES ? rendered : text) };
    });
    vi.resetModules();
    const after = await captionReviewFixture();
    expect(after.request.messages[0]!.content).toContain("Classificação das afirmações (separada da severidade):");
    expect(after.request.messages[0]!.content).toContain("Afirmações sustentadas pelos fatos autorizados não precisam de nova confirmação.");
    expect(after.recordedVersion).not.toBe(before.recordedVersion);
    expect(after.composerVersion).not.toBe(before.composerVersion);
  });

  it.each([...EQUIPE_AGENT_TASK_KINDS, "handoff_vision"])("selects the base and complete SHA-256 for %s", kind => {
    const version = getEquipePromptVersion(kind);
    const diagnosis = kind === "diagnosis";
    expect(version.base).toBe(diagnosis ? "equipe-diagnosis/v2" : "equipe-prompts/v7");
    expect(version.effective).toMatch(diagnosis ? /^equipe-diagnosis\/v2\+[0-9a-f]{64}$/ : /^equipe-prompts\/v7\+[0-9a-f]{64}$/);
    expect(version.effective).toHaveLength(diagnosis ? 84 : 82);
    expect(version.effective.split("+")).toHaveLength(2);
    expect(version.effective.length).toBeLessThanOrEqual(100);
    expect(getEquipePromptVersion(kind)).toEqual(version);
  });

  it("records a changed unused fragment without changing visual-review bytes, its cache prefix or measurement bytes", async () => {
    const beforeTexts = ["Regra factual: não invente preços."];
    const afterTexts = ["Regra factual: não invente preços nem brindes."];
    const before = await visualReviewFixture(beforeTexts);
    const after = await visualReviewFixture(afterTexts);
    const fingerprint = (texts: string[]) => createHash("sha256").update(JSON.stringify(texts), "utf8").digest("hex");

    expect(before.recordedVersion).toBe(`equipe-prompts/v7+${fingerprint(beforeTexts)}`);
    expect(after.recordedVersion).toBe(`equipe-prompts/v7+${fingerprint(afterTexts)}`);
    expect(after.recordedVersion).not.toBe(before.recordedVersion);
    expect(before.diagnosisVersion).toBe(`equipe-diagnosis/v2+${fingerprint(beforeTexts)}`);
    expect(after.diagnosisVersion).toBe(`equipe-diagnosis/v2+${fingerprint(afterTexts)}`);
    expect(JSON.stringify(after.request)).toBe(JSON.stringify(before.request));
    expect(after.request.messages[0]!.content).toContain("(equipe-prompts/v7).");
    expect(after.request.messages[0]!.content).not.toContain("+");
    expect(after.request.messages[1]!.content).toEqual(expect.arrayContaining([expect.objectContaining({ type: "text", cacheBreakpoint: true })]));
    expect(after.measurementPrompt).toBe(before.measurementPrompt);
    expect(after.measurementPrompt).toContain("(equipe-prompts/v7).");
    expect(after.measurementPrompt).not.toContain("+");
  });
});
