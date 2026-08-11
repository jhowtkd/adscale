import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/session", () => ({
  getSessionFromHeaders: vi.fn(),
}));

vi.mock("@/server/auth/team", () => ({
  ACTIVE_WORKSPACE_COOKIE: "adscale_active_workspace",
  ACTIVE_WORKSPACE_COOKIE_OPTIONS: {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
    secure: false,
  },
  acceptInvite: vi.fn(),
  isInviteStateError: () => false,
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { POST } from "./route";
import { getSessionFromHeaders } from "@/server/auth/session";
import { acceptInvite } from "@/server/auth/team";

describe("POST /api/workspace/invites/accept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the accepted workspace and pins it as the active workspace", async () => {
    vi.mocked(getSessionFromHeaders).mockResolvedValue({
      user: { id: "user-1", email: "person@example.com" },
    } as never);
    vi.mocked(acceptInvite).mockResolvedValue({ workspaceId: "workspace-2" } as never);

    const response = await POST(
      new Request("http://localhost/api/workspace/invites/accept", {
        method: "POST",
        body: JSON.stringify({ token: "invite-token" }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, workspaceId: "workspace-2" });
    expect(response.headers.get("set-cookie")).toContain("adscale_active_workspace=workspace-2");
  });
});
