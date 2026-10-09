import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { GET as startConnect } from "../../accounts/[accountId]/instagram/connect/route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

const KEY_B64 = vi.hoisted(() => Buffer.alloc(32, 7).toString("base64"));
const mocks = vi.hoisted(() => ({
  userId: "user-cid",
  workspaceId: "",
  sessionId: "session-a",
  appId: "ig-app-1" as string | undefined,
  appSecret: "shh" as string | undefined,
  uow: null as unknown,
  graph: null as unknown as {
    exchangeCode: ReturnType<typeof vi.fn>;
    exchangeLongLivedToken: ReturnType<typeof vi.fn>;
    resolveInstagramAccount: ReturnType<typeof vi.fn>;
  },
  nonces: new Map<string, string>(),
  memberships: new Set<string>(),
}));

vi.mock("@/server/auth/session", () => ({
  getSessionFromHeaders: vi.fn(async (headers: Headers) => ({
    user: { id: headers.get("x-user") ?? mocks.userId },
    session: { id: headers.get("x-session") ?? mocks.sessionId },
  })),
}));
vi.mock("@/server/repositories/workspace", () => ({
  getWorkspaceForUser: vi.fn(async (userId: string) =>
    mocks.memberships.has(`${userId}:${mocks.workspaceId}`) ? { id: mocks.workspaceId } : null,
  ),
  getWorkspaceForUserInWorkspace: vi.fn(async (userId: string, workspaceId: string) =>
    mocks.memberships.has(`${userId}:${workspaceId}`) ? { id: workspaceId } : null,
  ),
}));

vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/equipe/data/postgres", () => ({
  createPostgresEquipeUnitOfWork: () => mocks.uow,
}));
vi.mock("@/server/equipe/agents/gateway", () => ({
  LiveAdscaleGateway: class {
    constructor(public readonly workspaceId: string) {}
  },
}));
vi.mock("@/server/equipe/publishing/oauth-nonce", async () => {
  const { randomBytes } = await import("node:crypto");
  const { signEquipeIgState } = await import("@/server/equipe/publishing/oauth");
  return {
    createEquipeIgOAuthState: async (input: Record<string, string>) => {
      const nonce = randomBytes(32).toString("hex");
      const state = signEquipeIgState({ ...input, nonce } as Parameters<typeof signEquipeIgState>[0]);
      mocks.nonces.set(state, nonce);
      return state;
    },
    consumeEquipeIgOAuthState: async (state: string, nonce: string) => {
      if (mocks.nonces.get(state) !== nonce) return false;
      mocks.nonces.delete(state);
      return true;
    },
  };
});
vi.mock("@/server/equipe/publishing/graph", () => ({
  InstagramGraphClient: class {
    exchangeCode(...args: unknown[]) {
      return (mocks.graph.exchangeCode as (...a: unknown[]) => unknown)(...args);
    }
    exchangeLongLivedToken(...args: unknown[]) {
      return (mocks.graph.exchangeLongLivedToken as (...a: unknown[]) => unknown)(...args);
    }
    resolveInstagramAccount(...args: unknown[]) {
      return (mocks.graph.resolveInstagramAccount as (...a: unknown[]) => unknown)(...args);
    }
  },
}));
vi.mock("@/server/validation/env", () => ({
  env: {
    BETTER_AUTH_SECRET: "segredo-de-teste-com-32-caracteres!!",
    APP_URL: "https://app.example",
    EQUIPE_IG_TOKEN_ENCRYPTION_KEY: KEY_B64,
    get EQUIPE_IG_APP_ID() {
      return mocks.appId;
    },
    get EQUIPE_IG_APP_SECRET() {
      return mocks.appSecret;
    },
  },
}));

import { makeTestDeps, openTestAccount } from "@/server/equipe/module/testing/deps";
import { decryptEquipeIgToken } from "@/server/equipe/publishing/crypto";
import { signEquipeIgState, verifyEquipeIgState } from "@/server/equipe/publishing/oauth";
import { getWorkspaceForUserInWorkspace } from "@/server/repositories/workspace";
import { ACTIVE_WORKSPACE_COOKIE } from "@/server/auth/workspace";

const BASE = "http://localhost/api/equipe/instagram/callback";

async function seed() {
  const t = makeTestDeps();
  const ids = await openTestAccount(t, {
    people: [
      { name: "Ana", role: "approver", userId: "user-ana" },
      { name: "Cid", role: "custodian", userId: "user-cid" },
    ],
  });
  mocks.uow = t.deps.uow;
  mocks.workspaceId = ids.workspaceId;
  mocks.userId = "user-cid";
  mocks.sessionId = "session-a";
  mocks.memberships.add(`user-cid:${ids.workspaceId}`);
  const custodian = ids.actors.custodian;
  if (custodian.kind !== "client_person") throw new Error("custodian not bound");
  const state = await newState(ids, custodian.personId);
  return { t, ids, state, custodianPersonId: custodian.personId };
}

async function newState(
  ids: { workspaceId: string; accountId: string },
  custodianPersonId: string,
  options: { userId?: string; sessionId?: string } = {},
) {
  const nonce = (await import("node:crypto")).randomBytes(32).toString("hex");
  const state = signEquipeIgState({
    workspaceId: ids.workspaceId,
    accountId: ids.accountId,
    custodianPersonId,
    userId: options.userId ?? "user-cid",
    sessionId: options.sessionId ?? "session-a",
    nonce,
  });
  mocks.nonces.set(state, nonce);
  return state;
}

function getRoute(
  query: string,
  options: { userId?: string; activeWorkspaceId?: string; sessionId?: string } = {},
) {
  const headers = new Headers({
    "x-user": options.userId ?? mocks.userId,
    "x-session": options.sessionId ?? mocks.sessionId,
  });
  if (options.activeWorkspaceId) headers.set("cookie", `${ACTIVE_WORKSPACE_COOKIE}=${options.activeWorkspaceId}`);
  return GET(new Request(`${BASE}?${query}`, {
    headers,
  }));
}

function startRoute(accountId: string, options: { userId?: string; workspaceId?: string; sessionId?: string } = {}) {
  return startConnect(new Request(`http://localhost/api/equipe/accounts/${accountId}/instagram/connect`, {
    headers: {
      "x-user": options.userId ?? mocks.userId,
      "cookie": `${ACTIVE_WORKSPACE_COOKIE}=${options.workspaceId ?? mocks.workspaceId}`,
      "x-session": options.sessionId ?? mocks.sessionId,
    },
  }), { params: Promise.resolve({ accountId }) });
}

describe("equipe instagram callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appId = "ig-app-1";
    mocks.appSecret = "shh";
    mocks.nonces.clear();
    mocks.userId = "user-cid";
    mocks.sessionId = "session-a";
    mocks.memberships.clear();
    mocks.graph = {
      exchangeCode: vi.fn(async () => ({ accessToken: "short-lived" })),
      exchangeLongLivedToken: vi.fn(async () => ({ accessToken: "long-lived" })),
      resolveInstagramAccount: vi.fn(async () => ({ igUserId: "ig_1", igUsername: "marca" })),
    };
  });

  it("a valid code connects the account with the encrypted bundle", async () => {
    const { t, ids, state } = await seed();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const res = await getRoute(`code=abc&state=${encodeURIComponent(state)}`);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.example/pipeline?instagram=connected");
    expect(mocks.graph.exchangeCode).toHaveBeenCalledWith(
      "abc",
      "https://app.example/api/equipe/instagram/callback",
    );
    const connections = await t.deps.uow.repos.connections.list(scope);
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({ provider: "instagram", status: "active" });
    expect(decryptEquipeIgToken(connections[0]!.encryptedToken)).toEqual({
      accessToken: "long-lived",
      igUserId: "ig_1",
      igUsername: "marca",
    });
    const events = await t.deps.uow.repos.events.list(scope, { eventType: "connection.connected" });
    expect(events).toHaveLength(1);
  });

  it("a tampered state is rejected without touching the provider", async () => {
    const { t, ids, state } = await seed();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const [payload, sig] = state.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        workspaceId: ids.workspaceId,
        accountId: "00000000-0000-0000-0000-000000000000",
        custodianPersonId: "x",
        userId: "user-cid",
        exp: Date.now() + 600_000,
      }),
    ).toString("base64url");
    const res = await getRoute(`code=abc&state=${encodeURIComponent(`${tamperedPayload}.${sig}`)}`);
    expect(res.headers.get("location")).toContain("instagram=error");
    expect(res.headers.get("location")).toContain("invalid_state");
    expect(mocks.graph.exchangeCode).not.toHaveBeenCalled();
    expect(await t.deps.uow.repos.connections.list(scope)).toHaveLength(0);
    expect(payload).toBeDefined();
  });

  it("a provider denial or missing code redirects without recording", async () => {
    const { t, ids, custodianPersonId } = await seed();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const deniedState = await newState(ids, custodianPersonId);
    const denied = await getRoute(`state=${encodeURIComponent(deniedState)}&error=access_denied`);
    expect(denied.headers.get("location")).toContain("access_denied");
    const noCodeState = await newState(ids, custodianPersonId);
    const noCode = await getRoute(`state=${encodeURIComponent(noCodeState)}`);
    expect(noCode.headers.get("location")).toContain("missing_code");
    expect(mocks.graph.exchangeCode).not.toHaveBeenCalled();
    const events = await t.deps.uow.repos.events.list(scope);
    expect(events.some((e) => e.eventType.startsWith("connection."))).toBe(false);
  });

  it("an exchange failure records the failure; the second opens the exception", async () => {
    const { t, ids, custodianPersonId } = await seed();
    const scope = scopeOf(ids);
    mocks.graph.exchangeCode = vi.fn(async () => {
      throw new Error("graph down");
    });
    const query = `code=abc&state=${encodeURIComponent(await newState(ids, custodianPersonId))}`;
    const first = await getRoute(query);
    expect(first.headers.get("location")).toContain("oauth_failed");
    const secondState = await newState(ids, custodianPersonId);
    const second = await getRoute(`code=abc&state=${encodeURIComponent(secondState)}`);
    expect(second.headers.get("location")).toContain("oauth_failed");
    const failures = await t.deps.uow.repos.events.list(scope, { eventType: "connection.failed" });
    expect(failures).toHaveLength(2);
    const exceptions = await t.deps.uow.repos.exceptions.list(scope);
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]?.trigger).toBe("stuck_connection");
  });

  it("no linked IG account records the plain-language failure", async () => {
    const { t, ids, custodianPersonId } = await seed();
    const scope = scopeOf(ids);
    mocks.graph.resolveInstagramAccount = vi.fn(async () => null);
    const res = await getRoute(`code=abc&state=${encodeURIComponent(await newState(ids, custodianPersonId))}`);
    expect(res.headers.get("location")).toContain("no_instagram_account");
    const failures = await t.deps.uow.repos.events.list(scope, { eventType: "connection.failed" });
    expect(failures).toHaveLength(1);
    expect(await t.deps.uow.repos.connections.list(scope)).toHaveLength(0);
  });

  it("a stale custodian cannot complete the connection", async () => {
    const { t, ids } = await seed();
    const scope = scopeOf(ids);
    const approver = ids.actors.approver;
    if (approver.kind !== "client_person") throw new Error("approver not bound");
    // Signed for a person who is not the custodian (role changed mid-OAuth).
    const stale = signEquipeIgState({
      workspaceId: ids.workspaceId,
      accountId: ids.accountId,
      custodianPersonId: approver.personId,
      userId: "user-ana",
      sessionId: "session-a",
      nonce: (await import("node:crypto")).randomBytes(32).toString("hex"),
    });
    mocks.nonces.set(stale, verifyEquipeIgState(stale)!.nonce);
    mocks.memberships.add(`user-ana:${ids.workspaceId}`);
    const res = await getRoute(`code=abc&state=${encodeURIComponent(stale)}`, { userId: "user-ana" });
    expect(res.headers.get("location")).toContain("invalid_custodian");
    expect(await t.deps.uow.repos.connections.list(scope)).toHaveLength(0);
  });

  it("refuses a missing app config", async () => {
    const { ids, state } = await seed();
    const query = `code=abc&state=${encodeURIComponent(state)}`;
    mocks.appId = undefined;
    expect((await getRoute(query)).headers.get("location")).toContain("app_not_configured");
    expect(mocks.graph.exchangeCode).not.toHaveBeenCalled();
    expect(ids.accountId).toBeDefined();
  });

  it("integrates start and callback with signed session state, real command storage and one-use nonce", async () => {
    const { t, ids, custodianPersonId } = await seed();
    const scope = scopeOf(ids);
    const started = await startRoute(ids.accountId);
    const stateA = new URL(started.headers.get("location")!).searchParams.get("state")!;
    const signed = verifyEquipeIgState(stateA);
    expect(signed).toMatchObject({
      workspaceId: ids.workspaceId, accountId: ids.accountId,
      custodianPersonId, userId: "user-cid", sessionId: "session-a",
    });
    expect(signed?.nonce).toMatch(/^[a-f0-9]{64}$/);

    for (const other of [
      { userId: "user-cid", sessionId: "session-b" },
      { userId: "user-b", sessionId: "session-a" },
    ]) {
      const refused = await getRoute(`code=abc&state=${encodeURIComponent(stateA)}`, other);
      expect(refused.headers.get("location")).toContain("invalid_session");
      expect(await t.deps.uow.repos.connections.list(scope)).toHaveLength(0);
    }
    expect(mocks.graph.exchangeCode).not.toHaveBeenCalled();

    const otherWorkspace = await openTestAccount(t, {
      people: [
        { name: "Ana B", role: "approver", userId: "user-ana-b" },
        { name: "Cid B", role: "custodian", userId: "user-cid" },
      ],
    });
    mocks.memberships.add(`user-cid:${otherWorkspace.workspaceId}`);
    const connected = await getRoute(`code=abc&state=${encodeURIComponent(stateA)}`, {
      activeWorkspaceId: otherWorkspace.workspaceId,
    });
    expect(connected.headers.get("location")).toContain("instagram=connected");
    expect(getWorkspaceForUserInWorkspace).toHaveBeenCalledWith("user-cid", ids.workspaceId);
    const connection = (await t.deps.uow.repos.connections.list(scope))[0]!;
    expect(decryptEquipeIgToken(connection.encryptedToken)).toEqual({
      accessToken: "long-lived", igUserId: "ig_1", igUsername: "marca",
    });
    expect(connection.encryptedToken).not.toContain("long-lived");
    expect(await t.deps.uow.repos.connections.list({
      workspaceId: otherWorkspace.workspaceId, accountId: otherWorkspace.accountId,
    })).toHaveLength(0);
    expect((await getRoute(`code=abc&state=${encodeURIComponent(stateA)}`)).headers.get("location"))
      .toContain("invalid_state");
    expect(mocks.graph.exchangeCode).toHaveBeenCalledTimes(1);

    const person = (await t.deps.uow.repos.people.list(scope)).find((row) => row.id === custodianPersonId)!;
    const membershipStart = await startRoute(ids.accountId);
    const membershipState = new URL(membershipStart.headers.get("location")!).searchParams.get("state")!;
    mocks.memberships.delete(`user-cid:${ids.workspaceId}`);
    const withoutMembership = await getRoute(`code=abc&state=${encodeURIComponent(membershipState)}`, {
      activeWorkspaceId: otherWorkspace.workspaceId,
    });
    expect(withoutMembership.headers.get("location")).toContain("invalid_session");
    expect(mocks.graph.exchangeCode).toHaveBeenCalledTimes(1);
    expect((await t.deps.uow.repos.connections.list(scope))).toMatchObject([
      { encryptedToken: connection.encryptedToken },
    ]);
    mocks.memberships.add(`user-cid:${ids.workspaceId}`);

    const beforeRevoke = await startRoute(ids.accountId);
    const beforeState = new URL(beforeRevoke.headers.get("location")!).searchParams.get("state")!;
    await t.deps.uow.repos.people.update(scope, person.id, { active: false });
    expect((await getRoute(`code=abc&state=${encodeURIComponent(beforeState)}`)).headers.get("location"))
      .toContain("invalid_custodian");
    expect(mocks.graph.exchangeCode).toHaveBeenCalledTimes(1);
    await t.deps.uow.repos.people.update(scope, person.id, { active: true });

    const duringRevoke = await startRoute(ids.accountId);
    const duringState = new URL(duringRevoke.headers.get("location")!).searchParams.get("state")!;
    mocks.graph.exchangeCode = vi.fn(async () => {
      await t.deps.uow.repos.people.update(scope, person.id, { active: false });
      return { accessToken: "short-lived" };
    });
    const duringResult = await getRoute(`code=abc&state=${encodeURIComponent(duringState)}`);
    expect(duringResult.headers.get("location")).toContain("invalid_custodian");
    expect(mocks.graph.exchangeCode).toHaveBeenCalledTimes(1);
    expect((await t.deps.uow.repos.connections.list(scope))[0]!.encryptedToken).toBe(connection.encryptedToken);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: "connection.connected" })).toHaveLength(1);
    await t.deps.uow.repos.people.update(scope, person.id, { active: true });

    const removedAccountStart = await startRoute(ids.accountId);
    const removedAccountState = new URL(removedAccountStart.headers.get("location")!).searchParams.get("state")!;
    t.store.accounts.rows.delete(ids.accountId);
    const removed = await getRoute(`code=abc&state=${encodeURIComponent(removedAccountState)}`);
    expect(removed.headers.get("location")).toContain("invalid_custodian");
    expect(mocks.graph.exchangeCode).toHaveBeenCalledTimes(1);
  });

  it("requires a fresh OAuth nonce after a provider error", async () => {
    const { ids } = await seed();
    const firstStart = await startRoute(ids.accountId);
    const failedState = new URL(firstStart.headers.get("location")!).searchParams.get("state")!;
    mocks.graph.exchangeCode = vi.fn(async () => { throw new Error("provider rejected code"); });
    expect((await getRoute(`code=bad&state=${encodeURIComponent(failedState)}`)).headers.get("location"))
      .toContain("oauth_failed");

    mocks.graph.exchangeCode = vi.fn(async () => ({ accessToken: "short-lived" }));
    expect((await getRoute(`code=good&state=${encodeURIComponent(failedState)}`)).headers.get("location"))
      .toContain("invalid_state");
    expect(mocks.graph.exchangeCode).not.toHaveBeenCalled();
    const retryStart = await startRoute(ids.accountId);
    const freshState = new URL(retryStart.headers.get("location")!).searchParams.get("state")!;
    expect(freshState).not.toBe(failedState);
    expect((await getRoute(`code=good&state=${encodeURIComponent(freshState)}`)).headers.get("location"))
      .toContain("instagram=connected");
  });
});

function scopeOf(ids: { workspaceId: string; accountId: string }) {
  return { workspaceId: ids.workspaceId, accountId: ids.accountId };
}
