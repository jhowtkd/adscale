import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET, POST } from "./route";
import { createCampaign, getCampaignsPage } from "@/server/repositories/campaign";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/campaign", () => ({
  createCampaign: vi.fn(),
  getCampaignsPage: vi.fn(),
}));

vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: vi.fn(),
  getClientReferencesByIds: vi.fn(),
}));

vi.mock("@/lib/api-response", () => ({
  apiError: vi.fn((code: string, status: number) => {
    return new Response(JSON.stringify({ error: code }), { status });
  }),
  handleApiError: vi.fn((error: unknown) => {
    return new Response(JSON.stringify({ error: "internalError" }), { status: 500 });
  }),
}));

const mockGetCampaignsPage = vi.mocked(getCampaignsPage);
const mockCreateCampaign = vi.mocked(createCampaign);

describe("POST /api/campaigns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCampaign.mockResolvedValue({
      id: "camp-1",
      name: "Test Campaign",
      client: "Test Client",
      clientProfileId: null,
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Awaited<ReturnType<typeof createCampaign>>);
  });

  it("creates campaign with minimal required fields", async () => {
    const res = await POST(
      new Request("http://localhost/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test Campaign",
          client: "Test Client",
          clientProfileId: null,
        }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(mockCreateCampaign).toHaveBeenCalledWith("workspace-1", {
      name: "Test Campaign",
      client: "Test Client",
      clientProfileId: null,
      creativeLevel: "balanced",
      status: "draft",
    });
    expect(body.campaign).toBeDefined();
  });

  it("rejects creation without client", async () => {
    const res = await POST(
      new Request("http://localhost/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test Campaign",
          clientProfileId: null,
        }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("invalidInput");
  });

  it("rejects creation without name", async () => {
    const res = await POST(
      new Request("http://localhost/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: "Test Client",
          clientProfileId: null,
        }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("invalidInput");
  });
});

describe("GET /api/campaigns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes query params to the paginated repository call", async () => {
    mockGetCampaignsPage.mockResolvedValue({
      campaigns: [{ id: "camp-1", name: "Summer", status: "draft" }],
      totalCount: 1,
    } as Awaited<ReturnType<typeof getCampaignsPage>>);

    const res = await GET(
      new Request(
        "http://localhost/api/campaigns?q=summer&status=draft&platform=Meta&sort=name-desc&page=2&limit=25"
      )
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockGetCampaignsPage).toHaveBeenCalledWith("workspace-1", {
      searchQuery: "summer",
      statusFilter: "draft",
      platformFilter: "Meta",
      sortOption: "name-desc",
      limit: 25,
      offset: 25,
    });
    expect(body).toEqual({
      campaigns: [{ id: "camp-1", name: "Summer", status: "draft" }],
      totalCount: 1,
    });
  });
});
