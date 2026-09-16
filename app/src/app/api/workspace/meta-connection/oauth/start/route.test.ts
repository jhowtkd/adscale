import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({ user: { id: "user-1" }, workspace: { id: "workspace-1" } })
  ),
  requireRole: vi.fn(() => Promise.resolve({ role: "owner" })),
}));

const mocks = vi.hoisted(() => ({ mockMode: true, appId: undefined as string | undefined }));
vi.mock("@/server/served-ads/graph", () => ({
  isMockMode: () => mocks.mockMode,
  buildOAuthStartUrl: (params: { appId: string }) => `https://meta.invalid/dialog?app=${params.appId}`,
}));
vi.mock("@/server/served-ads/oauth", () => ({
  signOAuthState: () => "state-signed",
  metaCallbackUrl: () => "https://app.example/api/workspace/meta-connection/oauth/callback",
}));
vi.mock("@/server/validation/env", () => ({
  env: { get META_APP_ID() { return mocks.appId; } },
}));

import { AUTH_ERROR_CODES, WorkspaceAuthError } from "@/server/auth/errors";
import { requireRole } from "@/server/auth/workspace";

describe("meta-connection oauth start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockMode = true;
    mocks.appId = undefined;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("modo mock faz loopback para o callback com code mock", async () => {
    const res = await GET(new Request("http://localhost/api/workspace/meta-connection/oauth/start"));
    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/oauth/callback");
    expect(location).toContain("code=mock-code");
    expect(location).toContain("state=state-signed");
  });

  it("modo real redireciona para o dialog Meta", async () => {
    mocks.mockMode = false;
    mocks.appId = "app-1";
    const res = await GET(new Request("http://localhost/api/workspace/meta-connection/oauth/start"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("meta.invalid/dialog");
  });

  it("modo real sem app dá 503", async () => {
    mocks.mockMode = false;
    mocks.appId = undefined;
    const res = await GET(new Request("http://localhost/api/workspace/meta-connection/oauth/start"));
    expect(res.status).toBe(503);
  });

  it("member não inicia OAuth", async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );
    const res = await GET(new Request("http://localhost/api/workspace/meta-connection/oauth/start"));
    expect(res.status).toBe(403);
  });
});
