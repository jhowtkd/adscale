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
import { executeCommand } from "@/server/equipe/module/commands";
import { makeTestDeps, openTestAccount } from "@/server/equipe/module/testing/deps";

const mockRequireAccess = vi.mocked(requireWorkspaceAccess);
const mockCreateDeps = vi.mocked(createEquipeRouteDeps);

const USER_ID = "user-1";
const UNKNOWN_ID = "550e8400-e29b-41d4-a716-446655440099";

function callGet(accountId: string) {
  return GET(
    new Request(`http://localhost/api/equipe/accounts/${accountId}`),
    { params: Promise.resolve({ accountId }) },
  );
}

describe("GET /api/equipe/accounts/[accountId]", () => {
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

  it("returns the account state for a workspace member with no account row", async () => {
    const { account } = await seed();

    const res = await callGet(account.accountId);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      workspaceId: account.workspaceId,
      accountId: account.accountId,
      status: "deploying",
    });
    expect(body.fronts).toHaveLength(1);
    expect(body.pendingSteps).toHaveLength(7);
    expect(body.activePauses).toEqual([]);
  });

  it("exposes the active pauses with who may resume them", async () => {
    const { t, account } = await seed();
    const outcome = await executeCommand(
      t.deps,
      { actor: account.actors.approver, workspaceId: account.workspaceId, accountId: account.accountId },
      { type: "pause_publications", payload: {} },
    );
    expect(outcome.ok).toBe(true);

    const res = await callGet(account.accountId);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activePauses).toHaveLength(1);
    expect(body.activePauses[0]).toMatchObject({
      level: "publishing",
      origin: "client",
      resumableBy: "client",
      status: "active",
    });
  });

  it("returns 400 for a malformed account id", async () => {
    const { account } = await seed();

    const res = await callGet("not-a-uuid");

    expect(res.status).toBe(400);
    expect(account.accountId).toBeTruthy();
  });

  it("returns 404 for an unknown account", async () => {
    await seed();

    const res = await callGet(UNKNOWN_ID);

    expect(res.status).toBe(404);
  });

  it("returns 404 for an account of another workspace, like an unknown one", async () => {
    const t = makeTestDeps();
    const mine = await openTestAccount(t);
    const other = await openTestAccount(t);
    mockRequireAccess.mockResolvedValue({
      user: { id: USER_ID },
      workspace: { id: mine.workspaceId },
    } as never);
    mockCreateDeps.mockReturnValue(t.deps);

    const res = await callGet(other.accountId);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("notFound");
  });

  it("returns 404 without revealing the feature when the workspace is off the pilot", async () => {
    const { t, account } = await seed();
    t.deps.isEnabledForWorkspace = () => false;

    const res = await callGet(account.accountId);

    expect(res.status).toBe(404);
  });

  it("returns 401 without a session", async () => {
    await seed();
    mockRequireAccess.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized"),
    );

    const res = await callGet(UNKNOWN_ID);

    expect(res.status).toBe(401);
  });
});
