import { beforeEach, describe, expect, it, vi } from "vitest";

const getWork = vi.hoisted(() => vi.fn());
const prepare = vi.hoisted(() => vi.fn());
const snapshot = vi.hoisted(() => vi.fn());
const confirm = vi.hoisted(() => vi.fn());
const confirmSnapshots = vi.hoisted(() => vi.fn());
const setLegacySnapshot = vi.hoisted(() => vi.fn());
const getSourceAssets = vi.hoisted(() => vi.fn());
const reservePreparedOutputs = vi.hoisted(() => vi.fn());
const reserveGenerationOutputs = vi.hoisted(() => vi.fn());
const charge = vi.hoisted(() => vi.fn());
const createOutputs = vi.hoisted(() => vi.fn());
const deleteOutputs = vi.hoisted(() => vi.fn());
const setStatus = vi.hoisted(() => vi.fn());
const failOutput = vi.hoisted(() => vi.fn());
const failQueuedOutput = vi.hoisted(() => vi.fn());
const refreshStatus = vi.hoisted(() => vi.fn());
const send = vi.hoisted(() => vi.fn());
const refund = vi.hoisted(() => vi.fn());
const getUsage = vi.hoisted(() => vi.fn());
const trackUsage = vi.hoisted(() => vi.fn());
const getBrandKitMock = vi.hoisted(() => vi.fn());
const logLifecycleMock = vi.hoisted(() => vi.fn());
const loadCandidateMock = vi.hoisted(() => vi.fn());
const envState = vi.hoisted(() => ({ brandCortexSinglePieceEnabled: "false" }));

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: getWork,
  confirmCreativeWorkIdentity: confirm,
  confirmCreativeWorkSnapshotsIfUnchanged: confirmSnapshots,
  setCreativeWorkInputSnapshotIfMissing: setLegacySnapshot,
  getCreativeWorkSourceAssetDetails: getSourceAssets,
  reservePreparedCreativeWorkOutputsIfCurrent: reservePreparedOutputs,
  reserveCreativeWorkGenerationOutputs: reserveGenerationOutputs,
  withCreativeWorkPreparationLock: vi.fn(async (_ws, _id, callback) => callback({})),
  createPlannedCreativeWorkOutputs: createOutputs,
  deleteQueuedCreativeWorkOutputs: deleteOutputs,
  setCreativeWorkStatus: setStatus,
  failCreativeWorkOutput: failOutput,
  failQueuedCreativeWorkOutput: failQueuedOutput,
  refreshCreativeWorkStatus: refreshStatus,
}));
vi.mock("@/server/repositories/brand-kit", () => ({ getBrandKit: getBrandKitMock }));
vi.mock("./prepare-creative-work", () => ({ prepareCreativeWork: prepare }));
vi.mock("@/server/creative-work/identity", () => ({
  createIdentitySnapshot: snapshot,
}));
vi.mock("@/server/repositories/brand-training-sessions", () => ({
  loadCalibrationCandidateForWork: loadCandidateMock,
}));
vi.mock("@/server/generation/canonical/charge", () => ({ chargeForGenerationBatch: charge }));
vi.mock("@/server/billing/paywall", () => ({ spend: vi.fn() }));
vi.mock("@/server/jobs/client", () => ({ inngest: { send } }));
vi.mock("@/server/billing/credits", () => ({ refundCredits: refund }));
vi.mock("@/server/repositories/usage", () => ({
  getUsageByIdempotencyKey: getUsage,
  getUsageByIdempotencyKeys: async (workspaceId: string, keys: string[]) => new Map(await Promise.all(keys.map(async (key) => [key, await getUsage(workspaceId, key)] as const))),
  trackUsage,
}));
vi.mock("@/server/creative-work/job-telemetry", () => ({
  logCreativeWorkGenerationLifecycle: (...args: unknown[]) => logLifecycleMock(...args),
}));
vi.mock("@/server/validation/env", () => ({
  env: {
    get BRAND_CORTEX_SINGLE_PIECE_ENABLED() {
      return envState.brandCortexSinglePieceEnabled;
    },
  },
}));

import { generateCreativeWork as generateCommand } from "./generate-creative-work";

const work = {
  id: "work-1", workspaceId: "ws-1", clientProfileId: "profile-1", createdByUserId: "user-1",
  toolKind: "variations", status: "draft", request: "latest", format: "4:5",
  settings: { targetFormats: [] }, brief: null, copy: null, inputSnapshot: null, identitySnapshot: null,
  updatedAt: new Date("2026-07-16T12:00:00.000Z"),
};
const preparedWork = {
  ...work,
  brief: { theme: "Tema", objective: "Objetivo", audience: "Público", offer: "Oferta" },
  copy: { headline: "H", body: "B", cta: "C" },
  inputSnapshot: { request: "latest", settings: { targetFormats: [] }, sources: [{ sourceId: "source-1", usage: "content", content: { subject: "x" } }] },
};
const identitySnapshot = { clientProfileId: "profile-1", confirmedAt: "now", assets: [], brandKit: { colors: [], fonts: [], toneOfVoice: null, requiredElements: null, prohibitedElements: null } };
const rows = ["a", "b", "c"].map((id, index) => ({ id, creativeLevel: ["conservative", "balanced", "bold"][index], targetFormat: "4:5", status: "queued" }));
const generateCreativeWork = (input: Omit<Parameters<typeof generateCommand>[0], "preparedRevision">) => generateCommand({ ...input, preparedRevision: "2026-07-16T12:00:00.000Z" });

describe("generateCreativeWork", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envState.brandCortexSinglePieceEnabled = "false";
    getWork.mockResolvedValue({ work: preparedWork, outputs: [], sources: [] });
    prepare.mockResolvedValue({ ok: true, value: { work: preparedWork, quote: { plans: [], unitCount: 0, credits: 0 } } });
    snapshot.mockResolvedValue(identitySnapshot);
    confirm.mockResolvedValue({ ...preparedWork, status: "ready", identitySnapshot });
    confirmSnapshots.mockResolvedValue({ ...preparedWork, status: "ready", identitySnapshot });
    setLegacySnapshot.mockImplementation(async (_ws, _id, inputSnapshot) => ({ ...preparedWork, status: "ready", identitySnapshot, inputSnapshot }));
    getSourceAssets.mockResolvedValue(new Map());
    reservePreparedOutputs.mockResolvedValue({
      work: { ...preparedWork, status: "ready", identitySnapshot },
      outputs: rows,
      newlyCreatedIds: rows.map((row) => row.id),
    });
    charge.mockResolvedValue({ ok: true, creditsSpent: 15 });
    createOutputs.mockResolvedValue({ outputs: rows, newlyCreatedIds: rows.map((row) => row.id) });
    reserveGenerationOutputs.mockImplementation(async (input) => {
      const created = await createOutputs("ws-1", "work-1", input.plans);
      return { work: { ...preparedWork, status: "ready", identitySnapshot }, ...created };
    });
    send.mockResolvedValue(undefined);
    setStatus.mockResolvedValue({ ...preparedWork, status: "generating", identitySnapshot });
    failOutput.mockResolvedValue(null);
    failQueuedOutput.mockImplementation(async (_ws, _work, outputId) => ({ ...rows.find((row) => row.id === outputId), status: "failed", failureCode: "dispatch_failed" }));
    refreshStatus.mockResolvedValue("failed");
    refund.mockResolvedValue({ status: "refunded" });
    getUsage.mockResolvedValue(null);
    trackUsage.mockResolvedValue({ id: "dispatch-ack" });
    getBrandKitMock.mockResolvedValue({ name: "Cenbrap", requiredElements: null, prohibitedElements: null });
  });

  it("prepares, snapshots the ranked top three, charges the quote, and dispatches only IDs", async () => {
    const result = await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });
    expect(result.ok).toBe(true);
    // brief + format travel with the snapshot so the ranked fallback (#178)
    // can answer the request instead of taking rows in insertion order.
    expect(snapshot).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      selectedReferenceIds: [],
      brief: preparedWork.brief,
      format: preparedWork.format,
      includePublishedBrandKnowledge: false,
    });
    expect(reserveGenerationOutputs).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "ws-1", workItemId: "work-1", identitySnapshot,
    }));
    expect(charge).toHaveBeenCalledWith(expect.objectContaining({ unitCount: 3, chargeAmount: 150, unitChargeAmount: 50, billingKey: "creative-work:work-1:initial" }), expect.anything());
    expect(reserveGenerationOutputs).toHaveBeenCalledWith(expect.objectContaining({ plans: [
      { creativeLevel: "conservative", targetFormat: "4:5", versionNumber: 1 },
      { creativeLevel: "balanced", targetFormat: "4:5", versionNumber: 1 },
      { creativeLevel: "bold", targetFormat: "4:5", versionNumber: 1 },
    ] }));
    expect(send).toHaveBeenCalledWith(rows.map((row) => ({
      id: `creative-work-generate:${row.id}`,
      name: "creative-work.generate",
      data: { workspaceId: "ws-1", workItemId: "work-1", outputId: row.id },
    })));
    expect(logLifecycleMock).toHaveBeenCalledWith(expect.objectContaining({
      event: "creative_work_generation_accepted",
      unitCount: 3,
      outputIds: ["a", "b", "c"],
      credits: 150,
      result: "accepted",
    }));
  });

  it("carries the persisted generation correlation into every dispatch payload", async () => {
    const generationCorrelationId = "generation-correlation-1";
    const correlatedWork = { ...preparedWork, generationCorrelationId };
    const correlatedPreparedWork = { ...preparedWork, generationCorrelationId };
    const correlatedRows = rows.map((row) => ({ ...row, generationCorrelationId }));
    getWork.mockResolvedValue({ work: correlatedWork, outputs: [], sources: [] });
    confirmSnapshots.mockResolvedValue({ ...correlatedPreparedWork, status: "ready", identitySnapshot });
    createOutputs.mockResolvedValue({ outputs: correlatedRows, newlyCreatedIds: correlatedRows.map((row) => row.id) });
    reserveGenerationOutputs.mockResolvedValue({
      work: { ...correlatedPreparedWork, status: "ready", identitySnapshot },
      outputs: correlatedRows,
      newlyCreatedIds: correlatedRows.map((row) => row.id),
    });

    await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });

    expect(send).toHaveBeenCalledWith(correlatedRows.map((row) => ({
      id: `creative-work-generate:${row.id}`,
      name: "creative-work.generate",
      data: {
        workspaceId: "ws-1",
        workItemId: "work-1",
        outputId: row.id,
        generationCorrelationId,
      },
    })));
  });

  it("allows Brand-Kit-only generation and returns a non-blocking suggestion", async () => {
    const result = await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });
    expect(result).toMatchObject({ ok: true, value: { brandTrainingSuggestion: expect.any(String) } });
    expect(snapshot).toHaveBeenCalledWith(expect.objectContaining({ selectedReferenceIds: [] }));
  });

  it("preserves the public credit-blocked details at the application boundary", async () => {
    const blocked = {
      ok: false,
      status: 402,
      conversionPayload: { reason: "insufficient_credits" },
    } as const;
    charge.mockResolvedValue(blocked);

    const result = await generateCreativeWork({
      workspaceId: "ws-1",
      workItemId: "work-1",
      userId: "user-1",
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "credit_blocked", details: blocked },
    });
  });

  it("returns persisted rows without new spend or dispatch on repeated HTTP confirmation", async () => {
    getWork.mockResolvedValue({ work: { ...preparedWork, status: "generating", identitySnapshot }, outputs: rows, sources: [] });
    const result = await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });
    expect(result).toMatchObject({ ok: true, value: { outputs: rows, billingKey: "creative-work:work-1:initial" } });
    expect(charge).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("charges fifty credits for one single output", async () => {
    getWork.mockResolvedValue({ work: { ...preparedWork, toolKind: "single" }, outputs: [], sources: [] });
    createOutputs.mockResolvedValue({ outputs: [rows[1]], newlyCreatedIds: [rows[1].id] });
    await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });
    expect(charge).toHaveBeenCalledWith(expect.objectContaining({ unitCount: 1, chargeAmount: 50 }), expect.anything());
  });

  it("enables published Brand Cortex snapshots only for Peça única behind the rollout switch", async () => {
    envState.brandCortexSinglePieceEnabled = "true";
    getWork.mockResolvedValue({ work: { ...preparedWork, toolKind: "single" }, outputs: [], sources: [] });
    createOutputs.mockResolvedValue({ outputs: [rows[1]], newlyCreatedIds: [rows[1].id] });

    await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });

    expect(snapshot).toHaveBeenCalledWith(expect.objectContaining({
      includePublishedBrandKnowledge: true,
    }));
  });

  it("keeps other protocols outside the Brand Cortex rollout", async () => {
    envState.brandCortexSinglePieceEnabled = "true";

    await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });

    expect(snapshot).toHaveBeenCalledWith(expect.objectContaining({
      includePublishedBrandKnowledge: false,
    }));
  });

  it("does not grant Brand Cortex to restyle and snapshots the work brand", async () => {
    envState.brandCortexSinglePieceEnabled = "true";
    getWork.mockResolvedValue({
      work: { ...preparedWork, toolKind: "restyle" },
      outputs: [],
      sources: [],
    });
    createOutputs.mockResolvedValue({ outputs: [rows[1]], newlyCreatedIds: [rows[1].id] });

    await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });

    expect(snapshot).toHaveBeenCalledWith(expect.objectContaining({
      clientProfileId: "profile-1",
      includePublishedBrandKnowledge: false,
    }));
  });

  it("never replaces a frozen restyle snapshot after a later Brand Cortex flip", async () => {
    envState.brandCortexSinglePieceEnabled = "true";
    getWork.mockResolvedValue({
      work: { ...preparedWork, toolKind: "restyle", status: "ready", identitySnapshot },
      outputs: [],
      sources: [],
    });
    createOutputs.mockResolvedValue({ outputs: [rows[1]], newlyCreatedIds: [rows[1].id] });

    await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });

    expect(snapshot).not.toHaveBeenCalled();
    expect(confirmSnapshots).not.toHaveBeenCalled();
  });

  it("never replaces a frozen snapshot on an already confirmed Peça única", async () => {
    envState.brandCortexSinglePieceEnabled = "true";
    const frozen = {
      ...identitySnapshot,
      brandKnowledge: {
        mode: "published",
        versionId: "version-1",
        versionNumber: 1,
        versionHash: "a".repeat(64),
        compiledAt: "2026-08-13T12:00:00.000Z",
        claims: [],
      },
    };
    getWork.mockResolvedValue({
      work: { ...preparedWork, toolKind: "single", status: "ready", identitySnapshot: frozen },
      outputs: [],
      sources: [],
    });
    createOutputs.mockResolvedValue({ outputs: [rows[1]], newlyCreatedIds: [rows[1].id] });

    await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });

    expect(snapshot).not.toHaveBeenCalled();
    expect(confirmSnapshots).not.toHaveBeenCalled();
  });

  it("creates exactly one output per target format when the adaptation settings repeat a format", async () => {
    const adaptationSettings = { targetFormats: ["1:1", "9:16", "1:1"] as Array<"1:1" | "9:16"> };
    getWork.mockResolvedValue({
      work: { ...preparedWork, toolKind: "format_adaptation", settings: adaptationSettings },
      outputs: [],
      sources: [],
    });
    const formatRows = [
      { id: "f1", creativeLevel: "balanced", targetFormat: "1:1", status: "queued" },
      { id: "f2", creativeLevel: "balanced", targetFormat: "9:16", status: "queued" },
    ];
    createOutputs.mockResolvedValue({ outputs: formatRows, newlyCreatedIds: formatRows.map((row) => row.id) });

    await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });

    expect(reserveGenerationOutputs).toHaveBeenCalledWith(expect.objectContaining({ plans: [
      { creativeLevel: "balanced", targetFormat: "1:1", versionNumber: 1 },
      { creativeLevel: "balanced", targetFormat: "9:16", versionNumber: 1 },
    ] }));
    expect(charge).toHaveBeenCalledWith(expect.objectContaining({ unitCount: 2, chargeAmount: 100 }), expect.anything());
  });

  it("creates one output per selected direction when a direction pool is present", async () => {
    const directionPool = {
      version: 1,
      directions: [
        { id: "00000000-0000-4000-8000-0000000000d1", label: "A", instruction: "A instruction", order: 0, safetyBand: "safe" as const, provenance: "manual" as const },
        { id: "00000000-0000-4000-8000-0000000000d2", label: "B", instruction: "B instruction", order: 1, safetyBand: "experimental" as const, provenance: "ai-suggestion" as const },
      ],
      selectedIds: ["00000000-0000-4000-8000-0000000000d2"],
      manualInstruction: "Global instruction",
    };
    const settings = { targetFormats: [], directionPool };
    const directionRows = [
      { id: "dir-1", creativeLevel: "balanced", targetFormat: "4:5", status: "queued", directionId: "00000000-0000-4000-8000-0000000000d2", directionSnapshot: { label: "B", instruction: "B instruction", order: 1 } },
    ];
    getWork.mockResolvedValue({ work: { ...preparedWork, settings }, outputs: [], sources: [] });
    createOutputs.mockResolvedValue({ outputs: directionRows, newlyCreatedIds: directionRows.map((row) => row.id) });

    await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });

    expect(reserveGenerationOutputs).toHaveBeenCalledWith(expect.objectContaining({ plans: [
      {
        creativeLevel: "balanced",
        targetFormat: "4:5",
        versionNumber: 1,
        directionId: "00000000-0000-4000-8000-0000000000d2",
        directionSnapshot: { label: "B", instruction: "B instruction", order: 1, safetyBand: "experimental" },
      },
    ] }));
    expect(charge).toHaveBeenCalledWith(expect.objectContaining({ unitCount: 1, chargeAmount: 50 }), expect.anything());
  });

  it("fails newly-created rows and refunds the exact quote when dispatch fails", async () => {
    send.mockRejectedValue(new Error("transport down"));
    const result = await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });
    expect(result).toMatchObject({ ok: false, error: { code: "dispatch_failed" } });
    expect(failQueuedOutput).toHaveBeenCalledTimes(3);
    expect(refreshStatus).toHaveBeenCalledWith("ws-1", "work-1");
    expect(refund).toHaveBeenCalledTimes(3);
    expect(refund).toHaveBeenCalledWith(expect.objectContaining({ amount: 50, idempotencyKey: "creative-work:work-1:output:a:dispatch-refund" }));
  });

  it("resumes a frozen ready work after a previously blocked charge", async () => {
    getWork.mockResolvedValue({ work: { ...preparedWork, status: "ready", identitySnapshot }, outputs: [], sources: [] });
    const result = await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });
    expect(result.ok).toBe(true);
    expect(prepare).not.toHaveBeenCalled();
    expect(snapshot).not.toHaveBeenCalled();
    expect(charge).toHaveBeenCalledOnce();
  });

  it("rejects an old prepared revision for a ready retry before settlement", async () => {
    getWork.mockResolvedValue({
      work: { ...preparedWork, status: "ready", identitySnapshot, updatedAt: new Date("2026-07-16T12:01:00.000Z") },
      outputs: [],
      sources: [],
    });

    const result = await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });

    expect(result).toMatchObject({ ok: false, error: { code: "stale_input" } });
    expect(snapshot).not.toHaveBeenCalled();
    expect(charge).not.toHaveBeenCalled();
    expect(createOutputs).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects an expired pinned commercial offer before settlement", async () => {
    getWork.mockResolvedValue({
      work: {
        ...preparedWork,
        inputSnapshot: {
          ...preparedWork.inputSnapshot,
          commercialOffer: {
            offerId: "offer-1",
            version: 1,
            product: "Pós",
            offer: "turma",
            price: "R$ 497",
            validFrom: "2026-01-01T00:00:00.000Z",
            validUntil: "2026-02-01T00:00:00.000Z",
          },
        },
      },
      outputs: [],
      sources: [],
    });

    const result = await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });

    expect(result).toMatchObject({ ok: false, error: { code: "offer_expired" } });
    expect(charge).not.toHaveBeenCalled();
    expect(createOutputs).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("revalidates a ready retry under the reservation lock when an edit reopens it", async () => {
    const ready = { ...preparedWork, status: "ready" as const, identitySnapshot };
    getWork.mockResolvedValueOnce({ work: ready, outputs: [], sources: [] });
    reserveGenerationOutputs.mockResolvedValueOnce(null);

    const result = await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });

    expect(result).toMatchObject({ ok: false, error: { code: "stale_input" } });
    expect(charge).not.toHaveBeenCalled();
    expect(createOutputs).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("does not freeze a stale prepared snapshot after concurrent autosave", async () => {
    reserveGenerationOutputs.mockResolvedValueOnce(null);
    const result = await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });
    expect(result).toMatchObject({ ok: false, error: { code: "stale_input" } });
    expect(charge).not.toHaveBeenCalled();
  });

  it("does not accept or charge a prepared revision invalidated by a source mutation", async () => {
    // Source writers clear all prepared fields on the draft. The old revision
    // must therefore fail before identity confirmation or billing.
    getWork.mockResolvedValue({
      work: { ...preparedWork, brief: null, copy: null, inputSnapshot: null },
      outputs: [],
      sources: [],
    });

    const result = await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });

    expect(result).toMatchObject({ ok: false, error: { code: "work_not_prepared" } });
    expect(snapshot).not.toHaveBeenCalled();
    expect(charge).not.toHaveBeenCalled();
  });

  it("keeps legacy ready work compatible by rebuilding only its missing input snapshot", async () => {
    getWork.mockResolvedValue({ work: { ...preparedWork, status: "ready", identitySnapshot, inputSnapshot: null }, outputs: [], sources: [] });
    const result = await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });
    expect(result.ok).toBe(true);
    expect(reserveGenerationOutputs).toHaveBeenCalledWith(expect.objectContaining({ legacyInputSnapshot: expect.objectContaining({
      request: "latest",
      sources: [],
      factPack: expect.objectContaining({ version: 1, request: "latest" }),
    }) }));
    expect(confirmSnapshots).not.toHaveBeenCalled();
    // Rebuilding the missing block never duplicates the charge.
    expect(charge).toHaveBeenCalledOnce();
  });

  it("refunds the full batch after a synchronous partial dispatch failure", async () => {
    send.mockRejectedValue(new Error("partial"));
    failQueuedOutput.mockImplementation(async (_ws, _work, outputId) => outputId === "a" ? null : ({ id: outputId, status: "failed", failureCode: "dispatch_failed" }));
    await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });
    expect(refund).toHaveBeenCalledTimes(3);
    expect(refund).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "creative-work:work-1:output:a:dispatch-refund",
      }),
    );
  });

  it("retries an idempotent dispatch refund before early-returning persisted rows", async () => {
    const failed = [{ ...rows[0], status: "failed", failureCode: "dispatch_failed" }];
    getWork.mockResolvedValue({ work: { ...preparedWork, status: "failed", identitySnapshot }, outputs: failed, sources: [] });
    refund.mockRejectedValueOnce(new Error("billing unavailable")).mockResolvedValueOnce({ status: "refunded" });
    const first = await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });
    const second = await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });
    expect(first).toMatchObject({ ok: false, error: { code: "dispatch_failed" } });
    expect(second).toMatchObject({ ok: true, value: { outputs: failed } });
    expect(refund).toHaveBeenCalledTimes(2);
  });

  it("refuses generic generation for calibration-owned works", async () => {
    getWork.mockResolvedValue({
      work: { ...preparedWork, toolKind: "single", trainingSessionId: "session-1", trainingRound: 1, trainingSlot: 0 },
      outputs: [],
      sources: [],
    });
    loadCandidateMock.mockResolvedValue(null);
    const result = await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });
    expect(result).toMatchObject({ ok: false, error: { code: "calibration_managed" } });
    expect(snapshot).not.toHaveBeenCalled();
    expect(reserveGenerationOutputs).not.toHaveBeenCalled();
  });

  it("reserves the frozen candidate identity for calibration works", async () => {
    getWork.mockResolvedValue({
      work: { ...preparedWork, toolKind: "single", trainingSessionId: "session-1", trainingRound: 1, trainingSlot: 2 },
      outputs: [],
      sources: [],
    });
    const claim = {
      id: "claim-1",
      claimKey: "palette.colors",
      kind: "fact",
      value: ["#BEEF00"],
      scope: { level: "global" },
      authority: "explicit",
      confidence: "high",
      evidenceRefs: [],
      reviewedAt: "2026-09-13T12:00:00.000Z",
      reviewedByUserId: "user-1",
    };
    loadCandidateMock.mockResolvedValue({
      hash: "d".repeat(64),
      knowledge: {
        schemaVersion: 1,
        profileId: "profile-1",
        compiledAt: "2026-09-13T12:00:00.000Z",
        claims: [claim, { ...claim, id: "claim-2", scope: { level: "global", format: "1:1" } }],
        excluded: [],
      },
      identity: {
        clientProfileId: "profile-1",
        confirmedAt: "2026-09-13T12:00:00.000Z",
        assets: [{ referenceId: "ref-1", assetKey: "k", label: "L", category: "logo", usageMode: "exact" }],
        brandKit: { colors: ["#BEEF00"], fonts: [], toneOfVoice: null, prohibitedElements: null, requiredElements: null },
      },
      evidenceHashes: {},
    });
    const result = await generateCreativeWork({
      workspaceId: "ws-1",
      workItemId: "work-1",
      userId: "user-1",
      calibration: { sessionId: "session-1", round: 1, slot: 2 },
    });
    expect(result.ok).toBe(true);
    // The live identity is never reloaded for a calibration reservation.
    expect(snapshot).not.toHaveBeenCalled();
    expect(reserveGenerationOutputs).toHaveBeenCalledWith(expect.objectContaining({
      identitySnapshot: expect.objectContaining({
        confirmedAt: "2026-09-13T12:00:00.000Z",
        brandKnowledge: expect.objectContaining({
          mode: "published",
          versionHash: "d".repeat(64),
          claims: [expect.objectContaining({ id: "claim-1" })],
        }),
      }),
    }));
  });
});
