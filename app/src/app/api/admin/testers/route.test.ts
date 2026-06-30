import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

vi.mock("@/server/auth/platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/repositories/entitlements", () => ({
  listActiveTesterEntitlements: vi.fn(),
  grantTesterEntitlement: vi.fn(),
}));

vi.mock("@/server/repositories/workspace", () => ({
  getWorkspaceForUser: vi.fn(),
}));

vi.mock("@/server/repositories/user", () => ({
  getUserByEmail: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

import { requirePlatformOwner } from "@/server/auth/platform-owner";
import {
  grantTesterEntitlement,
  listActiveTesterEntitlements,
} from "@/server/repositories/entitlements";
import { getWorkspaceForUser } from "@/server/repositories/workspace";
import { getUserByEmail } from "@/server/repositories/user";

const mockRequirePlatformOwner = vi.mocked(requirePlatformOwner);
const mockListActiveTesterEntitlements = vi.mocked(listActiveTesterEntitlements);
const mockGrantTesterEntitlement = vi.mocked(grantTesterEntitlement);
const mockGetWorkspaceForUser = vi.mocked(getWorkspaceForUser);
const mockGetUserByEmail = vi.mocked(getUserByEmail);

describe("admin testers routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePlatformOwner.mockResolvedValue({
      user: { id: "owner-1", email: "owner@example.com" },
    });
  });

  it("returns empty tester list", async () => {
    mockListActiveTesterEntitlements.mockResolvedValue([]);

    const res = await GET(new Request("http://localhost/api/admin/testers"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.testers).toEqual([]);
  });

  it("grants tester access by email", async () => {
    mockGetUserByEmail.mockResolvedValue({
      id: "user-1",
      email: "tester@example.com",
      name: "Tester",
    });
    mockGetWorkspaceForUser.mockResolvedValue({
      id: "workspace-1",
      name: "Tester Workspace",
      slug: "tester-workspace",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockGrantTesterEntitlement.mockResolvedValue({
      id: "ent-1",
      workspaceId: "workspace-1",
      kind: "tester",
      status: "active",
      sourceCode: null,
      redeemedByUserId: null,
      metadata: { notes: "QA" },
      startsAt: new Date(),
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await POST(
      new Request("http://localhost/api/admin/testers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "tester@example.com",
          notes: "QA",
        }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockGrantTesterEntitlement).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        grantedByUserId: "owner-1",
        notes: "QA",
      })
    );
    expect(body.tester.ownerEmail).toBe("tester@example.com");
  });
});
