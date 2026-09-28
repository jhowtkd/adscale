import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

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
  uuid,
  type TestDeps,
} from "@/server/equipe/module/testing/deps";
import type { EquipeStaffRole } from "@/server/equipe/data";

const mockGetSession = vi.mocked(getSessionFromHeaders);
const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockCreateDeps = vi.mocked(createEquipeRouteDeps);

const USER_ID = "user-1";
const UNKNOWN_ID = "550e8400-e29b-41d4-a716-446655440099";

function callPost(body: unknown) {
  return POST(
    new Request("http://localhost/api/equipe/staff/commands", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/equipe/staff/commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden"),
    );
  });

  async function seed(roles: EquipeStaffRole[]): Promise<{
    t: TestDeps;
    workspaceId: string;
    accountId: string;
    staffIds: Record<string, string>;
  }> {
    const t = makeTestDeps();
    const { workspaceId, accountId } = await openTestAccount(t);
    const staffIds: Record<string, string> = {};
    for (const role of roles) {
      const row = await t.deps.uow.internal.staff.create({
        role,
        displayName: role,
        userId: USER_ID,
        active: true,
      });
      staffIds[role] = row.id;
    }
    mockGetSession.mockResolvedValue({ user: { id: USER_ID, email: "staff@test.com" } } as never);
    mockCreateDeps.mockReturnValue(t.deps);
    return { t, workspaceId, accountId, staffIds };
  }

  function openExceptionBody(workspaceId: string, accountId: string, extra: Record<string, unknown> = {}) {
    return {
      type: "open_exception",
      payload: { trigger: "stalled_implantation" },
      workspaceId,
      accountId,
      ...extra,
    };
  }

  function openAccountBody(workspaceId: string, profileId: string, extra: Record<string, unknown> = {}) {
    return {
      type: "open_account",
      payload: {
        clientProfileId: profileId,
        fronts: ["social_instagram"],
        people: [{ name: "Ana", role: "approver" }],
      },
      workspaceId,
      ...extra,
    };
  }

  async function asOwnerWithoutRows(): Promise<{ t: TestDeps; workspaceId: string; profileId: string }> {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const profileId = uuid();
    t.gateway.addProfile({ id: profileId, workspaceId });
    mockGetSession.mockResolvedValue({ user: { id: "owner-1", email: "owner@test.com" } } as never);
    mockRequireOwner.mockResolvedValue({ user: { id: "owner-1", email: "owner@test.com" } } as never);
    mockCreateDeps.mockReturnValue(t.deps);
    return { t, workspaceId, profileId };
  }

  async function rowsForUser(t: TestDeps, userId: string) {
    return (await t.deps.uow.internal.staff.list()).filter((row) => row.userId === userId);
  }

  it("builds the staff actor from the single row and runs the command", async () => {
    const { workspaceId, accountId, staffIds } = await seed(["support"]);

    const res = await callPost(openExceptionBody(workspaceId, accountId));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("open_exception");
    expect(body.events[0]).toMatchObject({
      actorType: "staff",
      actorId: staffIds.support,
      actorRole: "support",
    });
  });

  it("uses the row matching an explicit held role", async () => {
    const { workspaceId, accountId, staffIds } = await seed(["support", "quality"]);

    const res = await callPost(openExceptionBody(workspaceId, accountId, { role: "support" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events[0]).toMatchObject({
      actorType: "staff",
      actorId: staffIds.support,
      actorRole: "support",
    });
  });

  it("asks for an explicit role when several rows match", async () => {
    const { workspaceId, accountId } = await seed(["support", "quality"]);

    const res = await callPost(openExceptionBody(workspaceId, accountId));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("staff_role_required");
  });

  it("refuses a role the user does not hold", async () => {
    const { workspaceId, accountId } = await seed(["support"]);

    const res = await callPost(openExceptionBody(workspaceId, accountId, { role: "quality" }));

    expect(res.status).toBe(403);
  });

  it("rejects a body smuggling an actor — the actor never comes from the body", async () => {
    const { workspaceId, accountId } = await seed(["support"]);

    const res = await callPost({
      ...openExceptionBody(workspaceId, accountId),
      actor: { kind: "staff", role: "operations", staffId: "forged" },
    });

    expect(res.status).toBe(400);
  });

  it("maps a module forbidden_actor to 403", async () => {
    const { workspaceId, accountId } = await seed(["support"]);

    const res = await callPost({
      type: "score_attempt",
      payload: {
        roundId: UNKNOWN_ID,
        itemId: UNKNOWN_ID,
        facts: 3,
        brand: 3,
        usefulness: 3,
        execution: 3,
      },
      workspaceId,
      accountId,
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("forbidden_actor");
  });

  it("returns 400 without the workspace scope", async () => {
    const { accountId } = await seed(["support"]);

    const res = await callPost({ type: "open_exception", payload: {}, accountId });

    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown account", async () => {
    const { workspaceId } = await seed(["support"]);

    const res = await callPost(openExceptionBody(workspaceId, UNKNOWN_ID));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("unknown_account");
  });

  it("bootstraps a platform owner with no rows: rows created, open_account succeeds as operations", async () => {
    const { t, workspaceId, profileId } = await asOwnerWithoutRows();

    const res = await callPost(openAccountBody(workspaceId, profileId, { role: "operations" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("open_account");
    const rows = await rowsForUser(t, "owner-1");
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.role).sort()).toEqual(["operations", "quality", "support"]);
    const operations = rows.find((row) => row.role === "operations")!;
    expect(body.events[0]).toMatchObject({
      actorType: "staff",
      actorId: operations.id,
      actorRole: "operations",
    });
  });

  it("creates nothing on the owner's second request", async () => {
    const { t, workspaceId, profileId } = await asOwnerWithoutRows();
    const first = await callPost(openAccountBody(workspaceId, profileId, { role: "operations" }));
    expect(first.status).toBe(200);
    const before = await rowsForUser(t, "owner-1");
    expect(before).toHaveLength(3);

    const secondProfileId = uuid();
    t.gateway.addProfile({ id: secondProfileId, workspaceId });
    const second = await callPost(openAccountBody(workspaceId, secondProfileId, { role: "operations" }));

    expect(second.status).toBe(200);
    const after = await rowsForUser(t, "owner-1");
    expect(after.map((row) => row.id).sort()).toEqual(before.map((row) => row.id).sort());
  });

  it("returns 403 for a session user with no staff row who is not an owner", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId } = await openTestAccount(t);
    mockGetSession.mockResolvedValue({ user: { id: "random", email: "random@test.com" } } as never);
    mockCreateDeps.mockReturnValue(t.deps);

    const res = await callPost(openExceptionBody(workspaceId, accountId));

    expect(res.status).toBe(403);
    expect(await rowsForUser(t, "random")).toHaveLength(0);
  });

  it("refuses the command when the owner's operations row was deactivated — no reactivation", async () => {
    const { t, workspaceId, profileId } = await asOwnerWithoutRows();
    for (const role of ["support", "quality", "operations"] as const) {
      await t.deps.uow.internal.staff.create({
        role,
        displayName: role,
        userId: "owner-1",
        active: true,
      });
    }
    const operations = (await rowsForUser(t, "owner-1")).find((row) => row.role === "operations")!;
    await t.deps.uow.internal.staff.update(operations.id, { active: false });

    const res = await callPost(openAccountBody(workspaceId, profileId, { role: "operations" }));

    expect(res.status).toBe(403);
    const rows = await rowsForUser(t, "owner-1");
    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.role === "operations")?.active).toBe(false);
  });

  it("returns 403 when every owner role was deactivated — nothing is reactivated", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId } = await openTestAccount(t);
    for (const role of ["support", "quality", "operations"] as const) {
      await t.deps.uow.internal.staff.create({
        role,
        displayName: role,
        userId: "owner-1",
        active: false,
      });
    }
    mockGetSession.mockResolvedValue({ user: { id: "owner-1", email: "owner@test.com" } } as never);
    mockRequireOwner.mockResolvedValue({ user: { id: "owner-1", email: "owner@test.com" } } as never);
    mockCreateDeps.mockReturnValue(t.deps);

    const res = await callPost(openExceptionBody(workspaceId, accountId, { role: "support" }));

    expect(res.status).toBe(403);
    const rows = await rowsForUser(t, "owner-1");
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => !row.active)).toBe(true);
  });

  it("returns 401 without a session", async () => {
    const { workspaceId, accountId } = await seed(["support"]);
    mockGetSession.mockResolvedValue(null);

    const res = await callPost(openExceptionBody(workspaceId, accountId));

    expect(res.status).toBe(401);
  });
});
