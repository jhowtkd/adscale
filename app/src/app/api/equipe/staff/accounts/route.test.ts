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
import { makeTestDeps, openTestAccount } from "@/server/equipe/module/testing/deps";

const mockGetSession = vi.mocked(getSessionFromHeaders);
const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockCreateDeps = vi.mocked(createEquipeRouteDeps);

const USER_ID = "user-1";

function callGet() {
  return GET(new Request("http://localhost/api/equipe/staff/accounts"));
}

describe("GET /api/equipe/staff/accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden"),
    );
  });

  async function seedStaff() {
    const t = makeTestDeps();
    await openTestAccount(t);
    await openTestAccount(t);
    await t.deps.uow.internal.staff.create({
      role: "operations",
      displayName: "Ops",
      userId: USER_ID,
      active: true,
    });
    mockGetSession.mockResolvedValue({ user: { id: USER_ID, email: "ops@test.com" } } as never);
    mockCreateDeps.mockReturnValue(t.deps);
  }

  it("returns one entry per account across workspaces", async () => {
    await seedStaff();

    const res = await callGet();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toHaveLength(2);
    for (const entry of body.entries) {
      expect(entry.scope).toMatchObject({ workspaceId: expect.any(String), accountId: expect.any(String) });
      expect(entry.escalations).toEqual([]);
      expect(entry.exceptions).toEqual([]);
      expect(entry.pauses).toEqual([]);
    }
  });

  it("lets a platform owner read without any staff row", async () => {
    const t = makeTestDeps();
    await openTestAccount(t);
    mockGetSession.mockResolvedValue({ user: { id: "owner-1", email: "owner@test.com" } } as never);
    mockRequireOwner.mockResolvedValue({ user: { id: "owner-1", email: "owner@test.com" } } as never);
    mockCreateDeps.mockReturnValue(t.deps);

    const res = await callGet();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toHaveLength(1);
  });

  it("returns 403 for a session user with no staff row who is not an owner", async () => {
    const t = makeTestDeps();
    await openTestAccount(t);
    mockGetSession.mockResolvedValue({ user: { id: "random", email: "random@test.com" } } as never);
    mockCreateDeps.mockReturnValue(t.deps);

    const res = await callGet();

    expect(res.status).toBe(403);
  });

  it("returns 401 without a session", async () => {
    await seedStaff();
    mockGetSession.mockResolvedValue(null);

    const res = await callGet();

    expect(res.status).toBe(401);
  });
});
