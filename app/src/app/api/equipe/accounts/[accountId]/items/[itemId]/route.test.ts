import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(),
}));

vi.mock("@/server/equipe/http/deps", () => ({
  createEquipeRouteDeps: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { createEquipeRouteDeps } from "@/server/equipe/http/deps";
import { AUTH_ERROR_CODES, WorkspaceAuthError } from "@/server/auth/errors";
import { makeTestDeps, openTestAccount } from "@/server/equipe/module/testing/deps";

const mockRequireAccess = vi.mocked(requireWorkspaceAccess);
const mockCreateDeps = vi.mocked(createEquipeRouteDeps);

const USER_ID = "user-1";
const UNKNOWN_ID = "550e8400-e29b-41d4-a716-446655440099";

function callGet(accountId: string, itemId: string) {
  return GET(
    new Request(`http://localhost/api/equipe/accounts/${accountId}/items/${itemId}`),
    { params: Promise.resolve({ accountId, itemId }) },
  );
}

describe("GET /api/equipe/accounts/[accountId]/items/[itemId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function seed() {
    const t = makeTestDeps();
    const account = await openTestAccount(t);
    mockRequireAccess.mockResolvedValue({
      user: { id: USER_ID },
      workspace: { id: account.workspaceId },
    } as never);
    mockCreateDeps.mockReturnValue(t.deps);
    return { t, account };
  }

  it("returns the item detail for a workspace member with no account row", async () => {
    const { t, account } = await seed();
    const scope = { workspaceId: account.workspaceId, accountId: account.accountId };
    const fronts = await t.deps.uow.repos.fronts.list(scope);
    const item = await t.deps.uow.repos.items.create(scope, { frontId: fronts[0]!.id });

    const res = await callGet(account.accountId, item.id);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workspaceId).toBe(account.workspaceId);
    expect(body.accountId).toBe(account.accountId);
    expect(body.item.id).toBe(item.id);
    expect(body.versions).toEqual([]);
    expect(body.receipts).toEqual([]);
  });

  it("returns 400 for malformed ids", async () => {
    const { account } = await seed();

    expect((await callGet("not-a-uuid", UNKNOWN_ID)).status).toBe(400);
    expect((await callGet(account.accountId, "not-a-uuid")).status).toBe(400);
  });

  it("returns 404 for an unknown item", async () => {
    const { account } = await seed();

    const res = await callGet(account.accountId, UNKNOWN_ID);

    expect(res.status).toBe(404);
  });

  it("returns 404 for an item of another account, like an unknown one", async () => {
    const { t, account } = await seed();
    const other = await openTestAccount(t);
    const otherScope = { workspaceId: other.workspaceId, accountId: other.accountId };
    const fronts = await t.deps.uow.repos.fronts.list(otherScope);
    const item = await t.deps.uow.repos.items.create(otherScope, { frontId: fronts[0]!.id });

    const res = await callGet(account.accountId, item.id);

    expect(res.status).toBe(404);
  });

  it("returns 404 without revealing the feature when the workspace is off the pilot", async () => {
    const { t, account } = await seed();
    t.deps.isEnabledForWorkspace = () => false;

    const res = await callGet(account.accountId, UNKNOWN_ID);

    expect(res.status).toBe(404);
  });

  it("returns 401 without a session", async () => {
    const { account } = await seed();
    mockRequireAccess.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized"),
    );

    const res = await callGet(account.accountId, UNKNOWN_ID);

    expect(res.status).toBe(401);
  });
});
