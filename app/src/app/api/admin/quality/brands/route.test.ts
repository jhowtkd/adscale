import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/server/auth/platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { db } from "@/server/db";
import { WorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/errors";

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";
const CLIENT_PROFILE_ID = "550e8400-e29b-41d4-a716-446655440003";

const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockDbSelect = vi.mocked(db.select);

function mockBrandList(
  brands: Array<{
    id: string;
    name: string;
    workspaceId: string;
    workspaceName: string;
  }>
) {
  const orderByMock = vi.fn().mockResolvedValue(brands);
  const innerJoinMock = vi.fn(() => ({ orderBy: orderByMock }));
  const fromMock = vi.fn(() => ({ innerJoin: innerJoinMock }));
  mockDbSelect.mockReturnValue({ from: fromMock } as never);
}

async function callGet() {
  return GET(new Request("http://localhost/api/admin/quality/brands"));
}

describe("GET /api/admin/quality/brands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
    });
    mockBrandList([
      {
        id: CLIENT_PROFILE_ID,
        name: "Cenbrap",
        workspaceId: WORKSPACE_ID,
        workspaceName: "Acme Workspace",
      },
    ]);
  });

  it("returns 200 with brands for platform owner", async () => {
    const res = await callGet();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.brands).toEqual([
      {
        id: CLIENT_PROFILE_ID,
        name: "Cenbrap",
        workspaceId: WORKSPACE_ID,
        workspaceName: "Acme Workspace",
      },
    ]);
  });

  it("returns 403 when not platform owner", async () => {
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );

    const res = await callGet();

    expect(res.status).toBe(403);
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("returns empty brands array when no profiles exist", async () => {
    mockBrandList([]);

    const res = await callGet();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.brands).toEqual([]);
  });
});
