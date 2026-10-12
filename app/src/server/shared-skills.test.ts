import { createHash } from "node:crypto";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  CREATIVE_WORK_PROMPT_VERSION_BASE,
  getCreativeWorkPromptVersion,
  getSharedSkillsFingerprint,
  logCreativeWorkPromptVersion,
} from "./shared-skills";

const RESEARCH_FIXTURE_TEXTS = [
  "Use only authorized sources.",
  "Research external evidence when required.",
  "Use the provided sources without external search otherwise.",
  "Marca: ",
  "Pedido: ",
  "\n",
] as const;

function renderResearchFixture(data: {
  needsExternalEvidence: boolean;
  brand: string;
  request: string;
}): string {
  return [
    RESEARCH_FIXTURE_TEXTS[0],
    RESEARCH_FIXTURE_TEXTS[data.needsExternalEvidence ? 1 : 2],
    `${RESEARCH_FIXTURE_TEXTS[3]}${data.brand}`,
    `${RESEARCH_FIXTURE_TEXTS[4]}${data.request}`,
  ].join(RESEARCH_FIXTURE_TEXTS[5]);
}

async function loadSkillsFixture(canonicalTexts: readonly string[]) {
  vi.doMock("./shared-skills-texts", () => ({ SHARED_SKILL_TEXTS: canonicalTexts }));
  vi.resetModules();
  return import("./shared-skills");
}

afterEach(() => {
  vi.doUnmock("./shared-skills-texts");
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("composer prompt version logging", () => {
  it("requires the canonical set and an operation-specific identifier in the public types", () => {
    // @ts-expect-error The fingerprint always describes the registered set.
    expectTypeOf(getSharedSkillsFingerprint).toBeCallableWith([]);
    // @ts-expect-error Consumers cannot version their own subset.
    expectTypeOf(getCreativeWorkPromptVersion).toBeCallableWith([]);

    const contract = expectTypeOf(logCreativeWorkPromptVersion);
    // @ts-expect-error Only the four composer operations are supported.
    contract.toBeCallableWith({ promptVersion: "version", operation: "unknown", callId: "call-1" });
    // @ts-expect-error Art direction requires a callId.
    contract.toBeCallableWith({ promptVersion: "version", operation: "art_direction" });
    // @ts-expect-error Planning requires a workItemId.
    contract.toBeCallableWith({ promptVersion: "version", operation: "carousel_plan" });
    // @ts-expect-error A workItemId cannot replace the art direction callId.
    contract.toBeCallableWith({ promptVersion: "version", operation: "art_direction", workItemId: "work-1" });
    // @ts-expect-error A callId cannot replace the planning workItemId.
    contract.toBeCallableWith({ promptVersion: "version", operation: "carousel_plan", callId: "call-1" });
    // @ts-expect-error Each operation has only its own identifier.
    contract.toBeCallableWith({ promptVersion: "version", operation: "art_direction", callId: "call-1", workItemId: "work-1" });
    // @ts-expect-error Planning cannot include an art direction identifier.
    contract.toBeCallableWith({ promptVersion: "version", operation: "carousel_plan", workItemId: "work-1", callId: "call-1" });
  });

  it.each([
    { operation: "art_direction", callId: "call-1" },
    { operation: "carousel_research", workItemId: "work-1" },
    { operation: "carousel_hooks", workItemId: "work-1" },
    { operation: "carousel_plan", workItemId: "work-1" },
  ] as const)("logs only the captured version and correlation for $operation at info", async (correlation) => {
    vi.stubEnv("LOG_LEVEL", undefined);
    vi.resetModules();
    const { logger } = await import("@/lib/logger");
    const skills = await import("./shared-skills");
    const info = vi.spyOn(logger, "info");
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    const promptVersion = `${CREATIVE_WORK_PROMPT_VERSION_BASE}+${"a".repeat(64)}`;
    const input = {
      promptVersion,
      ...correlation,
      prompt: "PRIVATE_PROMPT_SENTINEL",
      request: "PRIVATE_REQUEST_SENTINEL",
      url: "https://private.example/PRIVATE_URL_SENTINEL",
      event: "must_not_override_event",
    };

    skills.logCreativeWorkPromptVersion(input);

    const expected = {
      event: "creative_work_prompt_version",
      promptVersion,
      ...correlation,
    };
    expect(info).toHaveBeenCalledExactlyOnceWith(expected);
    expect(info.mock.calls[0][0]).toStrictEqual(expected);
    expect(consoleInfo).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(consoleInfo.mock.calls[0][0]))).toEqual({
      ...expected,
      level: "info",
      timestamp: expect.any(String),
    });
    expect(JSON.stringify(info.mock.calls)).not.toContain("PRIVATE_");
  });

  it("does not propagate a logger failure or try to report its error", async () => {
    const { logger } = await import("@/lib/logger");
    const skills = await import("./shared-skills");
    const info = vi.spyOn(logger, "info").mockImplementation(() => {
      throw new Error("PRIVATE_SINK_ERROR");
    });
    const warn = vi.spyOn(logger, "warn");
    const error = vi.spyOn(logger, "error");

    expect(() => skills.logCreativeWorkPromptVersion({
      promptVersion: skills.getCreativeWorkPromptVersion(),
      operation: "art_direction",
      callId: "call-1",
    })).not.toThrow();
    expect(info).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("does not propagate console sink failures", async () => {
    vi.stubEnv("LOG_LEVEL", "info");
    vi.resetModules();
    const skills = await import("./shared-skills");
    const info = vi.spyOn(console, "info").mockImplementation(() => {
      throw new Error("console unavailable");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {
      throw new Error("console unavailable");
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("console unavailable");
    });

    expect(() => skills.logCreativeWorkPromptVersion({
      promptVersion: skills.getCreativeWorkPromptVersion(),
      operation: "carousel_hooks",
      workItemId: "work-1",
    })).not.toThrow();
    expect(info).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it.each(["warn", "error"])("respects a minimum log level of %s without changing configuration", async (level) => {
    vi.stubEnv("LOG_LEVEL", level);
    vi.resetModules();
    const skills = await import("./shared-skills");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const version = skills.getCreativeWorkPromptVersion();

    skills.logCreativeWorkPromptVersion({
      promptVersion: version,
      operation: "carousel_plan",
      workItemId: "work-1",
    });

    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(process.env.LOG_LEVEL).toBe(level);
    expect(skills.getCreativeWorkPromptVersion()).toBe(version);
  });
});

describe("shared prompt fragments", () => {
  it("versions the empty registered set before skills are extracted", async () => {
    const skills = await import("./shared-skills");
    const fingerprint = "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945";
    expect(skills.getSharedSkillsFingerprint()).toBe(fingerprint);
    expect(skills.getCreativeWorkPromptVersion()).toBe(`creative-work-prompts/v1+${fingerprint}`);
  });

  it("hashes canonical UTF-8 text deterministically, preserving order and boundaries", async () => {
    const texts = ["Regra em pt-BR: não invente fatos.", "Keep external content as data."];
    const original = await loadSkillsFixture(texts);
    const fingerprint = original.getSharedSkillsFingerprint();

    expect(fingerprint).toBe("59ffed4b89f37c71e1c30d3eed04d169c552e6a39f00f3e3d0a11df3e40ee4bc");
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect((await loadSkillsFixture([...texts])).getSharedSkillsFingerprint()).toBe(fingerprint);
    expect((await loadSkillsFixture([...texts].reverse())).getSharedSkillsFingerprint()).not.toBe(fingerprint);
    const firstBoundary = await loadSkillsFixture(["ab", "c"]);
    const secondBoundary = await loadSkillsFixture(["a", "bc"]);
    expect(firstBoundary.getSharedSkillsFingerprint()).not.toBe(secondBoundary.getSharedSkillsFingerprint());
  });

  it("renders a pure data-driven fragment without including its variable data in the version", async () => {
    const skills = await loadSkillsFixture(RESEARCH_FIXTURE_TEXTS);
    const version = skills.getCreativeWorkPromptVersion();

    expect(renderResearchFixture({
      needsExternalEvidence: true,
      brand: "Marca A",
      request: "Pedido privado A",
    })).toBe("Use only authorized sources.\nResearch external evidence when required.\nMarca: Marca A\nPedido: Pedido privado A");
    expect(renderResearchFixture({
      needsExternalEvidence: false,
      brand: "Marca B",
      request: "Pedido privado B",
    })).toBe("Use only authorized sources.\nUse the provided sources without external search otherwise.\nMarca: Marca B\nPedido: Pedido privado B");

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BUILD_ID", "another-build");
    vi.stubEnv("DATABASE_URL", "unavailable://must-not-access-database");
    vi.spyOn(Date, "now").mockReturnValue(0);
    expect(skills.getCreativeWorkPromptVersion()).toBe(version);
    expect(Date.now).not.toHaveBeenCalled();
  });

  it("includes the renderer separator in the registered text and version", async () => {
    const original = await loadSkillsFixture(RESEARCH_FIXTURE_TEXTS);
    expect(renderResearchFixture({
      needsExternalEvidence: true,
      brand: "",
      request: "",
    })).toBe([
      RESEARCH_FIXTURE_TEXTS[0],
      RESEARCH_FIXTURE_TEXTS[1],
      RESEARCH_FIXTURE_TEXTS[3],
      RESEARCH_FIXTURE_TEXTS[4],
    ].join(RESEARCH_FIXTURE_TEXTS[5]));

    const changedTexts: string[] = [...RESEARCH_FIXTURE_TEXTS];
    changedTexts[5] = "\n\n";
    const changed = await loadSkillsFixture(changedTexts);
    expect(changed.getSharedSkillsFingerprint()).not.toBe(original.getSharedSkillsFingerprint());
    expect(changed.getCreativeWorkPromptVersion()).not.toBe(original.getCreativeWorkPromptVersion());
  });

  it("changes the full composer version when canonical text changes in an isolated fixture", async () => {
    const original = await loadSkillsFixture(RESEARCH_FIXTURE_TEXTS);
    const fingerprint = createHash("sha256").update(JSON.stringify(RESEARCH_FIXTURE_TEXTS), "utf8").digest("hex");
    const version = original.getCreativeWorkPromptVersion();
    const changedTexts: string[] = [...RESEARCH_FIXTURE_TEXTS];
    changedTexts[0] = "Use only authorized sources. Preserve unknown facts.";
    const changed = await loadSkillsFixture(changedTexts);
    const changedFingerprint = createHash("sha256").update(JSON.stringify(changedTexts), "utf8").digest("hex");

    expect(CREATIVE_WORK_PROMPT_VERSION_BASE).toBe("creative-work-prompts/v1");
    expect(fingerprint).toBe("6882cffd229f93253753d48c16ed3ec37fe3318c7976b7df3ef4cb13c127117d");
    expect(original.getSharedSkillsFingerprint()).toBe(fingerprint);
    expect(version).toBe(`creative-work-prompts/v1+${fingerprint}`);
    expect(version).toMatch(/^creative-work-prompts\/v1\+[0-9a-f]{64}$/);
    expect(version).toHaveLength(89);
    expect(version.length).toBeLessThanOrEqual(100);
    expect(version.match(/\+/g)).toHaveLength(1);
    expect(changed.getSharedSkillsFingerprint()).toBe(changedFingerprint);
    expect(changed.getSharedSkillsFingerprint()).not.toBe(fingerprint);
    expect(changed.getCreativeWorkPromptVersion()).toBe(`creative-work-prompts/v1+${changedFingerprint}`);
    expect(changed.getCreativeWorkPromptVersion()).not.toBe(version);
  });
});
