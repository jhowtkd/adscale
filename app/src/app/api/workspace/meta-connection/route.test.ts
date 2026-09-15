import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET, DELETE } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({ user: { id: "user-1" }, workspace: { id: "workspace-1" } })
  ),
  requireRole: vi.fn(() => Promise.resolve({ role: "admin" })),
}));

const mocks = vi.hoisted(() => ({
  getConnectionByWorkspace: vi.fn(),
  listConnectionAccounts: vi.fn(),
  purge: vi.fn(),
  mockMode: true,
}));
vi.mock("@/server/served-ads/repository", () => ({
  getConnectionByWorkspace: (...args: unknown[]) => mocks.getConnectionByWorkspace(...args),
  listConnectionAccounts: (...args: unknown[]) => mocks.listConnectionAccounts(...args),
}));
vi.mock("@/server/served-ads/sync", () => ({
  disconnectConnection: (...args: unknown[]) => mocks.purge(...args),
}));
vi.mock("@/server/served-ads/graph", () => ({
  isMockMode: () => mocks.mockMode,
}));

import { AUTH_ERROR_CODES, WorkspaceAuthError } from "@/server/auth/errors";
import { requireRole } from "@/server/auth/workspace";

describe("/api/workspace/meta-connection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockMode = true;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GET sem conexão devolve connected:false", async () => {
    mocks.getConnectionByWorkspace.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/workspace/meta-connection"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ connected: false, mock: true });
  });

  it("GET com conexão devolve status + contas sem token", async () => {
    mocks.getConnectionByWorkspace.mockResolvedValue({
      id: "c1",
      status: "ativa",
      lastSyncAt: "2026-09-15T10:00:00Z",
      lastSyncError: null,
    });
    mocks.listConnectionAccounts.mockResolvedValue([
      { id: "a1", adAccountId: "123", name: "A", currency: "BRL", brandId: null },
    ]);
    const res = await GET(new Request("http://localhost/api/workspace/meta-connection"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ connected: true, status: "ativa" });
    expect(body.accounts).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain("tokenCiphertext");
  });

  it("DELETE desconecta e purga", async () => {
    mocks.getConnectionByWorkspace.mockResolvedValue({ id: "c1" });
    const res = await DELETE(new Request("http://localhost/api/workspace/meta-connection"));
    expect(res.status).toBe(200);
    expect(mocks.purge).toHaveBeenCalledWith("c1");
  });

  it("DELETE sem conexão dá 404", async () => {
    mocks.getConnectionByWorkspace.mockResolvedValue(null);
    const res = await DELETE(new Request("http://localhost/api/workspace/meta-connection"));
    expect(res.status).toBe(404);
  });

  it("DELETE como member dá 403", async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );
    const res = await DELETE(new Request("http://localhost/api/workspace/meta-connection"));
    expect(res.status).toBe(403);
    expect(mocks.purge).not.toHaveBeenCalled();
  });
});
