import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET, POST } from "./route";
import { encodeCatalogCursor } from "@/lib/catalog-page";

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
const listProductionMock = vi.hoisted(() => vi.fn());
const getClientProfileMock = vi.hoisted(() => vi.fn());
const getCampaignByIdMock = vi.hoisted(() => vi.fn());
const listInspirationsMock = vi.hoisted(() => vi.fn());
const updateSourceCasMock = vi.hoisted(() => vi.fn());
const createDraftWithSourceMock = vi.hoisted(() => vi.fn());
const getCreativeWorkMock = vi.hoisted(() => vi.fn());
const getCreativeWorkByDraftKeyMock = vi.hoisted(() => vi.fn());
const inngestSendMock = vi.hoisted(() => vi.fn());
const analyzeSourceMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/application/start-social-post-work", () => ({
  startSocialPostWork: (...args: unknown[]) => startMock(...args),
}));

vi.mock("@/server/creative-work/canonical/queries", () => ({
  listCanonicalWorksPage: (...args: unknown[]) => listMock(...args),
}));

vi.mock("@/server/application/list-creative-production", () => ({
  listCreativeProduction: (...args: unknown[]) => listProductionMock(...args),
}));

vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: (...args: unknown[]) => getClientProfileMock(...args),
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: (...args: unknown[]) => getCampaignByIdMock(...args),
}));

vi.mock("@/server/application/list-creative-inspirations", () => ({
  listCreativeInspirations: (...args: unknown[]) => listInspirationsMock(...args),
}));

vi.mock("@/server/application/instantiate-visual-recipe", () => ({
  instantiateVisualRecipe: vi.fn(),
}));

vi.mock("@/server/application/instantiate-commercial-offer", () => ({
  instantiateCommercialOffer: vi.fn(),
}));

vi.mock("@/server/repositories/visual-recipe", () => ({
  listVisualRecipes: vi.fn(),
}));

vi.mock("@/server/repositories/commercial-offer", () => ({
  listActiveCommercialOffers: vi.fn(),
}));

vi.mock("@/server/repositories/creative-work", () => ({
  createCreativeWorkDraftWithSource: (...args: unknown[]) => createDraftWithSourceMock(...args),
  getCreativeWork: (...args: unknown[]) => getCreativeWorkMock(...args),
  getCreativeWorkByDraftKey: (...args: unknown[]) => getCreativeWorkByDraftKeyMock(...args),
  updateCreativeWorkSourceIfUnchanged: (...args: unknown[]) => updateSourceCasMock(...args),
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: { send: (...args: unknown[]) => inngestSendMock(...args) },
}));

vi.mock("@/server/application/analyze-creative-work-source", () => ({
  analyzeCreativeWorkSource: (...args: unknown[]) => analyzeSourceMock(...args),
}));

const envState: { threeFourCreation: string | undefined } = { threeFourCreation: undefined };
vi.mock("@/server/validation/env", () => ({
  env: {
    get CREATIVE_WORK_34_CREATION_ENABLED() {
      return envState.threeFourCreation;
    },
  },
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
    listProductionMock.mockResolvedValue({ production: [], nextCursor: null });
    getClientProfileMock.mockResolvedValue({ id: profileId, workspaceId: "workspace-1" });
    getCampaignByIdMock.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000002",
      workspaceId: "workspace-1",
      clientProfileId: profileId,
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns creative_work canonical summaries", async () => {
    listMock.mockResolvedValue({ nextCursor: "next-1", items: [
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
    ] });

    const res = await GET(new Request("http://localhost/api/creative-work"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(listMock).toHaveBeenCalledWith("workspace-1", { limit: 24, cursor: null });
    expect(body.works).toHaveLength(1);
    expect(body.works[0].originKind).toBe("creative_work");
    expect(body.works[0].name).toBe("Novo produto");
    expect(body.nextCursor).toBe("next-1");
  });

  it("passes limit and cursor through to the works page query", async () => {
    listMock.mockResolvedValue({ items: [], nextCursor: null });
    const cursor = encodeCatalogCursor({
      at: new Date("2026-07-13T12:00:00.000Z"),
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    });

    const res = await GET(new Request(`http://localhost/api/creative-work?limit=10&cursor=${cursor}`));

    expect(res.status).toBe(200);
    expect(listMock).toHaveBeenCalledWith("workspace-1", {
      limit: 10,
      cursor: { at: new Date("2026-07-13T12:00:00.000Z"), id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" },
    });
  });

  it("rejects a malformed works cursor", async () => {
    const res = await GET(new Request("http://localhost/api/creative-work?cursor=not-a-cursor"));
    expect(res.status).toBe(400);
    expect(listMock).not.toHaveBeenCalled();
  });

  it("returns active-brand inspirations instead of the work list", async () => {
    listInspirationsMock.mockResolvedValue({
      items: [{ id: "template-1", source: "template" }],
      nextCursor: null,
    });

    const res = await GET(new Request(`http://localhost/api/creative-work?view=inspirations&clientProfileId=${profileId}`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(listInspirationsMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      clientProfileId: profileId,
      limit: 24,
      cursor: null,
    });
    expect(listMock).not.toHaveBeenCalled();
    expect(body.inspirations).toEqual([{ id: "template-1", source: "template" }]);
    expect(body.nextCursor).toBeNull();
  });

  it("lists recipes for the active brand only", async () => {
    const { listVisualRecipes } = await import("@/server/repositories/visual-recipe");
    vi.mocked(listVisualRecipes).mockResolvedValue({
      items: [{ id: "recipe-1", clientProfileId: profileId }],
      nextCursor: null,
    } as never);

    const res = await GET(new Request(`http://localhost/api/creative-work?view=recipes&clientProfileId=${profileId}`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(listVisualRecipes).toHaveBeenCalledWith("workspace-1", profileId, expect.objectContaining({ limit: 24 }));
    expect(body.recipes).toEqual([{ id: "recipe-1", clientProfileId: profileId }]);
  });

  it("returns the work committed under a draft key", async () => {
    const draftKey = "aa111111-1111-4111-8111-111111111111";
    getCreativeWorkByDraftKeyMock.mockResolvedValue({ id: "work-1", draftKey });
    const res = await GET(new Request(
      `http://localhost/api/creative-work?view=draftByKey&draftKey=${draftKey}`));
    expect(res.status).toBe(200);
    expect(getCreativeWorkByDraftKeyMock).toHaveBeenCalledWith("workspace-1", "user-1", draftKey);
    expect(await res.json()).toEqual({ work: { id: "work-1", draftKey } });
    expect(listMock).not.toHaveBeenCalled();
  });

  it("returns 404 when no work matches the draft key", async () => {
    getCreativeWorkByDraftKeyMock.mockResolvedValue(null);
    const res = await GET(new Request(
      "http://localhost/api/creative-work?view=draftByKey&draftKey=aa111111-1111-4111-8111-111111111111"));
    expect(res.status).toBe(404);
  });

  it("rejects a non-uuid draft key", async () => {
    const res = await GET(new Request(
      "http://localhost/api/creative-work?view=draftByKey&draftKey=abc"));
    expect(res.status).toBe(400);
    expect(getCreativeWorkByDraftKeyMock).not.toHaveBeenCalled();
  });

  it("separa produção da listagem canônica e não despacha geração", async () => {
    const response = await GET(new Request(
      `http://localhost/api/creative-work?view=production&clientProfileId=${profileId}`,
    ));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ production: [], nextCursor: null });
    expect(listProductionMock).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1", clientProfileId: profileId, campaignId: null, limit: 24,
    }));
    expect(listMock).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it.each([
    `view=production&clientProfileId=abc`,
    `view=production&clientProfileId=${profileId}&limit=0`,
    `view=production&clientProfileId=${profileId}&limit=49`,
    `view=production&clientProfileId=${profileId}&cursor=invalido`,
    `view=production&clientProfileId=${profileId}&campaignId=abc`,
  ])("rejects an invalid production query %s", async (query) => {
    const response = await GET(new Request(`http://localhost/api/creative-work?${query}`));
    expect(response.status).toBe(400);
    expect(listProductionMock).not.toHaveBeenCalled();
  });

  it("does not list production for a missing brand", async () => {
    getClientProfileMock.mockResolvedValue(null);
    const response = await GET(new Request(
      `http://localhost/api/creative-work?view=production&clientProfileId=${profileId}`,
    ));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "clientProfileNotFound" });
    expect(listProductionMock).not.toHaveBeenCalled();
  });

  it("does not list production for a missing campaign", async () => {
    const campaignId = "00000000-0000-4000-8000-000000000002";
    getCampaignByIdMock.mockResolvedValue(null);
    const response = await GET(new Request(
      `http://localhost/api/creative-work?view=production&clientProfileId=${profileId}&campaignId=${campaignId}`,
    ));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "campaignNotFound" });
    expect(listProductionMock).not.toHaveBeenCalled();
  });

  it("does not list production for a campaign of another brand", async () => {
    const campaignId = "00000000-0000-4000-8000-000000000002";
    getCampaignByIdMock.mockResolvedValue({
      id: campaignId,
      workspaceId: "workspace-1",
      clientProfileId: "00000000-0000-4000-8000-000000000099",
    });
    const response = await GET(new Request(
      `http://localhost/api/creative-work?view=production&clientProfileId=${profileId}&campaignId=${campaignId}`,
    ));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "campaignNotFound" });
    expect(listProductionMock).not.toHaveBeenCalled();
  });

  it("lists active brand offers only", async () => {
    const { listActiveCommercialOffers } = await import("@/server/repositories/commercial-offer");
    vi.mocked(listActiveCommercialOffers).mockResolvedValue({
      items: [{ id: "offer-1", clientProfileId: profileId }],
      nextCursor: null,
    } as never);

    const res = await GET(new Request(`http://localhost/api/creative-work?view=offers&clientProfileId=${profileId}`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(listActiveCommercialOffers).toHaveBeenCalledWith(
      "workspace-1",
      profileId,
      expect.any(Date),
      expect.objectContaining({ limit: 24 }),
    );
    expect(body.offers).toEqual([{ id: "offer-1", clientProfileId: profileId }]);
  });

  it("rejects an invalid inspiration brand id", async () => {
    const res = await GET(new Request("http://localhost/api/creative-work?view=inspirations&clientProfileId=not-a-uuid"));

    expect(res.status).toBe(400);
    expect(listInspirationsMock).not.toHaveBeenCalled();
    expect(listMock).not.toHaveBeenCalled();
  });

  it("returns global inspirations when clientProfileId is omitted", async () => {
    listInspirationsMock.mockResolvedValue({
      items: [{ id: "curated-1", source: "curated" }],
      nextCursor: null,
    });

    const response = await GET(
      new Request("http://localhost/api/creative-work?view=inspirations"),
    );

    expect(response.status).toBe(200);
    expect(listInspirationsMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      clientProfileId: null,
      limit: 24,
      cursor: null,
    });
  });
});

describe("POST /api/creative-work", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envState.threeFourCreation = undefined;
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

  it("keeps new 3:4 drafts off until enablement (ICE-04A)", async () => {
    const res = await POST(new Request("http://localhost/api/creative-work", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientProfileId: profileId,
        draftKey: "00000000-0000-4000-8000-000000000099",
        request: "Peça retrato 3:4",
        intent: "social_post",
        format: "3:4",
        settings: { targetFormats: [] },
      }),
    }));
    expect(res.status).toBe(400);
    expect(startMock).not.toHaveBeenCalled();
  });

  it("keeps 3:4 adaptation targets off until enablement (ICE-04A)", async () => {
    const res = await POST(new Request("http://localhost/api/creative-work", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientProfileId: profileId,
        draftKey: "00000000-0000-4000-8000-000000000099",
        request: "Adaptar para 3:4",
        intent: "format_adaptation",
        format: "4:5",
        settings: { targetFormats: ["3:4"] },
      }),
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).toContain("formatCreationDisabled");
    expect(startMock).not.toHaveBeenCalled();
  });

  it("creates 3:4 drafts in validated protocols once enabled (ICE-04B)", async () => {
    envState.threeFourCreation = "true";
    startMock.mockResolvedValue({ ok: true, value: {
      work: { id: "w-34", format: "3:4" },
      canonical: { id: "creative_work:w-34" },
      quote: { plans: [{}], unitCount: 1, credits: 5 },
    } });
    const res = await POST(new Request("http://localhost/api/creative-work", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientProfileId: profileId,
        draftKey: "00000000-0000-4000-8000-000000000099",
        request: "Peça retrato 3:4",
        intent: "single",
        format: "3:4",
        settings: { targetFormats: [] },
      }),
    }));
    expect(res.status).toBe(201);
    expect(startMock).toHaveBeenCalledWith(expect.objectContaining({ format: "3:4", intent: "single" }));
  });

  it("blocks 3:4 in unvalidated protocols with a distinct message (ICE-04B)", async () => {
    envState.threeFourCreation = "true";
    const res = await POST(new Request("http://localhost/api/creative-work", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientProfileId: profileId,
        draftKey: "00000000-0000-4000-8000-000000000099",
        request: "Variar em 3:4",
        intent: "variations",
        format: "3:4",
        settings: { targetFormats: [] },
      }),
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).toContain("formatProtocolUnsupported");
    expect(startMock).not.toHaveBeenCalled();
  });

  it("keeps the machine-readable code when the command blocks creation (ICE-04B)", async () => {
    startMock.mockResolvedValue({
      ok: false,
      error: { code: "format_protocol_unsupported", format: "3:4" },
    });
    const res = await POST(new Request("http://localhost/api/creative-work", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientProfileId: profileId,
        draftKey: "00000000-0000-4000-8000-000000000099",
        request: "Peça retrato",
        intent: "single",
        format: "4:5",
        settings: { targetFormats: [] },
      }),
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      details: { code: "format_protocol_unsupported", format: "3:4" },
    });
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

  it("maps the carousel visual-reference cap to its dedicated error code", async () => {
    createDraftWithSourceMock.mockResolvedValue({ limitReached: true, reason: "carousel_reference_limit" });

    const res = await POST(new Request("http://localhost/api/creative-work", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientProfileId: profileId,
        draftKey: "00000000-0000-4000-8000-0000000000c1",
        request: "",
        assetId: "asset-1",
        usage: "style",
        intent: "carousel",
        format: "4:5",
        settings: { targetFormats: [] },
      }),
    }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("creativeWorkCarouselReferenceLimit");
    expect(inngestSendMock).not.toHaveBeenCalled();
    expect(analyzeSourceMock).not.toHaveBeenCalled();
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

  it("returns the post-analysis work revision after template-first creation", async () => {
    const createdAt = new Date("2026-08-31T12:00:00.000Z");
    const analyzedAt = new Date("2026-08-31T12:00:00.001Z");
    const createdWork = {
      id: "work-template", workspaceId: "workspace-1", clientProfileId: profileId,
      toolKind: "variations", status: "draft", format: "4:5", settings: { targetFormats: [] },
      brief: null, copy: null, identitySnapshot: null, createdAt, updatedAt: createdAt,
    };
    const analyzedSource = {
      id: "source-template", workspaceId: "workspace-1", workItemId: "work-template",
      assetId: null, templateId: "template-1", usage: "both", status: "ready", updatedAt: analyzedAt,
    };
    createDraftWithSourceMock.mockResolvedValue({
      claimedForAnalysis: true,
      work: createdWork,
      source: { ...analyzedSource, status: "uploaded", updatedAt: createdAt },
      template: { id: "template-1", name: "Lançamento" },
    });
    analyzeSourceMock.mockResolvedValue(analyzedSource);
    getCreativeWorkMock.mockResolvedValue({
      work: { ...createdWork, updatedAt: analyzedAt },
      outputs: [],
      sources: [analyzedSource],
    });

    const res = await POST(new Request("http://localhost/api/creative-work", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        clientProfileId: profileId, draftKey: "00000000-0000-4000-8000-000000000099",
        request: "", templateId: "template-1", usage: "both", intent: "variations",
        format: "4:5", settings: { targetFormats: [] },
      }),
    }));
    const payload = await res.json();

    expect(res.status).toBe(201);
    expect(payload.work.updatedAt).toBe(analyzedAt.toISOString());
    expect(payload.source).toEqual(expect.objectContaining({ status: "ready", origin: "template" }));
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
    const failedAt = new Date("2026-07-16T12:00:00.001Z");
    getCreativeWorkMock.mockResolvedValue({
      work: {
        id: "work-asset", workspaceId: "workspace-1", clientProfileId: profileId,
        toolKind: "variations", status: "draft", format: "4:5", settings: { targetFormats: [] },
        brief: null, copy: null, identitySnapshot: null, createdAt: now, updatedAt: failedAt,
      },
      outputs: [],
      sources: [{ ...source, status: "failed", failureCode: "dispatch_failed", updatedAt: failedAt }],
    });

    const res = await POST(new Request("http://localhost/api/creative-work", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        clientProfileId: profileId, draftKey: "00000000-0000-4000-8000-000000000099", request: "",
        assetId: "asset-1", usage: "both", intent: "variations", format: "4:5", settings: { targetFormats: [] },
      }),
    }));
    const payload = await res.json();

    expect(res.status).toBe(201);
    expect(payload.source).toEqual(expect.objectContaining({ status: "failed", failureCode: "dispatch_failed" }));
    expect(payload.work.updatedAt).toBe("2026-07-16T12:00:00.001Z");
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

  it("instantiates an active brand offer as a new work", async () => {
    const { instantiateCommercialOffer } = await import("@/server/application/instantiate-commercial-offer");
    vi.mocked(instantiateCommercialOffer).mockResolvedValue({
      ok: true,
      value: {
        work: {
          id: "work-offer",
          workspaceId: "workspace-1",
          clientProfileId: profileId,
          toolKind: "single",
          status: "draft",
          format: "4:5",
          brief: null,
          copy: null,
          identitySnapshot: null,
          createdAt: new Date("2026-09-08T00:00:00.000Z"),
          updatedAt: new Date("2026-09-08T00:00:00.000Z"),
        },
        offerVersion: 2,
      },
    } as never);

    const res = await POST(new Request("http://localhost/api/creative-work", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientProfileId: profileId,
        draftKey: "00000000-0000-4000-8000-000000000099",
        offerId: "00000000-0000-4000-8000-000000000088",
      }),
    }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.offerVersion).toBe(2);
    expect(body.work.id).toBe("work-offer");
    expect(startMock).not.toHaveBeenCalled();
  });

  it("rejects an expired offer before creating a work", async () => {
    const { instantiateCommercialOffer } = await import("@/server/application/instantiate-commercial-offer");
    vi.mocked(instantiateCommercialOffer).mockResolvedValue({
      ok: false,
      error: { code: "expired" },
    });

    const res = await POST(new Request("http://localhost/api/creative-work", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientProfileId: profileId,
        draftKey: "00000000-0000-4000-8000-000000000099",
        offerId: "00000000-0000-4000-8000-000000000088",
      }),
    }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("commercialOfferExpired");
    expect(startMock).not.toHaveBeenCalled();
  });
});
