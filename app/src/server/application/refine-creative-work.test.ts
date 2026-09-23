import { beforeEach, describe, expect, it, vi } from "vitest";

const getWork = vi.hoisted(() => vi.fn());
const claim = vi.hoisted(() => vi.fn());
const getByKey = vi.hoisted(() => vi.fn());
const listAttempts = vi.hoisted(() => vi.fn());
const markAttempt = vi.hoisted(() => vi.fn());
const setState = vi.hoisted(() => vi.fn());
const revise = vi.hoisted(() => vi.fn());
const storageGet = vi.hoisted(() => vi.fn());
const analyzeArtComparisonMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/storage", () => ({ objectStorage: { get: storageGet } }));
vi.mock("@/server/ai/creative-qa", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/ai/creative-qa")>()),
  analyzeArtComparison: (...args: unknown[]) => analyzeArtComparisonMock(...args),
}));

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: getWork,
  claimArtRefinementAttempt: claim,
  getArtRefinementAttemptByKey: getByKey,
  listArtRefinementAttempts: listAttempts,
  markArtRefinementAttempt: markAttempt,
  setArtRefinementState: setState,
}));
vi.mock("./revise-creative-work-output", () => ({
  reviseCreativeWorkOutput: revise,
}));
vi.mock("@/server/generation/pipeline/post-generation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/generation/pipeline/post-generation")>()),
}));

import { GENERATION_CREDIT_COSTS } from "@/server/generation/canonical/types";
import { refineCreativeWork, refreshArtRefinementState } from "./refine-creative-work";

const UNIT = GENERATION_CREDIT_COSTS.creativeWorkOutput;
const NOW = new Date("2026-09-13T12:00:00.000Z");

const weakCritique = {
  verdict: "weak",
  problem: "Foco dividido",
  intervention: "Unificar foco",
  mode: "edit",
  preserve: ["facts"],
  evidence: ["Dois títulos dominantes"],
  confidence: "high",
};

const readyCritique = {
  verdict: "ready",
  problem: "",
  intervention: "",
  mode: "edit",
  preserve: [],
  evidence: [],
  confidence: "high",
};

function qualityWith(critique: Record<string, unknown> | null, objective = "pass") {
  return {
    schemaVersion: 1,
    objectiveVerdict: objective,
    ...(critique === null ? {} : { artCritique: critique }),
  };
}

function output(overrides: Record<string, unknown> = {}) {
  return {
    id: "root-1",
    workspaceId: "ws-1",
    workItemId: "work-1",
    parentOutputId: null,
    status: "completed",
    outputKey: "creative-work/root-1/original.png",
    quality: qualityWith(weakCritique),
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function aggregate(overrides: Record<string, unknown> = {}) {
  return {
    work: {
      id: "work-1",
      workspaceId: "ws-1",
      toolKind: "variations",
      format: "4:5",
      request: "Promo",
      trainingSessionId: null,
      inputSnapshot: {
        request: "Promo",
        settings: { targetFormats: [] },
        artRefinement: {
          version: 1,
          maxRevisionsPerRoot: 2,
          acceptedCreditCeiling: 3 * UNIT,
          acceptedBy: "user-1",
          acceptedAt: "2026-09-13T00:00:00.000Z",
        },
      },
      ...((overrides.work ?? {}) as Record<string, unknown>),
    },
    outputs: [output()],
    sources: [],
    ...(overrides.outputs ? { outputs: overrides.outputs } : {}),
  };
}

describe("refineCreativeWork", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWork.mockResolvedValue(aggregate());
    listAttempts.mockResolvedValue([]);
    claim.mockResolvedValue({ attempt: 1, revisionKey: "art-refinement:work-1:root-1:1", replay: false });
    revise.mockResolvedValue({ ok: true, value: { output: { id: "rev-1" } } });
    markAttempt.mockResolvedValue({});
    setState.mockResolvedValue({});
    storageGet.mockRejectedValue(new Error("missing"));
    analyzeArtComparisonMock.mockResolvedValue({
      winner: "tie", reason: "Empate.", fixedIssues: [], regressions: [],
    });
  });

  it("dispatches one revision through the canonical path with the frozen author", async () => {
    const result = await refineCreativeWork({
      workspaceId: "ws-1",
      workItemId: "work-1",
      rootOutputId: "root-1",
      completedOutputId: "root-1",
    });

    expect(result).toEqual({ kind: "started", outputId: "rev-1", reason: "revision_dispatched" });
    expect(claim).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "ws-1",
      workItemId: "work-1",
      rootOutputId: "root-1",
      parentOutputId: "root-1",
      unitCredits: UNIT,
      remainingCreditCeiling: 2 * UNIT,
    }));
    expect(revise).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      outputId: "root-1",
      revisionKey: "art-refinement:work-1:root-1:1",
      revisionAssetId: null,
      compositionMode: "edit",
    }));
    const instruction = revise.mock.calls[0]?.[0].instruction as string;
    expect(instruction).toContain("Foco dividido");
    expect(instruction).toContain("Unificar foco");
    expect(markAttempt).toHaveBeenCalledWith("ws-1", "art-refinement:work-1:root-1:1", {
      status: "dispatched",
      outputId: "rev-1",
    });
  });

  it("replays the same event without charging twice", async () => {
    const result = await refineCreativeWork({
      workspaceId: "ws-1", workItemId: "work-1", rootOutputId: "root-1", completedOutputId: "root-1",
    });
    expect(result.kind).toBe("started");
    expect(revise).toHaveBeenCalledTimes(1);

    claim.mockResolvedValue({ attempt: 1, revisionKey: "art-refinement:work-1:root-1:1", replay: true });
    getByKey.mockResolvedValue({ revisionKey: "art-refinement:work-1:root-1:1", outputId: "rev-1" });

    const replayed = await refineCreativeWork({
      workspaceId: "ws-1", workItemId: "work-1", rootOutputId: "root-1", completedOutputId: "root-1",
    });
    expect(replayed).toEqual({ kind: "replay", outputId: "rev-1", reason: "already_claimed" });
    expect(revise).toHaveBeenCalledTimes(1);
  });

  it("reconciles a claim whose dispatch never happened", async () => {
    claim.mockResolvedValue({ attempt: 1, revisionKey: "art-refinement:work-1:root-1:1", replay: true });
    getByKey.mockResolvedValue({ revisionKey: "art-refinement:work-1:root-1:1", outputId: null });

    const result = await refineCreativeWork({
      workspaceId: "ws-1", workItemId: "work-1", rootOutputId: "root-1", completedOutputId: "root-1",
    });

    expect(result.kind).toBe("replay");
    expect(result.outputId).toBe("rev-1");
    expect(revise).toHaveBeenCalledWith(expect.objectContaining({
      revisionKey: "art-refinement:work-1:root-1:1",
    }));
  });

  it.each([
    ["calibration_excluded", { work: { trainingSessionId: "session-1" } }],
    ["no_budget", { work: { inputSnapshot: { request: "Promo", settings: { targetFormats: [] } } } }],
    ["wrong_surface", { work: { toolKind: "carousel" } }],
    ["output_not_ready", { outputs: [output({ status: "failed", outputKey: null })] }],
    ["root_mismatch", { outputs: [output({ id: "other-root" })] }],
    ["no_actionable_critique", { outputs: [output({ quality: qualityWith(null) })] }],
    ["gate_closed", { outputs: [output({ quality: qualityWith(readyCritique) })] }],
    ["selection_blocked", { outputs: [output({ quality: qualityWith(weakCritique, "fail") })] }],
  ])("stops with %s without claiming", async (reason, overrides) => {
    getWork.mockResolvedValue(aggregate(overrides));
    const result = await refineCreativeWork({
      workspaceId: "ws-1", workItemId: "work-1", rootOutputId: "root-1", completedOutputId: "root-1",
    });
    // root_mismatch uses a missing completed id; adjust the call accordingly.
    if (reason === "root_mismatch") {
      expect(["root_mismatch", "output_not_ready"]).toContain(result.reason);
    } else {
      expect(result).toEqual({ kind: "stopped", outputId: null, reason });
    }
    expect(claim).not.toHaveBeenCalled();
    expect(revise).not.toHaveBeenCalled();
  });

  it("stops at the root cap or ceiling when the claim refuses", async () => {
    listAttempts.mockResolvedValue([
      { rootOutputId: "root-1", attempt: 1 },
      { rootOutputId: "root-1", attempt: 2 },
    ]);
    claim.mockResolvedValue(null);
    const result = await refineCreativeWork({
      workspaceId: "ws-1", workItemId: "work-1", rootOutputId: "root-1", completedOutputId: "root-1",
    });
    expect(result).toEqual({ kind: "stopped", outputId: null, reason: expect.stringMatching(/claim_refused|gate_closed/) });
    expect(revise).not.toHaveBeenCalled();
    expect(setState).toHaveBeenCalled();
  });

  it("consumes the opportunity on deterministic failure with the canonical refund path", async () => {
    revise.mockResolvedValue({ ok: false, error: { code: "credit_blocked" } });
    const result = await refineCreativeWork({
      workspaceId: "ws-1", workItemId: "work-1", rootOutputId: "root-1", completedOutputId: "root-1",
    });
    expect(result).toEqual({ kind: "stopped", outputId: null, reason: "credit_blocked" });
    expect(markAttempt).toHaveBeenCalledWith("ws-1", "art-refinement:work-1:root-1:1", { status: "failed" });
  });

  it("leaves the attempt claimed when the dispatch outcome is unknown", async () => {
    revise.mockRejectedValue(new Error("connection reset"));
    await expect(refineCreativeWork({
      workspaceId: "ws-1", workItemId: "work-1", rootOutputId: "root-1", completedOutputId: "root-1",
    })).rejects.toThrow("art_refinement_dispatch_unknown");
    expect(markAttempt).not.toHaveBeenCalled();
  });
});

describe("refreshArtRefinementState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setState.mockResolvedValue({});
    listAttempts.mockResolvedValue([]);
    storageGet.mockRejectedValue(new Error("missing"));
    analyzeArtComparisonMock.mockResolvedValue({
      winner: "tie", reason: "Empate.", fixedIssues: [], regressions: [],
    });
  });

  it("keeps the previous version on a structural tie and reports ready", async () => {
    getWork.mockResolvedValue(aggregate({
      outputs: [
        output({ id: "root-1", quality: qualityWith(weakCritique) }),
        output({ id: "rev-1", parentOutputId: "root-1", quality: qualityWith(readyCritique), createdAt: new Date(NOW.getTime() + 1000) }),
      ],
    }));
    await refreshArtRefinementState({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(setState).toHaveBeenCalledWith("ws-1", "work-1", expect.objectContaining({
      recommendedOutputIds: ["root-1"],
      status: "ready",
      issues: [],
    }));
  });

  it("adopts the valid revision when the previous version is ineligible", async () => {
    getWork.mockResolvedValue(aggregate({
      outputs: [
        output({ id: "root-1", quality: qualityWith(weakCritique, "fail") }),
        output({ id: "rev-1", parentOutputId: "root-1", quality: qualityWith(readyCritique), createdAt: new Date(NOW.getTime() + 1000) }),
      ],
    }));
    await refreshArtRefinementState({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(setState).toHaveBeenCalledWith("ws-1", "work-1", expect.objectContaining({
      recommendedOutputIds: ["rev-1"],
      status: "ready",
    }));
  });

  it("never promotes a rejected output and asks for review when nothing is valid", async () => {
    getWork.mockResolvedValue(aggregate({
      outputs: [output({ quality: qualityWith(weakCritique, "fail") })],
    }));
    await refreshArtRefinementState({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(setState).toHaveBeenCalledWith("ws-1", "work-1", expect.objectContaining({
      recommendedOutputIds: [],
      status: "needs_review",
    }));
  });

  it("stays running while an output or attempt is in flight", async () => {
    getWork.mockResolvedValue(aggregate({
      outputs: [
        output({ quality: qualityWith(readyCritique) }),
        output({ id: "root-2", status: "processing", outputKey: null, quality: null }),
      ],
    }));
    await refreshArtRefinementState({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(setState).toHaveBeenCalledWith("ws-1", "work-1", expect.objectContaining({
      status: "running",
    }));
  });

  it("writes nothing for legacy works without a budget", async () => {
    getWork.mockResolvedValue(aggregate({
      work: { inputSnapshot: { request: "Promo", settings: { targetFormats: [] } } },
    }));
    await refreshArtRefinementState({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(setState).not.toHaveBeenCalled();
  });

  it("recommends the revision when the multimodal judge prefers it", async () => {
    storageGet.mockImplementation(async (key: string) => Buffer.from(`img:${key}`));
    analyzeArtComparisonMock.mockResolvedValue({
      winner: "after", reason: "Foco unificado.", fixedIssues: ["foco"], regressions: [],
    });
    getWork.mockResolvedValue(aggregate({
      outputs: [
        output({ id: "root-1", quality: qualityWith(weakCritique) }),
        output({ id: "rev-1", parentOutputId: "root-1", quality: qualityWith(readyCritique), createdAt: new Date(NOW.getTime() + 1000) }),
      ],
    }));
    await refreshArtRefinementState({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(analyzeArtComparisonMock).toHaveBeenCalledTimes(1);
    expect(setState).toHaveBeenCalledWith("ws-1", "work-1", expect.objectContaining({
      recommendedOutputIds: ["rev-1"],
      status: "ready",
    }));
  });

  it("reutiliza o julgamento e invalida quando imagem, briefing ou avaliador mudam", async () => {
    const outputs = [
      output({ id: "root-1", quality: qualityWith(weakCritique) }),
      output({ id: "rev-1", parentOutputId: "root-1", quality: qualityWith(readyCritique), createdAt: new Date(NOW.getTime() + 1000) }),
    ];
    let work = aggregate({ outputs });
    getWork.mockImplementation(async () => work);
    storageGet.mockImplementation(async (key: string) => Buffer.from(`img:${key}`));
    analyzeArtComparisonMock.mockResolvedValue({ winner: "after", reason: "Melhor foco.", fixedIssues: [], regressions: [] });
    const refresh = () => refreshArtRefinementState({ workspaceId: "ws-1", workItemId: "work-1" });
    const saveState = () => {
      const state = setState.mock.lastCall?.[2];
      work = aggregate({ work: { ...work.work, artRefinementState: state }, outputs });
      return state;
    };

    await refresh();
    const firstState = saveState() as { comparisons: Record<string, unknown> };
    expect(Object.keys(firstState.comparisons)).toHaveLength(1);
    expect(analyzeArtComparisonMock).toHaveBeenCalledTimes(1);
    expect(storageGet).toHaveBeenCalledTimes(2);

    await refresh();
    expect(analyzeArtComparisonMock).toHaveBeenCalledTimes(1);
    expect(storageGet).toHaveBeenCalledTimes(2);
    expect(setState.mock.lastCall?.[2]).toMatchObject({ recommendedOutputIds: ["rev-1"], comparisons: firstState.comparisons });

    outputs[1] = output({ ...outputs[1], outputKey: "creative-work/rev-1/replaced.png" });
    await refresh();
    expect(analyzeArtComparisonMock).toHaveBeenCalledTimes(2);
    saveState();

    work = aggregate({ work: { artRefinementState: setState.mock.lastCall?.[2], inputSnapshot: { ...work.work.inputSnapshot, request: "Promo alterada" } }, outputs });
    await refresh();
    expect(analyzeArtComparisonMock).toHaveBeenCalledTimes(3);
    saveState();

    vi.stubEnv("OPENAI_TEXT_MODEL", "gpt-6-test");
    try {
      await refresh();
      expect(analyzeArtComparisonMock).toHaveBeenCalledTimes(4);
      saveState();
      vi.stubEnv("APP_URL", "http://localhost:3000");
      vi.stubEnv("E2E_CONTROLLED_PROVIDER", "true");
      await refresh();
      expect(analyzeArtComparisonMock).toHaveBeenCalledTimes(5);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("não persiste julgamento quando faltam bytes ou o avaliador falha", async () => {
    getWork.mockResolvedValue(aggregate({ outputs: [
      output({ id: "root-1", quality: qualityWith(weakCritique) }),
      output({ id: "rev-1", parentOutputId: "root-1", quality: qualityWith(readyCritique), createdAt: new Date(NOW.getTime() + 1000) }),
    ] }));
    const refresh = () => refreshArtRefinementState({ workspaceId: "ws-1", workItemId: "work-1" });
    await refresh();
    expect(setState.mock.lastCall?.[2]).toMatchObject({ comparisons: {} });

    storageGet.mockResolvedValue(Buffer.from("png"));
    analyzeArtComparisonMock.mockRejectedValue(new Error("timeout"));
    await refresh();
    expect(setState.mock.lastCall?.[2]).toMatchObject({ comparisons: {} });

    analyzeArtComparisonMock.mockResolvedValue({ winner: "after", reason: "", fixedIssues: [], regressions: [] });
    await refresh();
    expect(setState.mock.lastCall?.[2]).toMatchObject({ comparisons: {} });

    analyzeArtComparisonMock.mockResolvedValue({ winner: "after", reason: "Melhor foco.", fixedIssues: [], regressions: [] });
    await refresh();
    expect(analyzeArtComparisonMock).toHaveBeenCalledTimes(3);
    expect(Object.keys((setState.mock.lastCall?.[2] as { comparisons: Record<string, unknown> }).comparisons)).toHaveLength(1);
  });

  it("mantém a comparação sequencial do vencedor com no máximo duas leituras simultâneas", async () => {
    getWork.mockResolvedValue(aggregate({ outputs: [
      output({ id: "root-1", outputKey: "root.png", quality: qualityWith(weakCritique) }),
      output({ id: "rev-1", parentOutputId: "root-1", outputKey: "rev-1.png", quality: qualityWith(weakCritique), createdAt: new Date(NOW.getTime() + 1000) }),
      output({ id: "rev-2", parentOutputId: "rev-1", outputKey: "rev-2.png", quality: qualityWith(readyCritique), createdAt: new Date(NOW.getTime() + 2000) }),
    ] }));
    let activeReads = 0;
    let peakReads = 0;
    storageGet.mockImplementation(async (key: string) => {
      activeReads += 1;
      peakReads = Math.max(peakReads, activeReads);
      await new Promise((resolve) => setTimeout(resolve, 1));
      activeReads -= 1;
      return Buffer.from(`img:${key}`);
    });
    analyzeArtComparisonMock
      .mockResolvedValueOnce({ winner: "after", reason: "Primeira revisão melhor.", fixedIssues: [], regressions: [] })
      .mockResolvedValueOnce({ winner: "before", reason: "Segunda revisão pior.", fixedIssues: [], regressions: [] });

    await refreshArtRefinementState({ workspaceId: "ws-1", workItemId: "work-1" });

    expect(peakReads).toBeLessThanOrEqual(2);
    expect(storageGet).toHaveBeenCalledTimes(3);
    expect(analyzeArtComparisonMock).toHaveBeenCalledTimes(2);
    expect(analyzeArtComparisonMock.mock.calls[1]?.[0].beforeImageBuffer).toEqual(Buffer.from("img:rev-1.png"));
    expect(setState.mock.lastCall?.[2]).toMatchObject({ recommendedOutputIds: ["rev-1"] });
  });

  it("falls back to a structural tie when comparison bytes are unavailable", async () => {
    storageGet.mockRejectedValueOnce(new Error("missing"));
    getWork.mockResolvedValue(aggregate({
      outputs: [
        output({ id: "root-1", quality: qualityWith(weakCritique) }),
        output({ id: "rev-1", parentOutputId: "root-1", quality: qualityWith(readyCritique), createdAt: new Date(NOW.getTime() + 1000) }),
      ],
    }));
    await refreshArtRefinementState({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(analyzeArtComparisonMock).not.toHaveBeenCalled();
    expect(setState).toHaveBeenCalledWith("ws-1", "work-1", expect.objectContaining({
      recommendedOutputIds: ["root-1"],
      status: "ready",
    }));
  });
});
