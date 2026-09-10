import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET, PATCH, POST } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

const activePreparationMock = vi.hoisted(() => vi.fn<() => Promise<{ id: string; inputFingerprint?: string } | null>>(async () => null));
vi.mock("@/server/repositories/creative-work-preparation", () => ({
  getActivePreparationAttempt: activePreparationMock,
}));

const requirePlatformOwnerMock = vi.hoisted(() => vi.fn());
const isPlatformOwnerEmailMock = vi.hoisted(() => vi.fn());
const requestLayerizationMock = vi.hoisted(() => vi.fn());
const callbackHandlerMock = vi.hoisted(() => vi.fn());
const recoverExpiredLayerizationsMock = vi.hoisted(() => vi.fn());
const layerEditorAccessMock = vi.hoisted(() => vi.fn());
const requestRegenerationMock = vi.hoisted(() => vi.fn());
const acceptCandidateCommandMock = vi.hoisted(() => vi.fn());
const discardCandidateCommandMock = vi.hoisted(() => vi.fn());
const publishLayerEditorMock = vi.hoisted(() => vi.fn());
const openLayerEditorMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/require-platform-owner", () => ({
  requirePlatformOwner: (...args: unknown[]) => requirePlatformOwnerMock(...args),
}));
vi.mock("@/server/auth/platform-owner", () => ({
  isPlatformOwnerEmail: (...args: unknown[]) => isPlatformOwnerEmailMock(...args),
}));
vi.mock("@/server/application/request-creative-work-layerization", () => ({
  requestCreativeWorkLayerization: (...args: unknown[]) => requestLayerizationMock(...args),
}));
vi.mock("@/server/application/handle-creative-work-layerization-callback", () => ({
  handleCreativeWorkLayerizationCallback: (...args: unknown[]) => callbackHandlerMock(...args),
}));
vi.mock("@/server/application/recover-expired-creative-work-layerizations", () => ({
  recoverExpiredCreativeWorkLayerizations: (...args: unknown[]) => recoverExpiredLayerizationsMock(...args),
}));
vi.mock("@/server/layer-editor/quota", () => ({
  getLayerEditorAccess: (...args: unknown[]) => layerEditorAccessMock(...args),
}));
vi.mock("@/server/application/request-creative-work-layer-regeneration", () => ({
  requestCreativeWorkLayerRegeneration: (...args: unknown[]) => requestRegenerationMock(...args),
}));
vi.mock("@/server/application/manage-creative-work-layer-editor", () => ({
  openCreativeWorkLayerEditor: (...args: unknown[]) => openLayerEditorMock(...args),
  acceptCreativeWorkLayerRegenerationCandidate: (...args: unknown[]) => acceptCandidateCommandMock(...args),
  discardCreativeWorkLayerRegenerationCandidate: (...args: unknown[]) => discardCandidateCommandMock(...args),
  heartbeatCreativeWorkLayerEditor: vi.fn(),
  saveCreativeWorkLayerEditor: vi.fn(),
  releaseCreativeWorkLayerEditor: vi.fn(),
}));
vi.mock("@/server/application/publish-creative-work-layer-editor", () => ({
  publishCreativeWorkLayerEditor: (...args: unknown[]) => publishLayerEditorMock(...args),
}));

const getWorkMock = vi.hoisted(() => vi.fn());
const failStaleOutputsMock = vi.hoisted(() => vi.fn());
const failStaleSourcesMock = vi.hoisted(() => vi.fn());
const refreshStatusMock = vi.hoisted(() => vi.fn());
const confirmMock = vi.hoisted(() => vi.fn());
const updateDraftMock = vi.hoisted(() => vi.fn());
const updateDraftCasMock = vi.hoisted(() => vi.fn());
const autosaveDraftMock = vi.hoisted(() => vi.fn());
const prepareMock = vi.hoisted(() => vi.fn());
const detectDraftConflictMock = vi.hoisted(() => vi.fn());
const createSourceMock = vi.hoisted(() => vi.fn());
const updateSourceMock = vi.hoisted(() => vi.fn());
const updateSourceCasMock = vi.hoisted(() => vi.fn());
const mutatePieceReferenceMock = vi.hoisted(() => vi.fn());
const mutateDraftSourceMock = vi.hoisted(() => vi.fn());
const deleteSourceMock = vi.hoisted(() => vi.fn());
const linkCampaignMock = vi.hoisted(() => vi.fn());
const getAssetMock = vi.hoisted(() => vi.fn());
const getTemplateMock = vi.hoisted(() => vi.fn());
const claimPieceTrainingReferenceMock = vi.hoisted(() => vi.fn());
const getTrainingReferenceMock = vi.hoisted(() => vi.fn());
const createTrainingReferenceMock = vi.hoisted(() => vi.fn());
const deleteTrainingReferenceMock = vi.hoisted(() => vi.fn());
const analyzeSourceMock = vi.hoisted(() => vi.fn());
const inngestSendMock = vi.hoisted(() => vi.fn());
const terminalTelemetryMock = vi.hoisted(() => vi.fn());
const aggregateTelemetryMock = vi.hoisted(() => vi.fn());
const recordAggregateMock = vi.hoisted(() => vi.fn());
const listPendingRefundsMock = vi.hoisted(() => vi.fn());
const markOutputFailureCodeMock = vi.hoisted(() => vi.fn());
const clearObjectiveQualityMarkerMock = vi.hoisted(() => vi.fn());
const refundCreditsMock = vi.hoisted(() => vi.fn());
const resolveReactivationMock = vi.hoisted(() => vi.fn());
const getUsageByIdempotencyKeyMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: (...args: unknown[]) => getWorkMock(...args),
  failStaleCreativeWorkOutputs: (...args: unknown[]) => failStaleOutputsMock(...args),
  failStaleQueuedCreativeWorkOutputs: (...args: unknown[]) => failStaleOutputsMock(...args),
  failStaleProcessingCreativeWorkOutputs: (...args: unknown[]) => failStaleOutputsMock(...args),
  failStaleCreativeWorkSources: (...args: unknown[]) => failStaleSourcesMock(...args),
  listCreativeWorkOutputsNeedingRefund: (...args: unknown[]) => listPendingRefundsMock(...args),
  markCreativeWorkOutputFailureCode: (...args: unknown[]) => markOutputFailureCodeMock(...args),
  clearCreativeWorkOutputObjectiveQualityRefundPending: (...args: unknown[]) =>
    clearObjectiveQualityMarkerMock(...args),
  CREATIVE_WORK_OBJECTIVE_QUALITY_REFUND_PENDING: "objective_quality_failed_refund_pending",
  recordCreativeWorkGenerationAggregate: (...args: unknown[]) => recordAggregateMock(...args),
  refreshCreativeWorkStatus: (...args: unknown[]) => refreshStatusMock(...args),
  updateCreativeWorkDraft: (...args: unknown[]) => updateDraftMock(...args),
  updateCreativeWorkDraftIfUnchanged: (...args: unknown[]) => updateDraftCasMock(...args),
  autosaveCreativeWorkDraft: (...args: unknown[]) => autosaveDraftMock(...args),
  createCreativeWorkSource: (...args: unknown[]) => createSourceMock(...args),
  claimCreativeWorkPieceTrainingReference: (...args: unknown[]) => claimPieceTrainingReferenceMock(...args),
  promoteCreativeWorkPieceReference: (...args: unknown[]) => claimPieceTrainingReferenceMock(...args),
  updateCreativeWorkSource: (...args: unknown[]) => updateSourceMock(...args),
  updateCreativeWorkSourceIfUnchanged: (...args: unknown[]) => updateSourceCasMock(...args),
  mutateCreativeWorkPieceReference: (...args: unknown[]) => mutatePieceReferenceMock(...args),
  mutateCreativeWorkDraftSource: (...args: unknown[]) => mutateDraftSourceMock(...args),
  isCreativeWorkRevisionConflict: (error: unknown) => error instanceof Error && (error as Error & { code?: unknown }).code === "stale_input",
  deleteCreativeWorkSource: (...args: unknown[]) => deleteSourceMock(...args),
  linkCreativeWorkCampaign: (...args: unknown[]) => linkCampaignMock(...args),
}));

const listCurrentCarouselSlidesMock = vi.hoisted(() => vi.fn());
vi.mock("@/server/repositories/creative-work-carousel", () => ({
  listCurrentCarouselSlides: (...args: unknown[]) => listCurrentCarouselSlidesMock(...args),
}));

vi.mock("@/server/billing/credits", () => ({
  refundCredits: (...args: unknown[]) => refundCreditsMock(...args),
  canSpend: vi.fn(),
  recordUsage: vi.fn(),
}));
vi.mock("@/server/repositories/usage", () => ({
  getUsageByIdempotencyKey: (...args: unknown[]) => getUsageByIdempotencyKeyMock(...args),
}));
vi.mock("@/server/generation/settlement-adapters", () => ({
  resolveCreativeWorkOutputReactivationOutcome: (...args: unknown[]) => resolveReactivationMock(...args),
}));

vi.mock("@/server/repositories/workspace-asset", () => ({
  getWorkspaceAssetById: (...args: unknown[]) => getAssetMock(...args),
}));
vi.mock("@/server/repositories/template", () => ({ getTemplateById: (...args: unknown[]) => getTemplateMock(...args) }));
vi.mock("@/server/repositories/client-reference", () => ({
  getTrainingReferenceByAssetKey: (...args: unknown[]) => getTrainingReferenceMock(...args),
  createTrainingReference: (...args: unknown[]) => createTrainingReferenceMock(...args),
  deleteTrainingReference: (...args: unknown[]) => deleteTrainingReferenceMock(...args),
}));
vi.mock("@/server/application/analyze-creative-work-source", () => ({ analyzeCreativeWorkSource: (...args: unknown[]) => analyzeSourceMock(...args) }));
vi.mock("@/server/jobs/client", () => ({ inngest: { send: (...args: unknown[]) => inngestSendMock(...args) } }));
vi.mock("@/server/creative-work/job-telemetry", () => ({
  logCreativeWorkGenerationAggregate: (...args: unknown[]) => aggregateTelemetryMock(...args),
  logCreativeWorkOutputTerminal: (...args: unknown[]) => terminalTelemetryMock(...args),
}));

vi.mock("@/server/application/confirm-social-post-work", () => ({
  confirmSocialPostWork: (...args: unknown[]) => confirmMock(...args),
}));
vi.mock("@/server/application/prepare-creative-work", () => ({
  prepareCreativeWork: (...args: unknown[]) => prepareMock(...args),
  detectCreativeWorkDraftBrandConflict: (...args: unknown[]) => detectDraftConflictMock(...args),
}));

const saveOfferMock = vi.hoisted(() => vi.fn());
vi.mock("@/server/application/save-commercial-offer", () => ({
  saveCommercialOfferFromWork: (...args: unknown[]) => saveOfferMock(...args),
}));

const prepareCarouselMock = vi.hoisted(() => vi.fn());
vi.mock("@/server/application/prepare-carousel-work", () => ({
  prepareCarouselWork: (...args: unknown[]) => prepareCarouselMock(...args),
}));

const approveCarouselDeckMock = vi.hoisted(() => vi.fn());
vi.mock("@/server/application/export-carousel-work", () => ({
  approveCarouselDeck: (...args: unknown[]) => approveCarouselDeckMock(...args),
}));

const refundHelperMock = vi.hoisted(() => vi.fn());
vi.mock("@/server/application/refund-creative-work-output", () => ({
  refundCreativeWorkOutputCompensatory: (...args: unknown[]) =>
    refundHelperMock(...args),
}));

const saveOutputReviewMock = vi.hoisted(() => vi.fn());
vi.mock("@/server/application/save-creative-work-output-review", () => ({
  saveCreativeWorkOutputReview: (...args: unknown[]) =>
    saveOutputReviewMock(...args),
}));

function makeParams(id: string) {
  return Promise.resolve({ id });
}

function requestPatch(body: unknown) {
  const action = typeof body === "object" && body !== null && "action" in body
    ? (body as { action?: unknown }).action
    : null;
  const requiresRevision = new Set([
    "autosave", "attachSource", "updateSource", "retrySource", "removeSource",
    "updatePieceReference", "replacePieceReference", "promotePieceReference", "editSourceAnalysis",
    "resolveBrandConflict",
  ]).has(typeof action === "string" ? action : "");
  const payload = requiresRevision && typeof body === "object" && body !== null
    ? { expectedUpdatedAt: "2026-07-13T12:00:00.000Z", ...body }
    : body;
  return PATCH(new Request("http://localhost/api/creative-work/work-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }), { params: makeParams("work-1") });
}

const profileId = "00000000-0000-4000-8000-000000000001";
const refId1 = "00000000-0000-4000-8000-000000000010";
const refId2 = "00000000-0000-4000-8000-000000000011";

const workItem = {
  id: "work-1",
  workspaceId: "workspace-1",
  clientProfileId: profileId,
  createdByUserId: "user-1",
  toolKind: "social_post",
  status: "draft",
  brief: {
    theme: "Tema",
    objective: "Objetivo",
    audience: "Publico",
    offer: "Oferta",
  },
  format: "4:5",
  copy: null,
  identitySnapshot: null,
  createdAt: new Date("2026-07-13T12:00:00.000Z"),
  updatedAt: new Date("2026-07-13T12:00:00.000Z"),
};

const outputs = [
  {
    id: "o1",
    workItemId: "work-1",
    creativeLevel: "conservative",
    status: "queued",
    outputKey: null,
    isSelected: false,
    createdAt: new Date("2026-07-13T12:00:00.000Z"),
  },
];

function layerizationState(providerRequestId: string | null = null) {
  return {
    status: "reconciling" as const,
    attemptId: "attempt-1",
    callbackTokenHash: "a".repeat(64),
    callbackConsumedAt: null,
    requestedByUserId: "owner-1",
    createdAt: "2026-08-12T10:00:00.000Z",
    updatedAt: "2026-08-12T10:00:00.000Z",
    callbackDeadlineAt: "2026-08-12T12:00:00.000Z",
    latencyMs: null,
    providerRequestId,
    providerModel: "bytedance/seedream-v5.0-pro/layer-decomposition",
    providerEndpoint: "https://api.atlascloud.ai/api/v1/model/generateImage",
    estimatedCostUsd: null,
    baseWidth: null,
    baseHeight: null,
    layers: [],
    psdKey: null,
    diagnosticZipKey: null,
    fidelity: null,
    failureCode: null,
  };
}

function layerEditorState() {
  const layerId = "00000000-0000-4000-8000-000000000111";
  const secondLayerId = "00000000-0000-4000-8000-000000000112";
  return {
    schemaVersion: 1 as const,
    revision: 3,
    sourceLayerizationAttemptId: "attempt-1",
    canvas: { width: 100, height: 100 },
    layers: [
      {
        id: layerId,
        source: { order: 0, name: "Base", visible: true, x: 0, y: 0, width: 100, height: 100, key: "private/base.png" },
        order: 0, name: "Base", visible: true, x: 0, y: 0, width: 100, height: 100,
        currentKey: "private/current-base.png", currentKind: "source" as const, restorableKey: "private/base.png",
      },
      {
        id: secondLayerId,
        source: { order: 1, name: "Headline", visible: true, x: 10, y: 10, width: 50, height: 20, key: "private/headline.png" },
        order: 1, name: "Headline", visible: true, x: 10, y: 10, width: 50, height: 20,
        currentKey: "private/current-headline.png", currentKind: "regenerated" as const, restorableKey: "private/headline.png",
      },
    ],
    lease: null,
    regeneration: null,
    publishedPsdKey: "private/published.psd",
    updatedAt: "2026-08-22T00:00:00.000Z",
  };
}

const confirmBody = {
  copy: {
    headline: "Headline",
    body: "Body content",
    cta: "CTA",
  },
  selectedReferenceIds: [refId1, refId2],
};

describe("GET /api/creative-work/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isPlatformOwnerEmailMock.mockReturnValue(false);
    requirePlatformOwnerMock.mockResolvedValue({ user: { id: "owner-1" } });
    failStaleOutputsMock.mockResolvedValue([]);
    failStaleSourcesMock.mockResolvedValue([]);
    listPendingRefundsMock.mockResolvedValue([]);
    markOutputFailureCodeMock.mockResolvedValue(null);
    refundCreditsMock.mockResolvedValue({ status: "refunded" });
    refundHelperMock.mockResolvedValue(true);
    getUsageByIdempotencyKeyMock.mockResolvedValue(null);
    resolveReactivationMock.mockResolvedValue({ state: "none" });
    recordAggregateMock.mockResolvedValue(null);
    layerEditorAccessMock.mockResolvedValue({ enabled: false, period: null, layerize: null, regeneration: null });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("projects only the active attempt id through the existing work query", async () => {
    activePreparationMock.mockResolvedValueOnce({ id: "attempt-1", inputFingerprint: "private" });
    getWorkMock.mockResolvedValue({ work: { ...workItem, status: "draft" }, outputs: [], sources: [] });
    const response = await GET(new Request("http://localhost/api/creative-work/work-1"), { params: makeParams("work-1") });
    expect(response.status).toBe(200);
    expect((await response.json()).preparationAttempt).toEqual({ id: "attempt-1" });
    expect(activePreparationMock).toHaveBeenCalledWith({ workspaceId: "workspace-1", workItemId: "work-1" });
  });

  it("catches up generating work status once outputs are terminal", async () => {
    refreshStatusMock.mockResolvedValue("partial");
    const terminalOutputs = [
      { ...outputs[0], id: "o1", creativeLevel: "conservative", status: "completed" },
      { ...outputs[0], id: "o2", creativeLevel: "balanced", status: "completed" },
      { ...outputs[0], id: "o3", creativeLevel: "bold", status: "failed" },
    ];
    getWorkMock
      .mockResolvedValueOnce({
        work: { ...workItem, status: "generating" },
        outputs: terminalOutputs,
        sources: [],
      })
      .mockResolvedValueOnce({
        work: { ...workItem, status: "partial" },
        outputs: terminalOutputs,
        sources: [],
      });

    const res = await GET(
      new Request("http://localhost/api/creative-work/work-1"),
      { params: makeParams("work-1") },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(refreshStatusMock).toHaveBeenCalledWith("workspace-1", "work-1");
    expect(getWorkMock).toHaveBeenCalledTimes(2);
    expect(body.work.status).toBe("partial");
  });

  it("returns work, outputs, and canonical projection", async () => {
    const inferredBriefing = {
      version: 1,
      message: { value: "Tema", state: "sourced" },
      objective: { value: "Objetivo", state: "inferred", confidence: "medium" },
      audience: { value: "Publico", state: "sourced" },
      offer: { value: null, state: "unknown" },
      tone: { value: null, state: "unknown" },
      constraints: { value: null, state: "unknown" },
      readiness: "exploratory",
      confidence: "low",
    } as const;
    const factPack = {
      version: 1,
      request: "Tema",
      facts: [{ value: "Marca", class: "brand", required: true, origin: "brand" }],
      brand: { requiredElements: [], prohibitedElements: [] },
      identity: { clientProfileId: profileId, brandName: "Marca", brandAuthority: "active" },
    } as const;
    getWorkMock.mockResolvedValue({
      work: { ...workItem, toolKind: "single", inputSnapshot: { inferredBriefing, factPack } },
      outputs,
    });

    const res = await GET(
      new Request("http://localhost/api/creative-work/work-1"),
      { params: makeParams("work-1") }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.work.id).toBe("work-1");
    expect(body.outputs).toHaveLength(1);
    expect(body.canonical.id).toBe("creative_work:work-1");
    expect(body.canonical.intent.kind).toBe("social_post");
    expect(body.canonical.briefing.theme).toBe("Tema");
    expect(body.inferredBriefing).toEqual(inferredBriefing);
    expect(body.briefingFactPack).toEqual(factPack);
    expect(getWorkMock).toHaveBeenCalledWith("workspace-1", "work-1");
  });

  it("reconciles an unsettled exact preflight refund with the terminal key and clears its pending code", async () => {
    listPendingRefundsMock.mockResolvedValue([
      { id: "output-1", failureCode: "exact_asset_preflight_failed_refund_pending" },
    ]);
    getWorkMock.mockResolvedValue({ work: workItem, outputs, sources: [] });

    const res = await GET(
      new Request("http://localhost/api/creative-work/work-1"),
      { params: makeParams("work-1") },
    );

    expect(res.status).toBe(200);
    // Routing only: the shared helper owns keys/ledger (covered in its suite).
    expect(refundHelperMock).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      outputId: "output-1",
      reason: "retry_pending_compensatory_refund",
      failurePhase: "terminal",
    }));
    expect(markOutputFailureCodeMock).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      "output-1",
      "exact_asset_preflight_failed",
    );
  });

  it("reconciles an unsettled reactivation exact preflight refund with its distinct charge key", async () => {
    listPendingRefundsMock.mockResolvedValue([
      {
        id: "output-1",
        retryCount: 2,
        manualRetryAttempt: 2,
        failureCode: "exact_asset_preflight_failed_reactivation_refund_pending",
      },
    ]);
    getWorkMock.mockResolvedValue({ work: workItem, outputs, sources: [] });

    const res = await GET(
      new Request("http://localhost/api/creative-work/work-1"),
      { params: makeParams("work-1") },
    );

    expect(res.status).toBe(200);
    expect(refundHelperMock).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      outputId: "output-1",
      manualRetryAttempt: 2,
      reason: "retry_pending_compensatory_refund",
    }));
    expect(markOutputFailureCodeMock).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      "output-1",
      "exact_asset_preflight_failed",
    );
  });

  it("clears a pending manual reactivation refund already settled in the real ledger resolver without a fallback refund", async () => {
    listPendingRefundsMock.mockResolvedValue([{
      id: "output-1",
      manualRetryAttempt: 2,
      failureCode: "exact_asset_preflight_failed_reactivation_refund_pending",
    }]);
    getWorkMock.mockResolvedValue({ work: workItem, outputs, sources: [] });

    const response = await GET(
      new Request("http://localhost/api/creative-work/work-1"),
      { params: makeParams("work-1") },
    );

    expect(response.status).toBe(200);
    expect(refundHelperMock).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      outputId: "output-1",
      manualRetryAttempt: 2,
    }));
    expect(markOutputFailureCodeMock).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      "output-1",
      "exact_asset_preflight_failed",
    );
  });

  it("uses the actual manual debit for a stale output and a cancellation-pending reconciliation", async () => {
    failStaleOutputsMock
      .mockResolvedValueOnce([{ id: "output-1", manualRetryAttempt: 3 }])
      .mockResolvedValueOnce([]);
    listPendingRefundsMock.mockResolvedValue([{ id: "output-2", manualRetryAttempt: 1, failureCode: "generation_canceled_refund_pending" }]);
    getWorkMock.mockResolvedValue({ work: workItem, outputs, sources: [] });

    await expect(GET(new Request("http://localhost/api/creative-work/work-1"), { params: makeParams("work-1") }))
      .resolves.toHaveProperty("status", 200);
    expect(refundHelperMock).toHaveBeenCalledWith(expect.objectContaining({
      outputId: "output-1",
      manualRetryAttempt: 3,
    }));
    expect(refundHelperMock).toHaveBeenCalledWith(expect.objectContaining({
      outputId: "output-2",
      manualRetryAttempt: 1,
    }));
  });

  it("does not project layerization state to a non-owner", async () => {
    getWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [{ ...outputs[0], layerization: { status: "completed", callbackTokenHash: "secret" } }],
    });

    const res = await GET(new Request("http://localhost/api/creative-work/work-1"), { params: makeParams("work-1") });
    const body = await res.json();

    expect(body.canLayerize).toBe(false);
    expect(body.outputs[0].layerization).toBeNull();
  });

  it("runs stale queued cleanup after entitlement revocation without enabling redelivery", async () => {
    const queued = { ...layerizationState(), status: "queued" as const, providerRequestId: null };
    const terminal = { ...queued, status: "submission_unknown" as const, failureCode: "submission_unknown" as const };
    getWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [{ ...outputs[0], layerization: queued }],
      sources: [],
    });
    recoverExpiredLayerizationsMock.mockResolvedValue(new Map([["o1", terminal]]));

    const res = await GET(new Request("http://localhost/api/creative-work/work-1"), { params: makeParams("work-1") });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.canLayerize).toBe(false);
    expect(body.outputs[0].layerization).toBeNull();
    expect(recoverExpiredLayerizationsMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      outputs: [{ ...outputs[0], layerization: queued }],
      cleanupOnly: true,
    });
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("projects only the allowlisted layer editor summary through the common GET", async () => {
    getWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [{ ...outputs[0], layerEditor: layerEditorState() }],
      sources: [],
    });

    const res = await GET(new Request("http://localhost/api/creative-work/work-1"), { params: makeParams("work-1") });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.outputs[0].layerEditor).toEqual({
      revision: 3,
      layerCount: 2,
      regenerationStatus: null,
      updatedAt: "2026-08-22T00:00:00.000Z",
    });
    expect(JSON.stringify(body.outputs[0].layerEditor)).not.toContain("private/");
    expect(JSON.stringify(body.outputs[0])).not.toMatch(/outputKey|operationKey|publishedPsdKey|private\//);
    expect(JSON.stringify(body.canonical)).not.toMatch(/outputKey|operationKey|publishedPsdKey|private\//);
    expect(body.outputs[0]).toMatchObject({ hasOutput: Boolean(outputs[0]!.outputKey), id: outputs[0]!.id });
  });

  it("keeps layerization disabled for an owner when ATLASCLOUD_API_KEY is absent", async () => {
    const previous = process.env.ATLASCLOUD_API_KEY;
    delete process.env.ATLASCLOUD_API_KEY;
    isPlatformOwnerEmailMock.mockReturnValue(true);
    getWorkMock.mockResolvedValue({ work: workItem, outputs, sources: [] });

    const res = await GET(new Request("http://localhost/api/creative-work/work-1"), { params: makeParams("work-1") });
    const body = await res.json();

    expect(body.canLayerize).toBe(false);
    if (previous === undefined) delete process.env.ATLASCLOUD_API_KEY;
    else process.env.ATLASCLOUD_API_KEY = previous;
  });

  it("marks an expired owner-visible attempt unknown when no provider request was persisted", async () => {
    const previous = process.env.ATLASCLOUD_API_KEY;
    process.env.ATLASCLOUD_API_KEY = "test-atlas-key";
    isPlatformOwnerEmailMock.mockReturnValue(true);
    layerEditorAccessMock.mockResolvedValue({ enabled: true, period: null, layerize: null, regeneration: null });
    acceptCandidateCommandMock.mockResolvedValue({ ok: true });
    discardCandidateCommandMock.mockResolvedValue({ ok: true });
    const expired = layerizationState();
    const unknown = { ...expired, status: "submission_unknown" as const, failureCode: "submission_unknown" as const };
    getWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [{ ...outputs[0], layerization: expired }],
      sources: [],
    });
    recoverExpiredLayerizationsMock.mockResolvedValue(new Map([["o1", unknown]]));

    try {
      const res = await GET(new Request("http://localhost/api/creative-work/work-1"), { params: makeParams("work-1") });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(recoverExpiredLayerizationsMock).toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        workItemId: "work-1",
        outputs: [{ ...outputs[0], layerization: expired }],
      });
      expect(body.outputs[0].layerization.status).toBe("submission_unknown");
      expect(inngestSendMock).not.toHaveBeenCalled();
    } finally {
    if (previous === undefined) delete process.env.ATLASCLOUD_API_KEY;
    else process.env.ATLASCLOUD_API_KEY = previous;
    }
  });

  it("re-dispatches an expired owner-visible attempt when the provider request is known", async () => {
    const previous = process.env.ATLASCLOUD_API_KEY;
    process.env.ATLASCLOUD_API_KEY = "test-atlas-key";
    isPlatformOwnerEmailMock.mockReturnValue(true);
    layerEditorAccessMock.mockResolvedValue({ enabled: true, period: null, layerize: null, regeneration: null });
    const expired = layerizationState("request-1");
    const recovered = { ...expired, updatedAt: "2026-08-12T15:00:00.000Z" };
    getWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [{ ...outputs[0], layerization: expired }],
      sources: [],
    });
    recoverExpiredLayerizationsMock.mockResolvedValue(new Map([["o1", recovered]]));

    try {
      const res = await GET(new Request("http://localhost/api/creative-work/work-1"), { params: makeParams("work-1") });

      expect(res.status).toBe(200);
      expect(recoverExpiredLayerizationsMock).toHaveBeenCalledOnce();
      expect(inngestSendMock).not.toHaveBeenCalled();
    } finally {
    if (previous === undefined) delete process.env.ATLASCLOUD_API_KEY;
    else process.env.ATLASCLOUD_API_KEY = previous;
    }
  });

  it("does not expose a Peça Única envelope from another protocol", async () => {
    getWorkMock.mockResolvedValue({
      work: {
        ...workItem,
        toolKind: "variations",
        inputSnapshot: {
          inferredBriefing: {
            version: 1,
            message: { value: "Tema", state: "sourced" },
            objective: { value: "Objetivo", state: "inferred", confidence: "medium" },
            audience: { value: null, state: "unknown" },
            offer: { value: null, state: "unknown" },
            tone: { value: null, state: "unknown" },
            constraints: { value: null, state: "unknown" },
            readiness: "exploratory",
            confidence: "low",
          },
        },
      },
      outputs: [],
    });

    const res = await GET(
      new Request("http://localhost/api/creative-work/work-1"),
      { params: makeParams("work-1") },
    );
    const body = await res.json();

    expect(body.inferredBriefing).toBeNull();
    expect(body.briefingFactPack).toBeNull();
  });

  it("humanizes a legacy JSON request when resuming a work", async () => {
    getWorkMock.mockResolvedValue({
      work: {
        ...workItem,
        request: JSON.stringify(workItem.brief),
      },
      outputs: [],
      sources: [],
    });

    const res = await GET(
      new Request("http://localhost/api/creative-work/work-1"),
      { params: makeParams("work-1") },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.work.request).toBe("Tema — Oferta");
    expect(body.work.request.startsWith("{")).toBe(false);
  });

  it("returns 404 when the work does not belong to the workspace", async () => {
    getWorkMock.mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/creative-work/work-1"),
      { params: makeParams("work-1") }
    );

    expect(res.status).toBe(404);
  });

  it("projects carousel slides without private keys and summarizes deck quality", async () => {
    listCurrentCarouselSlidesMock.mockResolvedValue([{
      id: "slide-1",
      workspaceId: "workspace-1",
      workItemId: "work-1",
      position: 1,
      role: "hook",
      primaryText: "Gancho",
      secondaryText: null,
      copyAuthority: "ai_proposal",
      status: "completed",
      providerBaseKey: "private/base.png",
      outputKey: "private/output.png",
      previewKey: "private/preview.png",
      anchorKey: "private/anchor.png",
      generationOperationKey: "deck-r1:slide-1",
      deckRevision: "deck-r1",
      visualContractHash: "hash",
      createdAt: new Date("2026-08-30T12:00:00.000Z"),
      updatedAt: new Date("2026-08-30T12:00:00.000Z"),
    }]);
    getWorkMock.mockResolvedValue({
      work: {
        ...workItem,
        toolKind: "carousel",
        carouselApprovedRevision: "deck-r1",
        carouselQuality: {
          version: 1,
          objectivePassed: true,
          advisoryWarnings: ["aviso"],
          contactSheetKey: "private/contact-sheet.png",
          reviewedAt: "2026-08-30T13:00:00.000Z",
        },
      },
      outputs: [],
      sources: [],
    });

    const res = await GET(new Request("http://localhost/api/creative-work/work-1"), { params: makeParams("work-1") });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(listCurrentCarouselSlidesMock).toHaveBeenCalledWith("workspace-1", "work-1");
    expect(body.carouselSlides).toHaveLength(1);
    expect(body.carouselSlides[0]).toEqual(expect.objectContaining({
      id: "slide-1",
      status: "completed",
      hasOutput: true,
      planSlideId: "slide-1",
    }));
    expect(JSON.stringify(body.carouselSlides[0])).not.toMatch(
      /providerBaseKey|outputKey|previewKey|anchorKey|generationOperationKey|private\//,
    );
    expect(body.carouselQuality).toEqual({
      version: 1,
      objectivePassed: true,
      advisoryWarnings: ["aviso"],
      reviewedAt: "2026-08-30T13:00:00.000Z",
      hasContactSheet: true,
    });
    expect(JSON.stringify(body.work)).not.toMatch(/contactSheetKey|carouselQuality|private\//);
  });

  it("projects an empty carousel surface for non-carousel works", async () => {
    listCurrentCarouselSlidesMock.mockClear();
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [], sources: [] });

    const res = await GET(new Request("http://localhost/api/creative-work/work-1"), { params: makeParams("work-1") });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(listCurrentCarouselSlidesMock).not.toHaveBeenCalled();
    expect(body.carouselSlides).toEqual([]);
    expect(body.carouselQuality).toBeNull();
  });

  it("turns stale generation into a terminal retryable failure", async () => {
    failStaleOutputsMock
      .mockResolvedValueOnce([{ id: "o1", status: "failed" }])
      .mockResolvedValueOnce([]);
    refreshStatusMock.mockResolvedValue("failed");
    const queuedAt = new Date("2026-07-13T12:00:00.000Z");
    const terminalAt = new Date("2026-07-13T12:10:00.000Z");
    recordAggregateMock.mockResolvedValue({
      generationCorrelationId: "generation-1",
      unitCount: 1,
      terminalCount: 1,
      successCount: 0,
      failureCount: 1,
      result: "failed",
      firstTerminalAt: terminalAt.toISOString(),
      completedAt: terminalAt.toISOString(),
      timeToFirstOutputMs: 10 * 60 * 1000,
      totalDurationMs: 10 * 60 * 1000,
      firstTerminalEmitted: true,
      completionEmitted: true,
    });
    getWorkMock.mockResolvedValue({
      work: { ...workItem, status: "failed" },
      outputs: [{
        ...outputs[0],
        status: "failed",
        failureCode: "generation_timeout",
        generationCorrelationId: "generation-1",
        imageCallCount: 1,
        retryCount: 0,
        queuedAt,
        terminalAt,
        updatedAt: terminalAt,
      }],
    });

    const res = await GET(
      new Request("http://localhost/api/creative-work/work-1"),
      { params: makeParams("work-1") },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(failStaleOutputsMock).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      expect.any(Date),
    );
    expect(refreshStatusMock).toHaveBeenCalledWith("workspace-1", "work-1");
    expect(body.outputs[0]).toEqual(
      expect.objectContaining({ status: "failed", failureCode: "generation_timeout" }),
    );
    expect(terminalTelemetryMock).toHaveBeenCalledWith(expect.objectContaining({
      outputId: "o1",
      generationCorrelationId: "generation-1",
      outcome: "failed",
      failureCode: "generation_timeout",
      durationMs: 10 * 60 * 1000,
    }));
    expect(recordAggregateMock).toHaveBeenCalledWith("workspace-1", "work-1", "generation-1");
    expect(aggregateTelemetryMock).toHaveBeenCalledWith(expect.objectContaining({ phase: "first_terminal" }));
    expect(aggregateTelemetryMock).toHaveBeenCalledWith(expect.objectContaining({ phase: "completed" }));
  });

  it("turns stale source analysis into an explicit retryable failure", async () => {
    failStaleSourcesMock.mockResolvedValue([{ id: "source-1", status: "failed" }]);
    getWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [],
      sources: [{
        id: "source-1", assetId: null, templateId: null, status: "failed",
        usage: "both", usageConfirmed: true, failureCode: "analysis_timeout",
      }],
    });

    const res = await GET(
      new Request("http://localhost/api/creative-work/work-1"),
      { params: makeParams("work-1") },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(failStaleSourcesMock).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      expect.any(Date),
    );
    expect(body.sources[0]).toEqual(expect.objectContaining({
      status: "failed",
      failureCode: "analysis_timeout",
    }));
  });

  it("returns reloadable source DTOs with server-derived name and origin", async () => {
    getWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [],
      sources: [
        {
          id: "source-1",
          assetId: "asset-1",
          templateId: null,
          usage: "content",
          status: "ready",
          contentAnalysis: {
            product: "Curso",
            offer: "30%",
            cta: { text: "Inscreva-se", style: "botão" },
            brandElements: [],
            keyVisual: "Médica",
            textContent: { headline: "Nova turma", bullets: ["Até agosto"] },
            format: "4:5",
          },
        },
        { id: "source-2", assetId: null, templateId: "template-1", usage: "style", status: "ready" },
      ],
    });
    getAssetMock.mockResolvedValue({ id: "asset-1", workspaceId: "workspace-1", name: "aprovada.png", source: "creative_work" });
    getTemplateMock.mockResolvedValue({ id: "template-1", workspaceId: "workspace-1", name: "Black Friday" });

    const res = await GET(new Request("http://localhost/api/creative-work/work-1"), { params: makeParams("work-1") });
    const body = await res.json();

    expect(body.sources).toEqual([
      expect.objectContaining({
        id: "source-1",
        name: "aprovada.png",
        origin: "approved_work",
        contentAnalysis: expect.objectContaining({ offer: "30%" }),
      }),
      expect.objectContaining({ id: "source-2", name: "Black Friday", origin: "template" }),
    ]);
    expect(getAssetMock).toHaveBeenCalledWith("asset-1", "workspace-1");
    expect(getTemplateMock).toHaveBeenCalledWith("template-1", "workspace-1");
  });

  it("projects an authenticated preview URL for asset-backed sources", async () => {
    getWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [],
      sources: [{
        id: "source-1",
        assetId: "asset-1",
        templateId: null,
        usage: "content",
        status: "ready",
      }],
    });

    getAssetMock.mockResolvedValue({
      id: "asset-1",
      workspaceId: "workspace-1",
      name: "original.png",
      source: "upload",
    });

    const response = await GET(
      new Request("http://localhost/api/creative-work/work-1"),
      { params: makeParams("work-1") },
    );

    const payload = await response.json();

    expect(payload.sources[0]).toEqual(expect.objectContaining({
      previewUrl: "/api/workspace/assets/asset-1/file",
    }));
  });

  it("projects a null preview URL for template-backed sources", async () => {
    getWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [],
      sources: [{
        id: "source-1",
        assetId: null,
        templateId: "template-1",
        usage: "style",
        status: "ready",
      }],
    });
    getTemplateMock.mockResolvedValue({
      id: "template-1",
      workspaceId: "workspace-1",
      name: "Black Friday",
    });

    const response = await GET(
      new Request("http://localhost/api/creative-work/work-1"),
      { params: makeParams("work-1") },
    );
    const payload = await response.json();

    expect(payload.sources[0].previewUrl).toBeNull();
  });
});

describe("PATCH /api/creative-work/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformOwnerMock.mockResolvedValue({ user: { id: "owner-1" } });
    confirmMock.mockResolvedValue({
      ok: true,
      value: {
        work: {
          ...workItem,
          copy: confirmBody.copy,
          status: "ready",
          identitySnapshot: { clientProfileId: profileId },
        },
        canonical: {
          id: "creative_work:work-1",
          originKind: "creative_work",
          intent: {
            kind: "social_post",
            objective: "Objetivo",
            formatHint: "4:5",
            platforms: [],
          },
          briefing: {
            headline: confirmBody.copy.headline,
            body: confirmBody.copy.body,
            cta: confirmBody.copy.cta,
            theme: "Tema",
          },
        },
      },
    });
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [], sources: [] });
    getAssetMock.mockResolvedValue({ id: "asset-1", workspaceId: "workspace-1", key: "trusted/key.png", type: "image/png" });
    createSourceMock.mockResolvedValue({
      source: { id: "source-1", workspaceId: "workspace-1", workItemId: "work-1", assetId: "asset-1", usage: "both", status: "uploaded" },
      claimedForAnalysis: true,
    });
    updateSourceMock.mockResolvedValue({ id: "source-1", usage: "style", status: "uploaded" });
    updateSourceCasMock.mockResolvedValue({ id: "source-1", usage: "content", status: "uploaded", updatedAt: new Date("2026-07-16T12:00:00.001Z") });
    mutateDraftSourceMock.mockResolvedValue({ id: "source-1", usage: "content", status: "uploaded", updatedAt: new Date("2026-07-16T12:00:00.001Z") });
    deleteSourceMock.mockResolvedValue({ id: "source-1" });
    linkCampaignMock.mockResolvedValue({ ...workItem, campaignId: "campaign-1" });
    inngestSendMock.mockResolvedValue(undefined);
    getTemplateMock.mockResolvedValue({ id: "template-1", workspaceId: "workspace-1", name: "Template", styleIntensity: "medium" });
    analyzeSourceMock.mockResolvedValue({ id: "source-1", status: "ready" });
    layerEditorAccessMock.mockResolvedValue({ enabled: true, period: null, layerize: null, regeneration: null });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("delegates to confirmSocialPostWork and returns work + canonical", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/creative-work/work-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirmBody),
      }),
      { params: makeParams("work-1") }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(confirmMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      copy: confirmBody.copy,
      selectedReferenceIds: [refId1, refId2],
    });
    expect(body.work.status).toBe("ready");
    expect(body.canonical.id).toBe("creative_work:work-1");
  });

  it("accepts a member layerization command through the existing Work seam", async () => {
    requestLayerizationMock.mockResolvedValue({ ok: true, accepted: true, replay: false, state: null });
    const outputId = "00000000-0000-4000-8000-000000000099";

    const res = await requestPatch({ action: "layerizeOutput", outputId, operationId: "00000000-0000-4000-8000-000000000098" });

    expect(res.status).toBe(202);
    expect(requirePlatformOwnerMock).not.toHaveBeenCalled();
    expect(requestLayerizationMock).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      outputId,
      userId: "user-1",
      operationId: "00000000-0000-4000-8000-000000000098",
    }));
  });

  it("rejects a malformed layerization operation id", async () => {
    const res = await requestPatch({
      action: "layerizeOutput",
      outputId: "00000000-0000-4000-8000-000000000099",
    });

    expect(res.status).toBe(400);
    expect(requestLayerizationMock).not.toHaveBeenCalled();
  });

  it("autosaves through the source-locked repository command without profile fields", async () => {
    autosaveDraftMock.mockResolvedValue({
      work: { ...workItem, request: "Novo pedido", brief: null },
      error: null,
      sourcesNeedingSingleAnalysis: [{ id: "normalized-source", status: "uploaded", usage: "both", updatedAt: new Date() }],
    });
    const res = await PATCH(new Request("http://localhost/api/creative-work/work-1", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "autosave", expectedUpdatedAt: "2026-07-13T12:00:00.000Z", request: "Novo pedido", intent: "variations", format: "1:1", settings: { targetFormats: [] } }),
    }), { params: makeParams("work-1") });
    expect(res.status).toBe(200);
    expect(autosaveDraftMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1", workItemId: "work-1",
      expectedUpdatedAt: new Date("2026-07-13T12:00:00.000Z"),
      request: "Novo pedido", intent: "variations", format: "1:1", settings: { targetFormats: [] },
    });
    expect(autosaveDraftMock.mock.calls[0][0]).not.toHaveProperty("clientProfileId");
    expect(inngestSendMock).toHaveBeenCalledWith({
      name: "creative-work.source.analyze",
      data: { workspaceId: "workspace-1", workItemId: "work-1", sourceId: "normalized-source" },
    });

    // A replay after the transition sees the locked Single state and does not
    // enqueue the same normalized source again.
    autosaveDraftMock.mockResolvedValueOnce({
      work: { ...workItem, toolKind: "single" }, error: null, sourcesNeedingSingleAnalysis: [],
    });
    const replay = await requestPatch({ action: "autosave", request: "Novo pedido", intent: "single", format: "1:1", settings: { targetFormats: [] } });
    expect(replay.status).toBe(200);
    expect(inngestSendMock).toHaveBeenCalledTimes(1);
  });

  it("returns the explicit three-reference error from an atomic Single transition", async () => {
    autosaveDraftMock.mockResolvedValue({ work: null, error: "single_piece_reference_limit" });
    const res = await requestPatch({ action: "autosave", request: "Nova peça", intent: "single", format: "4:5", settings: { targetFormats: [] } });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("creativeWorkPieceReferenceLimit");
  });

  it("maps the carousel autosave reference cap to its dedicated error code", async () => {
    autosaveDraftMock.mockResolvedValue({ work: null, error: "carousel_reference_limit", sourcesNeedingSingleAnalysis: [] });
    const res = await requestPatch({ action: "autosave", request: "Nova peça", intent: "carousel", format: "4:5", settings: { targetFormats: [] } });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("creativeWorkCarouselReferenceLimit");
  });

  it("maps the carousel attach cap to its dedicated error code before analysis dispatch", async () => {
    getWorkMock.mockResolvedValue({ work: { ...workItem, toolKind: "carousel" }, outputs: [], sources: [] });
    getAssetMock.mockResolvedValue({ id: "asset-1", workspaceId: "workspace-1", key: "trusted/ref.png", type: "image/png" });
    createSourceMock.mockResolvedValue({ limitReached: true, reason: "carousel_reference_limit" });

    const res = await requestPatch({ action: "attachSource", assetId: "asset-1", usage: "style" });

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("creativeWorkCarouselReferenceLimit");
    expect(inngestSendMock).not.toHaveBeenCalled();
    expect(analyzeSourceMock).not.toHaveBeenCalled();
  });

  it("preserves late-autosave semantics: missing is 404 and non-draft is 409", async () => {
    autosaveDraftMock.mockResolvedValueOnce({ work: null, error: "not_found", sourcesNeedingSingleAnalysis: [] });
    const missing = await requestPatch({ action: "autosave", request: "Nova peça", intent: "single", format: "4:5", settings: { targetFormats: [] } });
    expect(missing.status).toBe(404);
    autosaveDraftMock.mockResolvedValueOnce({ work: null, error: "not_draft", sourcesNeedingSingleAnalysis: [] });
    const late = await requestPatch({ action: "autosave", request: "Nova peça", intent: "single", format: "4:5", settings: { targetFormats: [] } });
    expect(late.status).toBe(409);
    expect((await late.json()).code).toBe("creativeWorkNotDraft");
  });

  it("maps a typed repository revision conflict to stale_input", async () => {
    autosaveDraftMock.mockRejectedValueOnce(Object.assign(
      new Error("creative_work_revision_conflict"),
      { code: "stale_input" },
    ));

    const response = await requestPatch({
      action: "autosave", request: "Nova peça", intent: "single", format: "4:5", settings: { targetFormats: [] },
    });

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("stale_input");
  });

  it("prepares through the existing detail patch", async () => {
    const briefing = {
      version: 1,
      message: { value: "Tema", state: "sourced" },
      objective: { value: "Objetivo", state: "inferred", confidence: "medium" },
      audience: { value: null, state: "unknown" },
      offer: { value: null, state: "unknown" },
      tone: { value: null, state: "unknown" },
      constraints: { value: null, state: "unknown" },
      readiness: "exploratory",
      confidence: "low",
    } as const;
    prepareMock.mockResolvedValue({
      ok: true,
      value: {
        work: workItem,
        quote: { unitCount: 3, credits: 15 },
        briefing,
        readiness: briefing.readiness,
        confidence: briefing.confidence,
      },
    });
    const res = await PATCH(new Request("http://localhost/api/creative-work/work-1", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare" }),
    }), { params: makeParams("work-1") });
    expect(res.status).toBe(200);
    expect(await res.clone().json()).toEqual(expect.objectContaining({ briefing }));
    expect(prepareMock).toHaveBeenCalledWith({ workspaceId: "workspace-1", workItemId: "work-1" });
  });

  it("edits one inferred briefing field with a versioned compare-and-swap", async () => {
    const updatedAt = new Date("2026-07-13T12:00:00.000Z");
    const briefing = {
      version: 1,
      message: { value: "Tema", state: "sourced" },
      objective: { value: "Objetivo", state: "inferred", confidence: "medium" },
      audience: { value: null, state: "unknown" },
      offer: { value: null, state: "unknown" },
      tone: { value: null, state: "unknown" },
      constraints: { value: null, state: "unknown" },
      readiness: "exploratory",
      confidence: "low",
    } as const;
    const factPack = {
      version: 1,
      request: "Tema",
      facts: [],
      brand: { requiredElements: [], prohibitedElements: [] },
      identity: { clientProfileId: profileId, brandName: "Marca", brandAuthority: "active" },
    } as const;
    const current = {
      ...workItem,
      toolKind: "single",
      updatedAt,
      settings: { targetFormats: [], briefingOverrides: {}, briefingVersion: 3 },
      inputSnapshot: {
        request: "Tema",
        settings: { targetFormats: [], briefingOverrides: {}, briefingVersion: 3 },
        sources: [],
        inferredBriefing: briefing,
        factPack,
      },
    };
    getWorkMock.mockResolvedValue({ work: current, outputs: [], sources: [] });
    const saved = { ...current, updatedAt: new Date("2026-07-13T12:00:01.000Z") };
    updateDraftCasMock.mockResolvedValue(saved);

    const res = await requestPatch({
      action: "editBriefing",
      field: "audience",
      value: "Professores",
      expectedUpdatedAt: updatedAt.toISOString(),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.briefing.audience).toEqual({ value: "Professores", state: "sourced" });
    expect(body.briefingOverrides).toEqual({ audience: "Professores" });
    expect(body.briefingVersion).toBe(4);
    expect(updateDraftCasMock).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      updatedAt,
      expect.objectContaining({ copy: null, identitySnapshot: null }),
    );
  });

  it("rejects an inline edit whose snapshot is stale without writing", async () => {
    const updatedAt = new Date("2026-07-13T12:00:00.000Z");
    getWorkMock.mockResolvedValue({
      work: {
        ...workItem,
        toolKind: "single",
        updatedAt,
        settings: { targetFormats: [], briefingOverrides: {}, briefingVersion: 1 },
      },
      outputs: [],
      sources: [],
    });

    const res = await requestPatch({
      action: "editBriefing",
      field: "message",
      value: "Novo tema",
      expectedUpdatedAt: "2026-07-13T11:59:59.000Z",
    });

    expect(res.status).toBe(409);
    expect(updateDraftCasMock).not.toHaveBeenCalled();
  });

  it("links and unlinks only an existing compatible campaign", async () => {
    const linked = await requestPatch({ action: "linkCampaign", campaignId: "campaign-1" });
    expect(linked.status).toBe(200);
    expect(linkCampaignMock).toHaveBeenCalledWith("workspace-1", "work-1", "campaign-1");

    linkCampaignMock.mockResolvedValue({ ...workItem, campaignId: null });
    const unlinked = await requestPatch({ action: "linkCampaign", campaignId: null });
    expect(unlinked.status).toBe(200);
    expect(linkCampaignMock).toHaveBeenCalledWith("workspace-1", "work-1", null);
  });

  it("rejects a missing or brand-incompatible campaign", async () => {
    linkCampaignMock.mockResolvedValue(null);
    const res = await requestPatch({ action: "linkCampaign", campaignId: "other-campaign" });
    expect(res.status).toBe(409);
  });

  it.each([
    ["sources_not_ready", 409],
    ["work_not_draft", 409],
    ["stale_input", 409],
    ["missing_input", 422],
    ["person_unknown", 422],
    ["person_ambiguous", 422],
    ["visual_language_unknown", 422],
    ["visual_language_ambiguous", 422],
  ])("maps prepare %s to %i", async (code, status) => {
    prepareMock.mockResolvedValue({ ok: false, error: { code } });
    const res = await PATCH(new Request("http://localhost/api/creative-work/work-1", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare" }),
    }), { params: makeParams("work-1") });
    expect(res.status).toBe(status);
  });

  it("maps an expired pinned offer on prepare to 409", async () => {
    prepareMock.mockResolvedValue({ ok: false, error: { code: "offer_expired" } });
    const res = await PATCH(new Request("http://localhost/api/creative-work/work-1", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare" }),
    }), { params: makeParams("work-1") });
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.code).toBe("commercialOfferExpired");
  });

  it("saves authorized briefing facts as a brand offer", async () => {
    saveOfferMock.mockResolvedValue({
      ok: true,
      value: { offer: { id: "offer-1", version: 1, document: { product: "Pós", offer: "turma" } } },
    });
    const res = await requestPatch({
      action: "saveAsOffer",
      validUntil: "2026-10-01T00:00:00.000Z",
    });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.offer.id).toBe("offer-1");
    expect(saveOfferMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      validFrom: undefined,
      validUntil: "2026-10-01T00:00:00.000Z",
    });
  });

  it("does not invent an offer when the fact pack has no authorized claims", async () => {
    saveOfferMock.mockResolvedValue({ ok: false, error: { code: "missing_offer" } });
    const res = await requestPatch({
      action: "saveAsOffer",
      validUntil: "2026-10-01T00:00:00.000Z",
    });
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.code).toBe("commercialOfferMissingOffer");
  });

  it("returns the active preparation attempt in a typed 409", async () => {
    prepareMock.mockResolvedValue({ ok: false, error: { code: "preparation_in_progress", details: { attemptId: "attempt-1" } } });
    const response = await requestPatch({ action: "prepare" });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "creativeWorkPreparationInProgress",
      code: "creativeWorkPreparationInProgress",
      attemptId: "attempt-1",
    });
  });

  it("maps prepare invalid_context to 422 preserving the violations payload", async () => {
    const violations = [{ class: "price", value: "50%", field: "headline" }];
    prepareMock.mockResolvedValue({ ok: false, error: { code: "invalid_context", details: { violations } } });
    const res = await PATCH(new Request("http://localhost/api/creative-work/work-1", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare" }),
    }), { params: makeParams("work-1") });
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.code).toBe("invalid_context");
    expect(body.details).toEqual({ violations });
  });

  it("maps prepare brand_conflict to 422 with exactly the two short choices (R-003)", async () => {
    const details = { detectedBrand: "XTB", activeBrand: "Cenbrap", sourceId: "source-1", choices: ["source", "active"] };
    prepareMock.mockResolvedValue({ ok: false, error: { code: "brand_conflict", details } });
    const res = await PATCH(new Request("http://localhost/api/creative-work/work-1", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare" }),
    }), { params: makeParams("work-1") });
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.code).toBe("brand_conflict");
    expect(body.details).toEqual(details);
    expect(body.details.choices).toHaveLength(2);
  });

  it("maps a blocked briefing to 422 with its actionable reason", async () => {
    const details = { reason: "missing_direction", readiness: "blocked" };
    prepareMock.mockResolvedValue({ ok: false, error: { code: "briefing_blocked", details } });
    const res = await PATCH(new Request("http://localhost/api/creative-work/work-1", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare" }),
    }), { params: makeParams("work-1") });
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.code).toBe("briefing_blocked");
    expect(body.details).toEqual(details);
  });

  it("routes the prepare action to the carousel command for carousel works", async () => {
    getWorkMock.mockResolvedValue({ work: { ...workItem, toolKind: "carousel" }, outputs: [], sources: [] });
    prepareCarouselMock.mockResolvedValue({
      ok: true,
      value: {
        work: { ...workItem, toolKind: "carousel" },
        preparedRevision: "prep-1",
        deck: { version: 1, slides: [] },
        visualContract: { version: 1, contractHash: "a".repeat(64) },
      },
    });
    const res = await PATCH(new Request("http://localhost/api/creative-work/work-1", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare" }),
    }), { params: makeParams("work-1") });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(prepareCarouselMock).toHaveBeenCalledWith({ workspaceId: "workspace-1", workItemId: "work-1" });
    expect(prepareMock).not.toHaveBeenCalled();
    expect(body).toEqual(expect.objectContaining({
      preparedRevision: "prep-1",
      deck: expect.objectContaining({ version: 1 }),
      visualContract: expect.objectContaining({ contractHash: "a".repeat(64) }),
    }));
  });

  it.each([
    ["blocking_questions", 409],
    ["work_not_draft", 409],
    ["sources_not_ready", 409],
    ["stale_input", 409],
    ["temporary_reference_limit", 409],
    ["editorial_invalid", 422],
    ["invalid_context", 422],
    ["person_unknown", 422],
    ["person_ambiguous", 422],
    ["person_unconfirmed", 422],
    ["person_limit", 422],
    ["visual_language_unknown", 422],
    ["visual_language_ambiguous", 422],
  ])("maps carousel prepare %s to %i", async (code, status) => {
    getWorkMock.mockResolvedValue({ work: { ...workItem, toolKind: "carousel" }, outputs: [], sources: [] });
    prepareCarouselMock.mockResolvedValue({ ok: false, error: { code, details: { findings: [] } } });
    const res = await PATCH(new Request("http://localhost/api/creative-work/work-1", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare" }),
    }), { params: makeParams("work-1") });
    expect(res.status).toBe(status);
  });

  it("carries carousel editorial field findings in the 422 details", async () => {
    getWorkMock.mockResolvedValue({ work: { ...workItem, toolKind: "carousel" }, outputs: [], sources: [] });
    const findings = [{ code: "unsupported_claim", path: "slides.1.primaryText", message: "sem origem", blocking: true }];
    prepareCarouselMock.mockResolvedValue({ ok: false, error: { code: "editorial_invalid", details: { findings } } });
    const res = await PATCH(new Request("http://localhost/api/creative-work/work-1", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare" }),
    }), { params: makeParams("work-1") });
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.code).toBe("editorial_invalid");
    expect(body.details.findings).toEqual(findings);
  });

  it("returns 404 before choosing a prepare path when the work is missing", async () => {
    getWorkMock.mockResolvedValue(null);
    const res = await PATCH(new Request("http://localhost/api/creative-work/work-1", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare" }),
    }), { params: makeParams("work-1") });
    expect(res.status).toBe(404);
    expect(prepareMock).not.toHaveBeenCalled();
    expect(prepareCarouselMock).not.toHaveBeenCalled();
  });

  it("persists the brand conflict choice bound to the detected brand and invalidates the prepared blocks so the same draft resumes", async () => {
    getWorkMock.mockResolvedValue({
      work: { ...workItem, toolKind: "restyle", settings: { targetFormats: [] } },
      outputs: [],
      sources: [],
    });
    detectDraftConflictMock.mockResolvedValue({
      detectedBrand: "XTB",
      activeBrand: "Cenbrap",
      sourceId: "source-1",
      choices: ["source", "active"],
    });
    updateDraftCasMock.mockResolvedValue({ ...workItem, toolKind: "restyle" });
    const res = await requestPatch({ action: "resolveBrandConflict", choice: "source" });
    expect(res.status).toBe(200);
    expect(updateDraftCasMock).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      new Date("2026-07-13T12:00:00.000Z"),
      {
        settings: { targetFormats: [], brandConflictChoice: "source", brandConflictDetectedBrand: "XTB" },
        brief: null,
        copy: null,
        inputSnapshot: null,
      },
    );
    expect(updateDraftMock).not.toHaveBeenCalled();
    expect(confirmMock).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("rejects a stale resolveBrandConflict from R1 after a concurrent R2 autosave without overwriting settings", async () => {
    getWorkMock.mockResolvedValue({
      work: {
        ...workItem,
        toolKind: "restyle",
        settings: { targetFormats: [], request: "R2" },
        updatedAt: new Date("2026-07-13T12:00:01.000Z"),
      },
      outputs: [],
      sources: [],
    });
    detectDraftConflictMock.mockResolvedValue({
      detectedBrand: "XTB",
      activeBrand: "Cenbrap",
      sourceId: "source-1",
      choices: ["source", "active"],
    });
    const res = await requestPatch({
      action: "resolveBrandConflict",
      choice: "source",
      expectedUpdatedAt: "2026-07-13T12:00:00.000Z",
    });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ code: "stale_input" });
    expect(updateDraftCasMock).not.toHaveBeenCalled();
    expect(updateDraftMock).not.toHaveBeenCalled();
    expect(detectDraftConflictMock).not.toHaveBeenCalled();
    expect(confirmMock).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the CAS write loses a race after the revision pre-check", async () => {
    getWorkMock.mockResolvedValue({
      work: { ...workItem, toolKind: "restyle", settings: { targetFormats: [] } },
      outputs: [],
      sources: [],
    });
    detectDraftConflictMock.mockResolvedValue({
      detectedBrand: "XTB",
      activeBrand: "Cenbrap",
      sourceId: "source-1",
      choices: ["source", "active"],
    });
    updateDraftCasMock.mockResolvedValue(null);
    const res = await requestPatch({ action: "resolveBrandConflict", choice: "active" });
    expect(res.status).toBe(409);
    expect(updateDraftCasMock).toHaveBeenCalledOnce();
    expect(updateDraftMock).not.toHaveBeenCalled();
  });

  it("rejects resolveBrandConflict without expectedUpdatedAt before reading the draft", async () => {
    const res = await PATCH(new Request("http://localhost/api/creative-work/work-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resolveBrandConflict", choice: "source" }),
    }), { params: makeParams("work-1") });
    expect(res.status).toBe(400);
    expect(getWorkMock).not.toHaveBeenCalled();
    expect(updateDraftCasMock).not.toHaveBeenCalled();
  });

  it("rejects resolveBrandConflict when no brand conflict is detectable in the current draft", async () => {
    getWorkMock.mockResolvedValue({
      work: { ...workItem, toolKind: "restyle", settings: { targetFormats: [] } },
      outputs: [],
      sources: [],
    });
    detectDraftConflictMock.mockResolvedValue(null);
    const res = await requestPatch({ action: "resolveBrandConflict", choice: "active" });
    expect(res.status).toBe(400);
    expect(updateDraftMock).not.toHaveBeenCalled();
  });

  it("rejects the brand conflict choice for non-restyle works and non-drafts", async () => {
    getWorkMock.mockResolvedValue({
      work: { ...workItem, toolKind: "variations", settings: { targetFormats: [] } },
      outputs: [],
      sources: [],
    });
    const wrongKind = await requestPatch({ action: "resolveBrandConflict", choice: "active" });
    expect(wrongKind.status).toBe(400);
    getWorkMock.mockResolvedValue({
      work: { ...workItem, toolKind: "restyle", status: "ready", settings: { targetFormats: [] } },
      outputs: [],
      sources: [],
    });
    const notDraft = await requestPatch({ action: "resolveBrandConflict", choice: "active" });
    expect(notDraft.status).toBe(409);
    expect(updateDraftMock).not.toHaveBeenCalled();
  });

  it("maps work_not_found → 404", async () => {
    confirmMock.mockResolvedValue({
      ok: false,
      error: { code: "work_not_found" },
    });

    const res = await PATCH(
      new Request("http://localhost/api/creative-work/work-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirmBody),
      }),
      { params: makeParams("work-1") }
    );

    expect(res.status).toBe(404);
  });

  it("returns 400 when copy fields are invalid", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/creative-work/work-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          copy: { headline: "x", body: "", cta: "y" },
          selectedReferenceIds: [refId1],
        }),
      }),
      { params: makeParams("work-1") }
    );

    expect(res.status).toBe(400);
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the browser tries to send asset keys", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/creative-work/work-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          copy: confirmBody.copy,
          selectedReferenceIds: [refId1],
          assetKeys: ["browser-supplied-key"],
        }),
      }),
      { params: makeParams("work-1") }
    );

    expect(res.status).toBe(400);
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("attaches a workspace asset and dispatches analysis without trusting browser metadata", async () => {
    const res = await PATCH(new Request("http://localhost/api/creative-work/work-1", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "attachSource", expectedUpdatedAt: "2026-07-13T12:00:00.000Z", assetId: "asset-1", usage: "both" }),
    }), { params: makeParams("work-1") });

    expect(res.status).toBe(200);
    expect(getAssetMock).toHaveBeenCalledWith("asset-1", "workspace-1");
    expect(createSourceMock).toHaveBeenCalledWith({ workspaceId: "workspace-1", workItemId: "work-1", expectedUpdatedAt: new Date("2026-07-13T12:00:00.000Z"), assetId: "asset-1", usage: "both", usageConfirmed: true, status: "uploaded" });
    expect(inngestSendMock).toHaveBeenCalledWith({ name: "creative-work.source.analyze", data: { workspaceId: "workspace-1", workItemId: "work-1", sourceId: "source-1" } });
  });

  it("caps only asset-backed Single attachments, leaving template sources outside the three slots", async () => {
    const fourthAssetId = "00000000-0000-4000-8000-000000000401";
    getWorkMock.mockResolvedValue({
      work: { ...workItem, toolKind: "single" }, outputs: [],
      sources: ["1", "2", "3"].map((suffix) => ({ id: `source-${suffix}`, assetId: `asset-${suffix}`, templateId: null })),
    });
    getAssetMock.mockResolvedValueOnce({ id: fourthAssetId, workspaceId: "workspace-1", key: "trusted/fourth.png", type: "image/png" });
    createSourceMock.mockResolvedValueOnce({ limitReached: true });

    const blocked = await requestPatch({ action: "attachSource", assetId: fourthAssetId, usage: "content" });

    expect(blocked.status).toBe(409);
    expect((await blocked.json()).code).toBe("creativeWorkPieceReferenceLimit");
    expect(createSourceMock).toHaveBeenCalledWith(expect.objectContaining({ assetId: fourthAssetId, usage: "content", usageConfirmed: true }));

    getWorkMock.mockResolvedValue({
      work: { ...workItem, toolKind: "single" }, outputs: [],
      sources: ["1", "2", "3"].map((suffix) => ({ id: `template-${suffix}`, assetId: null, templateId: `template-${suffix}` })),
    });
    createSourceMock.mockClear();
    const template = await requestPatch({ action: "attachSource", templateId: "template-1", usage: "style" });

    expect(template.status).toBe(200);
    expect(createSourceMock).toHaveBeenCalledWith(expect.objectContaining({ templateId: "template-1", usage: "style" }));
  });

  it("accepts only browser correction fields and persists a trimmed user classification", async () => {
    const sourceId = "00000000-0000-4000-8000-000000000402";
    const source = {
      id: sourceId, assetId: "asset-1", status: "ready", usage: "both", usageConfirmed: true,
      pieceReference: { version: 1, category: null, classificationSource: "automatic", confidence: "low", userInstruction: null, hasTransparency: false },
    };
    getWorkMock.mockResolvedValue({ work: { ...workItem, toolKind: "single" }, outputs: [], sources: [source] });
    mutatePieceReferenceMock.mockResolvedValue({ ...source, pieceReference: { ...source.pieceReference, category: "style_reference", classificationSource: "user", userInstruction: "Somente a textura" } });

    const valid = await requestPatch({ action: "updatePieceReference", sourceId, category: "style_reference", userInstruction: "  Somente a textura  " });

    expect(valid.status).toBe(200);
    expect(mutatePieceReferenceMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1", workItemId: "work-1", expectedUpdatedAt: new Date("2026-07-13T12:00:00.000Z"), sourceId,
      mutation: { kind: "correct", category: "style_reference", userInstruction: "Somente a textura" },
    });

    mutatePieceReferenceMock.mockClear();
    await requestPatch({ action: "updatePieceReference", sourceId, category: "style_reference" });
    await requestPatch({ action: "updatePieceReference", sourceId, userInstruction: "  Só o acabamento  " });
    expect(mutatePieceReferenceMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      mutation: { kind: "correct", category: "style_reference" },
    }));
    expect(mutatePieceReferenceMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      mutation: { kind: "correct", userInstruction: "Só o acabamento" },
    }));

    mutatePieceReferenceMock.mockClear();
    const invalid = await requestPatch({ action: "updatePieceReference", sourceId, category: "style_reference", treatment: "style_direction" });
    expect(invalid.status).toBe(400);
    expect(mutatePieceReferenceMock).not.toHaveBeenCalled();
  });

  it("replaces the existing piece source in place, resets its derived fields, and dispatches analysis", async () => {
    const sourceId = "00000000-0000-4000-8000-000000000403";
    const replacementAssetId = "00000000-0000-4000-8000-000000000404";
    const source = {
      id: sourceId, assetId: "asset-old", status: "ready", usage: "both", usageConfirmed: true,
      pieceReference: { version: 1, category: "style_reference", classificationSource: "user", confidence: "high", userInstruction: "Manter textura", hasTransparency: false },
    };
    getWorkMock.mockResolvedValue({ work: { ...workItem, toolKind: "single" }, outputs: [], sources: [source] });
    getAssetMock.mockResolvedValue({ id: replacementAssetId, workspaceId: "workspace-1", key: "trusted/replacement.png", name: "replacement.png", type: "image/png" });
    mutatePieceReferenceMock.mockResolvedValue({ ...source, assetId: replacementAssetId, status: "uploaded" });

    const res = await requestPatch({ action: "replacePieceReference", sourceId, assetId: replacementAssetId });

    expect(res.status).toBe(200);
    expect(mutatePieceReferenceMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1", workItemId: "work-1", expectedUpdatedAt: new Date("2026-07-13T12:00:00.000Z"), sourceId,
      mutation: { kind: "replace", assetId: replacementAssetId },
    });
    expect(inngestSendMock).toHaveBeenCalledWith({ name: "creative-work.source.analyze", data: { workspaceId: "workspace-1", workItemId: "work-1", sourceId } });
  });

  it("returns a conflict and never dispatches replacement analysis when prepare wins the shared lock", async () => {
    const sourceId = "00000000-0000-4000-8000-000000000406";
    const replacementAssetId = "00000000-0000-4000-8000-000000000407";
    getWorkMock.mockResolvedValue({
      work: { ...workItem, toolKind: "single" }, outputs: [],
      sources: [{
        id: sourceId, assetId: "asset-old", status: "ready", usage: "both", usageConfirmed: true,
        pieceReference: { version: 1, category: "style_reference", classificationSource: "user", confidence: "high", userInstruction: null, hasTransparency: false },
      }],
    });
    getAssetMock.mockResolvedValue({ id: replacementAssetId, workspaceId: "workspace-1", key: "trusted/replacement.png", type: "image/png" });
    mutatePieceReferenceMock.mockResolvedValue(null);

    const res = await requestPatch({ action: "replacePieceReference", sourceId, assetId: replacementAssetId });

    expect(res.status).toBe(409);
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("claims one promotion row, leaves a failed dispatch pending, and retries immediately through consumer CAS", async () => {
    const sourceId = "00000000-0000-4000-8000-000000000405";
    const source = {
      id: sourceId, assetId: "asset-1", status: "ready", usage: "both", usageConfirmed: true,
      pieceReference: { version: 1, category: "style_reference", classificationSource: "user", confidence: "high", userInstruction: null, hasTransparency: false },
    };
    getWorkMock.mockResolvedValue({ work: { ...workItem, toolKind: "single" }, outputs: [], sources: [source] });
    getAssetMock.mockResolvedValue({ id: "asset-1", workspaceId: "workspace-1", key: "trusted/piece.png", name: "piece.png", type: "image/png" });
    claimPieceTrainingReferenceMock.mockResolvedValueOnce({
      reference: { id: "training-existing", reviewStatus: "approved" }, claimed: false,
    });

    const existing = await requestPatch({ action: "promotePieceReference", sourceId });
    expect(existing.status).toBe(200);
    expect((await existing.json()).alreadySaved).toBe(true);
    expect(inngestSendMock).not.toHaveBeenCalled();

    claimPieceTrainingReferenceMock.mockResolvedValueOnce({
      reference: { id: "training-pending", reviewStatus: "pending_analysis" }, claimed: false,
    });
    const retried = await requestPatch({ action: "promotePieceReference", sourceId });
    expect(retried.status).toBe(200);
    expect(inngestSendMock).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ referenceId: "training-pending" }),
    }));
    expect(inngestSendMock.mock.calls.at(-1)?.[0]).not.toHaveProperty("id");

    claimPieceTrainingReferenceMock.mockResolvedValueOnce({
      reference: { id: "training-new", reviewStatus: "pending_analysis" }, claimed: true,
    });
    const created = await requestPatch({ action: "promotePieceReference", sourceId });
    expect(created.status).toBe(201);
    expect(inngestSendMock).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ referenceId: "training-new", assetKey: "trusted/piece.png" }),
    }));

    claimPieceTrainingReferenceMock.mockResolvedValueOnce({
      reference: { id: "training-failed", reviewStatus: "pending_analysis" }, claimed: true,
    });
    inngestSendMock.mockRejectedValueOnce(new Error("queue unavailable"));
    const failed = await requestPatch({ action: "promotePieceReference", sourceId });
    expect(failed.status).toBe(500);
    expect(deleteTrainingReferenceMock).not.toHaveBeenCalled();
    // The failed send leaves the winner's persisted pending row in place;
    // retry immediately enters the training consumer, whose persistence CAS
    // prevents a duplicate completed analysis.
    claimPieceTrainingReferenceMock.mockResolvedValueOnce({
      reference: { id: "training-failed", reviewStatus: "pending_analysis" }, claimed: false,
    });
    const retryAfterFailure = await requestPatch({ action: "promotePieceReference", sourceId });
    expect(retryAfterFailure.status).toBe(200);
    expect(inngestSendMock).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ referenceId: "training-failed" }),
    }));
    expect(claimPieceTrainingReferenceMock).toHaveBeenCalledTimes(5);
  });

  it.each([
    ["unready", { status: "uploaded", category: "style_reference" }],
    ["unclassified", { status: "ready", category: null }],
  ])("rejects promotion of a %s piece reference", async (_label, state) => {
    const sourceId = "00000000-0000-4000-8000-000000000406";
    getWorkMock.mockResolvedValue({
      work: { ...workItem, toolKind: "single" }, outputs: [],
      sources: [{ id: sourceId, assetId: "asset-1", usage: "both", usageConfirmed: true, status: state.status, pieceReference: { version: 1, category: state.category, classificationSource: "automatic", confidence: "low", userInstruction: null, hasTransparency: false } }],
    });

    const res = await requestPatch({ action: "promotePieceReference", sourceId });
    expect(res.status).toBe(409);
    expect(claimPieceTrainingReferenceMock).not.toHaveBeenCalled();
  });

  it("attaches a scoped template, maps it synchronously, and does not dispatch vision", async () => {
    createSourceMock.mockResolvedValue({
      source: { id: "source-template", workspaceId: "workspace-1", workItemId: "work-1", assetId: null, templateId: "template-1", usage: "both", status: "uploaded" },
      claimedForAnalysis: true,
    });
    analyzeSourceMock.mockResolvedValue({ id: "source-template", status: "ready" });

    const res = await PATCH(new Request("http://localhost/api/creative-work/work-1", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "attachSource", expectedUpdatedAt: "2026-07-13T12:00:00.000Z", templateId: "template-1", usage: "both" }),
    }), { params: makeParams("work-1") });

    expect(res.status).toBe(200);
    expect(getTemplateMock).toHaveBeenCalledWith("template-1", "workspace-1");
    expect(createSourceMock).toHaveBeenCalledWith({ workspaceId: "workspace-1", workItemId: "work-1", expectedUpdatedAt: new Date("2026-07-13T12:00:00.000Z"), templateId: "template-1", usage: "both", usageConfirmed: true, status: "uploaded" });
    expect(analyzeSourceMock).toHaveBeenCalledWith({ workspaceId: "workspace-1", workItemId: "work-1", sourceId: "source-template" });
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it.each([
    ["approved asset", { assetId: "asset-1" }, false],
    ["template", { templateId: "template-1" }, true],
  ] as const)("dispatches analysis once for concurrent-equivalent %s source attaches", async (_label, origin, template) => {
    const existing = {
      id: "source-existing", workspaceId: "workspace-1", workItemId: "work-1",
      assetId: template ? null : "asset-1", templateId: template ? "template-1" : null,
      usage: "both", status: "uploaded", updatedAt: new Date(),
    };
    createSourceMock
      .mockResolvedValueOnce({ source: existing, claimedForAnalysis: true })
      .mockResolvedValueOnce({ source: existing, claimedForAnalysis: false });
    analyzeSourceMock.mockResolvedValue({ ...existing, status: "ready" });

    const first = await requestPatch({ action: "attachSource", ...origin, usage: "both" });
    const replay = await requestPatch({ action: "attachSource", ...origin, usage: "both" });

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(createSourceMock).toHaveBeenCalledTimes(2);
    expect(inngestSendMock).toHaveBeenCalledTimes(template ? 0 : 1);
    expect(analyzeSourceMock).toHaveBeenCalledTimes(template ? 1 : 0);
  });

  it("reloads the canonical template source when the claimant loses the analysis CAS", async () => {
    const uploaded = {
      id: "source-template", workspaceId: "workspace-1", workItemId: "work-1",
      assetId: null, templateId: "template-1", usage: "both", status: "uploaded", updatedAt: new Date(),
    };
    const canonical = { ...uploaded, status: "analyzing", updatedAt: new Date(Date.now() + 1) };
    createSourceMock.mockResolvedValue({ source: uploaded, claimedForAnalysis: true });
    analyzeSourceMock.mockResolvedValue(null);
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [], sources: [canonical] });

    const res = await requestPatch({ action: "attachSource", templateId: "template-1", usage: "both" });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toEqual(expect.objectContaining({ id: "source-template", status: "analyzing" }));
  });

  it("rejects a replay when the persisted source usage differs from the attach payload", async () => {
    createSourceMock.mockResolvedValue(null);

    const res = await requestPatch({ action: "attachSource", assetId: "asset-1", usage: "style" });

    expect(res.status).toBe(400);
    expect(inngestSendMock).not.toHaveBeenCalled();
    expect(analyzeSourceMock).not.toHaveBeenCalled();
  });

  it("rejects a template outside the workspace without creating a source", async () => {
    getTemplateMock.mockResolvedValue(null);
    const res = await PATCH(new Request("http://localhost/api/creative-work/work-1", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "attachSource", templateId: "other-template", usage: "content" }),
    }), { params: makeParams("work-1") });
    expect(res.status).toBe(400);
    expect(createSourceMock).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it.each(["key", "mimeType", "contentAnalysis", "workspaceId"])("rejects browser-supplied source %s", async (field) => {
    const res = await PATCH(new Request("http://localhost/api/creative-work/work-1", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "attachSource", assetId: "asset-1", usage: "content", [field]: "untrusted" }),
    }), { params: makeParams("work-1") });
    expect(res.status).toBe(400);
    expect(createSourceMock).not.toHaveBeenCalled();
  });

  it("updates usage in scope and dispatches a new analysis attempt", async () => {
    getWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [],
      sources: [{ id: "source-1", workspaceId: "workspace-1", workItemId: "work-1", assetId: "asset-1", templateId: null, usage: "content", status: "ready", updatedAt: new Date("2026-07-16T12:00:00.000Z") }],
    });
    const res = await requestPatch({ action: "updateSource", sourceId: "source-1", usage: "style" });
    expect(res.status).toBe(200);
    expect(mutateDraftSourceMock).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1", workItemId: "work-1", sourceId: "source-1",
      mutation: { kind: "update", patch: { usage: "style", usageConfirmed: true, status: "uploaded", failureCode: null } },
    }));
    expect(inngestSendMock).toHaveBeenCalledOnce();
  });

  it("updates template usage synchronously without event dispatch", async () => {
    const templateSource = { id: "source-1", templateId: "template-1", assetId: null, usage: "content", status: "ready", updatedAt: new Date("2026-07-16T12:00:00.000Z") };
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [], sources: [templateSource] });
    mutateDraftSourceMock.mockResolvedValue({ ...templateSource, usage: "style", status: "uploaded", updatedAt: new Date("2026-07-16T12:00:00.001Z") });
    analyzeSourceMock.mockResolvedValue({ ...templateSource, usage: "style", status: "ready" });

    const res = await requestPatch({ action: "updateSource", sourceId: "source-1", usage: "style" });

    expect(res.status).toBe(200);
    expect(analyzeSourceMock).toHaveBeenCalledWith({ workspaceId: "workspace-1", workItemId: "work-1", sourceId: "source-1" });
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("retries only a failed source through CAS and dispatches once", async () => {
    const failed = { id: "source-1", usage: "content", status: "failed", updatedAt: new Date("2026-07-16T12:00:00.000Z") };
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [], sources: [failed] });
    await requestPatch({ action: "retrySource", sourceId: "source-1" });
    expect(mutateDraftSourceMock).toHaveBeenCalledWith(expect.objectContaining({
      mutation: { kind: "update", patch: { status: "uploaded", failureCode: null }, expected: { status: "failed", usage: "content", updatedAt: failed.updatedAt } },
    }));
    expect(inngestSendMock).toHaveBeenCalledOnce();
  });

  it("retries a template synchronously without event dispatch", async () => {
    const failed = { id: "source-1", templateId: "template-1", assetId: null, usage: "content", status: "failed", updatedAt: new Date("2026-07-16T12:00:00.000Z") };
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [], sources: [failed] });
    mutateDraftSourceMock.mockResolvedValue({ ...failed, status: "uploaded", updatedAt: new Date("2026-07-16T12:00:00.001Z") });
    analyzeSourceMock.mockResolvedValue({ ...failed, status: "ready" });

    const res = await requestPatch({ action: "retrySource", sourceId: "source-1" });

    expect(res.status).toBe(200);
    expect(analyzeSourceMock).toHaveBeenCalledOnce();
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("does not dispatch when retry loses its CAS", async () => {
    const failed = { id: "source-1", assetId: "asset-1", templateId: null, usage: "content", status: "failed", updatedAt: new Date("2026-07-16T12:00:00.000Z") };
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [], sources: [failed] });
    mutateDraftSourceMock.mockResolvedValue(null);
    const res = await requestPatch({ action: "retrySource", sourceId: "source-1" });
    expect(res.status).toBe(409);
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it.each([
    ["attach", { action: "attachSource", assetId: "asset-1", usage: "content" }],
    ["update", { action: "updateSource", sourceId: "source-1", usage: "style" }],
  ] as const)("marks an uploaded asset failed when %s dispatch fails", async (kind, body) => {
    const source = { id: "source-1", assetId: "asset-1", templateId: null, usage: kind === "update" ? "content" : "content", status: "ready", updatedAt: new Date("2026-07-16T12:00:00.000Z") };
    if (kind === "update") getWorkMock.mockResolvedValue({ work: workItem, outputs: [], sources: [source] });
    const uploaded = { ...source, usage: kind === "update" ? "style" : "content", status: "uploaded", updatedAt: new Date("2026-07-16T12:00:00.001Z") };
    if (kind === "attach") createSourceMock.mockResolvedValue({ source: uploaded, claimedForAnalysis: true });
    else mutateDraftSourceMock.mockResolvedValue(uploaded);
    inngestSendMock.mockRejectedValue(new Error("inngest unavailable"));
    updateSourceCasMock.mockResolvedValue({ ...uploaded, status: "failed", failureCode: "dispatch_failed" });

    const res = await requestPatch(body);

    expect(res.status).toBe(500);
    expect(updateSourceCasMock).toHaveBeenCalledWith(
      "workspace-1", "work-1", "source-1",
      { status: "uploaded", usage: uploaded.usage, updatedAt: uploaded.updatedAt },
      { status: "failed", failureCode: "dispatch_failed" },
    );
  });

  it("marks failed dispatch on retry and allows a later manual retry", async () => {
    const failed = { id: "source-1", assetId: "asset-1", templateId: null, usage: "content", status: "failed", updatedAt: new Date("2026-07-16T12:00:00.000Z") };
    const uploaded = { ...failed, status: "uploaded", updatedAt: new Date("2026-07-16T12:00:00.001Z") };
    const dispatchFailed = { ...failed, failureCode: "dispatch_failed", updatedAt: new Date("2026-07-16T12:00:00.002Z") };
    getWorkMock.mockResolvedValueOnce({ work: workItem, outputs: [], sources: [failed] }).mockResolvedValueOnce({ work: workItem, outputs: [], sources: [dispatchFailed] });
    mutateDraftSourceMock
      .mockResolvedValueOnce(uploaded)
      .mockResolvedValueOnce(dispatchFailed)
      .mockResolvedValueOnce({ ...uploaded, updatedAt: new Date("2026-07-16T12:00:00.003Z") });
    inngestSendMock.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(undefined);

    expect((await requestPatch({ action: "retrySource", sourceId: "source-1" })).status).toBe(500);
    expect((await requestPatch({ action: "retrySource", sourceId: "source-1" })).status).toBe(200);
    expect(inngestSendMock).toHaveBeenCalledTimes(2);
  });

  it.each(["analyzing", "ready"])("rejects duplicate retry from %s without dispatch", async (status) => {
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [], sources: [{ id: "source-1", usage: "content", status, updatedAt: new Date() }] });
    const res = await requestPatch({ action: "retrySource", sourceId: "source-1" });
    expect(res.status).toBe(409);
    expect(mutateDraftSourceMock).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("retries a stuck uploaded source by re-dispatching analysis", async () => {
    const uploaded = {
      id: "source-1",
      assetId: "asset-1",
      templateId: null,
      usage: "content",
      status: "uploaded",
      updatedAt: new Date("2026-07-16T12:00:00.000Z"),
    };
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [], sources: [uploaded] });
    mutateDraftSourceMock.mockResolvedValue({ ...uploaded, updatedAt: new Date("2026-07-16T12:00:00.001Z") });
    const res = await requestPatch({ action: "retrySource", sourceId: "source-1" });
    expect(res.status).toBe(200);
    expect(mutateDraftSourceMock).toHaveBeenCalledWith(expect.objectContaining({
      mutation: { kind: "update", patch: { status: "uploaded", failureCode: null }, expected: { status: "uploaded", usage: "content", updatedAt: uploaded.updatedAt } },
    }));
    expect(inngestSendMock).toHaveBeenCalledOnce();
  });

  it("removes only the scoped source without dispatch", async () => {
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [], sources: [{ id: "source-1", usage: "content", status: "ready" }] });
    await requestPatch({ action: "removeSource", sourceId: "source-1" });
    expect(mutateDraftSourceMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1", workItemId: "work-1", expectedUpdatedAt: new Date("2026-07-13T12:00:00.000Z"), sourceId: "source-1", mutation: { kind: "remove" },
    });
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("returns a conflict when prepare wins before a browser source removal", async () => {
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [], sources: [{ id: "source-1", usage: "content", status: "ready" }] });
    mutateDraftSourceMock.mockResolvedValue(null);

    const res = await requestPatch({ action: "removeSource", sourceId: "source-1" });

    expect(res.status).toBe(409);
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("edits only usage-allowed analysis and invalidates prepared data", async () => {
    const validContent = { product: "Tênis", offer: "20%", cta: { text: "Comprar", style: "botão" }, brandElements: [], keyVisual: "produto", textContent: { headline: "Novo", bullets: [] }, format: "4:5" };
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [], sources: [{ id: "source-1", usage: "content", status: "ready" }] });
    await requestPatch({ action: "editSourceAnalysis", sourceId: "source-1", content: validContent, style: null });
    expect(mutateDraftSourceMock).toHaveBeenCalledWith(expect.objectContaining({
      mutation: expect.objectContaining({ kind: "update", patch: { contentAnalysis: validContent, styleAnalysis: null, status: "ready", failureCode: null } }),
    }));
    expect(updateDraftMock).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("does not invalidate prepared data when a concurrent edit loses the source", async () => {
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [], sources: [{ id: "source-1", usage: "content", status: "ready" }] });
    mutateDraftSourceMock.mockResolvedValue(null);
    const validContent = { product: "Tênis", offer: "20%", cta: { text: "Comprar", style: "botão" }, brandElements: [], keyVisual: "produto", textContent: { headline: "Novo", bullets: [] }, format: "4:5" };
    const res = await requestPatch({ action: "editSourceAnalysis", sourceId: "source-1", content: validContent, style: null });
    expect(res.status).toBe(409);
    expect(updateDraftMock).not.toHaveBeenCalled();
  });

  it("maps identity_reference_not_approved → 422", async () => {
    confirmMock.mockResolvedValue({
      ok: false,
      error: {
        code: "identity_reference_not_approved",
        referenceId: refId1,
      },
    });

    const res = await PATCH(
      new Request("http://localhost/api/creative-work/work-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirmBody),
      }),
      { params: makeParams("work-1") }
    );

    expect(res.status).toBe(422);
  });
  it("maps regeneration dispatch failure to 503", async () => {
    requestRegenerationMock.mockResolvedValue({ ok: false, code: "layer_regeneration_dispatch_failed" });

    const response = await requestPatch({
      action: "regenerateLayer",
      outputId: "00000000-0000-4000-8000-000000000111",
      leaseId: "00000000-0000-4000-8000-000000000112",
      expectedRevision: 4,
      operationId: "00000000-0000-4000-8000-000000000113",
      layerId: "00000000-0000-4000-8000-000000000114",
      instruction: "Change only the product color",
    });

    expect(response.status).toBe(503);
  });

  it("keeps the public read-only document in 409 error details when opening a foreign lease", async () => {
    const document = { schemaVersion: 1, revision: 1, canvas: { width: 10, height: 10 }, layers: [], lease: { mode: "read", leaseId: null, heldByName: "Editor A", expiresAt: "2099-08-22T00:00:00.000Z" }, regeneration: null, updatedAt: "2026-08-22T00:00:00.000Z" };
    openLayerEditorMock.mockResolvedValue({ ok: false, status: 409, code: "layer_editor_locked", document });
    const response = await requestPatch({ action: "openLayerEditor", outputId: "00000000-0000-4000-8000-000000000111", mode: "edit" });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ code: "layer_editor_locked", details: { document } });
  });

  it("maps disabled regeneration entitlement to 403", async () => {
    requestRegenerationMock.mockResolvedValue({ ok: false, code: "disabled" });
    const response = await requestPatch({
      action: "regenerateLayer", outputId: "00000000-0000-4000-8000-000000000111", leaseId: "00000000-0000-4000-8000-000000000112",
      expectedRevision: 4, operationId: "00000000-0000-4000-8000-000000000113", layerId: "00000000-0000-4000-8000-000000000114", instruction: "Change only the product color",
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "layer_editor_not_available" });
  });

  it("maps regeneration quota exhaustion to the public 429 code", async () => {
    requestRegenerationMock.mockResolvedValue({ ok: false, code: "quota_exhausted" });
    const response = await requestPatch({ action: "regenerateLayer", outputId: "00000000-0000-4000-8000-000000000111", leaseId: "00000000-0000-4000-8000-000000000112", expectedRevision: 4, operationId: "00000000-0000-4000-8000-000000000113", layerId: "00000000-0000-4000-8000-000000000114", instruction: "Change" });
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ code: "layer_editor_quota_exhausted" });
  });

  it("adapts candidate commands without exposing storage or repository seams", async () => {
    const request = { action: "acceptLayerCandidate", outputId: "00000000-0000-4000-8000-000000000111", leaseId: "00000000-0000-4000-8000-000000000112", expectedRevision: 4, operationId: "00000000-0000-4000-8000-000000000113" };
    const response = await requestPatch(request);
    expect(response.status).toBe(200);
    expect(acceptCandidateCommandMock).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "workspace-1", workItemId: "work-1", userId: "user-1" }));
  });

  it("maps candidate entitlement and conflict errors from the application service", async () => {
    discardCandidateCommandMock.mockResolvedValue({ ok: false, code: "layer_editor_not_available" });
    const request = { action: "discardLayerCandidate", outputId: "00000000-0000-4000-8000-000000000111", leaseId: "00000000-0000-4000-8000-000000000112", expectedRevision: 4, operationId: "00000000-0000-4000-8000-000000000113" };
    await expect(requestPatch(request)).resolves.toMatchObject({ status: 403 });
    discardCandidateCommandMock.mockResolvedValue({ ok: false, code: "layer_editor_revision_conflict" });
    await expect(requestPatch(request)).resolves.toMatchObject({ status: 409 });
  });

  it.each([
    ["a new child", { ok: true, replay: false, output: { id: "child-1", isSelected: false } }, 201],
    ["a replayed child", { ok: true, replay: true, output: { id: "child-1", isSelected: false } }, 200],
    ["a stale publication", { ok: false, code: "layer_editor_publish_conflict" }, 409],
    ["a missing artifact", { ok: false, code: "layer_editor_artifact_missing" }, 409],
    ["an unavailable entitlement", { ok: false, code: "layer_editor_not_available" }, 403],
  ] as const)("maps publishLayerEditor %s to the contract status", async (_label, result, status) => {
    publishLayerEditorMock.mockResolvedValue(result);

    const response = await requestPatch({
      action: "publishLayerEditor",
      outputId: "00000000-0000-4000-8000-000000000111",
      leaseId: "00000000-0000-4000-8000-000000000112",
      expectedRevision: 4,
      operationId: "00000000-0000-4000-8000-000000000113",
    });

    expect(response.status).toBe(status);
    expect(publishLayerEditorMock).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "workspace-1", workItemId: "work-1", userId: "user-1" }));
  });

  it("allowlists the published child DTO at the route boundary", async () => {
    publishLayerEditorMock.mockResolvedValue({ ok: true, replay: false, output: { id: "child-1", parentOutputId: "parent-1", status: "completed", isSelected: false, creativeLevel: "balanced", targetFormat: "4:5", versionNumber: 2, outputKey: "private/piece.png", layerEditor: { publishedPsdKey: "private/piece.psd" } } });
    const response = await requestPatch({ action: "publishLayerEditor", outputId: "00000000-0000-4000-8000-000000000111", leaseId: "00000000-0000-4000-8000-000000000112", expectedRevision: 4, operationId: "00000000-0000-4000-8000-000000000113" });
    const payload = await response.json();
    expect(response.status).toBe(201);
    expect(JSON.stringify(payload)).not.toMatch(/outputKey|layerEditor|publishedPsdKey|private\//);
  });
});

describe("POST /api/creative-work/[id] layerization callback", () => {
  it("accepts a bounded callback only through the tokenized existing seam", async () => {
    callbackHandlerMock.mockResolvedValue({ ok: true, replay: false });
    const response = await POST(
      new Request("http://localhost/api/creative-work/work-1?layerizeCallback=1&outputId=output-1&attemptId=attempt-1&token=token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED", request_id: "req-1", output: { layers: [] } }),
      }),
      { params: makeParams("work-1") },
    );

    expect(response.status).toBe(202);
    expect(callbackHandlerMock).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: "work-1",
      outputId: "output-1",
      attemptId: "attempt-1",
      token: "token",
    }));
  });
});

describe("PATCH /api/creative-work/[id] approveCarousel", () => {
  beforeEach(() => {
    approveCarouselDeckMock.mockReset();
    linkCampaignMock.mockReset();
    createSourceMock.mockReset();
  });

  it("dispatches the strict approveCarousel action to the workspace-scoped command", async () => {
    approveCarouselDeckMock.mockResolvedValue({
      ok: true,
      replay: false,
      value: { work: { id: "work-1", carouselApprovedRevision: "deck-r1" }, replay: false },
    });
    const response = await requestPatch({ action: "approveCarousel", revision: "deck-r1" });

    expect(response.status).toBe(201);
    expect(approveCarouselDeckMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      revision: "deck-r1",
    });
    await expect(response.json()).resolves.toMatchObject({ approvedRevision: "deck-r1", replay: false });
  });

  it("returns 200 on a replayed approval", async () => {
    approveCarouselDeckMock.mockResolvedValue({
      ok: true,
      value: { work: { id: "work-1", carouselApprovedRevision: "deck-r1" }, replay: true },
    });
    const response = await requestPatch({ action: "approveCarousel", revision: "deck-r1" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ replay: true });
  });

  it("rejects bodies outside the strict schema before any command runs", async () => {
    const missingRevision = await requestPatch({ action: "approveCarousel" });
    expect(missingRevision.status).toBe(400);

    const extraField = await requestPatch({ action: "approveCarousel", revision: "deck-r1", outputId: "output-1" });
    expect(extraField.status).toBe(400);

    const blankRevision = await requestPatch({ action: "approveCarousel", revision: "" });
    expect(blankRevision.status).toBe(400);

    expect(approveCarouselDeckMock).not.toHaveBeenCalled();
  });

  it.each([
    ["work_not_found", 404, undefined],
    ["work_not_carousel", 409, undefined],
    ["stale_input", 409, undefined],
    ["revision_conflict", 409, undefined],
  ])("maps %s to %i", async (code, status) => {
    approveCarouselDeckMock.mockResolvedValue({ ok: false, error: { code } });
    const response = await requestPatch({ action: "approveCarousel", revision: "deck-r1" });
    expect(response.status).toBe(status);
  });

  it("carries the objective findings in the 409 details and never mutates campaigns or outputs", async () => {
    const findings = [{ path: "positions.2", code: "missing_position", message: "position 2 has no current slide" }];
    approveCarouselDeckMock.mockResolvedValue({ ok: false, error: { code: "deck_not_ready", details: { findings } } });
    const response = await requestPatch({ action: "approveCarousel", revision: "deck-r1" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ details: { findings } });
    expect(linkCampaignMock).not.toHaveBeenCalled();
    expect(createSourceMock).not.toHaveBeenCalled();
  });

  it("saves a review draft and returns the canonical cost without dispatch", async () => {
    const draft = {
      version: 1,
      revision: 1,
      revisionKey: "00000000-0000-4000-8000-000000000001",
      action: "refine",
      targetFormat: "4:5",
      instruction: "Aumente o título",
      annotations: [],
      revisionAssetId: null,
    };
    saveOutputReviewMock.mockResolvedValue({
      ok: true,
      value: { draft, revisionCreditCost: 50 },
    });
    const response = await requestPatch({
      action: "saveOutputReview",
      outputId: "00000000-0000-4000-8000-000000000002",
      expectedReviewRevision: 0,
      draft: {
        action: "refine",
        targetFormat: "4:5",
        instruction: "Aumente o título",
        annotations: [],
        revisionAssetId: null,
      },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      draft,
      revisionCreditCost: 50,
    });
  });

  it("maps a stale review writer to 409 without overwriting", async () => {
    saveOutputReviewMock.mockResolvedValue({
      ok: false,
      error: { code: "review_conflict" },
    });
    const response = await requestPatch({
      action: "saveOutputReview",
      outputId: "00000000-0000-4000-8000-000000000002",
      expectedReviewRevision: 0,
      draft: {
        action: "refine",
        targetFormat: "4:5",
        instruction: "Aumente o título",
        annotations: [],
        revisionAssetId: null,
      },
    });
    expect(response.status).toBe(409);
  });
});

describe("GET review projection", () => {
  it("projects saved drafts without private storage keys and exposes canonical cost", async () => {
    const { GET } = await import("./route");
    getWorkMock.mockResolvedValue({
      work: { ...workItem, toolKind: "single", inputSnapshot: null },
      outputs: [
        {
          id: "output-1",
          workItemId: "work-1",
          creativeLevel: "balanced",
          targetFormat: "4:5",
          versionNumber: 1,
          parentOutputId: null,
          revisionInstruction: null,
          revisionAssetId: null,
          reviewDraft: {
            version: 1,
            revision: 1,
            revisionKey: "00000000-0000-4000-8000-000000000001",
            action: "refine",
            targetFormat: "4:5",
            instruction: "Aumente o título",
            annotations: [],
            revisionAssetId: null,
          },
          revisionContext: null,
          retryCount: 0,
          imageCallCount: 1,
          status: "completed",
          outputKey: "pieces/base.png",
          failureCode: null,
          quality: null,
          isSelected: false,
          directionId: null,
          directionSnapshot: null,
          createdAt: new Date("2026-07-13T12:00:00.000Z"),
          updatedAt: new Date("2026-07-13T12:00:00.000Z"),
          layerization: null,
          layerEditor: null,
        },
      ],
      sources: [],
    });
    const res = await GET(new Request("http://localhost/api/creative-work/work-1"), {
      params: makeParams("work-1"),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.outputs[0].reviewDraft).toMatchObject({ revision: 1 });
    expect(body.outputs[0].revisionContext).toBeNull();
    expect(body.revisionCreditCost).toBe(50);
    expect(JSON.stringify(body)).not.toContain("pieces/base.png");
  });

  it("rejects persisted drafts with extra private keys or invalid versions without reset", async () => {    const { GET } = await import("./route");
    const base = {
      id: "output-1",
      workItemId: "work-1",
      creativeLevel: "balanced",
      targetFormat: "4:5",
      versionNumber: 1,
      parentOutputId: null,
      revisionInstruction: null,
      revisionAssetId: null,
      retryCount: 0,
      imageCallCount: 1,
      status: "completed",
      outputKey: "pieces/base.png",
      failureCode: null,
      quality: null,
      isSelected: false,
      directionId: null,
      directionSnapshot: null,
      createdAt: new Date("2026-07-13T12:00:00.000Z"),
      updatedAt: new Date("2026-07-13T12:00:00.000Z"),
      layerization: null,
      layerEditor: null,
    };
    getWorkMock.mockResolvedValue({
      work: { ...workItem, toolKind: "single", inputSnapshot: null },
      outputs: [
        {
          ...base,
          id: "output-extra",
          reviewDraft: {
            version: 1,
            revision: 1,
            revisionKey: "00000000-0000-4000-8000-000000000001",
            action: "refine",
            targetFormat: "4:5",
            instruction: "Ajuste",
            annotations: [],
            revisionAssetId: null,
            storageKey: "private/extra.png",
          },
          revisionContext: {
            version: 2,
            reviewRevision: 1,
            sourceOutputId: "00000000-0000-4000-8000-000000000002",
            sourceOutputVersion: 1,
            action: "refine",
            targetFormat: "4:5",
            instruction: "Ajuste",
            annotations: [],
            revisionAssetId: null,
          },
        },
      ],
      sources: [],
    });
    const res = await GET(new Request("http://localhost/api/creative-work/work-1"), {
      params: makeParams("work-1"),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.outputs[0].reviewDraft).toBeNull();
    expect(body.outputs[0].revisionContext).toBeNull();
    expect(JSON.stringify(body)).not.toContain("private/extra.png");
  });
});

describe("GET objective-quality refund recovery (R1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    failStaleOutputsMock.mockResolvedValue([]);
    failStaleSourcesMock.mockResolvedValue([]);
    listPendingRefundsMock.mockResolvedValue([]);
    markOutputFailureCodeMock.mockResolvedValue(null);
    clearObjectiveQualityMarkerMock.mockResolvedValue(null);
    refundHelperMock.mockResolvedValue(true);
    getUsageByIdempotencyKeyMock.mockResolvedValue(null);
    resolveReactivationMock.mockResolvedValue({ state: "none" });
    recordAggregateMock.mockResolvedValue(null);
    layerEditorAccessMock.mockResolvedValue({ enabled: false, period: null, layerize: null, regeneration: null });
  });

  const markedOutput = {
    id: "output-1",
    workItemId: "work-1",
    creativeLevel: "balanced",
    targetFormat: "4:5",
    versionNumber: 1,
    parentOutputId: null,
    revisionInstruction: null,
    revisionAssetId: null,
    reviewDraft: null,
    revisionContext: null,
    retryCount: 0,
    imageCallCount: 1,
    manualRetryAttempt: null,
    status: "completed",
    outputKey: "pieces/final.png",
    failureCode: "objective_quality_failed_refund_pending",
    quality: { schemaVersion: 1, objectiveVerdict: "fail" },
    isSelected: false,
    directionId: null,
    directionSnapshot: null,
    createdAt: new Date("2026-07-13T12:00:00.000Z"),
    updatedAt: new Date("2026-07-13T12:00:00.000Z"),
    layerization: null,
    layerEditor: null,
  };

  it("refunds a preserved QA-fail preview with the terminal key and clears only the marker", async () => {
    listPendingRefundsMock.mockResolvedValue([markedOutput]);
    getWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [markedOutput],
      sources: [],
    });

    const res = await GET(new Request("http://localhost/api/creative-work/work-1"), {
      params: makeParams("work-1"),
    });

    expect(res.status).toBe(200);
    expect(refundHelperMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      outputId: "output-1",
      reason: "objective_quality_failed",
      manualRetryAttempt: null,
      failurePhase: "terminal",
      userId: "user-1",
    });
    expect(clearObjectiveQualityMarkerMock).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      "output-1",
      "pieces/final.png",
    );
    // The generic failed-row code rewrite never touches a completed preview.
    expect(markOutputFailureCodeMock).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.outputs[0].hasOutput).toBe(true);
    expect(body.outputs[0].quality).toMatchObject({ objectiveVerdict: "fail" });
  });

  it("keeps the marker when the refund fails so recovery can resume", async () => {
    refundHelperMock.mockResolvedValueOnce(false);
    listPendingRefundsMock.mockResolvedValue([markedOutput]);
    getWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [markedOutput],
      sources: [],
    });

    const res = await GET(new Request("http://localhost/api/creative-work/work-1"), {
      params: makeParams("work-1"),
    });

    expect(res.status).toBe(200);
    expect(refundHelperMock).toHaveBeenCalledTimes(1);
    expect(clearObjectiveQualityMarkerMock).not.toHaveBeenCalled();
    expect(markOutputFailureCodeMock).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.outputs[0].hasOutput).toBe(true);
  });
});
