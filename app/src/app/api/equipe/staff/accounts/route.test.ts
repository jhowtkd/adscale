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
    // #583 — the global stop rides along for the internal consoles.
    expect(body.globalStop).toEqual({ active: false });
    for (const entry of body.entries) {
      expect(entry.scope).toMatchObject({ workspaceId: expect.any(String), accountId: expect.any(String) });
      expect(entry.brandName).toBe("Marca demo");
      expect(entry.workspaceName).toBe("Espaço demo");
      expect(entry.escalations).toEqual([]);
      expect(entry.exceptions).toEqual([]);
      expect(entry.pauses).toEqual([]);
    }
  });

  it("lists the paid accounts and only the free ones with something open, with names", async () => {
    const t = makeTestDeps();
    const paid = await openTestAccount(t);
    const quiet = await openTestAccount(t);
    const withCase = await openTestAccount(t, { labels: { brandName: "Café Aurora", workspaceName: "Agência Sul" } });
    for (const free of [quiet, withCase]) t.store.accounts.rows.get(free.accountId)!.status = "free";
    const scope = { workspaceId: withCase.workspaceId, accountId: withCase.accountId };
    await t.deps.uow.repos.exceptions.create(scope, { trigger: "sem_material" });
    await t.deps.uow.internal.staff.create({ role: "operations", displayName: "Ops", userId: USER_ID, active: true });
    mockGetSession.mockResolvedValue({ user: { id: USER_ID, email: "ops@test.com" } } as never);
    mockCreateDeps.mockReturnValue(t.deps);

    const res = await callGet();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries.map((entry: { scope: { accountId: string } }) => entry.scope.accountId))
      .toEqual([paid.accountId, withCase.accountId]);
    expect(body.entries.map((entry: { scope: { accountId: string } }) => entry.scope.accountId)).not.toContain(quiet.accountId);
    expect(body.entries[1]).toMatchObject({ brandName: "Café Aurora", workspaceName: "Agência Sul" });
    expect(body.entries[1].exceptions).toHaveLength(1);
    expect(body.entries[0].exceptions).toEqual([]);
    expect(body.globalStop).toEqual({ active: false });
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

  describe("?access=1: the shell's question, answered without an error (ticket 13, D-11)", () => {
    const callProbe = () => GET(new Request("http://localhost/api/equipe/staff/accounts?access=1"));

    it("staff: 200 {allowed:true}, and nothing of the pipeline is read", async () => {
      await seedStaff();
      const res = await callProbe();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ allowed: true });
    });

    it("a platform owner without a staff row is allowed too", async () => {
      const t = makeTestDeps();
      mockGetSession.mockResolvedValue({ user: { id: "owner-1", email: "owner@test.com" } } as never);
      mockRequireOwner.mockResolvedValue({ user: { id: "owner-1", email: "owner@test.com" } } as never);
      mockCreateDeps.mockReturnValue(t.deps);
      const res = await callProbe();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ allowed: true });
    });

    it("a regular account gets 200 {allowed:false}, not a 403 (the browser logged that 403 as an error at every opening of the home)", async () => {
      const t = makeTestDeps();
      await openTestAccount(t);
      mockGetSession.mockResolvedValue({ user: { id: "random", email: "random@test.com" } } as never);
      mockCreateDeps.mockReturnValue(t.deps);
      const res = await callProbe();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ allowed: false });
    });

    it("without a session it is still a 401", async () => {
      await seedStaff();
      mockGetSession.mockResolvedValue(null);
      expect((await callProbe()).status).toBe(401);
    });

    it("any other failure is still an error, never a quiet {allowed:false}", async () => {
      const t = makeTestDeps();
      mockGetSession.mockResolvedValue({ user: { id: "random", email: "random@test.com" } } as never);
      mockCreateDeps.mockImplementation(() => { throw new Error("db down"); });
      void t;
      expect((await callProbe()).status).toBe(500);
    });

    it("without the probe a regular account still gets the 403 (the route's own contract is unchanged)", async () => {
      const t = makeTestDeps();
      mockGetSession.mockResolvedValue({ user: { id: "random", email: "random@test.com" } } as never);
      mockCreateDeps.mockReturnValue(t.deps);
      expect((await callGet()).status).toBe(403);
    });
  });
});
