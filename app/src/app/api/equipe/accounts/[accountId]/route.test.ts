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

  describe("viewer: whether the caller may decide the brand handoff", () => {
    async function seedAs(role: "approver" | "substitute" | "custodian" | "member", options: { active?: boolean } = {}) {
      const { t, account } = await seed();
      const scope = { workspaceId: account.workspaceId, accountId: account.accountId };
      const row = (await t.deps.uow.repos.people.list(scope)).find((person) => person.role === role)!;
      await t.deps.uow.repos.people.update(scope, row.id, { userId: USER_ID, ...(options.active === false ? { active: false } : {}) });
      return { t, account, scope };
    }
    const viewerOf = async (accountId: string) => (await (await callGet(accountId)).json()).viewer;

    it.each([
      ["approver", true], ["substitute", false], ["custodian", false], ["member", false],
    ] as const)("says a %s may decide: %s", async (role, expected) => {
      const { account } = await seedAs(role);
      expect(await viewerOf(account.accountId)).toEqual({ canDecideHandoff: expected });
    });

    it("says no for an approver whose row is inactive", async () => {
      const { account } = await seedAs("approver", { active: false });
      expect(await viewerOf(account.accountId)).toEqual({ canDecideHandoff: false });
    });

    it("says no for a workspace member with no row on the account", async () => {
      const { account } = await seed();
      expect(await viewerOf(account.accountId)).toEqual({ canDecideHandoff: false });
    });

    it("follows the strongest active row when the user holds several", async () => {
      const { t, account, scope } = await seedAs("custodian");
      const approver = (await t.deps.uow.repos.people.list(scope)).find((person) => person.role === "approver")!;
      await t.deps.uow.repos.people.update(scope, approver.id, { userId: USER_ID });
      expect(await viewerOf(account.accountId)).toEqual({ canDecideHandoff: true });
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

describe("GET /api/equipe/accounts/[accountId] — planAvailable (ticket 08)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("passes the plan gate through: false without a diagnosis, true once one is recorded", async () => {
    const t = makeTestDeps();
    const account = await openTestAccount(t);
    mockRequireAccess.mockResolvedValue({ user: { id: USER_ID }, workspace: { id: account.workspaceId } } as never);
    mockCreateDeps.mockReturnValue(t.deps);

    expect((await (await callGet(account.accountId)).json()).planAvailable).toBe(false);
    await t.deps.uow.repos.events.create({ workspaceId: account.workspaceId, accountId: account.accountId }, {
      actorType: "system", actorId: "diag", actorRole: "system", eventType: "diagnostic.recorded", payload: { documentId: "doc-1" }, occurredAt: new Date(),
    });
    const body = await (await callGet(account.accountId)).json();
    expect(body.planAvailable).toBe(true);
    expect(body.viewer).toBeDefined();
  });
});

describe("GET /api/equipe/accounts/[accountId] — threads (ticket 09)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  async function setup() {
    const t = makeTestDeps();
    const account = await openTestAccount(t);
    mockRequireAccess.mockResolvedValue({ user: { id: USER_ID }, workspace: { id: account.workspaceId } } as never);
    mockCreateDeps.mockReturnValue(t.deps);
    const parallel = async (topic: string) => {
      const assistantThreadId = crypto.randomUUID();
      t.store.assistantThreads.rows.set(assistantThreadId, { id: assistantThreadId, workspaceId: account.workspaceId, clientProfileId: account.profileId, campaignId: null });
      const outcome = await executeCommand(t.deps, { actor: account.actors.approver, workspaceId: account.workspaceId, accountId: account.accountId },
        { type: "open_parallel_thread", payload: { assistantThreadId, topic } });
      if (!outcome.ok) throw new Error(outcome.error.code);
      return assistantThreadId;
    };
    return { t, account, parallel };
  }

  it("lists the primary conversation with none parallel on a fresh account", async () => {
    const { account } = await setup();
    const body = await (await callGet(account.accountId)).json();
    expect(body.threads.parallel).toEqual([]);
    expect(body.threads.primary).toEqual({ id: expect.any(String), assistantThreadId: expect.any(String), topic: null });
    expect(Object.keys(body.threads.primary).sort()).toEqual(["assistantThreadId", "id", "topic"]);
  });

  it("lists the parallel conversations by topic, oldest first, next to the viewer", async () => {
    const { account, parallel } = await setup();
    const first = await parallel("Black Friday");
    const second = await parallel("Natal");
    const body = await (await callGet(account.accountId)).json();
    expect(body.threads.parallel.map((row: { topic: string; assistantThreadId: string }) => [row.topic, row.assistantThreadId]))
      .toEqual([["Black Friday", first], ["Natal", second]]);
    for (const row of body.threads.parallel) expect(Object.keys(row).sort()).toEqual(["assistantThreadId", "id", "topic"]);
    expect(body.viewer).toBeDefined();
  });

  it("never lists a conversation that belongs to another account or workspace", async () => {
    const { t, account, parallel } = await setup();
    const other = await openTestAccount(t);
    const otherThread = crypto.randomUUID();
    t.store.assistantThreads.rows.set(otherThread, { id: otherThread, workspaceId: other.workspaceId, clientProfileId: other.profileId, campaignId: null });
    const opened = await executeCommand(t.deps, { actor: other.actors.approver, workspaceId: other.workspaceId, accountId: other.accountId },
      { type: "open_parallel_thread", payload: { assistantThreadId: otherThread, topic: "Da outra conta" } });
    expect(opened.ok).toBe(true);
    await parallel("Minha");

    const mine = (await (await callGet(account.accountId)).json()).threads;
    expect(mine.parallel.map((row: { topic: string }) => row.topic)).toEqual(["Minha"]);
    expect(JSON.stringify(mine)).not.toContain("Da outra conta");
    expect(JSON.stringify(mine)).not.toContain(otherThread);
  });

  it("answers 404 and no threads for another workspace's account", async () => {
    const { t, account } = await setup();
    const other = await openTestAccount(t);
    mockRequireAccess.mockResolvedValue({ user: { id: USER_ID }, workspace: { id: other.workspaceId } } as never);
    const res = await callGet(account.accountId);
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain("threads");
  });
});
