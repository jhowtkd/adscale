import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET, POST } from "./route";

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

const startMock = vi.hoisted(() => vi.fn());
const listMock = vi.hoisted(() => vi.fn());
const listInspirationsMock = vi.hoisted(() => vi.fn());
const updateSourceCasMock = vi.hoisted(() => vi.fn());
const createDraftWithSourceMock = vi.hoisted(() => vi.fn());
const getCreativeWorkMock = vi.hoisted(() => vi.fn());
const inngestSendMock = vi.hoisted(() => vi.fn());
const analyzeSourceMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/application/start-social-post-work", () => ({
  startSocialPostWork: (...args: unknown[]) => startMock(...args),
}));

vi.mock("@/server/creative-work/canonical/queries", () => ({
  listCanonicalWorks: (...args: unknown[]) => listMock(...args),
}));

vi.mock("@/server/application/list-creative-inspirations", () => ({
  listCreativeInspirations: (...args: unknown[]) => listInspirationsMock(...args),
}));

vi.mock("@/server/repositories/creative-work", () => ({
  createCreativeWorkDraftWithSource: (...args: unknown[]) => createDraftWithSourceMock(...args),
  getCreativeWork: (...args: unknown[]) => getCreativeWorkMock(...args),
  updateCreativeWorkSourceIfUnchanged: (...args: unknown[]) => updateSourceCasMock(...args),
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: { send: (...args: unknown[]) => inngestSendMock(...args) },
}));

vi.mock("@/server/application/analyze-creative-work-source", () => ({
  analyzeCreativeWorkSource: (...args: unknown[]) => analyzeSourceMock(...args),
}));

const profileId = "00000000-0000-4000-8000-000000000001";

const validBody = {
  clientProfileId: profileId,
  toolKind: "social_post" as const,
  format: "4:5" as const,
  brief: {
    theme: "Novo produto",
    objective: "Gerar interesse",
    audience: "Empreendedores",
    offer: "Teste gratuito",
  },
};

describe("GET /api/creative-work", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inngestSendMock.mockResolvedValue(undefined);
    analyzeSourceMock.mockResolvedValue(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns creative_work canonical summaries", async () => {
    listMock.mockResolvedValue([
      {
        id: "creative_work:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        originKind: "creative_work",
        originId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        origin: "quick_tool",
        workspaceId: "workspace-1",
        name: "Novo produto",
        state: "producing",
        updatedAt: "2026-07-13T12:00:00.000Z",
        resumable: true,
        resumeHref: "/criar-post/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      },
    ]);

    const res = await GET(new Request("http://localhost/api/creative-work"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(listMock).toHaveBeenCalledWith("workspace-1");
    expect(body.works).toHaveLength(1);
    expect(body.works[0].originKind).toBe("creative_work");
    expect(body.works[0].name).toBe("Novo produto");
  });

  it("returns active-brand inspirations instead of the work list", async () => {
    listInspirationsMock.mockResolvedValue([{ id: "template-1", source: "template" }]);

    const res = await GET(new Request(`http://localhost/api/creative-work?view=inspirations&clientProfileId=${profileId}`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(listInspirationsMock).toHaveBeenCalledWith({ workspaceId: "workspace-1", clientProfileId: profileId });
    expect(listMock).not.toHaveBeenCalled();
    expect(body.inspirations).toEqual([{ id: "template-1", source: "template" }]);
  });

  it("rejects an invalid inspiration brand id", async () => {
    const res = await GET(new Request("http://localhost/api/creative-work?view=inspirations&clientProfileId=not-a-uuid"));

    expect(res.status).toBe(400);
    expect(listInspirationsMock).not.toHaveBeenCalled();
    expect(listMock).not.toHaveBeenCalled();
  });

  it("returns global inspirations when clientProfileId is omitted", async () => {
    listInspirationsMock.mockResolvedValue([
      { id: "curated-1", source: "curated" },
    ]);

    const response = await GET(
      new Request("http://localhost/api/creative-work?view=inspirations"),
    );

    expect(response.status).toBe(200);
    expect(listInspirationsMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      clientProfileId: null,
    });
  });
});

describe("POST /api/creative-work", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inngestSendMock.mockResolvedValue(undefined);
    analyzeSourceMock.mockResolvedValue(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 201 with work + canonical social_post intent", async () => {
    const work = {
      id: "work-1",
      workspaceId: "workspace-1",
      clientProfileId: profileId,
      toolKind: "social_post",
      status: "draft",
      brief: validBody.brief,
      format: "4:5",
    };
    startMock.mockResolvedValue({
      ok: true,
      value: {
        work,
        canonical: {
          id: "creative_work:work-1",
          originKind: "creative_work",
          intent: {
            kind: "social_post",
            objective: "Gerar interesse",
            formatHint: "4:5",
            platforms: [],
          },
        },
      },
    });

    const res = await POST(
      new Request("http://localhost/api/creative-work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.work.id).toBe("work-1");
    expect(body.canonical.intent.kind).toBe("social_post");
    expect(body.canonical.originKind).toBe("creative_work");
    expect(startMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      userId: "user-1",
      clientProfileId: profileId,
      format: "4:5",
      brief: validBody.brief,
    });
  });

  it("creates the same three-unit draft for a repeated draftKey", async () => {
    const body = {
      clientProfileId: profileId,
      draftKey: "00000000-0000-4000-8000-000000000099",
      request: "Promoção de matrícula para julho",
      intent: "variations",
      format: "4:5",
      settings: { targetFormats: [] },
    };
    startMock.mockResolvedValue({ ok: true, value: {
      work: { id: "same-work", title: body.request, brief: null },
      canonical: { id: "creative_work:same-work" },
      quote: { plans: [{}, {}, {}], unitCount: 3, credits: 15 },
    } });
    const first = await POST(new Request("http://localhost/api/creative-work", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }));
    const second = await POST(new Request("http://localhost/api/creative-work", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }));
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const firstBody = await first.json();
    expect(firstBody.work).toEqual(expect.objectContaining({ id: "same-work", title: body.request, brief: null }));
    expect(firstBody.quote).toMatchObject({ unitCount: 3, credits: 15 });
    expect((await second.json()).work.id).toBe("same-work");
    expect(startMock).toHaveBeenLastCalledWith(expect.objectContaining({ draftKey: body.draftKey, request: body.request }));
  });

  it("rejects an empty draft request before calling the command", async () => {
    const res = await POST(new Request("http://localhost/api/creative-work", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientProfileId: profileId,
        draftKey: "00000000-0000-4000-8000-000000000099",
        request: "   ", intent: "variations", format: "4:5", settings: { targetFormats: [] },
      }),
    }));
    expect(res.status).toBe(400);
    expect(startMock).not.toHaveBeenCalled();
  });

  it("accepts an attachment-first draft only with a scoped image asset", async () => {
    const body = {
      clientProfileId: profileId,
      draftKey: "00000000-0000-4000-8000-000000000099",
      request: "",
      assetId: "asset-1",
      usage: "both",
      intent: "variations",
      format: "4:5",
      settings: { targetFormats: [] },
    };
    createDraftWithSourceMock.mockResolvedValue({
      claimedForAnalysis: true,
      work: {
        id: "work-asset", workspaceId: "workspace-1", clientProfileId: profileId,
        toolKind: "variations", status: "draft", format: "4:5", settings: { targetFormats: [] },
        brief: null, copy: null, identitySnapshot: null, createdAt: new Date(), updatedAt: new Date(),
      },
      source: {
        id: "source-1", workspaceId: "workspace-1", workItemId: "work-asset", assetId: "asset-1",
        templateId: null, usage: "both", status: "uploaded", updatedAt: new Date(),
      },
      asset: { id: "asset-1", name: "arte.png", type: "image/png", source: "upload" },
    });

    const res = await POST(new Request("http://localhost/api/creative-work", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }));
    const payload = await res.json();

    expect(res.status).toBe(201);
    expect(createDraftWithSourceMock).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1", assetId: "asset-1", usage: "both",
    }));
    expect(payload.source).toEqual(expect.objectContaining({ name: "arte.png", origin: "upload" }));
  });

  it("accepts a template-first draft through the same atomic source command", async () => {
    const body = {
      clientProfileId: profileId,
      draftKey: "00000000-0000-4000-8000-000000000099",
      request: "",
      templateId: "template-1",
      usage: "both",
      intent: "variations",
      format: "4:5",
      settings: { targetFormats: [] },
    };
    createDraftWithSourceMock.mockResolvedValue({
      claimedForAnalysis: true,
      work: {
        id: "work-template", workspaceId: "workspace-1", clientProfileId: profileId,
        toolKind: "variations", status: "draft", format: "4:5", settings: { targetFormats: [] },
        brief: null, copy: null, identitySnapshot: null, createdAt: new Date(), updatedAt: new Date(),
      },
      source: {
        id: "source-template", workspaceId: "workspace-1", workItemId: "work-template",
        assetId: null, templateId: "template-1", usage: "both", status: "ready", updatedAt: new Date(),
      },
      template: { id: "template-1", name: "Lançamento" },
    });

    const res = await POST(new Request("http://localhost/api/creative-work", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }));
    const payload = await res.json();

    expect(res.status).toBe(201);
    expect(createDraftWithSourceMock).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1", templateId: "template-1", usage: "both",
    }));
    expect(payload.source).toEqual(expect.objectContaining({ name: "Lançamento", origin: "template" }));
    expect(inngestSendMock).not.toHaveBeenCalled();
    expect(analyzeSourceMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1", workItemId: "work-template", sourceId: "source-template",
    });
  });

  it("returns the saved failed template source when inline analysis fails", async () => {
    const source = {
      id: "source-template", workspaceId: "workspace-1", workItemId: "work-template",
      assetId: null, templateId: "template-1", usage: "both", status: "uploaded", updatedAt: new Date(),
    };
    const failedSource = { ...source, status: "failed", failureCode: "analysis_failed" };
    createDraftWithSourceMock.mockResolvedValue({
      claimedForAnalysis: true,
      work: {
        id: "work-template", workspaceId: "workspace-1", clientProfileId: profileId,
        toolKind: "variations", status: "draft", format: "4:5", settings: { targetFormats: [] },
        brief: null, copy: null, identitySnapshot: null, createdAt: new Date(), updatedAt: new Date(),
      },
      source,
      template: { id: "template-1", name: "Lançamento" },
    });
    analyzeSourceMock.mockRejectedValue(new Error("analysis failed"));
    getCreativeWorkMock.mockResolvedValue({ work: {}, outputs: [], sources: [failedSource] });

    const res = await POST(new Request("http://localhost/api/creative-work", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        clientProfileId: profileId, draftKey: "00000000-0000-4000-8000-000000000099",
        request: "", templateId: "template-1", usage: "both", intent: "variations",
        format: "4:5", settings: { targetFormats: [] },
      }),
    }));

    expect(res.status).toBe(201);
    expect((await res.json()).source).toEqual(expect.objectContaining({ status: "failed", failureCode: "analysis_failed" }));
  });

  it("delegates attachment-first creation to one atomic idempotent repository command", async () => {
    const source = { id: "source-1", workItemId: "work-asset", assetId: "asset-1", usage: "both", status: "uploaded", updatedAt: new Date() };
    const result = {
      work: { id: "work-asset", workspaceId: "workspace-1", clientProfileId: profileId, toolKind: "variations", format: "4:5", settings: { targetFormats: [] }, status: "draft", brief: null, copy: null, identitySnapshot: null, createdAt: new Date(), updatedAt: new Date() },
      source,
      asset: { id: "asset-1", name: "arte.png", type: "image/png", source: "upload" },
    };
    createDraftWithSourceMock
      .mockResolvedValueOnce({ ...result, claimedForAnalysis: true })
      .mockResolvedValueOnce({ ...result, claimedForAnalysis: false });
    const body = {
      clientProfileId: profileId, draftKey: "00000000-0000-4000-8000-000000000099", request: "",
      assetId: "asset-1", usage: "both", intent: "variations", format: "4:5", settings: { targetFormats: [] },
    };

    const first = await POST(new Request("http://localhost/api/creative-work", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    const second = await POST(new Request("http://localhost/api/creative-work", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(createDraftWithSourceMock).toHaveBeenCalledTimes(2);
    expect(createDraftWithSourceMock).toHaveBeenLastCalledWith(expect.objectContaining({
      workspaceId: "workspace-1", createdByUserId: "user-1", draftKey: body.draftKey, assetId: "asset-1",
    }));
    expect(startMock).not.toHaveBeenCalled();
    expect(inngestSendMock).toHaveBeenCalledOnce();
    expect((await first.json()).source.id).toBe("source-1");
    expect((await second.json()).source.id).toBe("source-1");
  });

  it("analyzes a concurrent-equivalent template-first replay only once and always returns a source", async () => {
    const source = { id: "source-template", workItemId: "work-template", assetId: null, templateId: "template-1", usage: "both", status: "uploaded", updatedAt: new Date() };
    const result = {
      work: { id: "work-template", workspaceId: "workspace-1", clientProfileId: profileId, toolKind: "variations", format: "4:5", settings: { targetFormats: [] }, status: "draft", brief: null, copy: null, identitySnapshot: null, createdAt: new Date(), updatedAt: new Date() },
      source,
      template: { id: "template-1", name: "Lançamento" },
    };
    createDraftWithSourceMock
      .mockResolvedValueOnce({ ...result, claimedForAnalysis: true })
      .mockResolvedValueOnce({ ...result, claimedForAnalysis: false });
    analyzeSourceMock.mockResolvedValue({ ...source, status: "ready" });
    const body = {
      clientProfileId: profileId, draftKey: "00000000-0000-4000-8000-000000000099", request: "",
      templateId: "template-1", usage: "both", intent: "variations", format: "4:5", settings: { targetFormats: [] },
    };

    const first = await POST(new Request("http://localhost/api/creative-work", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    const replay = await POST(new Request("http://localhost/api/creative-work", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(analyzeSourceMock).toHaveBeenCalledOnce();
    expect((await first.json()).source).not.toBeNull();
    expect((await replay.json()).source).not.toBeNull();
  });

  it("reloads the canonical template source when attachment-first analysis loses its CAS", async () => {
    const uploaded = {
      id: "source-template", workspaceId: "workspace-1", workItemId: "work-template",
      assetId: null, templateId: "template-1", usage: "both", status: "uploaded", updatedAt: new Date(),
    };
    const canonical = { ...uploaded, status: "analyzing", updatedAt: new Date(Date.now() + 1) };
    createDraftWithSourceMock.mockResolvedValue({
      claimedForAnalysis: true,
      work: { id: "work-template", workspaceId: "workspace-1", clientProfileId: profileId, toolKind: "variations", format: "4:5", settings: { targetFormats: [] }, status: "draft", brief: null, copy: null, identitySnapshot: null, createdAt: new Date(), updatedAt: new Date() },
      source: uploaded,
      template: { id: "template-1", name: "Lançamento" },
    });
    analyzeSourceMock.mockResolvedValue(null);
    getCreativeWorkMock.mockResolvedValue({ work: {}, outputs: [], sources: [canonical] });

    const res = await POST(new Request("http://localhost/api/creative-work", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        clientProfileId: profileId, draftKey: "00000000-0000-4000-8000-000000000099", request: "",
        templateId: "template-1", usage: "both", intent: "variations", format: "4:5", settings: { targetFormats: [] },
      }),
    }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.source).toEqual(expect.objectContaining({ id: "source-template", status: "analyzing" }));
  });

  it.each([
    ["approved asset", { assetId: "asset-1" }],
    ["template", { templateId: "template-1" }],
  ] as const)("rejects attachment-first %s replay when usage differs", async (_label, origin) => {
    createDraftWithSourceMock.mockResolvedValue(null);
    const res = await POST(new Request("http://localhost/api/creative-work", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        clientProfileId: profileId, draftKey: "00000000-0000-4000-8000-000000000099", request: "",
        ...origin, usage: "style", intent: "variations", format: "4:5", settings: { targetFormats: [] },
      }),
    }));
    expect(res.status).toBe(400);
    expect(inngestSendMock).not.toHaveBeenCalled();
    expect(analyzeSourceMock).not.toHaveBeenCalled();
  });

  it("rejects attachment-first metadata and assets outside the workspace", async () => {
    createDraftWithSourceMock.mockResolvedValue(null);
    const base = {
      clientProfileId: profileId, draftKey: "00000000-0000-4000-8000-000000000099", request: "",
      assetId: "other-asset", usage: "both", intent: "variations", format: "4:5", settings: { targetFormats: [] },
    };
    const outside = await POST(new Request("http://localhost/api/creative-work", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(base),
    }));
    const untrusted = await POST(new Request("http://localhost/api/creative-work", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...base, assetId: "asset-1", key: "browser-key" }),
    }));

    expect(outside.status).toBe(400);
    expect(untrusted.status).toBe(400);
    expect(startMock).not.toHaveBeenCalled();
  });

  it("returns the attachment-first draft with an immediate retry state when dispatch fails", async () => {
    const now = new Date("2026-07-16T12:00:00.000Z");
    const source = {
      id: "source-1", workspaceId: "workspace-1", workItemId: "work-asset", assetId: "asset-1",
      templateId: null, usage: "both", status: "uploaded", updatedAt: now,
    };
    createDraftWithSourceMock.mockResolvedValue({
      claimedForAnalysis: true,
      work: {
        id: "work-asset", workspaceId: "workspace-1", clientProfileId: profileId,
        toolKind: "variations", status: "draft", format: "4:5", settings: { targetFormats: [] },
        brief: null, copy: null, identitySnapshot: null, createdAt: now, updatedAt: now,
      },
      source,
      asset: { id: "asset-1", name: "arte.png", type: "image/png", source: "upload" },
    });
    inngestSendMock.mockRejectedValue(new Error("down"));
    updateSourceCasMock.mockResolvedValue({ ...source, status: "failed", failureCode: "dispatch_failed" });

    const res = await POST(new Request("http://localhost/api/creative-work", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        clientProfileId: profileId, draftKey: "00000000-0000-4000-8000-000000000099", request: "",
        assetId: "asset-1", usage: "both", intent: "variations", format: "4:5", settings: { targetFormats: [] },
      }),
    }));
    const payload = await res.json();

    expect(res.status).toBe(201);
    expect(payload.source).toEqual(expect.objectContaining({ status: "failed", failureCode: "dispatch_failed" }));
  });

  it("rejects format adaptation without target formats", async () => {
    const res = await POST(new Request("http://localhost/api/creative-work", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientProfileId: profileId,
        draftKey: "00000000-0000-4000-8000-000000000099",
        request: "Adaptar", intent: "format_adaptation", format: "4:5", settings: { targetFormats: [] },
      }),
    }));
    expect(res.status).toBe(400);
    expect(startMock).not.toHaveBeenCalled();
  });

  it("accepts body without toolKind (preconfigured social_post)", async () => {
    startMock.mockResolvedValue({
      ok: true,
      value: {
        work: { id: "work-2" },
        canonical: {
          id: "creative_work:work-2",
          intent: { kind: "social_post" },
        },
      },
    });

    const withoutToolKind = {
      clientProfileId: validBody.clientProfileId,
      format: validBody.format,
      brief: validBody.brief,
    };
    const res = await POST(
      new Request("http://localhost/api/creative-work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withoutToolKind),
      })
    );
    expect(res.status).toBe(201);
    expect(startMock).toHaveBeenCalled();
  });

  it("returns 404 when profile is outside workspace", async () => {
    startMock.mockResolvedValue({
      ok: false,
      error: { code: "client_profile_not_found" },
    });

    const res = await POST(
      new Request("http://localhost/api/creative-work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      })
    );

    expect(res.status).toBe(404);
  });

  it("returns 400 when the brief is invalid", async () => {
    const res = await POST(
      new Request("http://localhost/api/creative-work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...validBody, brief: { theme: "" } }),
      })
    );

    expect(res.status).toBe(400);
    expect(startMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the format is unsupported", async () => {
    const res = await POST(
      new Request("http://localhost/api/creative-work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...validBody, format: "16:9" }),
      })
    );

    expect(res.status).toBe(400);
    expect(startMock).not.toHaveBeenCalled();
  });
});
