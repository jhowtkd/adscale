import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

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

const rateLimitMock = vi.hoisted(() => vi.fn());
const planMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/with-rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => rateLimitMock(...args),
}));
vi.mock("@/server/application/plan-carousel-work", () => ({
  planCarouselWork: (...args: unknown[]) => planMock(...args),
}));

function requestPlan(body: unknown) {
  return POST(new Request("http://localhost/api/creative-work/work-1/carousel/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: "work-1" }) });
}

const validBody = { expectedUpdatedAt: "2026-08-30T12:00:00.000Z" };

const draft = {
  version: 1,
  revision: "questions-1",
  answers: {},
  blockingQuestions: [],
  plan: null,
  changes: [],
};

describe("POST /api/creative-work/[id]/carousel/plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMock.mockResolvedValue(null);
    planMock.mockResolvedValue({
      ok: true,
      value: { work: { id: "work-1" }, draft, findings: [] },
    });
  });

  it("rate-limits with the ai category before doing any work", async () => {
    const limited = new Response(null, { status: 429 });
    rateLimitMock.mockResolvedValueOnce(limited);

    const res = await requestPlan(validBody);

    expect(rateLimitMock).toHaveBeenCalledWith(
      expect.any(Request),
      { category: "ai", workspaceId: "workspace-1" },
    );
    expect(res).toBe(limited);
    expect(planMock).not.toHaveBeenCalled();
  });

  it("rejects a body without a datetime offset expectedUpdatedAt", async () => {
    const res = await requestPlan({ expectedUpdatedAt: "2026-08-30T12:00:00" });

    expect(res.status).toBe(400);
    expect(planMock).not.toHaveBeenCalled();
  });

  it("rejects a body with extra keys", async () => {
    const res = await requestPlan({ ...validBody, plan: "browser-supplied" });

    expect(res.status).toBe(400);
    expect(planMock).not.toHaveBeenCalled();
  });

  it("defaults answers to an empty record", async () => {
    const res = await requestPlan(validBody);

    expect(res.status).toBe(200);
    expect(planMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      expectedUpdatedAt: "2026-08-30T12:00:00.000Z",
      answers: {},
    });
  });

  it("trims and bounds answers, rejecting blanks", async () => {
    const res = await requestPlan({ ...validBody, answers: { publico: "  Adultos  " } });

    expect(res.status).toBe(200);
    expect(planMock).toHaveBeenCalledWith(expect.objectContaining({ answers: { publico: "Adultos" } }));

    const blank = await requestPlan({ ...validBody, answers: { publico: "   " } });
    expect(blank.status).toBe(400);
  });

  it("returns work, draft, and findings on success", async () => {
    const res = await requestPlan(validBody);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ work: { id: "work-1" }, draft, findings: [] });
  });

  it.each([
    ["work_not_found", 404],
    ["work_not_carousel", 409],
    ["work_not_draft", 409],
    ["sources_not_ready", 409],
    ["stale_input", 409],
  ])("maps %s to %i", async (code, status) => {
    planMock.mockResolvedValue({ ok: false, error: { code } });

    const res = await requestPlan(validBody);

    expect(res.status).toBe(status);
  });

  it("maps editorial_plan_invalid to 422 without a silent fallback", async () => {
    planMock.mockResolvedValue({
      ok: false,
      error: { code: "editorial_plan_invalid", details: { message: "bad response" } },
    });

    const res = await requestPlan(validBody);
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.code).toBe("editorial_plan_invalid");
    expect(body.details).toEqual({ message: "bad response" });
  });
});
