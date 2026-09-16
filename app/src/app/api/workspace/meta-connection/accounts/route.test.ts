import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET as listAccounts, POST as linkAccount } from "./route";

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
  accounts: [] as Array<Record<string, unknown>>,
  linked: true,
  brand: { id: "550e8400-e29b-41d4-a716-446655440012" } as null | { id: string },
  send: vi.fn(),
}));
vi.mock("@/server/served-ads/repository", () => ({
  getConnectionByWorkspace: vi.fn(() => Promise.resolve(mocks.connection)),
  listConnectionAccounts: vi.fn(() => Promise.resolve(mocks.accounts)),
  linkAccountBrand: vi.fn(() => Promise.resolve(mocks.linked)),
}));
vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: vi.fn(() => Promise.resolve(mocks.brand)),
}));
vi.mock("@/server/jobs/client", () => ({
  inngest: { send: (...args: unknown[]) => mocks.send(...args) },
}));

import { AUTH_ERROR_CODES, WorkspaceAuthError } from "@/server/auth/errors";
import { requireRole } from "@/server/auth/workspace";
import { linkAccountBrand } from "@/server/served-ads/repository";

describe("meta-connection accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection = { id: "c1", status: "ativa" };
    mocks.accounts = [];
    mocks.linked = true;
    mocks.brand = { id: "550e8400-e29b-41d4-a716-446655440012" };
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accounts GET lista (member lê)", async () => {
    mocks.accounts = [{ id: "550e8400-e29b-41d4-a716-446655440011", adAccountId: "123", brandId: null }];
    const res = await listAccounts(new Request("http://localhost/api/workspace/meta-connection/accounts"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accounts: mocks.accounts });
  });

  it("accounts POST vincula conta ↔ marca", async () => {
    const res = await linkAccount(
      new Request("http://localhost/api/workspace/meta-connection/accounts", {
        method: "POST",
        body: JSON.stringify({ accountId: "550e8400-e29b-41d4-a716-446655440011", brandId: "550e8400-e29b-41d4-a716-446655440012" }),
      })
    );
    expect(res.status).toBe(200);
    expect(linkAccountBrand).toHaveBeenCalledWith("c1", "550e8400-e29b-41d4-a716-446655440011", "550e8400-e29b-41d4-a716-446655440012");
  });

  it("accounts POST aceita desvincular (brandId null)", async () => {
    const res = await linkAccount(
      new Request("http://localhost/api/workspace/meta-connection/accounts", {
        method: "POST",
        body: JSON.stringify({ accountId: "550e8400-e29b-41d4-a716-446655440011", brandId: null }),
      })
    );
    expect(res.status).toBe(200);
    expect(linkAccountBrand).toHaveBeenCalledWith("c1", "550e8400-e29b-41d4-a716-446655440011", null);
  });

  it("accounts POST valida entrada, marca e conta", async () => {
    const bad = await linkAccount(
      new Request("http://localhost/x", { method: "POST", body: JSON.stringify({}) })
    );
    expect(bad.status).toBe(400);
    mocks.brand = null;
    const noBrand = await linkAccount(
      new Request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ accountId: "550e8400-e29b-41d4-a716-446655440011", brandId: "550e8400-e29b-41d4-a716-446655440099" }),
      })
    );
    expect(noBrand.status).toBe(404);
    mocks.brand = { id: "550e8400-e29b-41d4-a716-446655440012" };
    mocks.linked = false;
    const noAccount = await linkAccount(
      new Request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ accountId: "550e8400-e29b-41d4-a716-446655440099", brandId: "550e8400-e29b-41d4-a716-446655440012" }),
      })
    );
    expect(noAccount.status).toBe(404);
  });

  it("accounts POST como member dá 403", async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );
    const res = await linkAccount(
      new Request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ accountId: "550e8400-e29b-41d4-a716-446655440011", brandId: null }),
      })
    );
    expect(res.status).toBe(403);
  });
});
