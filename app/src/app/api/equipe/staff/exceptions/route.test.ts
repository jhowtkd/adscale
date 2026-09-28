import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({
  getSessionFromHeaders: vi.fn(),
}));

vi.mock("@/server/auth/require-platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/equipe/http/deps", () => ({
  createEquipeRouteDeps: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { getSessionFromHeaders } from "@/server/auth/session";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { createEquipeRouteDeps } from "@/server/equipe/http/deps";
import { AUTH_ERROR_CODES, WorkspaceAuthError } from "@/server/auth/errors";
import {
  makeTestDeps,
  openTestAccount,
  type TestDeps,
} from "@/server/equipe/module/testing/deps";

const mockGetSession = vi.mocked(getSessionFromHeaders);
const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockCreateDeps = vi.mocked(createEquipeRouteDeps);

const USER_ID = "user-1";
const UNKNOWN_ID = "550e8400-e29b-41d4-a716-446655440099";

function callGet(query: string) {
  return GET(new Request(`http://localhost/api/equipe/staff/exceptions${query}`));
}

describe("GET /api/equipe/staff/exceptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden"),
    );
  });

  async function seed(role: "support" | "quality" = "support"): Promise<{
    t: TestDeps;
    workspaceId: string;
    accountId: string;
  }> {
    const t = makeTestDeps();
    const { workspaceId, accountId } = await openTestAccount(t, {
      labels: { brandName: "Café Aurora", workspaceName: "Agência Sul" },
    });
    await t.deps.uow.internal.staff.create({
      role,
      displayName: "Staffer",
      userId: USER_ID,
      active: true,
    });
    mockGetSession.mockResolvedValue({ user: { id: USER_ID, email: "staff@test.com" } } as never);
    mockCreateDeps.mockReturnValue(t.deps);
    return { t, workspaceId, accountId };
  }

  it("returns the account queue for internal staff", async () => {
    const { t, workspaceId, accountId } = await seed();
    const scope = { workspaceId, accountId };
    await t.deps.uow.repos.exceptions.create(scope, {
      trigger: "client_requested_person",
      reason: "cliente pediu uma pessoa",
      dueAt: new Date("2026-10-05T13:00:00.000Z"),
    });

    const res = await callGet(`?workspaceId=${workspaceId}&accountId=${accountId}`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workspaceId).toBe(workspaceId);
    expect(body.accountId).toBe(accountId);
    expect(body.brandName).toBe("Café Aurora");
    expect(body.workspaceName).toBe("Agência Sul");
    expect(body.open).toHaveLength(1);
    expect(body.open[0].exception.trigger).toBe("client_requested_person");
    expect(body.open[0].slaBreached).toBe(true);
  });

  it("lets a platform owner read without any staff row", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId } = await openTestAccount(t);
    mockGetSession.mockResolvedValue({ user: { id: "owner-1", email: "owner@test.com" } } as never);
    mockRequireOwner.mockResolvedValue({ user: { id: "owner-1", email: "owner@test.com" } } as never);
    mockCreateDeps.mockReturnValue(t.deps);

    const res = await callGet(`?workspaceId=${workspaceId}&accountId=${accountId}`);

    expect(res.status).toBe(200);
    expect(mockRequireOwner).toHaveBeenCalled();
  });

  it("returns 403 for a session user with no staff row who is not an owner", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId } = await openTestAccount(t);
    mockGetSession.mockResolvedValue({ user: { id: "random", email: "random@test.com" } } as never);
    mockCreateDeps.mockReturnValue(t.deps);

    const res = await callGet(`?workspaceId=${workspaceId}&accountId=${accountId}`);

    expect(res.status).toBe(403);
  });

  it("returns 400 without the account scope", async () => {
    const { workspaceId } = await seed();

    expect((await callGet("")).status).toBe(400);
    expect((await callGet(`?workspaceId=${workspaceId}`)).status).toBe(400);
    expect((await callGet("?workspaceId=not-a-uuid&accountId=not-a-uuid")).status).toBe(400);
  });

  it("returns 404 for an unknown account", async () => {
    const { workspaceId } = await seed();

    const res = await callGet(`?workspaceId=${workspaceId}&accountId=${UNKNOWN_ID}`);

    expect(res.status).toBe(404);
  });

  it("returns 401 without a session", async () => {
    const { workspaceId, accountId } = await seed();
    mockGetSession.mockResolvedValue(null);

    const res = await callGet(`?workspaceId=${workspaceId}&accountId=${accountId}`);

    expect(res.status).toBe(401);
  });
});
