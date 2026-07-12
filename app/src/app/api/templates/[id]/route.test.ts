import { describe, it, expect, vi, beforeEach } from "vitest";
import { DELETE, GET } from "./route";
import {
  deleteTemplate,
  getTemplateById,
} from "@/server/repositories/template";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/template", () => ({
  getTemplateById: vi.fn(),
  deleteTemplate: vi.fn(),
  updateTemplate: vi.fn(),
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

const mockGetTemplateById = vi.mocked(getTemplateById);
const mockDeleteTemplate = vi.mocked(deleteTemplate);

const TEMPLATE = {
  id: "11111111-1111-1111-1111-111111111111",
  workspaceId: "workspace-1",
  name: "Black Friday",
  description: null,
  client: "Acme",
  product: "Course",
  objective: "Leads",
  audience: "Founders",
  platforms: ["meta_feed"],
  tone: "direct",
  offer: "20% off",
  constraints: null,
  notes: null,
  generationMode: "art_variation" as const,
  creativeLevel: "balanced",
  styleIntensity: "medium",
  ctaVariants: ["Buy now"],
  targetFormats: ["1:1"],
  createdAt: new Date("2026-07-01T00:00:00Z"),
  updatedAt: new Date("2026-07-01T00:00:00Z"),
};

describe("GET /api/templates/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns template in the correct workspace", async () => {
    mockGetTemplateById.mockResolvedValue(TEMPLATE);

    const res = await GET(new Request("http://localhost/api/templates/t1"), {
      params: Promise.resolve({ id: TEMPLATE.id }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockGetTemplateById).toHaveBeenCalledWith(TEMPLATE.id, "workspace-1");
    expect(body.template.name).toBe("Black Friday");
    expect(body.template.platforms).toEqual(["meta_feed"]);
    expect(body.template.offer).toBe("20% off");
  });

  it("returns 404 for missing template", async () => {
    mockGetTemplateById.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/templates/missing"), {
      params: Promise.resolve({ id: "missing" }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("notFound");
  });

  it("returns 404 for cross-workspace isolation (repo scoped null)", async () => {
    // Repository filters by workspaceId; other-workspace ids resolve to null.
    mockGetTemplateById.mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/templates/other-ws"),
      { params: Promise.resolve({ id: "other-ws" }) }
    );

    expect(res.status).toBe(404);
    expect(mockGetTemplateById).toHaveBeenCalledWith("other-ws", "workspace-1");
  });
});

describe("DELETE /api/templates/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes template in the correct workspace", async () => {
    mockDeleteTemplate.mockResolvedValue(TEMPLATE);

    const res = await DELETE(new Request("http://localhost/api/templates/t1", {
      method: "DELETE",
    }), {
      params: Promise.resolve({ id: TEMPLATE.id }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockDeleteTemplate).toHaveBeenCalledWith(TEMPLATE.id, "workspace-1");
    expect(body.template.id).toBe(TEMPLATE.id);
  });

  it("returns 404 on second delete (explicit non-silent contract)", async () => {
    mockDeleteTemplate
      .mockResolvedValueOnce(TEMPLATE)
      .mockResolvedValueOnce(null);

    const first = await DELETE(
      new Request("http://localhost/api/templates/t1", { method: "DELETE" }),
      { params: Promise.resolve({ id: TEMPLATE.id }) }
    );
    expect(first.status).toBe(200);

    const second = await DELETE(
      new Request("http://localhost/api/templates/t1", { method: "DELETE" }),
      { params: Promise.resolve({ id: TEMPLATE.id }) }
    );
    const body = await second.json();

    expect(second.status).toBe(404);
    expect(body.error).toBe("notFound");
  });

  it("returns 404 for cross-workspace delete", async () => {
    mockDeleteTemplate.mockResolvedValue(null);

    const res = await DELETE(
      new Request("http://localhost/api/templates/other", { method: "DELETE" }),
      { params: Promise.resolve({ id: "other" }) }
    );

    expect(res.status).toBe(404);
    expect(mockDeleteTemplate).toHaveBeenCalledWith("other", "workspace-1");
  });
});
