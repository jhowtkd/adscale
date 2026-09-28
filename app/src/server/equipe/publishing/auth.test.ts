import { beforeEach, describe, expect, it, vi } from "vitest";

const KEY_B64 = vi.hoisted(() => Buffer.alloc(32, 7).toString("base64"));

vi.mock("@/server/validation/env", () => ({
  env: { EQUIPE_IG_TOKEN_ENCRYPTION_KEY: KEY_B64 },
}));

import { createMemoryEquipeStore, createMemoryEquipeRepositories } from "../data";
import { InstagramAuthError, loadInstagramAuth } from "./auth";
import { encryptEquipeIgToken } from "./crypto";

const SCOPE = { workspaceId: "ws-1", accountId: "acc-1" };

describe("loadInstagramAuth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  async function seedConnection(input: {
    status?: "active" | "expired" | "revoked" | "error";
    encryptedToken?: string;
  }) {
    const store = createMemoryEquipeStore();
    const repos = createMemoryEquipeRepositories(store);
    await repos.connections.create(SCOPE, {
      provider: "instagram",
      encryptedToken:
        input.encryptedToken ??
        encryptEquipeIgToken({ accessToken: "tok", igUserId: "ig_1", igUsername: "marca" }),
      status: input.status ?? "active",
    });
    return repos;
  }

  it("loads the token and IG account of an active connection", async () => {
    const repos = await seedConnection({});
    const auth = await loadInstagramAuth(repos, SCOPE);
    expect(auth).toMatchObject({ accessToken: "tok", igUserId: "ig_1", igUsername: "marca" });
  });

  it("refuses a missing connection", async () => {
    const store = createMemoryEquipeStore();
    const repos = createMemoryEquipeRepositories(store);
    try {
      await loadInstagramAuth(repos, SCOPE);
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(InstagramAuthError);
      expect((error as InstagramAuthError).code).toBe("connection_missing");
    }
  });

  it("refuses expired, revoked and error connections", async () => {
    for (const status of ["expired", "revoked", "error"] as const) {
      const repos = await seedConnection({ status });
      try {
        await loadInstagramAuth(repos, SCOPE);
        throw new Error(`expected failure for ${status}`);
      } catch (error) {
        expect((error as InstagramAuthError).code).toBe(`connection_${status}`);
      }
    }
  });

  it("refuses an unreadable token as connection_error", async () => {
    const repos = await seedConnection({ encryptedToken: "v1:AAAA" });
    try {
      await loadInstagramAuth(repos, SCOPE);
      throw new Error("expected failure");
    } catch (error) {
      expect((error as InstagramAuthError).code).toBe("connection_error");
    }
  });
});
