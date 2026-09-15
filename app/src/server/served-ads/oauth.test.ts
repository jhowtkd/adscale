import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/validation/env", () => ({
  env: {
    BETTER_AUTH_SECRET: "01234567890123456789012345678901",
    APP_URL: "https://app.example",
  },
}));

import { metaCallbackUrl, signOAuthState, verifyOAuthState } from "./oauth";

describe("served-ads oauth state", () => {
  it("roundtrip preserva workspace+usuário", () => {
    const state = signOAuthState({ workspaceId: "ws-1", userId: "user-1" });
    expect(verifyOAuthState(state)).toEqual({ workspaceId: "ws-1", userId: "user-1" });
  });

  it("adulteração invalida", () => {
    const state = signOAuthState({ workspaceId: "ws-1", userId: "user-1" });
    const [payload] = state.split(".");
    expect(verifyOAuthState(`${payload}.deadbeef`)).toBeNull();
    expect(verifyOAuthState("lixo")).toBeNull();
    expect(verifyOAuthState("")).toBeNull();
  });

  it("expira em 10 minutos", () => {
    const now = Date.now();
    const state = signOAuthState({ workspaceId: "ws-1", userId: "user-1" }, now);
    expect(verifyOAuthState(state, now + 9 * 60 * 1000)).not.toBeNull();
    expect(verifyOAuthState(state, now + 11 * 60 * 1000)).toBeNull();
  });

  it("callback aponta para a rota fixa sob APP_URL", () => {
    expect(metaCallbackUrl()).toBe("https://app.example/api/workspace/meta-connection/oauth/callback");
  });
});
