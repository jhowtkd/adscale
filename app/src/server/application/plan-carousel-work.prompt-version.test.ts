import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { CreativeWorkItem, CreativeWorkSource } from "@/server/db/schema";

const repo = vi.hoisted(() => ({
  getCreativeWork: vi.fn(),
  updateCreativeWorkDraftIfUnchanged: vi.fn(),
  updateCreativeWorkIfUnchanged: vi.fn(),
  claimPreparationAttempt: vi.fn(),
  finalizePreparationAttempt: vi.fn(),
  listCurrentCarouselSlides: vi.fn(),
}));
const responsesCreate = vi.hoisted(() => vi.fn());
const chatCreate = vi.hoisted(() => vi.fn());
const controlled = vi.hoisted(() => ({ enabled: false }));

vi.mock("@/server/repositories/creative-work", () => ({
  ...repo,
  withCreativeWorkPreparationLock: async (
    _workspaceId: string,
    _workItemId: string,
    callback: (executor: object) => Promise<unknown>,
  ) => callback({}),
}));
vi.mock("@/server/repositories/creative-work-preparation", () => repo);
vi.mock("@/server/repositories/creative-work-carousel", () => repo);
vi.mock("@/server/repositories/brand-kit", () => ({ getBrandKit: vi.fn(async () => null) }));
vi.mock("@/server/ai/providers/e2e-controlled-provider", () => ({
  isE2EControlledProviderEnabled: () => controlled.enabled,
}));
vi.mock("@/server/ai/utils", () => ({
  getOpenAI: () => ({ responses: { create: responsesCreate }, chat: { completions: { create: chatCreate } } }),
  extractOutputText: (response: { output_text?: string }) => response.output_text,
}));
vi.mock("@/server/validation/env", () => ({ env: { OPENAI_TEXT_MODEL: "fake-text-model" } }));

const UPDATED_AT = "2026-08-30T12:00:00.000Z";
const REQUEST = "Grupo de terapia começa em agosto, vagas limitadas no consultório";
const hooks = [
  { id: "hook-1", headline: "Grupo de terapia em agosto", promise: "O grupo começa em agosto", narrative: "Abre com a data." },
  { id: "hook-2", headline: "Vagas limitadas no consultório", promise: "As vagas são limitadas", narrative: "Parte das vagas." },
  { id: "hook-3", headline: "Cuidado em grupo no consultório", promise: "O grupo acontece no consultório", narrative: "Começa pelo cuidado." },
];
const research = {
  status: "not_needed", question: "O grupo começa em agosto?", thesis: REQUEST,
  sources: [], claims: [], gaps: [],
};
const script = {
  kind: "deck", objective: "Divulgar o grupo de terapia", audience: null,
  tone: null, promise: "O grupo começa em agosto", changes: [], caption: "Inscreva-se",
  slides: [
    ["hook", "Grupo de terapia começa em agosto"],
    ["context", "O grupo acontece no consultório"],
    ["argument", "As vagas são limitadas"],
    ["evidence", "O consultório organiza o grupo de terapia"],
    ["closing", "Comece em agosto"],
  ].map(([role, primaryText]) => ({
    role, primaryText, purpose: "Avançar no argumento", secondaryText: null,
    sourceFactIds: [], slideId: null,
  })),
  storyboard: Array.from({ length: 5 }, () => ({
    learning: "O leitor entende a oferta", representation: "Tipografia com o fato principal",
    hierarchy: "Título, apoio, marca", transition: "Segue para o próximo argumento", claimIds: [],
  })),
};

describe("carousel planning prompt version events", () => {
  let current: CreativeWorkItem;
  let sources: CreativeWorkSource[];
  let run: typeof import("./plan-carousel-work").planCarouselWork;
  let promptVersion: string;
  let info: MockInstance<(...args: unknown[]) => void>;
  let consoleInfo: MockInstance<typeof console.info>;

  async function loadPlanning(logLevel?: string) {
    vi.stubEnv("LOG_LEVEL", logLevel);
    vi.resetModules();
    const { logger } = await import("@/lib/logger");
    info = vi.spyOn(logger, "info");
    consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    ({ planCarouselWork: run } = await import("./plan-carousel-work"));
    promptVersion = (await import("@/server/shared-skills")).getCreativeWorkPromptVersion();
  }

  function input(command?: Parameters<typeof run>[0]["command"]) {
    return {
      workspaceId: current.workspaceId, workItemId: current.id,
      expectedUpdatedAt: current.updatedAt.toISOString(), answers: {}, command,
    };
  }

  function event(operation: string) {
    return { event: "creative_work_prompt_version", promptVersion, operation, workItemId: current.id };
  }

  async function planScript() {
    expect((await run(input())).ok).toBe(true);
    chatCreate.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(script) } }] });
    return run(input({ kind: "select_hook", hookId: "hook-1" }));
  }

  beforeEach(async () => {
    vi.resetAllMocks();
    controlled.enabled = false;
    sources = [];
    current = {
      id: "work-1", workspaceId: "workspace-1", clientProfileId: "profile-1",
      createdByUserId: "user-1", toolKind: "carousel", status: "draft",
      request: REQUEST, format: "4:5", settings: { targetFormats: [] },
      inputSnapshot: null, identitySnapshot: null,
      createdAt: new Date(UPDATED_AT), updatedAt: new Date(UPDATED_AT),
    } as CreativeWorkItem;
    repo.getCreativeWork.mockImplementation(async () => ({ work: current, outputs: [], sources }));
    const persist = async (
      _workspaceId: string, _workItemId: string, expected: Date,
      patch: { settings: CreativeWorkItem["settings"] },
    ) => {
      if (current.updatedAt.getTime() !== expected.getTime()) return null;
      current = { ...current, settings: patch.settings, updatedAt: new Date(expected.getTime() + 1000) };
      return current;
    };
    repo.updateCreativeWorkDraftIfUnchanged.mockImplementation(persist);
    repo.updateCreativeWorkIfUnchanged.mockImplementation(persist);
    repo.claimPreparationAttempt.mockResolvedValue({ outcome: "claimed", attempt: { id: "attempt-1" } });
    repo.finalizePreparationAttempt.mockResolvedValue({ ok: true });
    repo.listCurrentCarouselSlides.mockResolvedValue([]);
    responsesCreate.mockResolvedValue({ output_text: JSON.stringify(research), output: [] });
    chatCreate.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({
      hooks, recommendedHookId: "hook-1", recommendation: "Abre com a data.",
    }) } }] });
    await loadPlanning();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("logs research and hooks once, before each real SDK invocation, correlated to the work", async () => {
    responsesCreate.mockImplementationOnce(async () => {
      expect(info.mock.calls).toEqual([[event("carousel_research")]]);
      return { output_text: JSON.stringify(research), output: [] };
    });
    chatCreate.mockImplementationOnce(async () => {
      expect(info.mock.calls).toEqual([[event("carousel_research")], [event("carousel_hooks")]]);
      return { choices: [{ message: { content: JSON.stringify({
        hooks, recommendedHookId: "hook-1", recommendation: "Abre com a data.",
      }) } }] };
    });

    const result = await run(input());

    expect(result).toMatchObject({ ok: true, value: { editorial: {
      hooks, selectedHookId: null, approvedScriptRevision: null, approvedCover: null,
    } } });
    expect(responsesCreate).toHaveBeenCalledTimes(1);
    expect(responsesCreate.mock.calls[0][1]).toEqual({ timeout: 60_000, maxRetries: 0 });
    expect(chatCreate).toHaveBeenCalledTimes(1);
    expect(chatCreate.mock.calls[0]).toHaveLength(1);
    expect(info.mock.calls).toEqual([[event("carousel_research")], [event("carousel_hooks")]]);
    expect(consoleInfo.mock.calls.map(([payload]) => JSON.parse(String(payload)))).toEqual([
      { ...event("carousel_research"), level: "info", timestamp: expect.any(String) },
      { ...event("carousel_hooks"), level: "info", timestamp: expect.any(String) },
    ]);
  });

  it("logs the script before its SDK call and preserves the human hook and editorial gates", async () => {
    expect((await run(input())).ok).toBe(true);
    chatCreate.mockImplementationOnce(async () => {
      expect(info.mock.calls).toEqual([
        [event("carousel_research")], [event("carousel_hooks")], [event("carousel_plan")],
      ]);
      return { choices: [{ message: { content: JSON.stringify(script) } }] };
    });

    const result = await run(input({
      kind: "select_hook", hookId: "hook-1", headline: "Grupo de terapia começa em agosto",
    }));

    expect(result).toMatchObject({ ok: true, value: {
      draft: { plan: { slides: [{ primaryText: "Grupo de terapia começa em agosto" }, {}, {}, {}, {}] } },
      editorial: { selectedHookId: "hook-1", caption: script.caption, approvedScriptRevision: null, approvedCover: null },
    } });
    expect(responsesCreate).toHaveBeenCalledTimes(1);
    expect(chatCreate).toHaveBeenCalledTimes(2);
    expect(chatCreate.mock.calls.every((call) => call.length === 1)).toBe(true);
    const scriptPrompt = chatCreate.mock.calls[1][0].messages[0].content as string;
    expect(scriptPrompt).toContain("Examples to avoid (generic phrases): transforme sua vida; mude sua vida");
    expect(scriptPrompt).toContain("Examples to avoid (AI meta-language or blase tone): neste post; neste carrossel");
    expect(info.mock.calls).toEqual([
      [event("carousel_research")], [event("carousel_hooks")], [event("carousel_plan")],
    ]);
  });

  it("keeps lint warnings advisory through script approval", async () => {
    expect((await run(input())).ok).toBe(true);
    chatCreate.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({
      ...script,
      slides: script.slides.map((slide, index) => index === 1
        ? { ...slide, secondaryText: "Transforme sua vida. Neste post." }
        : slide),
    }) } }] });

    const result = await run(input({ kind: "select_hook", hookId: "hook-1" }));

    expect(result).toMatchObject({ ok: true, value: { findings: expect.arrayContaining([
      { code: "generic_phrase", path: "slides.1.primaryText", message: 'generic phrase that could belong to any brand: "transforme sua vida"', blocking: false },
      { code: "blase_tone", path: "slides.1.primaryText", message: 'AI meta-language or blase tone: "neste post"', blocking: false },
    ]) } });
    const scriptRevision = current.settings.carouselEditorial!.revision;
    vi.clearAllMocks();

    expect((await run(input({ kind: "approve_script", scriptRevision }))).ok).toBe(true);
    expect(current.settings.carouselEditorial?.approvedScriptRevision).toBe(scriptRevision);
    expect(responsesCreate).not.toHaveBeenCalled();
    expect(chatCreate).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it.each(["provider failure", "invalid JSON"])("preserves the persisted script on %s with the new prompt", async (failure) => {
    expect((await planScript()).ok).toBe(true);
    const savedSettings = structuredClone(current.settings);
    vi.clearAllMocks();
    if (failure === "provider failure") chatCreate.mockRejectedValueOnce(new Error("provider unavailable"));
    else chatCreate.mockResolvedValueOnce({ choices: [{ message: { content: "invalid JSON" } }] });

    const result = await run(input({ kind: "revise_script", instruction: "Preservar os fatos" }));

    expect(result).toMatchObject({ ok: false, error: { code: "editorial_plan_invalid" } });
    expect(current.settings).toEqual(savedSettings);
    expect(repo.updateCreativeWorkDraftIfUnchanged).not.toHaveBeenCalled();
    expect(responsesCreate).not.toHaveBeenCalled();
    expect(chatCreate).toHaveBeenCalledTimes(1);
    expect(chatCreate.mock.calls[0][0].messages[0].content).toContain("Examples to avoid (generic phrases):");
    expect(info.mock.calls).toEqual([[event("carousel_plan")]]);
  });

  it.each([
    ["carousel_research", "research_unavailable"],
    ["carousel_hooks", "editorial_plan_invalid"],
    ["carousel_plan", "editorial_plan_invalid"],
  ])("logs %s once even when its SDK invocation fails", async (operation, code) => {
    if (operation === "carousel_plan") {
      expect((await run(input())).ok).toBe(true);
      vi.clearAllMocks();
    }
    const sdk = operation === "carousel_research" ? responsesCreate : chatCreate;
    sdk.mockRejectedValueOnce(new Error("provider unavailable"));

    const result = await run(input(operation === "carousel_plan"
      ? { kind: "select_hook", hookId: "hook-1" } : undefined));

    expect(result).toMatchObject({ ok: false, error: { code } });
    const operations = operation === "carousel_hooks" ? ["carousel_research", operation] : [operation];
    expect(info.mock.calls).toEqual(operations.map((name) => [event(name)]));
    expect(sdk).toHaveBeenCalledTimes(1);
    expect(responsesCreate).toHaveBeenCalledTimes(operation === "carousel_plan" ? 0 : 1);
    expect(chatCreate).toHaveBeenCalledTimes(operation === "carousel_research" ? 0 : 1);
    expect(current.settings.carouselDraft?.plan).toBeUndefined();
  });

  it.each(["logger", "console"])("keeps all three calls and their results when the %s throws", async (sink) => {
    const failure = () => { throw new Error("PRIVATE_LOG_FAILURE"); };
    if (sink === "logger") info.mockImplementation(failure);
    else consoleInfo.mockImplementation(failure);

    expect(await planScript()).toMatchObject({ ok: true, value: {
      draft: { plan: { slides: [{}, {}, {}, {}, {}] } }, editorial: { caption: script.caption },
    } });

    expect(info.mock.calls).toEqual([
      [event("carousel_research")], [event("carousel_hooks")], [event("carousel_plan")],
    ]);
    expect(responsesCreate).toHaveBeenCalledTimes(1);
    expect(responsesCreate.mock.calls[0][1]).toEqual({ timeout: 60_000, maxRetries: 0 });
    expect(chatCreate).toHaveBeenCalledTimes(2);
    expect(chatCreate.mock.calls.every((call) => call.length === 1)).toBe(true);
  });

  it("emits no version event or SDK call for the controlled research, hooks and script", async () => {
    controlled.enabled = true;

    expect((await planScript()).ok).toBe(true);

    expect(info).not.toHaveBeenCalled();
    expect(consoleInfo).not.toHaveBeenCalled();
    expect(responsesCreate).not.toHaveBeenCalled();
    expect(chatCreate).not.toHaveBeenCalled();
  });

  it.each(["work_not_found", "work_not_carousel", "work_not_draft", "sources_not_ready", "stale_input"])(
    "emits no event when authorization ends with %s", async (code) => {
      const request = input();
      if (code === "work_not_found") repo.getCreativeWork.mockResolvedValue(null);
      if (code === "work_not_carousel") current.toolKind = "social_post";
      if (code === "work_not_draft") current.status = "ready";
      if (code === "sources_not_ready") sources = [{ status: "analyzing" } as CreativeWorkSource];
      if (code === "stale_input") request.expectedUpdatedAt = "2026-08-30T11:59:59.000Z";

      expect(await run(request)).toMatchObject({ ok: false, error: { code } });

      expect(info).not.toHaveBeenCalled();
      expect(responsesCreate).not.toHaveBeenCalled();
      expect(chatCreate).not.toHaveBeenCalled();
    },
  );

  it.each(["joined", "revision_changed"])("emits no event when the preparation claim is %s", async (outcome) => {
    repo.claimPreparationAttempt.mockResolvedValueOnce({ outcome, attempt: { id: "original-attempt" } });

    expect(await run(input())).toMatchObject({ ok: false, error: {
      code: outcome === "joined" ? "preparation_in_progress" : "stale_input",
    } });

    expect(info).not.toHaveBeenCalled();
    expect(responsesCreate).not.toHaveBeenCalled();
    expect(chatCreate).not.toHaveBeenCalled();
  });

  it("logs only research when external evidence is insufficient and the hooks gate closes", async () => {
    current.request = "Segundo a OMS, grupo de terapia começa em agosto";

    expect(await run(input())).toMatchObject({ ok: false, error: { code: "research_insufficient" } });

    expect(info.mock.calls).toEqual([[event("carousel_research")]]);
    expect(responsesCreate).toHaveBeenCalledTimes(1);
    expect(chatCreate).not.toHaveBeenCalled();
  });

  it("emits no event for script and cover commands without a selected hook or script", async () => {
    for (const command of [
      { kind: "select_hook", hookId: "unknown" },
      { kind: "revise_script", instruction: "Revisar a abertura" },
      { kind: "approve_script", scriptRevision: "unknown" },
      { kind: "approve_cover", slideId: "cover-1", preparedRevision: "unknown" },
    ] as const) {
      expect(await run(input(command))).toMatchObject({ ok: false, error: { code: "invalid_editorial_transition" } });
    }
    expect(info).not.toHaveBeenCalled();
    expect(responsesCreate).not.toHaveBeenCalled();
    expect(chatCreate).not.toHaveBeenCalled();
  });

  it("emits no event for approval or reusing an already approved script", async () => {
    expect((await planScript()).ok).toBe(true);
    const scriptRevision = current.settings.carouselEditorial!.revision;
    vi.clearAllMocks();

    expect((await run(input({ kind: "approve_script", scriptRevision }))).ok).toBe(true);
    expect((await run(input({ kind: "approve_script", scriptRevision }))).ok).toBe(true);

    expect(current.settings.carouselEditorial?.approvedScriptRevision).toBe(scriptRevision);
    expect(repo.updateCreativeWorkIfUnchanged).toHaveBeenCalledTimes(1);
    expect(info).not.toHaveBeenCalled();
    expect(responsesCreate).not.toHaveBeenCalled();
    expect(chatCreate).not.toHaveBeenCalled();
  });

  it("logs each new script revision invocation without relogging research or hooks", async () => {
    expect((await planScript()).ok).toBe(true);
    vi.clearAllMocks();
    chatCreate.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(script) } }] });

    expect((await run(input({ kind: "revise_script", instruction: "Preservar os fatos" }))).ok).toBe(true);
    expect((await run(input({ kind: "revise_script", instruction: "Manter a abertura" }))).ok).toBe(true);

    expect(info.mock.calls).toEqual([[event("carousel_plan")], [event("carousel_plan")]]);
    expect(responsesCreate).not.toHaveBeenCalled();
    expect(chatCreate).toHaveBeenCalledTimes(2);
  });

  it("keeps request, backstage notes, sources and URLs out of all version events", async () => {
    const sentinels = ["PRIVATE_REQUEST", "PRIVATE_NOTES", "PRIVATE_SOURCE", "PRIVATE_URL"];
    current.request = `${REQUEST}\nPRIVATE_REQUEST\nNotas de bastidor: PRIVATE_NOTES https://private.example/PRIVATE_URL`;
    sources = [{
      id: "source-1", status: "ready", usage: "content",
      contentAnalysis: { product: "Grupo de terapia", offer: "PRIVATE_SOURCE", textContent: { bullets: [] } },
    } as CreativeWorkSource];

    expect((await planScript()).ok).toBe(true);

    expect(info.mock.calls).toEqual([
      [event("carousel_research")], [event("carousel_hooks")], [event("carousel_plan")],
    ]);
    for (const sentinel of sentinels) {
      expect(JSON.stringify(info.mock.calls)).not.toContain(sentinel);
      expect(JSON.stringify(consoleInfo.mock.calls)).not.toContain(sentinel);
    }
  });

  it.each(["warn", "error"])("suppresses all version events at minimum log level %s without changing calls", async (level) => {
    await loadPlanning(level);

    expect((await planScript()).ok).toBe(true);

    expect(info).toHaveBeenCalledTimes(3);
    expect(consoleInfo).not.toHaveBeenCalled();
    expect(process.env.LOG_LEVEL).toBe(level);
    expect(responsesCreate).toHaveBeenCalledTimes(1);
    expect(chatCreate).toHaveBeenCalledTimes(2);
  });
});
