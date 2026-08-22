import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET, PATCH, POST } from "./route";
import { AUTH_ERROR_CODES, WorkspaceAuthError } from "@/server/auth/errors";

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
const prepareMock = vi.hoisted(() => vi.fn());
const detectDraftConflictMock = vi.hoisted(() => vi.fn());
const createSourceMock = vi.hoisted(() => vi.fn());
const updateSourceMock = vi.hoisted(() => vi.fn());
const updateSourceCasMock = vi.hoisted(() => vi.fn());
const deleteSourceMock = vi.hoisted(() => vi.fn());
const linkCampaignMock = vi.hoisted(() => vi.fn());
const getAssetMock = vi.hoisted(() => vi.fn());
const getTemplateMock = vi.hoisted(() => vi.fn());
const analyzeSourceMock = vi.hoisted(() => vi.fn());
const inngestSendMock = vi.hoisted(() => vi.fn());
const terminalTelemetryMock = vi.hoisted(() => vi.fn());
const aggregateTelemetryMock = vi.hoisted(() => vi.fn());
const recordAggregateMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: (...args: unknown[]) => getWorkMock(...args),
  failStaleCreativeWorkOutputs: (...args: unknown[]) => failStaleOutputsMock(...args),
  failStaleQueuedCreativeWorkOutputs: (...args: unknown[]) => failStaleOutputsMock(...args),
  failStaleProcessingCreativeWorkOutputs: (...args: unknown[]) => failStaleOutputsMock(...args),
  failStaleCreativeWorkSources: (...args: unknown[]) => failStaleSourcesMock(...args),
  listCreativeWorkOutputsNeedingRefund: vi.fn(async () => []),
  markCreativeWorkOutputFailureCode: vi.fn(async () => null),
  recordCreativeWorkGenerationAggregate: (...args: unknown[]) => recordAggregateMock(...args),
  refreshCreativeWorkStatus: (...args: unknown[]) => refreshStatusMock(...args),
  updateCreativeWorkDraft: (...args: unknown[]) => updateDraftMock(...args),
  createCreativeWorkSource: (...args: unknown[]) => createSourceMock(...args),
  updateCreativeWorkSource: (...args: unknown[]) => updateSourceMock(...args),
  updateCreativeWorkSourceIfUnchanged: (...args: unknown[]) => updateSourceCasMock(...args),
  deleteCreativeWorkSource: (...args: unknown[]) => deleteSourceMock(...args),
  linkCreativeWorkCampaign: (...args: unknown[]) => linkCampaignMock(...args),
}));

vi.mock("@/server/billing/credits", () => ({
  refundCredits: vi.fn(async () => ({ status: "refunded" })),
}));

vi.mock("@/server/repositories/workspace-asset", () => ({
  getWorkspaceAssetById: (...args: unknown[]) => getAssetMock(...args),
}));
vi.mock("@/server/repositories/template", () => ({ getTemplateById: (...args: unknown[]) => getTemplateMock(...args) }));
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

function makeParams(id: string) {
  return Promise.resolve({ id });
}

function requestPatch(body: unknown) {
  return PATCH(new Request("http://localhost/api/creative-work/work-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
    recordAggregateMock.mockResolvedValue(null);
    layerEditorAccessMock.mockResolvedValue({ enabled: false, period: null, layerize: null, regeneration: null });
  });
  afterEach(() => {
    vi.restoreAllMocks();
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

  it("autosaves only editable fields and preserves clientProfileId", async () => {
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [], sources: [] });
    updateDraftMock.mockResolvedValue({ ...workItem, request: "Novo pedido", brief: null });
    const res = await PATCH(new Request("http://localhost/api/creative-work/work-1", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "autosave", request: "Novo pedido", intent: "variations", format: "1:1", settings: { targetFormats: [] } }),
    }), { params: makeParams("work-1") });
    expect(res.status).toBe(200);
    expect(updateDraftMock).toHaveBeenCalledWith("workspace-1", "work-1", {
      request: "Novo pedido", toolKind: "variations", format: "1:1", settings: { targetFormats: [] }, brief: null, copy: null, inputSnapshot: null,
    });
    expect(updateDraftMock.mock.calls[0][2]).not.toHaveProperty("clientProfileId");
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
  ])("maps prepare %s to %i", async (code, status) => {
    prepareMock.mockResolvedValue({ ok: false, error: { code } });
    const res = await PATCH(new Request("http://localhost/api/creative-work/work-1", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare" }),
    }), { params: makeParams("work-1") });
    expect(res.status).toBe(status);
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
    updateDraftMock.mockResolvedValue({ ...workItem, toolKind: "restyle" });
    const res = await requestPatch({ action: "resolveBrandConflict", choice: "source" });
    expect(res.status).toBe(200);
    expect(updateDraftMock).toHaveBeenCalledWith("workspace-1", "work-1", {
      settings: { targetFormats: [], brandConflictChoice: "source", brandConflictDetectedBrand: "XTB" },
      brief: null,
      copy: null,
      inputSnapshot: null,
    });
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
      body: JSON.stringify({ action: "attachSource", assetId: "asset-1", usage: "both" }),
    }), { params: makeParams("work-1") });

    expect(res.status).toBe(200);
    expect(getAssetMock).toHaveBeenCalledWith("asset-1", "workspace-1");
    expect(createSourceMock).toHaveBeenCalledWith({ workspaceId: "workspace-1", workItemId: "work-1", assetId: "asset-1", usage: "both", usageConfirmed: true, status: "uploaded" });
    expect(inngestSendMock).toHaveBeenCalledWith({ name: "creative-work.source.analyze", data: { workspaceId: "workspace-1", workItemId: "work-1", sourceId: "source-1" } });
  });

  it("attaches a scoped template, maps it synchronously, and does not dispatch vision", async () => {
    createSourceMock.mockResolvedValue({
      source: { id: "source-template", workspaceId: "workspace-1", workItemId: "work-1", assetId: null, templateId: "template-1", usage: "both", status: "uploaded" },
      claimedForAnalysis: true,
    });
    analyzeSourceMock.mockResolvedValue({ id: "source-template", status: "ready" });

    const res = await PATCH(new Request("http://localhost/api/creative-work/work-1", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "attachSource", templateId: "template-1", usage: "both" }),
    }), { params: makeParams("work-1") });

    expect(res.status).toBe(200);
    expect(getTemplateMock).toHaveBeenCalledWith("template-1", "workspace-1");
    expect(createSourceMock).toHaveBeenCalledWith({ workspaceId: "workspace-1", workItemId: "work-1", templateId: "template-1", usage: "both", usageConfirmed: true, status: "uploaded" });
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
    getWorkMock
      .mockResolvedValueOnce({ work: workItem, outputs: [], sources: [] })
      .mockResolvedValueOnce({ work: workItem, outputs: [], sources: [canonical] });

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
    await requestPatch({ action: "updateSource", sourceId: "source-1", usage: "style" });
    expect(updateSourceMock).toHaveBeenCalledWith("workspace-1", "work-1", "source-1", { usage: "style", usageConfirmed: true, status: "uploaded", failureCode: null });
    expect(inngestSendMock).toHaveBeenCalledOnce();
  });

  it("updates template usage synchronously without event dispatch", async () => {
    const templateSource = { id: "source-1", templateId: "template-1", assetId: null, usage: "content", status: "ready", updatedAt: new Date("2026-07-16T12:00:00.000Z") };
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [], sources: [templateSource] });
    updateSourceMock.mockResolvedValue({ ...templateSource, usage: "style", status: "uploaded", updatedAt: new Date("2026-07-16T12:00:00.001Z") });
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
    expect(updateSourceCasMock).toHaveBeenCalledWith(
      "workspace-1", "work-1", "source-1",
      { status: "failed", usage: "content", updatedAt: failed.updatedAt },
      { status: "uploaded", failureCode: null },
    );
    expect(inngestSendMock).toHaveBeenCalledOnce();
  });

  it("retries a template synchronously without event dispatch", async () => {
    const failed = { id: "source-1", templateId: "template-1", assetId: null, usage: "content", status: "failed", updatedAt: new Date("2026-07-16T12:00:00.000Z") };
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [], sources: [failed] });
    updateSourceCasMock.mockResolvedValue({ ...failed, status: "uploaded", updatedAt: new Date("2026-07-16T12:00:00.001Z") });
    analyzeSourceMock.mockResolvedValue({ ...failed, status: "ready" });

    const res = await requestPatch({ action: "retrySource", sourceId: "source-1" });

    expect(res.status).toBe(200);
    expect(analyzeSourceMock).toHaveBeenCalledOnce();
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("does not dispatch when retry loses its CAS", async () => {
    const failed = { id: "source-1", assetId: "asset-1", templateId: null, usage: "content", status: "failed", updatedAt: new Date("2026-07-16T12:00:00.000Z") };
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [], sources: [failed] });
    updateSourceCasMock.mockResolvedValue(null);
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
    else updateSourceMock.mockResolvedValue(uploaded);
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
    updateSourceCasMock
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
    expect(updateSourceCasMock).not.toHaveBeenCalled();
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
    updateSourceCasMock.mockResolvedValue({ ...uploaded, updatedAt: new Date("2026-07-16T12:00:00.001Z") });
    const res = await requestPatch({ action: "retrySource", sourceId: "source-1" });
    expect(res.status).toBe(200);
    expect(updateSourceCasMock).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      "source-1",
      { status: "uploaded", usage: "content", updatedAt: uploaded.updatedAt },
      { status: "uploaded", failureCode: null },
    );
    expect(inngestSendMock).toHaveBeenCalledOnce();
  });

  it("removes only the scoped source without dispatch", async () => {
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [], sources: [{ id: "source-1", usage: "content", status: "ready" }] });
    await requestPatch({ action: "removeSource", sourceId: "source-1" });
    expect(deleteSourceMock).toHaveBeenCalledWith("workspace-1", "work-1", "source-1");
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("edits only usage-allowed analysis and invalidates prepared data", async () => {
    const validContent = { product: "Tênis", offer: "20%", cta: { text: "Comprar", style: "botão" }, brandElements: [], keyVisual: "produto", textContent: { headline: "Novo", bullets: [] }, format: "4:5" };
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [], sources: [{ id: "source-1", usage: "content", status: "ready" }] });
    await requestPatch({ action: "editSourceAnalysis", sourceId: "source-1", content: validContent, style: null });
    expect(updateSourceMock).toHaveBeenCalledWith("workspace-1", "work-1", "source-1", { contentAnalysis: validContent, styleAnalysis: null, status: "ready", failureCode: null });
    expect(updateDraftMock).toHaveBeenCalledWith("workspace-1", "work-1", { brief: null, copy: null, inputSnapshot: null });
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("does not invalidate prepared data when a concurrent edit loses the source", async () => {
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [], sources: [{ id: "source-1", usage: "content", status: "ready" }] });
    updateSourceMock.mockResolvedValue(null);
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
