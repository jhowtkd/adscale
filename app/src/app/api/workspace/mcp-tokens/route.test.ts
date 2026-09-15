import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET, POST } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({ user: { id: "user-1" }, workspace: { id: "workspace-1" } })
  ),
  requireRole: vi.fn(() => Promise.resolve({ role: "admin" })),
}));

const mocks = vi.hoisted(() => ({ issue: vi.fn(), list: vi.fn() }));
vi.mock("@/server/mcp/tokens", () => ({
  issueWorkspaceToken: (...args: unknown[]) => mocks.issue(...args),
  listWorkspaceTokens: (...args: unknown[]) => mocks.list(...args),
}));

describe("/api/workspace/mcp-tokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue([]);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GET lista sem expor segredos", async () => {
    mocks.list.mockResolvedValue([{ id: "t1", name: "Claude", prefix: "adscale-mcp-abcd" }]);
    const res = await GET(new Request("http://localhost/api/workspace/mcp-tokens"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("tokenHash");
    expect(mocks.list).toHaveBeenCalledWith("workspace-1");
  });

  it("POST cria e devolve o segredo uma vez", async () => {
    mocks.issue.mockResolvedValue({ id: "t1", token: "adscale-mcp-segredo", prefix: "adscale-mcp-segr" });
    const res = await POST(
      new Request("http://localhost/api/workspace/mcp-tokens", {
        method: "POST",
        body: JSON.stringify({ name: "Claude" }),
      })
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ token: "adscale-mcp-segredo" });
    expect(mocks.issue).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      userId: "user-1",
      name: "Claude",
    });
  });

  it("POST rejeita nome vazio", async () => {
    const res = await POST(
      new Request("http://localhost/api/workspace/mcp-tokens", {
        method: "POST",
        body: JSON.stringify({ name: "  " }),
      })
    );
    expect(res.status).toBe(400);
    expect(mocks.issue).not.toHaveBeenCalled();
  });
});
