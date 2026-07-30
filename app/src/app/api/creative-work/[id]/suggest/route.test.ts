import { beforeEach, describe, expect, it, vi } from "vitest";

const suggestMock = vi.hoisted(() => vi.fn());

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));
vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() => Promise.resolve({ user: { id: "user-1" }, workspace: { id: "workspace-1" } })),
}));
vi.mock("@/lib/with-rate-limit", () => ({
  checkRateLimit: vi.fn(() => null),
}));
vi.mock("@/server/application/suggest-creative-directions", () => ({
  suggestCreativeDirections: (...args: unknown[]) => suggestMock(...args),
}));

import { POST } from "./route";

describe("POST /api/creative-work/[id]/suggest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns scoped suggestions without accepting a generation payload", async () => {
    suggestMock.mockResolvedValue([{ id: "direction-1", label: "Oferta", instruction: "Destaque", order: 0, safetyBand: "safe", provenance: "ai-suggestion" }]);
    const response = await POST(new Request("http://localhost/api/creative-work/work-1/suggest", { method: "POST" }), { params: Promise.resolve({ id: "work-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.directions).toHaveLength(1);
    expect(suggestMock).toHaveBeenCalledWith({ workspaceId: "workspace-1", workItemId: "work-1" });
  });

  it("returns not found when the work is outside the workspace", async () => {
    suggestMock.mockResolvedValue(null);
    const response = await POST(new Request("http://localhost/api/creative-work/work-1/suggest", { method: "POST" }), { params: Promise.resolve({ id: "work-1" }) });
    expect(response.status).toBe(404);
  });
});
