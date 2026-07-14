import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "./route";

const INVITE_ID = "550e8400-e29b-41d4-a716-446655440000";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
  requireRole: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/server/repositories/invitation", () => ({
  cancelInvitation: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { cancelInvitation } from "@/server/repositories/invitation";

const mockCancelInvitation = vi.mocked(cancelInvitation);

function deleteRequest(query = `id=${INVITE_ID}`): Request {
  return new Request(`http://localhost/api/workspace/invites?${query}`, {
    method: "DELETE",
  });
}

describe("DELETE /api/workspace/invites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cancels a pending invite by id", async () => {
    mockCancelInvitation.mockResolvedValue({
      id: INVITE_ID,
      workspaceId: "workspace-1",
      email: "member@example.com",
      role: "member",
      token: "token-1",
      status: "pending",
      expiresAt: new Date(),
      createdAt: new Date(),
      createdBy: "user-1",
    });

    const res = await DELETE(deleteRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockCancelInvitation).toHaveBeenCalledWith(INVITE_ID, "workspace-1");
  });

  it("returns 404 when the invite does not exist", async () => {
    mockCancelInvitation.mockResolvedValue(null);

    const res = await DELETE(deleteRequest());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe("notFound");
  });

  it("returns 400 when id query param is missing", async () => {
    const res = await DELETE(new Request("http://localhost/api/workspace/invites", { method: "DELETE" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("invalidInput");
    expect(body.details).toBeDefined();
    expect(mockCancelInvitation).not.toHaveBeenCalled();
  });

  it("returns 400 when id is not a valid uuid", async () => {
    const res = await DELETE(deleteRequest("id=not-a-uuid"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("invalidInput");
    expect(body.details).toBeDefined();
    expect(mockCancelInvitation).not.toHaveBeenCalled();
  });
});
