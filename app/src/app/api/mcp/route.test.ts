import { describe, it, expect, vi, beforeEach } from "vitest";

const envState = vi.hoisted(() => ({ MCP_BEARER_ENABLED: "true" }));
vi.mock("@/server/validation/env", () => ({ env: envState }));

const mocks = vi.hoisted(() => ({ verify: vi.fn(), fetch: vi.fn() }));
vi.mock("@/server/mcp/tokens", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/mcp/tokens")>();
  return { ...original, verifyBearerToken: (...args: unknown[]) => mocks.verify(...args) };
});
vi.mock("@/server/mcp/server", () => ({
  mcpHandler: { fetch: (...args: unknown[]) => mocks.fetch(...args) },
}));

import { POST } from "./route";

function mcpRequest(authorization?: string) {
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });
}

describe("POST /api/mcp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envState.MCP_BEARER_ENABLED = "true";
    mocks.verify.mockResolvedValue({
      workspaceId: "ws-1",
      userId: "user-1",
      tokenId: "tok-1",
      prefix: "adscale-mcp-abcd",
    });
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  });

  it("404 com a flag desligada (não vaza existência)", async () => {
    envState.MCP_BEARER_ENABLED = "false";
    const res = await POST(mcpRequest("Bearer x"));
    expect(res.status).toBe(404);
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("401 sem Bearer ou com token inválido", async () => {
    expect((await POST(mcpRequest())).status).toBe(401);
    mocks.verify.mockResolvedValue(null);
    const res = await POST(mcpRequest("Bearer inválido"));
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("invalid_token");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("repasse autenticado carrega workspace + operador no authInfo", async () => {
    const req = mcpRequest("Bearer segredo");
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mocks.verify).toHaveBeenCalledWith("segredo");
    expect(mocks.fetch).toHaveBeenCalledWith(req, {
      authInfo: {
        token: "segredo",
        clientId: "mcp-bearer",
        scopes: ["workspace"],
        extra: { workspaceId: "ws-1", userId: "user-1", tokenPrefix: "adscale-mcp-abcd" },
      },
    });
  });

  it("500 quando o handler quebra (não vaza detalhe)", async () => {
    mocks.fetch.mockRejectedValue(new Error("boom"));
    const res = await POST(mcpRequest("Bearer segredo"));
    expect(res.status).toBe(500);
  });
});
