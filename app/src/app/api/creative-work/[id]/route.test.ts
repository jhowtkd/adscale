import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET, PATCH } from "./route";

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

const getWorkMock = vi.hoisted(() => vi.fn());
const failStaleOutputsMock = vi.hoisted(() => vi.fn());
const failStaleSourcesMock = vi.hoisted(() => vi.fn());
const refreshStatusMock = vi.hoisted(() => vi.fn());
const confirmMock = vi.hoisted(() => vi.fn());
const updateDraftMock = vi.hoisted(() => vi.fn());
const prepareMock = vi.hoisted(() => vi.fn());
const createSourceMock = vi.hoisted(() => vi.fn());
const updateSourceMock = vi.hoisted(() => vi.fn());
const updateSourceCasMock = vi.hoisted(() => vi.fn());
const deleteSourceMock = vi.hoisted(() => vi.fn());
const linkCampaignMock = vi.hoisted(() => vi.fn());
const getAssetMock = vi.hoisted(() => vi.fn());
const getTemplateMock = vi.hoisted(() => vi.fn());
const analyzeSourceMock = vi.hoisted(() => vi.fn());
const inngestSendMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: (...args: unknown[]) => getWorkMock(...args),
  failStaleCreativeWorkOutputs: (...args: unknown[]) => failStaleOutputsMock(...args),
  failStaleCreativeWorkSources: (...args: unknown[]) => failStaleSourcesMock(...args),
  refreshCreativeWorkStatus: (...args: unknown[]) => refreshStatusMock(...args),
  updateCreativeWorkDraft: (...args: unknown[]) => updateDraftMock(...args),
  createCreativeWorkSource: (...args: unknown[]) => createSourceMock(...args),
  updateCreativeWorkSource: (...args: unknown[]) => updateSourceMock(...args),
  updateCreativeWorkSourceIfUnchanged: (...args: unknown[]) => updateSourceCasMock(...args),
  deleteCreativeWorkSource: (...args: unknown[]) => deleteSourceMock(...args),
  linkCreativeWorkCampaign: (...args: unknown[]) => linkCampaignMock(...args),
}));

vi.mock("@/server/repositories/workspace-asset", () => ({
  getWorkspaceAssetById: (...args: unknown[]) => getAssetMock(...args),
}));
vi.mock("@/server/repositories/template", () => ({ getTemplateById: (...args: unknown[]) => getTemplateMock(...args) }));
vi.mock("@/server/application/analyze-creative-work-source", () => ({ analyzeCreativeWorkSource: (...args: unknown[]) => analyzeSourceMock(...args) }));
vi.mock("@/server/jobs/client", () => ({ inngest: { send: (...args: unknown[]) => inngestSendMock(...args) } }));

vi.mock("@/server/application/confirm-social-post-work", () => ({
  confirmSocialPostWork: (...args: unknown[]) => confirmMock(...args),
}));
vi.mock("@/server/application/prepare-creative-work", () => ({
  prepareCreativeWork: (...args: unknown[]) => prepareMock(...args),
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
    failStaleOutputsMock.mockResolvedValue([]);
    failStaleSourcesMock.mockResolvedValue([]);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns work, outputs, and canonical projection", async () => {
    getWorkMock.mockResolvedValue({ work: workItem, outputs });

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
    expect(getWorkMock).toHaveBeenCalledWith("workspace-1", "work-1");
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
    failStaleOutputsMock.mockResolvedValue([{ id: "o1", status: "failed" }]);
    refreshStatusMock.mockResolvedValue("failed");
    getWorkMock.mockResolvedValue({
      work: { ...workItem, status: "failed" },
      outputs: [{ ...outputs[0], status: "failed", failureCode: "generation_timeout" }],
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
        { id: "source-1", assetId: "asset-1", templateId: null, usage: "content", status: "ready" },
        { id: "source-2", assetId: null, templateId: "template-1", usage: "style", status: "ready" },
      ],
    });
    getAssetMock.mockResolvedValue({ id: "asset-1", workspaceId: "workspace-1", name: "aprovada.png", source: "creative_work" });
    getTemplateMock.mockResolvedValue({ id: "template-1", workspaceId: "workspace-1", name: "Black Friday" });

    const res = await GET(new Request("http://localhost/api/creative-work/work-1"), { params: makeParams("work-1") });
    const body = await res.json();

    expect(body.sources).toEqual([
      expect.objectContaining({ id: "source-1", name: "aprovada.png", origin: "approved_work" }),
      expect.objectContaining({ id: "source-2", name: "Black Friday", origin: "template" }),
    ]);
    expect(getAssetMock).toHaveBeenCalledWith("asset-1", "workspace-1");
    expect(getTemplateMock).toHaveBeenCalledWith("template-1", "workspace-1");
  });
});

describe("PATCH /api/creative-work/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    prepareMock.mockResolvedValue({ ok: true, value: { work: workItem, quote: [{}, {}, {}] } });
    const res = await PATCH(new Request("http://localhost/api/creative-work/work-1", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare" }),
    }), { params: makeParams("work-1") });
    expect(res.status).toBe(200);
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

  it.each(["uploaded", "analyzing", "ready"])("rejects duplicate retry from %s without dispatch", async (status) => {
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [], sources: [{ id: "source-1", usage: "content", status, updatedAt: new Date() }] });
    const res = await requestPatch({ action: "retrySource", sourceId: "source-1" });
    expect(res.status).toBe(409);
    expect(updateSourceCasMock).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();
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
});
