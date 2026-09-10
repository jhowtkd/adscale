import { beforeEach, describe, expect, it, vi } from "vitest";

const getWork = vi.hoisted(() => vi.fn());
const settle = vi.hoisted(() => vi.fn());
const buildAdapter = vi.hoisted(() => vi.fn());
const logLifecycle = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: getWork,
}));
vi.mock("@/server/generation/settlement", () => ({
  startGenerationSettlement: settle,
}));
vi.mock("@/server/creative-work/job-telemetry", () => ({
  logCreativeWorkGenerationLifecycle: logLifecycle,
}));
vi.mock("@/server/generation/settlement-adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/generation/settlement-adapters")>();
  return {
    ...actual,
    creativeWorkRevisionSettlementAdapter: buildAdapter,
  };
});
vi.mock("@/server/repositories/workspace-asset", () => ({
  getWorkspaceAssetById: vi.fn(async () => null),
}));

import { InvalidCreativeWorkRevisionError } from "@/server/generation/settlement-adapters";
import { GENERATION_CREDIT_COSTS } from "@/server/generation/canonical/types";
import { reviseCreativeWorkOutput } from "./revise-creative-work-output";

const REVISION_KEY = "00000000-0000-4000-8000-000000000101";
const PARENT_ID = "00000000-0000-4000-8000-000000000001";
const REVISION_ID = "00000000-0000-4000-8000-000000000002";

const parent = {
  id: PARENT_ID,
  status: "completed",
  outputKey: "creative-work/output-v1/original.png",
};

const revision = {
  id: REVISION_ID,
  status: "queued",
  generationCorrelationId: "generation-revision-1",
  parentOutputId: PARENT_ID,
  revisionInstruction: "Use mais contraste",
};

const work = {
  id: "work-1",
  brief: { objective: "Matrículas" },
};

const adapter = { kind: "revision-adapter" };

describe("reviseCreativeWorkOutput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWork.mockResolvedValue({ work, outputs: [parent], sources: [] });
    buildAdapter.mockReturnValue(adapter);
    settle.mockResolvedValue({ ok: true, value: { output: revision } });
  });

  it("translates a settled revision through the canonical interface", async () => {
    const result = await reviseCreativeWorkOutput({
      workspaceId: "ws-1",
      workItemId: "work-1",
      userId: "user-1",
      outputId: parent.id,
      revisionKey: REVISION_KEY,
      instruction: "Use mais contraste",
      revisionAssetId: null,
    });

    expect(result).toEqual({ ok: true, value: { output: revision } });
    expect(buildAdapter).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      workItemId: "work-1",
      userId: "user-1",
      parentOutputId: parent.id,
      revisionKey: REVISION_KEY,
      instruction: "Use mais contraste",
      revisionAssetId: null,
      objective: "Matrículas",
    });
    expect(settle).toHaveBeenCalledWith(adapter);
    expect(logLifecycle).toHaveBeenCalledWith(expect.objectContaining({
      event: "creative_work_generation_accepted",
      generationCorrelationId: "generation-revision-1",
      unitCount: 1,
      outputIds: [REVISION_ID],
      result: "accepted",
    }));
  });

  it("maps credit_blocked and dispatch_failed from typed settlement results", async () => {
    settle
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: "credit_blocked",
          reason: "insufficient_credits",
          details: { reason: "insufficient_credits" },
        },
      })
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: "dispatch_failed",
          value: { output: revision },
          compensated: true,
        },
      });

    await expect(
      reviseCreativeWorkOutput({
        workspaceId: "ws-1",
        workItemId: "work-1",
        userId: "user-1",
        outputId: parent.id,
        revisionKey: REVISION_KEY,
        instruction: "Use mais contraste",
        revisionAssetId: null,
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "credit_blocked",
        details: { reason: "insufficient_credits" },
      },
    });
    await expect(
      reviseCreativeWorkOutput({
        workspaceId: "ws-1",
        workItemId: "work-1",
        userId: "user-1",
        outputId: parent.id,
        revisionKey: REVISION_KEY,
        instruction: "Use mais contraste",
        revisionAssetId: null,
      }),
    ).resolves.toEqual({ ok: false, error: { code: "dispatch_failed" } });
  });

  it("maps invalid_revision from the settlement reserve boundary", async () => {
    settle.mockRejectedValue(new InvalidCreativeWorkRevisionError());

    await expect(
      reviseCreativeWorkOutput({
        workspaceId: "ws-1",
        workItemId: "work-1",
        userId: "user-1",
        outputId: parent.id,
        revisionKey: REVISION_KEY,
        instruction: "Troque completamente a oferta",
        revisionAssetId: null,
      }),
    ).resolves.toEqual({ ok: false, error: { code: "invalid_revision" } });
  });

  it("rejects revision of an unfinished output before settlement", async () => {
    getWork.mockResolvedValue({
      work,
      outputs: [{ ...parent, status: "processing", outputKey: null }],
      sources: [],
    });

    await expect(
      reviseCreativeWorkOutput({
        workspaceId: "ws-1",
        workItemId: "work-1",
        userId: "user-1",
        outputId: parent.id,
        revisionKey: REVISION_KEY,
        instruction: "Use mais contraste",
        revisionAssetId: null,
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "output_not_ready" } });
    expect(settle).not.toHaveBeenCalled();
  });

  it("rejects a missing work item before settlement", async () => {
    getWork.mockResolvedValue(null);

    await expect(
      reviseCreativeWorkOutput({
        workspaceId: "ws-1",
        workItemId: "work-1",
        userId: "user-1",
        outputId: parent.id,
        revisionKey: REVISION_KEY,
        instruction: "Use mais contraste",
        revisionAssetId: null,
      }),
    ).resolves.toEqual({ ok: false, error: { code: "work_not_found" } });
    expect(settle).not.toHaveBeenCalled();
  });

  it("freezes a reviewed format change before canonical settlement", async () => {
    const draft = {
      version: 1,
      revision: 2,
      revisionKey: REVISION_KEY,
      action: "format",
      targetFormat: "9:16",
      instruction: "Preserve a pessoa.",
      annotations: [],
      revisionAssetId: null,
    };
    getWork.mockResolvedValue({
      work,
      outputs: [
        {
          ...parent,
          targetFormat: "4:5",
          versionNumber: 1,
          reviewDraft: draft,
        },
      ],
      sources: [],
    });
    const result = await reviseCreativeWorkOutput({
      workspaceId: "ws-1",
      workItemId: "work-1",
      userId: "user-1",
      outputId: parent.id,
      revisionKey: REVISION_KEY,
      reviewRevision: 2,
      expectedCredits: GENERATION_CREDIT_COSTS.creativeWorkOutput,
    });
    expect(result.ok).toBe(true);
    expect(buildAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        parentOutputId: parent.id,
        context: expect.objectContaining({
          sourceOutputId: parent.id,
          targetFormat: "9:16",
          action: "format",
        }),
      }),
    );
    expect(settle).toHaveBeenCalledTimes(1);
  });

  it("rejects a stale reviewed revision and a changed quote without settlement", async () => {
    const draft = {
      version: 1,
      revision: 2,
      revisionKey: REVISION_KEY,
      action: "refine",
      targetFormat: "4:5",
      instruction: "Ajuste fino",
      annotations: [],
      revisionAssetId: null,
    };
    getWork.mockResolvedValue({
      work,
      outputs: [{ ...parent, targetFormat: "4:5", versionNumber: 1, reviewDraft: draft }],
      sources: [],
    });
    await expect(
      reviseCreativeWorkOutput({
        workspaceId: "ws-1",
        workItemId: "work-1",
        userId: "user-1",
        outputId: parent.id,
        revisionKey: REVISION_KEY,
        reviewRevision: 1,
        expectedCredits: GENERATION_CREDIT_COSTS.creativeWorkOutput,
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "stale_review" } });
    await expect(
      reviseCreativeWorkOutput({
        workspaceId: "ws-1",
        workItemId: "work-1",
        userId: "user-1",
        outputId: parent.id,
        revisionKey: REVISION_KEY,
        reviewRevision: 2,
        expectedCredits: GENERATION_CREDIT_COSTS.creativeWorkOutput + 1,
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "quote_changed" } });
    expect(settle).not.toHaveBeenCalled();
  });

  it("replays an existing operation through settlement with frozen context after the draft was edited", async () => {
    const frozenContext = {
      version: 1,
      reviewRevision: 2,
      sourceOutputId: parent.id,
      sourceOutputVersion: 1,
      action: "refine",
      targetFormat: "4:5",
      instruction: "Use mais contraste",
      annotations: [],
      revisionAssetId: null,
    };
    const existing = {
      ...revision,
      operationKey: `revision:${REVISION_KEY}`,
      parentOutputId: parent.id,
      revisionInstruction: "Use mais contraste",
      revisionAssetId: null,
      revisionContext: frozenContext,
    };
    getWork.mockResolvedValue({
      work,
      outputs: [
        {
          ...parent,
          reviewDraft: {
            version: 1,
            revision: 3,
            revisionKey: "00000000-0000-4000-8000-000000000099",
            action: "refine",
            targetFormat: "4:5",
            instruction: "Texto novo",
            annotations: [],
            revisionAssetId: null,
          },
        },
        existing,
      ],
      sources: [],
    });
    settle.mockResolvedValue({ ok: true, value: { output: existing } });
    await expect(
      reviseCreativeWorkOutput({
        workspaceId: "ws-1",
        workItemId: "work-1",
        userId: "user-1",
        outputId: parent.id,
        revisionKey: REVISION_KEY,
        reviewRevision: 2,
        expectedCredits: GENERATION_CREDIT_COSTS.creativeWorkOutput,
      }),
    ).resolves.toEqual({ ok: true, value: { output: existing } });
    // The edited draft is never reinterpreted: the adapter carries the frozen
    // instruction and context stored on the existing row.
    expect(buildAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        parentOutputId: parent.id,
        revisionKey: REVISION_KEY,
        instruction: "Use mais contraste",
        revisionAssetId: null,
        context: expect.objectContaining({
          reviewRevision: 2,
          instruction: "Use mais contraste",
        }),
      }),
    );
    expect(settle).toHaveBeenCalledTimes(1);
  });

  it("surfaces a pending dispatch failure on replay without a second charge", async () => {
    const frozenContext = {
      version: 1,
      reviewRevision: 2,
      sourceOutputId: parent.id,
      sourceOutputVersion: 1,
      action: "refine",
      targetFormat: "4:5",
      instruction: "Use mais contraste",
      annotations: [],
      revisionAssetId: null,
    };
    const existing = {
      ...revision,
      operationKey: `revision:${REVISION_KEY}`,
      parentOutputId: parent.id,
      revisionInstruction: "Use mais contraste",
      revisionAssetId: null,
      revisionContext: frozenContext,
    };
    getWork.mockResolvedValue({
      work,
      outputs: [{ ...parent, reviewDraft: null }, existing],
      sources: [],
    });
    settle.mockResolvedValue({
      ok: false,
      error: {
        code: "dispatch_failed",
        value: { output: existing },
        compensated: true,
      },
    });
    await expect(
      reviseCreativeWorkOutput({
        workspaceId: "ws-1",
        workItemId: "work-1",
        userId: "user-1",
        outputId: parent.id,
        revisionKey: REVISION_KEY,
        reviewRevision: 2,
        expectedCredits: GENERATION_CREDIT_COSTS.creativeWorkOutput,
      }),
    ).resolves.toEqual({ ok: false, error: { code: "dispatch_failed" } });
    expect(settle).toHaveBeenCalledTimes(1);
  });

  it("rejects a replay whose stored context fails validation", async () => {
    const existing = {
      ...revision,
      operationKey: `revision:${REVISION_KEY}`,
      parentOutputId: parent.id,
      revisionInstruction: null,
      revisionAssetId: null,
      revisionContext: { version: 2, bogus: true },
    };
    getWork.mockResolvedValue({
      work,
      outputs: [{ ...parent, reviewDraft: null }, existing],
      sources: [],
    });
    await expect(
      reviseCreativeWorkOutput({
        workspaceId: "ws-1",
        workItemId: "work-1",
        userId: "user-1",
        outputId: parent.id,
        revisionKey: REVISION_KEY,
        reviewRevision: 2,
        expectedCredits: GENERATION_CREDIT_COSTS.creativeWorkOutput,
      }),
    ).resolves.toEqual({ ok: false, error: { code: "invalid_revision" } });
    expect(settle).not.toHaveBeenCalled();
    expect(buildAdapter).not.toHaveBeenCalled();
  });

  it("directs recompose from the originals but constrains adaptation/restyle to edit (plan 04, T2)", async () => {
    const base = {
      workspaceId: "ws-1",
      workItemId: "work-1",
      userId: "user-1",
      outputId: parent.id,
      revisionKey: REVISION_KEY,
      instruction: "Unificar foco",
      revisionAssetId: null,
    };
    await reviseCreativeWorkOutput({ ...base, compositionMode: "recompose", protocolMode: "art_variation" });
    const recomposeInstruction = buildAdapter.mock.calls[0]?.[0].instruction as string;
    expect(recomposeInstruction).toMatch(/^RECOMPOSE from the original briefing/);
    expect(recomposeInstruction).toContain("Unificar foco");

    buildAdapter.mockClear();
    await reviseCreativeWorkOutput({ ...base, compositionMode: "recompose", protocolMode: "format_adaptation" });
    expect(buildAdapter.mock.calls[0]?.[0].instruction).toBe("Unificar foco");
  });
});
