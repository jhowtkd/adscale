import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const suggestMock = vi.hoisted(() => vi.fn());
const rateLimitMock = vi.hoisted(() => vi.fn((): unknown => null));
const freePlan = vi.hoisted(() => ({ find: vi.fn(async (): Promise<{ accountId: string } | null> => null) }));

vi.mock("@/server/equipe/module/free-plan", () => ({
  findFreePlanAccount: (...args: unknown[]) => (freePlan.find as (...a: unknown[]) => unknown)(...args),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));
vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() => Promise.resolve({ user: { id: "user-1" }, workspace: { id: "workspace-1" } })),
}));
vi.mock("@/lib/with-rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => (rateLimitMock as (...a: unknown[]) => unknown)(...args),
}));
vi.mock("@/server/application/suggest-creative-directions", () => ({
  suggestCreativeDirections: (...args: unknown[]) => suggestMock(...args),
}));

import { POST } from "./route";

describe("POST /api/creative-work/[id]/suggest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns scoped suggestions without accepting a generation payload", async () => {
    suggestMock.mockResolvedValue({ ok: true, directions: [{ id: "direction-1", label: "Oferta", instruction: "Destaque", order: 0, safetyBand: "safe", provenance: "ai-suggestion" }] });
    const response = await POST(new Request("http://localhost/api/creative-work/work-1/suggest", { method: "POST" }), { params: Promise.resolve({ id: "work-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.directions).toHaveLength(1);
    expect(suggestMock).toHaveBeenCalledWith({ workspaceId: "workspace-1", workItemId: "work-1" });
  });

  it("returns not found when the work is outside the workspace", async () => {
    suggestMock.mockResolvedValue({ ok: false, error: { code: "work_not_found" } });
    const response = await POST(new Request("http://localhost/api/creative-work/work-1/suggest", { method: "POST" }), { params: Promise.resolve({ id: "work-1" }) });
    expect(response.status).toBe(404);
  });

  it("returns conflict when the work already left the draft state", async () => {
    suggestMock.mockResolvedValue({ ok: false, error: { code: "work_not_draft", status: "generating" } });
    const response = await POST(new Request("http://localhost/api/creative-work/work-1/suggest", { method: "POST" }), { params: Promise.resolve({ id: "work-1" }) });
    expect(response.status).toBe(409);
  });

  it("returns conflict when the intent does not support variations", async () => {
    suggestMock.mockResolvedValue({ ok: false, error: { code: "intent_not_supported", toolKind: "social_post" } });
    const response = await POST(new Request("http://localhost/api/creative-work/work-1/suggest", { method: "POST" }), { params: Promise.resolve({ id: "work-1" }) });
    expect(response.status).toBe(409);
  });

  it("returns conflict when no source is ready", async () => {
    suggestMock.mockResolvedValue({ ok: false, error: { code: "source_not_ready" } });
    const response = await POST(new Request("http://localhost/api/creative-work/work-1/suggest", { method: "POST" }), { params: Promise.resolve({ id: "work-1" }) });
    expect(response.status).toBe(409);
  });
});

describe("POST /api/creative-work/[id]/suggest on the free plan (ticket 11, part 2)", () => {
  const call = () =>
    POST(new Request("http://localhost/api/creative-work/work-1/suggest", { method: "POST" }), {
      params: Promise.resolve({ id: "work-1" }),
    });

  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMock.mockReturnValue(null);
    freePlan.find.mockReset();
    freePlan.find.mockResolvedValue(null);
    suggestMock.mockResolvedValue({ ok: true, directions: [] });
  });
  afterEach(() => {
    freePlan.find.mockReset();
    freePlan.find.mockResolvedValue(null);
  });

  it("refuses 402 free_plan before the rate limit and the suggestion", async () => {
    freePlan.find.mockResolvedValue({ accountId: "acc-free" });

    const response = await call();
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.code).toBe("free_plan");
    expect(body.details).toEqual(
      expect.objectContaining({ recommendedAction: "plan_request", reason: "free_plan", accountId: "acc-free" })
    );
    expect(freePlan.find).toHaveBeenCalledWith("workspace-1");
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(suggestMock).not.toHaveBeenCalled();
  });

  it("consults the rule with the workspace id and suggests when it is not the free plan", async () => {
    const response = await call();

    expect(response.status).toBe(200);
    expect(freePlan.find).toHaveBeenCalledWith("workspace-1");
    expect(suggestMock).toHaveBeenCalledWith({ workspaceId: "workspace-1", workItemId: "work-1" });
  });
});
