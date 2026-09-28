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

function callGet(escalationId: string, query: string) {
  return GET(
    new Request(`http://localhost/api/equipe/staff/escalations/${escalationId}${query}`),
    { params: Promise.resolve({ escalationId }) },
  );
}

describe("GET /api/equipe/staff/escalations/[escalationId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden"),
    );
  });

  async function seed(): Promise<{ t: TestDeps; workspaceId: string; accountId: string }> {
    const t = makeTestDeps();
    const { workspaceId, accountId } = await openTestAccount(t);
    await t.deps.uow.internal.staff.create({
      role: "operations",
      displayName: "Ops",
      userId: USER_ID,
      active: true,
    });
    mockGetSession.mockResolvedValue({ user: { id: USER_ID, email: "ops@test.com" } } as never);
    mockCreateDeps.mockReturnValue(t.deps);
    return { t, workspaceId, accountId };
  }

  it("returns the escalation detail for internal staff", async () => {
    const { t, workspaceId, accountId } = await seed();
    const escalation = await t.deps.uow.repos.escalations.create(
      { workspaceId, accountId },
      { kind: "content", severity: "high", ownerRole: "quality" },
    );

    const res = await callGet(escalation.id, `?workspaceId=${workspaceId}&accountId=${accountId}`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workspaceId).toBe(workspaceId);
    expect(body.accountId).toBe(accountId);
    expect(body.escalation.id).toBe(escalation.id);
    expect(body.item).toBeNull();
    expect(body.events).toEqual([]);
    expect(body.pauses).toEqual([]);
    expect(body.exception).toBeNull();
  });

  it("returns 400 for malformed ids or a missing scope", async () => {
    const { workspaceId, accountId } = await seed();

    expect(
      (await callGet("not-a-uuid", `?workspaceId=${workspaceId}&accountId=${accountId}`)).status,
    ).toBe(400);
    expect((await callGet(UNKNOWN_ID, "")).status).toBe(400);
  });

  it("returns 404 for an unknown escalation", async () => {
    const { workspaceId, accountId } = await seed();

    const res = await callGet(UNKNOWN_ID, `?workspaceId=${workspaceId}&accountId=${accountId}`);

    expect(res.status).toBe(404);
  });

  it("returns 403 for a session user with no staff row who is not an owner", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId } = await openTestAccount(t);
    mockGetSession.mockResolvedValue({ user: { id: "random", email: "random@test.com" } } as never);
    mockCreateDeps.mockReturnValue(t.deps);

    const res = await callGet(UNKNOWN_ID, `?workspaceId=${workspaceId}&accountId=${accountId}`);

    expect(res.status).toBe(403);
  });

  it("returns 401 without a session", async () => {
    const { workspaceId, accountId } = await seed();
    mockGetSession.mockResolvedValue(null);

    const res = await callGet(UNKNOWN_ID, `?workspaceId=${workspaceId}&accountId=${accountId}`);

    expect(res.status).toBe(401);
  });
});
