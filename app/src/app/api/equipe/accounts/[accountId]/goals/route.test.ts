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

function callGet(accountId: string) {
  return GET(
    new Request(`http://localhost/api/equipe/accounts/${accountId}/goals`),
    { params: Promise.resolve({ accountId }) },
  );
}

describe("GET /api/equipe/accounts/[accountId]/goals", () => {
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

  it("returns plan, mandates and onboarding for a workspace member with no account row", async () => {
    const { account } = await seed();

    const res = await callGet(account.accountId);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workspaceId).toBe(account.workspaceId);
    expect(body.accountId).toBe(account.accountId);
    expect(body.plan).toBeNull();
    expect(body.mandates).toEqual([]);
    expect(body.onboarding).toHaveLength(7);
  });

  it("returns 400 for a malformed account id", async () => {
    await seed();

    const res = await callGet("not-a-uuid");

    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown account", async () => {
    await seed();

    const res = await callGet(UNKNOWN_ID);

    expect(res.status).toBe(404);
  });

  it("returns 404 without revealing the feature when the workspace is off the pilot", async () => {
    const { t, account } = await seed();
    t.deps.isEnabledForWorkspace = () => false;

    const res = await callGet(account.accountId);

    expect(res.status).toBe(404);
  });

  it("returns 401 without a session", async () => {
    const { account } = await seed();
    mockRequireAccess.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized"),
    );

    const res = await callGet(account.accountId);

    expect(res.status).toBe(401);
  });
});
