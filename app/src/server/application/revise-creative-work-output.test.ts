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

import { InvalidCreativeWorkRevisionError } from "@/server/generation/settlement-adapters";
import { reviseCreativeWorkOutput } from "./revise-creative-work-output";

const REVISION_KEY = "00000000-0000-4000-8000-000000000101";

const parent = {
  id: "output-v1",
  status: "completed",
  outputKey: "creative-work/output-v1/original.png",
};

const revision = {
  id: "output-v2",
  status: "queued",
  generationCorrelationId: "generation-revision-1",
  parentOutputId: parent.id,
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
      outputIds: ["output-v2"],
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
