import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

const mocks = vi.hoisted(() => ({
  state: null as null | { workspaceId: string; userId: string },
  token: "tok-live",
  existing: null as null | { id: string },
  created: { id: "c-new" },
  send: vi.fn(),
  encrypt: vi.fn((token: string) => `ct:${token}`),
}));
vi.mock("@/server/served-ads/oauth", () => ({
  verifyOAuthState: () => mocks.state,
  metaCallbackUrl: () => "https://app.example/api/workspace/meta-connection/oauth/callback",
}));
vi.mock("@/server/served-ads/graph", () => ({
  getGraphClient: () => ({ exchangeCode: async () => ({ accessToken: mocks.token }) }),
}));
vi.mock("@/server/served-ads/crypto", () => ({
  encryptMetaToken: (...args: unknown[]) => mocks.encrypt(...args),
}));
vi.mock("@/server/served-ads/repository", () => ({
  getConnectionByWorkspace: vi.fn(() => Promise.resolve(mocks.existing)),
  updateConnectionToken: vi.fn(() => Promise.resolve()),
  createConnection: vi.fn(() => Promise.resolve(mocks.created)),
}));
vi.mock("@/server/jobs/client", () => ({
  inngest: { send: (...args: unknown[]) => mocks.send(...args) },
}));
vi.mock("@/server/validation/env", () => ({
  env: { APP_URL: "https://app.example" },
}));

import { createConnection, updateConnectionToken } from "@/server/served-ads/repository";

const base = "http://localhost/api/workspace/meta-connection/oauth/callback";

describe("meta-connection oauth callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state = { workspaceId: "ws-1", userId: "user-1" };
    mocks.existing = null;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("code válido cria conexão, cifra token e agenda sync", async () => {
    const res = await GET(new Request(`${base}?code=abc&state=s`));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.example/settings?tab=integrations&meta=connected");
    expect(mocks.encrypt).toHaveBeenCalledWith("tok-live");
    expect(createConnection).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      userId: "user-1",
      tokenCiphertext: "ct:tok-live",
    });
    expect(mocks.send).toHaveBeenCalledWith({ name: "meta.ads.sync", data: { connectionId: "c-new" } });
  });

  it("reconexão troca o token sem recriar", async () => {
    mocks.existing = { id: "c-old" };
    const res = await GET(new Request(`${base}?code=abc&state=s`));
    expect(res.status).toBe(307);
    expect(updateConnectionToken).toHaveBeenCalledWith("c-old", "ct:tok-live");
    expect(createConnection).not.toHaveBeenCalled();
  });

  it("state inválido redireciona com erro sem tocar no banco", async () => {
    mocks.state = null;
    const res = await GET(new Request(`${base}?code=abc&state=ruim`));
    expect(res.headers.get("location")).toContain("meta=error");
    expect(createConnection).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("erro do provedor ou sem code redireciona com erro", async () => {
    const denied = await GET(new Request(`${base}?state=s&error=access_denied`));
    expect(denied.headers.get("location")).toContain("meta=error");
    const noCode = await GET(new Request(`${base}?state=s`));
    expect(noCode.headers.get("location")).toContain("meta=error");
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
