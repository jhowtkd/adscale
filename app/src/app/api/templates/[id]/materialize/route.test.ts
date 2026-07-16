import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { materializeTemplateAsCampaign } from "@/server/application/materialize-template-as-campaign";
import { getClientProfile } from "@/server/repositories/client-reference";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/application/materialize-template-as-campaign", () => ({
  materializeTemplateAsCampaign: vi.fn(),
}));

vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

vi.mock("@/server/memory/brand-memory-dispatch", () => ({
  recordBrandMemoryEvent: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/api-response", () => ({
  apiError: vi.fn((code: string, status: number) => {
    return new Response(JSON.stringify({ error: code }), { status });
  }),
  handleApiError: vi.fn(() => {
    return new Response(JSON.stringify({ error: "internalError" }), {
      status: 500,
    });
  }),
}));

const mockMaterialize = vi.mocked(materializeTemplateAsCampaign);
const mockGetClientProfile = vi.mocked(getClientProfile);

const TEMPLATE_ID = "11111111-1111-4111-8111-111111111111";
const CAMPAIGN_ID = "22222222-2222-4222-8222-222222222222";

describe("POST /api/templates/[id]/materialize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClientProfile.mockResolvedValue({ id: "profile-1" } as never);
  });

  it("returns 201 with campaign + canonical", async () => {
    mockMaterialize.mockResolvedValue({
      ok: true,
      value: {
        campaign: {
          id: CAMPAIGN_ID,
          workspaceId: "workspace-1",
          name: "From Template",
          client: "Acme",
          product: "Course",
          objective: "Leads",
          audience: "Founders",
          platforms: ["meta_feed"],
          tone: "direct",
          offer: "20% off",
          constraints: null,
          notes: null,
          generationMode: "art_variation",
          ctaVariants: null,
          targetFormats: ["1:1"],
          creativeLevel: "balanced",
          selectedReferenceIds: null,
          createdAt: new Date("2026-07-13T12:00:00.000Z"),
        } as never,
        canonical: {
          id: `campaign:${CAMPAIGN_ID}`,
          originKind: "campaign",
          intent: {
            kind: "campaign",
            objective: "Leads",
            formatHint: "1:1",
            platforms: ["meta_feed"],
          },
          briefing: {
            product: "Course",
            client: "Acme",
            audience: "Founders",
            offer: "20% off",
            tone: "direct",
            constraints: null,
            notes: null,
            headline: null,
            body: null,
            cta: null,
            theme: null,
          },
        } as never,
      },
    });

    const res = await POST(
      new Request("http://localhost/api/templates/x/materialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "From Template",
          client: "Acme",
          clientProfileId: "33333333-3333-4333-8333-333333333333",
        }),
      }),
      { params: Promise.resolve({ id: TEMPLATE_ID }) }
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(mockMaterialize).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      userId: "user-1",
      templateId: TEMPLATE_ID,
      name: "From Template",
      client: "Acme",
      clientProfileId: "33333333-3333-4333-8333-333333333333",
    });
    expect(body.campaign.id).toBe(CAMPAIGN_ID);
    expect(body.canonical.intent.kind).toBe("campaign");
    expect(body.canonical.intent.formatHint).toBe("1:1");
  });

  it("returns 404 when template missing", async () => {
    mockMaterialize.mockResolvedValue({
      ok: false,
      error: { code: "template_not_found" },
    });

    const res = await POST(
      new Request("http://localhost/api/templates/x/materialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "X", client: "Y" }),
      }),
      { params: Promise.resolve({ id: TEMPLATE_ID }) }
    );

    expect(res.status).toBe(404);
  });

  it("rejects a client profile outside the current workspace", async () => {
    mockGetClientProfile.mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/api/templates/x/materialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "From Template",
          client: "Acme",
          clientProfileId: "33333333-3333-4333-8333-333333333333",
        }),
      }),
      { params: Promise.resolve({ id: TEMPLATE_ID }) }
    );

    expect(res.status).toBe(404);
    expect(mockGetClientProfile).toHaveBeenCalledWith(
      "workspace-1",
      "33333333-3333-4333-8333-333333333333"
    );
    expect(mockMaterialize).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid body", async () => {
    const res = await POST(
      new Request("http://localhost/api/templates/x/materialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      }),
      { params: Promise.resolve({ id: TEMPLATE_ID }) }
    );

    expect(res.status).toBe(400);
    expect(mockMaterialize).not.toHaveBeenCalled();
  });
});
