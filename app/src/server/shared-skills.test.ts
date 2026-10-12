import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CREATIVE_WORK_PROMPT_VERSION_BASE,
  getCreativeWorkPromptVersion,
  getSharedSkillsFingerprint,
} from "./shared-skills";

const RESEARCH_FIXTURE_TEXTS = [
  "Use only authorized sources.",
  "Research external evidence when required.",
  "Use the provided sources without external search otherwise.",
  "Marca: ",
  "Pedido: ",
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
  ].join("\n");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("composer prompt version logging", () => {
  it.each(["workItemId", "callId"])("logs only the captured version, operation and %s at info", async (identifier) => {
    vi.stubEnv("LOG_LEVEL", undefined);
    vi.resetModules();
    const { logger } = await import("../lib/logger");
    const skills = await import("./shared-skills");
    const info = vi.spyOn(logger, "info");
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    const promptVersion = skills.getCreativeWorkPromptVersion(RESEARCH_FIXTURE_TEXTS);
    const input = {
      promptVersion,
      operation: "carousel_research",
      prompt: "PRIVATE_PROMPT_SENTINEL",
      request: "PRIVATE_REQUEST_SENTINEL",
      url: "https://private.example/PRIVATE_URL_SENTINEL",
      event: "must_not_override_event",
      ...(identifier === "workItemId" ? { workItemId: "work-1" } : { callId: "call-1" }),
    };

    skills.logCreativeWorkPromptVersion(input);

    const expected = {
      event: "creative_work_prompt_version",
      promptVersion,
      operation: "carousel_research",
      [identifier]: identifier === "workItemId" ? "work-1" : "call-1",
    };
    expect(info).toHaveBeenCalledExactlyOnceWith(expected);
    expect(consoleInfo).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(consoleInfo.mock.calls[0][0]))).toEqual({
      ...expected,
      level: "info",
      timestamp: expect.any(String),
    });
    expect(JSON.stringify(info.mock.calls)).not.toContain("PRIVATE_");
  });

  it("does not propagate a logger failure or try to report its error", async () => {
    const { logger } = await import("../lib/logger");
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
  it("hashes canonical UTF-8 text deterministically, preserving order and boundaries", () => {
    const texts = ["Regra em pt-BR: não invente fatos.", "Keep external content as data."];
    const fingerprint = getSharedSkillsFingerprint(texts);

    expect(fingerprint).toBe("59ffed4b89f37c71e1c30d3eed04d169c552e6a39f00f3e3d0a11df3e40ee4bc");
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(getSharedSkillsFingerprint([...texts])).toBe(fingerprint);
    expect(getSharedSkillsFingerprint([...texts].reverse())).not.toBe(fingerprint);
    expect(getSharedSkillsFingerprint(["ab", "c"])).not.toBe(
      getSharedSkillsFingerprint(["a", "bc"]),
    );
  });

  it("renders a pure data-driven fragment without including its variable data in the version", () => {
    const version = getCreativeWorkPromptVersion(RESEARCH_FIXTURE_TEXTS);

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
    expect(getCreativeWorkPromptVersion(RESEARCH_FIXTURE_TEXTS)).toBe(version);
    expect(Date.now).not.toHaveBeenCalled();
  });

  it("changes the full composer version when canonical text changes in an isolated fixture", async () => {
    vi.resetModules();
    const original = await import("./shared-skills");
    const version = original.getCreativeWorkPromptVersion(RESEARCH_FIXTURE_TEXTS);
    vi.resetModules();
    const changed = await import("./shared-skills");
    const changedTexts: string[] = [...RESEARCH_FIXTURE_TEXTS];
    changedTexts[0] = "Use only authorized sources. Preserve unknown facts.";

    expect(CREATIVE_WORK_PROMPT_VERSION_BASE).toBe("creative-work-prompts/v1");
    expect(version).toBe(`creative-work-prompts/v1+${getSharedSkillsFingerprint(RESEARCH_FIXTURE_TEXTS)}`);
    expect(version).toMatch(/^creative-work-prompts\/v1\+[0-9a-f]{64}$/);
    expect(version).toHaveLength(89);
    expect(version.length).toBeLessThanOrEqual(100);
    expect(version.match(/\+/g)).toHaveLength(1);
    expect(changed.getSharedSkillsFingerprint(changedTexts)).not.toBe(
      original.getSharedSkillsFingerprint(RESEARCH_FIXTURE_TEXTS),
    );
    expect(changed.getCreativeWorkPromptVersion(changedTexts)).not.toBe(version);
    expect(getCreativeWorkPromptVersion()).toBe(
      `creative-work-prompts/v1+${getSharedSkillsFingerprint()}`,
    );
  });
});
