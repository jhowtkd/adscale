import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({ user: { id: "user-1" }, workspace: { id: "workspace-1" } })
  ),
  requireRole: vi.fn(() => Promise.resolve({ role: "owner" })),
}));

const mocks = vi.hoisted(() => ({
  connection: null as null | { id: string; status: string },
  send: vi.fn(),
}));
vi.mock("@/server/served-ads/repository", () => ({
  getConnectionByWorkspace: vi.fn(() => Promise.resolve(mocks.connection)),
}));
vi.mock("@/server/jobs/client", () => ({
  inngest: { send: (...args: unknown[]) => mocks.send(...args) },
}));

import { AUTH_ERROR_CODES, WorkspaceAuthError } from "@/server/auth/errors";
import { requireRole } from "@/server/auth/workspace";

describe("meta-connection sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection = { id: "c1", status: "ativa" };
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POST enfileira evento e devolve 202", async () => {
    const res = await POST(new Request("http://localhost/api/workspace/meta-connection/sync"));
    expect(res.status).toBe(202);
    expect(mocks.send).toHaveBeenCalledWith({ name: "meta.ads.sync", data: { connectionId: "c1" } });
  });

  it("sem conexão dá 404; inativa dá 409", async () => {
    mocks.connection = null;
    expect((await POST(new Request("http://localhost/x"))).status).toBe(404);
    mocks.connection = { id: "c1", status: "expirada" };
    expect((await POST(new Request("http://localhost/x"))).status).toBe(409);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("como member dá 403", async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );
    expect((await POST(new Request("http://localhost/x"))).status).toBe(403);
  });
});
