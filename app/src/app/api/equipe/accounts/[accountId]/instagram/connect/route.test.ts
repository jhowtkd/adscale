import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

const mocks = vi.hoisted(() => ({
  userId: "user-cid",
  workspaceId: "",
  sessionId: "session-a",
  enabled: true,
  appId: "ig-app-1" as string | undefined,
  uow: null as unknown,
  states: new Map<string, string>(),
}));

vi.mock("@/server/auth/workspace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/workspace")>();
  return {
    ...actual,
    requireWorkspaceAccess: vi.fn(async () => ({
      user: { id: mocks.userId },
      workspace: { id: mocks.workspaceId },
    })),
  };
});
vi.mock("@/server/auth/session", () => ({
  getSessionFromHeaders: vi.fn(async () => ({
    user: { id: mocks.userId },
    session: { id: mocks.sessionId },
  })),
}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/equipe/data/postgres", () => ({
  createPostgresEquipeUnitOfWork: () => mocks.uow,
}));
vi.mock("@/server/equipe/module/equipe-enabled", () => ({
  isEquipeEnabledForWorkspace: () => mocks.enabled,
}));
vi.mock("@/server/equipe/publishing/oauth-nonce", async () => {
  const { randomBytes } = await import("node:crypto");
  const { signEquipeIgState } = await import("@/server/equipe/publishing/oauth");
  return {
    createEquipeIgOAuthState: async (input: Record<string, string>) => {
      const nonce = randomBytes(32).toString("hex");
      const state = signEquipeIgState({ ...input, nonce } as Parameters<typeof signEquipeIgState>[0]);
      mocks.states.set(state, nonce);
      return state;
    },
    consumeEquipeIgOAuthState: async (state: string, nonce: string) => {
      if (mocks.states.get(state) !== nonce) return false;
      mocks.states.delete(state);
      return true;
    },
  };
});
vi.mock("@/server/validation/env", () => ({
  env: {
    BETTER_AUTH_SECRET: "segredo-de-teste-com-32-caracteres!!",
    APP_URL: "https://app.example",
    get EQUIPE_IG_APP_ID() {
      return mocks.appId;
    },
  },
}));

import { makeTestDeps, openTestAccount } from "@/server/equipe/module/testing/deps";
import { verifyEquipeIgState } from "@/server/equipe/publishing/oauth";

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
  return ids;
}

function getRoute(accountId: string) {
  return GET(new Request("http://localhost/api/equipe/x/instagram/connect"), {
    params: Promise.resolve({ accountId }),
  });
}

describe("equipe instagram connect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userId = "user-cid";
    mocks.sessionId = "session-a";
    mocks.enabled = true;
    mocks.appId = "ig-app-1";
    mocks.states.clear();
  });

  it("the custodian starts OAuth with a signed state carrying the account", async () => {
    const ids = await seed();
    const res = await getRoute(ids.accountId);
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.hostname).toBe("www.facebook.com");
    expect(location.searchParams.get("client_id")).toBe("ig-app-1");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://app.example/api/equipe/instagram/callback",
    );
    expect(location.searchParams.get("scope")).toContain("instagram_content_publish");
    const state = verifyEquipeIgState(location.searchParams.get("state") ?? "");
    expect(state).toMatchObject({ workspaceId: ids.workspaceId, accountId: ids.accountId });
    expect(state?.userId).toBe("user-cid");
    expect(state?.sessionId).toBe("session-a");
    expect(state?.nonce).toMatch(/^[a-f0-9]{64}$/);
  });

  it("anyone but the custodian is refused", async () => {
    const ids = await seed();
    mocks.userId = "user-ana";
    expect((await getRoute(ids.accountId)).status).toBe(403);
    mocks.userId = "user-unknown";
    expect((await getRoute(ids.accountId)).status).toBe(403);
  });

  it("refuses workspaces outside the Equipe pilot", async () => {
    const ids = await seed();
    mocks.enabled = false;
    expect((await getRoute(ids.accountId)).status).toBe(403);
  });

  it("404s on accounts outside the workspace and 400s on bad ids", async () => {
    const ids = await seed();
    expect((await getRoute("not-a-uuid")).status).toBe(400);
    expect((await getRoute("00000000-0000-0000-0000-000000000000")).status).toBe(404);
    expect(ids.accountId).toBeDefined();
  });

  it("503s when the Instagram app is not configured", async () => {
    const ids = await seed();
    mocks.appId = undefined;
    expect((await getRoute(ids.accountId)).status).toBe(503);
  });
});
