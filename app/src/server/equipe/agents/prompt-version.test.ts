import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getEquipePromptVersion } from "./prompt-version";
import { EQUIPE_AGENT_TASK_KINDS } from "./roles";

afterEach(() => {
  vi.doUnmock("@/server/shared-skills-texts");
  vi.resetModules();
});

async function visualReviewFixture(canonicalTexts: readonly string[]) {
  vi.doMock("@/server/shared-skills-texts", async original => ({
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
