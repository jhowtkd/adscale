import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

const KEY_B64 = vi.hoisted(() => Buffer.alloc(32, 7).toString("base64"));
const mocks = vi.hoisted(() => ({
  enabled: true,
  appId: "ig-app-1" as string | undefined,
  appSecret: "shh" as string | undefined,
  uow: null as unknown,
  graph: null as unknown as {
    exchangeCode: ReturnType<typeof vi.fn>;
    exchangeLongLivedToken: ReturnType<typeof vi.fn>;
    resolveInstagramAccount: ReturnType<typeof vi.fn>;
  },
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
vi.mock("@/server/equipe/module/equipe-enabled", () => ({
  isEquipeEnabledForWorkspace: () => mocks.enabled,
}));
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
import { signEquipeIgState } from "@/server/equipe/publishing/oauth";

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
  const custodian = ids.actors.custodian;
  if (custodian.kind !== "client_person") throw new Error("custodian not bound");
  const state = signEquipeIgState({
    workspaceId: ids.workspaceId,
    accountId: ids.accountId,
    custodianPersonId: custodian.personId,
    userId: "user-cid",
  });
  return { t, ids, state, custodianPersonId: custodian.personId };
}

function getRoute(query: string) {
  return GET(new Request(`${BASE}?${query}`));
}

describe("equipe instagram callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled = true;
    mocks.appId = "ig-app-1";
    mocks.appSecret = "shh";
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
    const { t, ids, state } = await seed();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const denied = await getRoute(`state=${encodeURIComponent(state)}&error=access_denied`);
    expect(denied.headers.get("location")).toContain("access_denied");
    const noCode = await getRoute(`state=${encodeURIComponent(state)}`);
    expect(noCode.headers.get("location")).toContain("missing_code");
    expect(mocks.graph.exchangeCode).not.toHaveBeenCalled();
    const events = await t.deps.uow.repos.events.list(scope);
    expect(events.some((e) => e.eventType.startsWith("connection."))).toBe(false);
  });

  it("an exchange failure records the failure; the second opens the exception", async () => {
    const { t, ids, state } = await seed();
    const scope = scopeOf(ids);
    mocks.graph.exchangeCode = vi.fn(async () => {
      throw new Error("graph down");
    });
    const query = `code=abc&state=${encodeURIComponent(state)}`;
    const first = await getRoute(query);
    expect(first.headers.get("location")).toContain("oauth_failed");
    const second = await getRoute(query);
    expect(second.headers.get("location")).toContain("oauth_failed");
    const failures = await t.deps.uow.repos.events.list(scope, { eventType: "connection.failed" });
    expect(failures).toHaveLength(2);
    const exceptions = await t.deps.uow.repos.exceptions.list(scope);
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]?.trigger).toBe("stuck_connection");
  });

  it("no linked IG account records the plain-language failure", async () => {
    const { t, ids, state } = await seed();
    const scope = scopeOf(ids);
    mocks.graph.resolveInstagramAccount = vi.fn(async () => null);
    const res = await getRoute(`code=abc&state=${encodeURIComponent(state)}`);
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
    });
    const res = await getRoute(`code=abc&state=${encodeURIComponent(stale)}`);
    expect(res.headers.get("location")).toContain("complete_failed");
    expect(await t.deps.uow.repos.connections.list(scope)).toHaveLength(0);
  });

  it("refuses workspaces outside the pilot and missing app config", async () => {
    const { ids, state } = await seed();
    const query = `code=abc&state=${encodeURIComponent(state)}`;
    mocks.enabled = false;
    expect((await getRoute(query)).headers.get("location")).toContain("not_enabled");
    mocks.enabled = true;
    mocks.appId = undefined;
    expect((await getRoute(query)).headers.get("location")).toContain("app_not_configured");
    expect(mocks.graph.exchangeCode).not.toHaveBeenCalled();
    expect(ids.accountId).toBeDefined();
  });
});

function scopeOf(ids: { workspaceId: string; accountId: string }) {
  return { workspaceId: ids.workspaceId, accountId: ids.accountId };
}
