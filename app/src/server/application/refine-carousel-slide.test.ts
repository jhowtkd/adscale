import { beforeEach, describe, expect, it, vi } from "vitest";

const getWork = vi.hoisted(() => vi.fn());
const listAttempts = vi.hoisted(() => vi.fn());
const getByKey = vi.hoisted(() => vi.fn());
const markAttempt = vi.hoisted(() => vi.fn());
const setState = vi.hoisted(() => vi.fn());
const listCurrent = vi.hoisted(() => vi.fn());
const listLineage = vi.hoisted(() => vi.fn());
const claimSlide = vi.hoisted(() => vi.fn());
const claimUnits = vi.hoisted(() => vi.fn());
const revise = vi.hoisted(() => vi.fn());
const storageGet = vi.hoisted(() => vi.fn());
const analyzeArtComparisonMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: getWork,
  listArtRefinementAttempts: listAttempts,
  getArtRefinementAttemptByKey: getByKey,
  markArtRefinementAttempt: markAttempt,
  setArtRefinementState: setState,
}));
vi.mock("@/server/repositories/creative-work-carousel", () => ({
  listCurrentCarouselSlides: listCurrent,
  listCarouselSlideLineage: listLineage,
  claimArtRefinementSlideAttempt: claimSlide,
  claimArtRefinementSlideUnits: claimUnits,
}));
vi.mock("./revise-carousel", () => ({
  reviseCarouselSlide: revise,
}));
// Unused by the slide coordinator; pulled transitively through
// ./refine-creative-work (image loader + instruction builder).
vi.mock("./revise-creative-work-output", () => ({
  reviseCreativeWorkOutput: vi.fn(),
}));
vi.mock("@/server/storage", () => ({ objectStorage: { get: storageGet } }));
vi.mock("@/server/ai/creative-qa", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/ai/creative-qa")>()),
  analyzeArtComparison: (...args: unknown[]) => analyzeArtComparisonMock(...args),
}));
vi.mock("@/server/generation/pipeline/post-generation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/generation/pipeline/post-generation")>()),
}));

import { GENERATION_CREDIT_COSTS } from "@/server/generation/canonical/types";
import { refineCarouselSlide, refreshCarouselArtRefinementState } from "./refine-carousel-slide";

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

function region() {
  return { x: 80, y: 96, width: 864, height: 420, minFontPx: 42, maxFontPx: 82, align: "left" as const };
}

function deckFixture() {
  const roles = ["hook", "context", "problem", "argument", "closing"] as const;
  const families = ["impact", "development", "impact", "development", "respite"] as const;
  return {
    version: 1,
    revision: "deck-r1",
    workId: "work-1",
    objective: "Divulgar o grupo",
    audience: null,
    tone: null,
    promise: "Grupo em agosto",
    format: "4:5",
    slides: [1, 2, 3, 4, 5].map((position) => ({
      slideId: `slide-${position}`,
      position,
      role: roles[position - 1],
      purpose: `Purpose ${position}`,
      primaryText: `Title ${position}`,
      secondaryText: null,
      authority: "ai_proposal",
      sourceFactIds: [],
      layoutFamily: families[position - 1],
    })),
  };
}

function contractFixture() {
  const layout = (id: string, density: "high" | "medium" | "low", backgroundInstruction: string) => ({
    id, density, primaryRegion: region(), secondaryRegion: null, exactAssetSlots: [], backgroundInstruction,
  });
  return {
    version: 1,
    brandSnapshotHash: "brand-hash-1",
    temporaryReferenceId: null,
    palette: ["#112233"],
    typography: { fontAssetKey: null, fallbackFamily: "sans", authority: "fallback" },
    directionInstruction: null,
    layoutFamilies: {
      impact: layout("impact-v1", "high", "impact"),
      development: layout("development-v1", "medium", "development"),
      respite: layout("respite-v1", "low", "respite"),
    },
    recurringMotifs: [],
    exactAssetKeys: [],
    prohibitedElements: [],
    safeAreaPx: 64,
    contractHash: "contract-hash-1",
  };
}

function snapshotFixture(overrides: Record<string, unknown> = {}) {
  return {
    request: "Quero um carrossel",
    settings: { targetFormats: [] },
    artRefinement: {
      version: 1,
      maxRevisionsPerRoot: 2,
      acceptedCreditCeiling: 5 * 3 * UNIT,
      acceptedBy: "user-1",
      acceptedAt: "2026-09-13T00:00:00.000Z",
    },
    carousel: {
      version: 1,
      preparedRevision: "prep-1",
      deck: deckFixture(),
      visualContract: contractFixture(),
    },
    ...overrides,
  };
}

function slide(overrides: Record<string, unknown> = {}) {
  return {
    id: "slide-2",
    workspaceId: "ws-1",
    workItemId: "work-1",
    lineageId: "lineage-2",
    parentSlideId: null,
    versionNumber: 1,
    deckRevision: "deck-r1",
    position: 2,
    role: "context",
    status: "completed",
    outputKey: "creative-work/work-1/carousel/slides/slide-2/final.png",
    quality: qualityWith(weakCritique),
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function deckSlides() {
  // 5-slide deck: anchors at 1, 3, 5; position 2 completes with a weak critique.
  return [1, 2, 3, 4, 5].map((position) => slide({
    id: `slide-${position}`,
    lineageId: `lineage-${position}`,
    position,
    outputKey: `creative-work/work-1/carousel/slides/slide-${position}/final.png`,
    quality: position === 2 ? qualityWith(weakCritique) : qualityWith(readyCritique),
  }));
}

function aggregate(overrides: Record<string, unknown> = {}) {
  return {
    work: {
      id: "work-1",
      workspaceId: "ws-1",
      toolKind: "carousel",
      format: "4:5",
      request: "Quero um carrossel",
      trainingSessionId: null,
      inputSnapshot: snapshotFixture(),
      ...((overrides.work ?? {}) as Record<string, unknown>),
    },
    outputs: [],
    sources: [],
  };
}

describe("refineCarouselSlide", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWork.mockResolvedValue(aggregate());
    listCurrent.mockResolvedValue(deckSlides());
    listLineage.mockImplementation(async (_ws: string, _work: string, lineageId: string) => {
      const rows = deckSlides().filter((row) => row.lineageId === lineageId);
      return rows;
    });
    listAttempts.mockResolvedValue([]);
    claimSlide.mockResolvedValue({ attempt: 1, revisionKey: "art-refinement:work-1:slide-2:1", replay: false });
    claimUnits.mockResolvedValue([
      { attempt: 1, revisionKey: "art-refinement:work-1:slide-1:1", replay: false },
    ]);
    revise.mockResolvedValue({ ok: true, value: { slide: { id: "slide-2-v2" } } });
    markAttempt.mockResolvedValue({});
    setState.mockResolvedValue({});
    storageGet.mockRejectedValue(new Error("missing"));
    analyzeArtComparisonMock.mockResolvedValue({
      winner: "tie", reason: "Empate.", fixedIssues: [], regressions: [],
    });
  });

  it("dispatches one non-anchor revision through the canonical path with the frozen author", async () => {
    const result = await refineCarouselSlide({
      workspaceId: "ws-1", workItemId: "work-1", rootSlideId: "slide-2", completedSlideId: "slide-2",
    });

    expect(result).toEqual({ kind: "started", outputId: "slide-2-v2", reason: "revision_dispatched" });
    expect(claimUnits).not.toHaveBeenCalled();
    expect(claimSlide).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "ws-1",
      workItemId: "work-1",
      rootSlideId: "slide-2",
      parentSlideId: "slide-2",
      unitCredits: UNIT,
      remainingCreditCeiling: 5 * 3 * UNIT - 5 * UNIT,
    }));
    expect(revise).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      slideId: "slide-2",
      expectedVersion: 1,
      revisionKey: "art-refinement:work-1:slide-2:1",
      kind: "visual",
    }));
    const instruction = revise.mock.calls[0]?.[0].instruction as string;
    expect(instruction).toContain("Foco dividido");
    expect(instruction).toContain("Unificar foco");
    expect(markAttempt).toHaveBeenCalledWith("ws-1", "art-refinement:work-1:slide-2:1", {
      status: "dispatched",
      slideId: "slide-2-v2",
    });
  });

  it("reserves the anchor plus every dependent rebuild in one transaction", async () => {
    listCurrent.mockResolvedValue(deckSlides().map((row) =>
      row.id === "slide-1" ? { ...row, quality: qualityWith(weakCritique) } : row,
    ));
    claimUnits.mockResolvedValue([
      { attempt: 1, revisionKey: "art-refinement:work-1:slide-1:1", replay: false },
      { attempt: 1, revisionKey: "art-refinement:work-1:slide-2:1", replay: false },
      { attempt: 1, revisionKey: "art-refinement:work-1:slide-4:1", replay: false },
    ]);
    revise.mockResolvedValue({ ok: true, value: { slide: { id: "slide-1-v2" } } });

    const result = await refineCarouselSlide({
      workspaceId: "ws-1", workItemId: "work-1", rootSlideId: "slide-1", completedSlideId: "slide-1",
    });

    expect(result).toEqual({ kind: "started", outputId: "slide-1-v2", reason: "revision_dispatched" });
    expect(claimSlide).not.toHaveBeenCalled();
    expect(claimUnits).toHaveBeenCalledWith(expect.objectContaining({
      anchor: expect.objectContaining({ rootSlideId: "slide-1", parentSlideId: "slide-1" }),
      unitCredits: UNIT,
    }));
    const dependents = claimUnits.mock.calls[0]?.[0].dependents as Array<{ rootSlideId: string }>;
    expect(dependents.map((unit) => unit.rootSlideId).sort()).toEqual(["slide-2", "slide-4"]);
    expect(markAttempt).toHaveBeenCalledWith("ws-1", "art-refinement:work-1:slide-1:1", {
      status: "dispatched",
      slideId: "slide-1-v2",
    });
  });

  it("replays the same event without charging twice", async () => {
    claimSlide.mockResolvedValue({ attempt: 1, revisionKey: "art-refinement:work-1:slide-2:1", replay: true });
    getByKey.mockResolvedValue({ revisionKey: "art-refinement:work-1:slide-2:1", slideId: "slide-2-v2" });

    const result = await refineCarouselSlide({
      workspaceId: "ws-1", workItemId: "work-1", rootSlideId: "slide-2", completedSlideId: "slide-2",
    });

    expect(result).toEqual({ kind: "replay", outputId: "slide-2-v2", reason: "already_claimed" });
    expect(revise).not.toHaveBeenCalled();
  });

  it("reconciles a claim whose dispatch never happened", async () => {
    claimSlide.mockResolvedValue({ attempt: 1, revisionKey: "art-refinement:work-1:slide-2:1", replay: true });
    getByKey.mockResolvedValue({ revisionKey: "art-refinement:work-1:slide-2:1", slideId: null });

    const result = await refineCarouselSlide({
      workspaceId: "ws-1", workItemId: "work-1", rootSlideId: "slide-2", completedSlideId: "slide-2",
    });

    expect(result.kind).toBe("replay");
    expect(result.outputId).toBe("slide-2-v2");
    expect(revise).toHaveBeenCalledWith(expect.objectContaining({
      revisionKey: "art-refinement:work-1:slide-2:1",
    }));
  });

  it.each([
    ["wrong_surface", { work: { toolKind: "variations" } }],
    ["calibration_excluded", { work: { trainingSessionId: "session-1" } }],
    ["no_budget", { work: { inputSnapshot: snapshotFixture({ artRefinement: undefined }) } }],
    ["stale_input", { work: { inputSnapshot: snapshotFixture({ carousel: null }) } }],
    ["no_actionable_critique", { slides: [slide({ quality: qualityWith(null) })] }],
    ["gate_closed", { slides: [slide({ quality: qualityWith(readyCritique) })] }],
    ["selection_blocked", { slides: [slide({ quality: qualityWith(weakCritique, "fail") })] }],
  ])("stops with %s without claiming", async (reason, overrides) => {
    getWork.mockResolvedValue(aggregate(overrides as Record<string, unknown>));
    if ((overrides as { slides?: unknown[] }).slides) {
      listCurrent.mockResolvedValue((overrides as { slides: unknown[] }).slides);
      listLineage.mockResolvedValue((overrides as { slides: unknown[] }).slides);
    }
    const result = await refineCarouselSlide({
      workspaceId: "ws-1", workItemId: "work-1", rootSlideId: "slide-2", completedSlideId: "slide-2",
    });
    expect(result).toEqual({ kind: "stopped", outputId: null, reason });
    expect(claimSlide).not.toHaveBeenCalled();
    expect(claimUnits).not.toHaveBeenCalled();
    expect(revise).not.toHaveBeenCalled();
  });

  it("stops when the slide is not ready or the root mismatches", async () => {
    listCurrent.mockResolvedValue([slide({ status: "failed", outputKey: null })]);
    const notReady = await refineCarouselSlide({
      workspaceId: "ws-1", workItemId: "work-1", rootSlideId: "slide-2", completedSlideId: "slide-2",
    });
    expect(notReady).toEqual({ kind: "stopped", outputId: null, reason: "slide_not_ready" });

    listCurrent.mockResolvedValue(deckSlides());
    const mismatch = await refineCarouselSlide({
      workspaceId: "ws-1", workItemId: "work-1", rootSlideId: "slide-9", completedSlideId: "slide-2",
    });
    expect(mismatch).toEqual({ kind: "stopped", outputId: null, reason: "root_mismatch" });
    expect(claimSlide).not.toHaveBeenCalled();
    expect(revise).not.toHaveBeenCalled();
  });

  it("stops anchor refinement while a dependent is not completed", async () => {
    listCurrent.mockResolvedValue(deckSlides().map((row) =>
      row.id === "slide-1"
        ? { ...row, quality: qualityWith(weakCritique) }
        : row.id === "slide-4"
          ? { ...row, status: "draft", outputKey: null, quality: null }
          : row,
    ));

    const result = await refineCarouselSlide({
      workspaceId: "ws-1", workItemId: "work-1", rootSlideId: "slide-1", completedSlideId: "slide-1",
    });

    expect(result).toEqual({ kind: "stopped", outputId: null, reason: "dependents_not_ready" });
    expect(claimUnits).not.toHaveBeenCalled();
    expect(revise).not.toHaveBeenCalled();
    expect(setState).toHaveBeenCalled();
  });

  it("stops at the root cap or ceiling when the claim refuses", async () => {
    listAttempts.mockResolvedValue([
      { rootSlideId: "slide-2", attempt: 1 },
      { rootSlideId: "slide-2", attempt: 2 },
    ]);
    claimSlide.mockResolvedValue(null);
    const result = await refineCarouselSlide({
      workspaceId: "ws-1", workItemId: "work-1", rootSlideId: "slide-2", completedSlideId: "slide-2",
    });
    expect(result).toEqual({ kind: "stopped", outputId: null, reason: expect.stringMatching(/claim_refused|gate_closed/) });
    expect(revise).not.toHaveBeenCalled();
    expect(setState).toHaveBeenCalled();
  });

  it("consumes the opportunity on deterministic failure", async () => {
    revise.mockResolvedValue({ ok: false, error: { code: "dispatch_failed" } });
    const result = await refineCarouselSlide({
      workspaceId: "ws-1", workItemId: "work-1", rootSlideId: "slide-2", completedSlideId: "slide-2",
    });
    expect(result).toEqual({ kind: "stopped", outputId: null, reason: "dispatch_failed" });
    expect(markAttempt).toHaveBeenCalledWith("ws-1", "art-refinement:work-1:slide-2:1", { status: "failed" });
  });

  it("leaves the attempt claimed when the dispatch outcome is unknown", async () => {
    revise.mockRejectedValue(new Error("connection reset"));
    await expect(refineCarouselSlide({
      workspaceId: "ws-1", workItemId: "work-1", rootSlideId: "slide-2", completedSlideId: "slide-2",
    })).rejects.toThrow("art_refinement_dispatch_unknown");
    expect(markAttempt).not.toHaveBeenCalled();
  });
});

describe("refreshCarouselArtRefinementState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWork.mockResolvedValue(aggregate());
    listAttempts.mockResolvedValue([]);
    setState.mockResolvedValue({});
    storageGet.mockRejectedValue(new Error("missing"));
    analyzeArtComparisonMock.mockResolvedValue({
      winner: "tie", reason: "Empate.", fixedIssues: [], regressions: [],
    });
  });

  it("recommends the best valid slide per lineage and reports ready", async () => {
    const current = deckSlides();
    listCurrent.mockResolvedValue(current);
    listLineage.mockImplementation(async (_ws: string, _work: string, lineageId: string) => {
      if (lineageId === "lineage-2") {
        return [
          slide({ id: "slide-2", lineageId, versionNumber: 1, quality: qualityWith(weakCritique) }),
          slide({
            id: "slide-2-v2", lineageId, versionNumber: 2, parentSlideId: "slide-2",
            outputKey: "creative-work/work-1/carousel/slides/slide-2-v2/final.png",
            quality: qualityWith(readyCritique),
          }),
        ];
      }
      return current.filter((row) => row.lineageId === lineageId);
    });

    await refreshCarouselArtRefinementState({ workspaceId: "ws-1", workItemId: "work-1" });

    // Structural tie keeps the previous version of lineage-2.
    expect(setState).toHaveBeenCalledWith("ws-1", "work-1", expect.objectContaining({
      recommendedOutputIds: ["slide-1", "slide-2", "slide-3", "slide-4", "slide-5"],
      status: "ready",
      issues: [],
    }));
  });

  function twoVersionLineage(current: ReturnType<typeof deckSlides>) {
    listCurrent.mockResolvedValue(current);
    listLineage.mockImplementation(async (_ws: string, _work: string, lineageId: string) => {
      if (lineageId === "lineage-2") {
        return [
          slide({ id: "slide-2", lineageId, versionNumber: 1, quality: qualityWith(weakCritique) }),
          slide({
            id: "slide-2-v2", lineageId, versionNumber: 2, parentSlideId: "slide-2",
            outputKey: "creative-work/work-1/carousel/slides/slide-2-v2/final.png",
            quality: qualityWith(readyCritique),
          }),
        ];
      }
      return current.filter((row) => row.lineageId === lineageId);
    });
  }

  it("judges each pair once and persists the verdict for later refreshes", async () => {
    twoVersionLineage(deckSlides());
    storageGet.mockResolvedValue(Buffer.from("png"));
    analyzeArtComparisonMock.mockResolvedValue({
      winner: "after", reason: "Melhor foco.", fixedIssues: [], regressions: [],
    });

    await refreshCarouselArtRefinementState({ workspaceId: "ws-1", workItemId: "work-1" });

    expect(analyzeArtComparisonMock).toHaveBeenCalledTimes(1);
    // Only the judged pair loads images — single-version lineages load nothing.
    expect(storageGet).toHaveBeenCalledTimes(2);
    const state = setState.mock.calls[0]?.[2] as { recommendedOutputIds: string[]; comparisons: Record<string, unknown> };
    expect(state.recommendedOutputIds).toEqual(["slide-1", "slide-2-v2", "slide-3", "slide-4", "slide-5"]);
    const [key, verdict] = Object.entries(state.comparisons)[0]!;
    expect(key.startsWith("slide-2:slide-2-v2:")).toBe(true);
    expect(verdict).toEqual({ preferredId: "slide-2-v2" });

    // A refresh with the persisted verdict re-runs neither storage nor the judge.
    vi.clearAllMocks();
    setState.mockResolvedValue({});
    getWork.mockResolvedValue(aggregate({ work: { artRefinementState: state } }));
    twoVersionLineage(deckSlides());

    await refreshCarouselArtRefinementState({ workspaceId: "ws-1", workItemId: "work-1" });

    expect(analyzeArtComparisonMock).not.toHaveBeenCalled();
    expect(storageGet).not.toHaveBeenCalled();
    expect(setState).toHaveBeenCalledWith("ws-1", "work-1", expect.objectContaining({
      recommendedOutputIds: ["slide-1", "slide-2-v2", "slide-3", "slide-4", "slide-5"],
      comparisons: state.comparisons,
    }));
  });

  it("does not persist verdicts from a failed judge or missing images", async () => {
    twoVersionLineage(deckSlides());
    analyzeArtComparisonMock.mockRejectedValue(new Error("timeout"));

    await refreshCarouselArtRefinementState({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(setState).toHaveBeenCalledWith("ws-1", "work-1", expect.objectContaining({ comparisons: {} }));

    vi.clearAllMocks();
    setState.mockResolvedValue({});
    getWork.mockResolvedValue(aggregate());
    twoVersionLineage(deckSlides());
    storageGet.mockResolvedValue(Buffer.from("png"));

    await refreshCarouselArtRefinementState({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(analyzeArtComparisonMock).toHaveBeenCalledTimes(1);
    expect(setState).toHaveBeenCalledWith("ws-1", "work-1", expect.objectContaining({
      recommendedOutputIds: ["slide-1", "slide-2", "slide-3", "slide-4", "slide-5"],
      comparisons: {},
    }));
  });

  it("asks for review when a lineage has no valid slide", async () => {
    listCurrent.mockResolvedValue([slide({ quality: qualityWith(weakCritique, "fail") })]);
    listLineage.mockResolvedValue([slide({ quality: qualityWith(weakCritique, "fail") })]);

    await refreshCarouselArtRefinementState({ workspaceId: "ws-1", workItemId: "work-1" });

    expect(setState).toHaveBeenCalledWith("ws-1", "work-1", expect.objectContaining({
      recommendedOutputIds: [],
      status: "needs_review",
    }));
  });

  it("stays running while a slide or attempt is in flight", async () => {
    listCurrent.mockResolvedValue([
      slide({ quality: qualityWith(readyCritique) }),
      slide({ id: "slide-4", lineageId: "lineage-4", position: 4, status: "draft", outputKey: null, quality: null }),
    ]);
    listLineage.mockImplementation(async (_ws: string, _work: string, lineageId: string) =>
      lineageId === "lineage-2" ? [slide({ quality: qualityWith(readyCritique) })] : []);

    await refreshCarouselArtRefinementState({ workspaceId: "ws-1", workItemId: "work-1" });

    expect(setState).toHaveBeenCalledWith("ws-1", "work-1", expect.objectContaining({
      status: "running",
    }));
  });

  it("writes nothing for non-carousel or legacy works", async () => {
    getWork.mockResolvedValue(aggregate({ work: { toolKind: "variations" } }));
    await refreshCarouselArtRefinementState({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(setState).not.toHaveBeenCalled();

    getWork.mockResolvedValue(aggregate({
      work: { inputSnapshot: snapshotFixture({ artRefinement: undefined }) },
    }));
    await refreshCarouselArtRefinementState({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(setState).not.toHaveBeenCalled();
  });
});
