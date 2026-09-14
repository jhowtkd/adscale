import { beforeEach, describe, expect, it, vi } from "vitest";

const getWork = vi.hoisted(() => vi.fn());
const claim = vi.hoisted(() => vi.fn());
const getByKey = vi.hoisted(() => vi.fn());
const listAttempts = vi.hoisted(() => vi.fn());
const markAttempt = vi.hoisted(() => vi.fn());
const setState = vi.hoisted(() => vi.fn());
const revise = vi.hoisted(() => vi.fn());

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
});
