import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/validation/env", () => ({
  env: {
    BETTER_AUTH_SECRET: "segredo-de-teste-com-32-caracteres!!",
    APP_URL: "https://app.example",
  },
}));

import {
  buildEquipeIgStartUrl,
  equipeIgCallbackUrl,
  signEquipeIgState,
  verifyEquipeIgState,
} from "./oauth";

const STATE = {
  workspaceId: "ws-1",
  accountId: "acc-1",
  custodianPersonId: "person-cid",
  userId: "user-1",
  sessionId: "session-1",
  nonce: "a".repeat(64),
};

describe("equipe instagram oauth state", () => {
  it("assina e verifica o state com a conta dentro", () => {
    const raw = signEquipeIgState(STATE, 1_000);
    expect(verifyEquipeIgState(raw, 2_000)).toEqual(STATE);
  });

  it("rejeita state adulterado", () => {
    const raw = signEquipeIgState(STATE, 1_000);
    const [payload, sig] = raw.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...STATE, accountId: "acc-outra", exp: 1_000 + 600_000 }),
    ).toString("base64url");
    expect(verifyEquipeIgState(`${tamperedPayload}.${sig}`, 2_000)).toBeNull();
    expect(verifyEquipeIgState(`${payload}.deadbeef`, 2_000)).toBeNull();
    expect(verifyEquipeIgState("lixo", 2_000)).toBeNull();
  });

  it("requires a 64-hex nonce and initiating session in state", () => {
    expect(verifyEquipeIgState(signEquipeIgState({ ...STATE, nonce: "short" }, 1_000), 2_000)).toBeNull();
    expect(verifyEquipeIgState(signEquipeIgState({ ...STATE, sessionId: "" }, 1_000), 2_000)).toBeNull();
    const extra = signEquipeIgState(STATE, 1_000) + ".extra";
    expect(verifyEquipeIgState(extra, 2_000)).toBeNull();
  });

  it("rejeita state expirado", () => {
    const raw = signEquipeIgState(STATE, 1_000);
    expect(verifyEquipeIgState(raw, 1_000 + 10 * 60 * 1000 + 1)).toBeNull();
  });

  it("monta a URL fixa do callback e o início com escopos", () => {
    expect(equipeIgCallbackUrl()).toBe("https://app.example/api/equipe/instagram/callback");
    const url = new URL(
      buildEquipeIgStartUrl({
        appId: "app-1",
        redirectUri: equipeIgCallbackUrl(),
        state: "st",
      }),
    );
    expect(url.hostname).toBe("www.facebook.com");
    expect(url.searchParams.get("client_id")).toBe("app-1");
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.get("scope")).toContain("instagram_content_publish");
  });
});
