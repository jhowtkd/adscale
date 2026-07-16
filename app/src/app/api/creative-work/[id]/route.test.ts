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
const refreshStatusMock = vi.hoisted(() => vi.fn());
const confirmMock = vi.hoisted(() => vi.fn());
const updateDraftMock = vi.hoisted(() => vi.fn());
const prepareMock = vi.hoisted(() => vi.fn());
const createSourceMock = vi.hoisted(() => vi.fn());
const updateSourceMock = vi.hoisted(() => vi.fn());
const deleteSourceMock = vi.hoisted(() => vi.fn());
const getAssetMock = vi.hoisted(() => vi.fn());
const inngestSendMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: (...args: unknown[]) => getWorkMock(...args),
  failStaleCreativeWorkOutputs: (...args: unknown[]) => failStaleOutputsMock(...args),
  refreshCreativeWorkStatus: (...args: unknown[]) => refreshStatusMock(...args),
  updateCreativeWorkDraft: (...args: unknown[]) => updateDraftMock(...args),
  createCreativeWorkSource: (...args: unknown[]) => createSourceMock(...args),
  updateCreativeWorkSource: (...args: unknown[]) => updateSourceMock(...args),
  deleteCreativeWorkSource: (...args: unknown[]) => deleteSourceMock(...args),
}));

vi.mock("@/server/repositories/workspace-asset", () => ({
  getWorkspaceAssetById: (...args: unknown[]) => getAssetMock(...args),
}));
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
    createSourceMock.mockResolvedValue({ id: "source-1", workspaceId: "workspace-1", workItemId: "work-1", assetId: "asset-1", usage: "both", status: "uploaded" });
    updateSourceMock.mockResolvedValue({ id: "source-1", usage: "style", status: "uploaded" });
    deleteSourceMock.mockResolvedValue({ id: "source-1" });
    inngestSendMock.mockResolvedValue(undefined);
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
    expect(createSourceMock).toHaveBeenCalledWith({ workspaceId: "workspace-1", workItemId: "work-1", assetId: "asset-1", usage: "both", status: "uploaded" });
    expect(inngestSendMock).toHaveBeenCalledWith({ name: "creative-work.source.analyze", data: { workspaceId: "workspace-1", workItemId: "work-1", sourceId: "source-1" } });
  });

  it.each(["key", "mimeType", "contentAnalysis", "workspaceId"])("rejects browser-supplied source %s", async (field) => {
    const res = await PATCH(new Request("http://localhost/api/creative-work/work-1", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "attachSource", assetId: "asset-1", usage: "content", [field]: "untrusted" }),
    }), { params: makeParams("work-1") });
    expect(res.status).toBe(400);
    expect(createSourceMock).not.toHaveBeenCalled();
  });

  it("updates usage, retries, removes, and validates editable analysis through the detail patch", async () => {
    getWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [],
      sources: [{ id: "source-1", workspaceId: "workspace-1", workItemId: "work-1", assetId: "asset-1", templateId: null, usage: "content", status: "ready" }],
    });
    const request = (body: unknown) => PATCH(new Request("http://localhost/api/creative-work/work-1", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }), { params: makeParams("work-1") });

    expect((await request({ action: "updateSource", sourceId: "source-1", usage: "style" })).status).toBe(200);
    expect((await request({ action: "retrySource", sourceId: "source-1" })).status).toBe(200);
    expect((await request({ action: "removeSource", sourceId: "source-1" })).status).toBe(200);
    expect((await request({ action: "editSourceAnalysis", sourceId: "source-1", content: { product: "invalid" }, style: null })).status).toBe(400);
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
