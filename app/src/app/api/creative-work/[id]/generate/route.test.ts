import { beforeEach, describe, expect, it, vi } from "vitest";

const generate = vi.hoisted(() => vi.fn());
const revise = vi.hoisted(() => vi.fn());
vi.mock("@/server/application/generate-creative-work", () => ({ generateCreativeWork: generate }));
vi.mock("@/server/application/revise-creative-work-output", () => ({ reviseCreativeWorkOutput: revise }));
vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(async () => ({ user: { id: "user-1" }, workspace: { id: "ws-1" } })),
}));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));

import { POST } from "./route";

const request = (body: unknown = { action: "initial" }) => new Request("http://localhost/api/creative-work/work-1/generate", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

describe("POST /api/creative-work/[id]/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generate.mockResolvedValue({ ok: true, value: { work: { id: "work-1" }, outputs: [{ id: "output-1" }], billingKey: "creative-work:work-1:initial", brandTrainingSuggestion: null } });
    revise.mockResolvedValue({ ok: true, value: { output: { id: "output-v2", versionNumber: 2 } } });
  });

  it("delegates a strict revision command and returns only the new output", async () => {
    const body = {
      action: "revision",
      revisionKey: "00000000-0000-4000-8000-000000000101",
      outputId: "output-v1",
      instruction: "Use mais contraste",
      revisionAssetId: null,
    };
    const response = await POST(request(body), { params: Promise.resolve({ id: "work-1" }) });

    expect(response.status).toBe(202);
    expect(revise).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      workItemId: "work-1",
      userId: "user-1",
      revisionKey: "00000000-0000-4000-8000-000000000101",
      outputId: "output-v1",
      instruction: "Use mais contraste",
      revisionAssetId: null,
    });
    await expect(response.json()).resolves.toEqual({ output: { id: "output-v2", versionNumber: 2 } });
  });

  it("rejects a non-UUID revision key before it reaches the application command", async () => {
    const response = await POST(request({
      action: "revision",
      revisionKey: "balanced:4:5:1",
      outputId: "output-v1",
      instruction: "Use mais contraste",
      revisionAssetId: null,
    }), { params: Promise.resolve({ id: "work-1" }) });

    expect(response.status).toBe(400);
    expect(revise).not.toHaveBeenCalled();
  });

  it("is a thin adapter for the initial generation command", async () => {
    const response = await POST(request(), { params: Promise.resolve({ id: "work-1" }) });
    expect(response.status).toBe(202);
    expect(generate).toHaveBeenCalledWith({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });
    await expect(response.json()).resolves.toMatchObject({ outputs: [{ id: "output-1" }], billingKey: "creative-work:work-1:initial" });
  });

  it("rejects bodies other than the strict initial action", async () => {
    const response = await POST(request({}), { params: Promise.resolve({ id: "work-1" }) });
    expect(response.status).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });

  it.each([
    ["work_not_found", 404], ["work_not_draft", 409], ["work_not_prepared", 409],
    ["invalid_context", 422], ["brand_conflict", 422], ["briefing_blocked", 422], ["credit_blocked", 402], ["dispatch_failed", 502],
  ])("maps %s", async (code, status) => {
    generate.mockResolvedValue({ ok: false, error: { code } });
    const response = await POST(request(), { params: Promise.resolve({ id: "work-1" }) });
    expect(response.status).toBe(status);
  });

  it("maps invalid_context to 422 preserving the violations payload", async () => {
    const violations = [{ class: "modality", value: "presencial", field: "body" }];
    generate.mockResolvedValue({ ok: false, error: { code: "invalid_context", details: { violations } } });
    const response = await POST(request(), { params: Promise.resolve({ id: "work-1" }) });
    const body = await response.json();
    expect(response.status).toBe(422);
    expect(body.code).toBe("invalid_context");
    expect(body.details).toEqual({ violations });
  });

  it("maps brand_conflict to 422 preserving the two brand choices (R-003)", async () => {
    const details = { detectedBrand: "XTB", activeBrand: "Cenbrap", sourceId: "source-1", choices: ["source", "active"] };
    generate.mockResolvedValue({ ok: false, error: { code: "brand_conflict", details } });
    const response = await POST(request(), { params: Promise.resolve({ id: "work-1" }) });
    const body = await response.json();
    expect(response.status).toBe(422);
    expect(body.code).toBe("brand_conflict");
    expect(body.details).toEqual(details);
    expect(body.details.choices).toHaveLength(2);
  });
});
