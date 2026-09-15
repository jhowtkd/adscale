import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DELETE } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({ user: { id: "user-1" }, workspace: { id: "workspace-1" } })
  ),
  requireRole: vi.fn(() => Promise.resolve({ role: "admin" })),
}));

const revokeMock = vi.hoisted(() => vi.fn());
vi.mock("@/server/mcp/tokens", () => ({
  revokeWorkspaceToken: (...args: unknown[]) => revokeMock(...args),
}));

describe("DELETE /api/workspace/mcp-tokens/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("revoga token do workspace", async () => {
    revokeMock.mockResolvedValue(true);
    const res = await DELETE(
      new Request("http://localhost/api/workspace/mcp-tokens/t1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "t1" }) }
    );
    expect(res.status).toBe(200);
    expect(revokeMock).toHaveBeenCalledWith("workspace-1", "t1");
  });

  it("404 quando já revogado ou de outro workspace", async () => {
    revokeMock.mockResolvedValue(false);
    const res = await DELETE(
      new Request("http://localhost/api/workspace/mcp-tokens/t1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "t1" }) }
    );
    expect(res.status).toBe(404);
  });
});
