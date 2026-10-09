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

function callGet() {
  return GET(new Request("http://localhost/api/equipe/accounts"));
}

describe("GET /api/equipe/accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function seedEnabled() {
    const t = makeTestDeps();
    const first = await openTestAccount(t);
    const second = await openTestAccount(t);
    mockRequireAccess.mockResolvedValue({
      user: { id: USER_ID },
      workspace: { id: first.workspaceId },
    } as never);
    mockCreateDeps.mockReturnValue(t.deps);
    return { t, first, second };
  }

  it("lists the workspace accounts, oldest first", async () => {
    const { first } = await seedEnabled();

    const res = await callGet();

    expect(res.status).toBe(200);
    const body = await res.json();
    // Only the session workspace's accounts — the second seed is elsewhere.
    expect(body.accounts.map((account: { id: string }) => account.id)).toEqual([first.accountId]);
    expect(body.accounts[0]).toMatchObject({
      workspaceId: first.workspaceId,
      status: "deploying",
    });
  });

  it("carries the brand name and the pending-decision flag per account", async () => {
    const t = makeTestDeps();
    const seeded = await openTestAccount(t, { profileName: "Café Aurora" });
    mockRequireAccess.mockResolvedValue({
      user: { id: USER_ID },
      workspace: { id: seeded.workspaceId },
    } as never);
    mockCreateDeps.mockReturnValue(t.deps);

    const res = await callGet();

    expect(res.status).toBe(200);
    const body = await res.json();
    // Freshly opened: implantação steps still open, so decisions pending.
    expect(body.accounts[0]).toMatchObject({
      id: seeded.accountId,
      clientProfileName: "Café Aurora",
      pendingDecisions: true,
    });

    for (const step of await t.deps.uow.repos.onboarding.list({
      workspaceId: seeded.workspaceId,
      accountId: seeded.accountId,
    })) {
      await t.deps.uow.repos.onboarding.update(
        { workspaceId: seeded.workspaceId, accountId: seeded.accountId },
        step.id,
        { status: "done" },
      );
    }
    const quiet = await callGet();
    expect((await quiet.json()).accounts[0]).toMatchObject({ pendingDecisions: false });
  });

  it("returns an empty list when the workspace has no accounts", async () => {
    const t = makeTestDeps();
    mockRequireAccess.mockResolvedValue({
      user: { id: USER_ID },
      workspace: { id: "550e8400-e29b-41d4-a716-446655440001" },
    } as never);
    mockCreateDeps.mockReturnValue(t.deps);

    const res = await callGet();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accounts: [] });
  });

  it("returns 401 without a session", async () => {
    mockRequireAccess.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized"),
    );

    const res = await callGet();

    expect(res.status).toBe(401);
  });
});
