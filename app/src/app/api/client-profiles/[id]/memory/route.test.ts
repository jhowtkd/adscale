import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: vi.fn(),
}));

vi.mock("@/server/memory/brand-memory-context", () => ({
  getBrandMemoryContext: vi.fn(),
}));

vi.mock("@/server/memory/zep-client", () => ({
  isBrandMemoryEnabled: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { getClientProfile } from "@/server/repositories/client-reference";
import { getBrandMemoryContext } from "@/server/memory/brand-memory-context";
import { isBrandMemoryEnabled } from "@/server/memory/zep-client";

const mockGetClientProfile = vi.mocked(getClientProfile);
const mockGetBrandMemoryContext = vi.mocked(getBrandMemoryContext);
const mockIsBrandMemoryEnabled = vi.mocked(isBrandMemoryEnabled);

function paramsWith(id: string) {
  return Promise.resolve({ id });
}

describe("GET /api/client-profiles/[id]/memory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClientProfile.mockResolvedValue({
      id: "profile-id",
      workspaceId: "workspace-1",
      name: "Acme",
    } as Awaited<ReturnType<typeof getClientProfile>>);
    mockIsBrandMemoryEnabled.mockReturnValue(true);
    mockGetBrandMemoryContext.mockResolvedValue({
      block: "BRAND MEMORY / LEARNED CONTEXT",
      items: [{ text: "Acme favors direct CTAs.", source: "fact" }],
    });
  });

  it("returns normalized memory for the selected profile", async () => {
    const res = await GET(
      new Request("http://localhost/api/client-profiles/profile-id/memory"),
      { params: paramsWith("profile-id") }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.enabled).toBe(true);
    expect(body.items).toEqual([{ text: "Acme favors direct CTAs.", source: "fact" }]);
    expect(mockGetBrandMemoryContext).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        clientProfileName: "Acme",
      })
    );
  });

  it("returns an empty disabled payload when Zep is off", async () => {
    mockIsBrandMemoryEnabled.mockReturnValue(false);

    const res = await GET(
      new Request("http://localhost/api/client-profiles/profile-id/memory"),
      { params: paramsWith("profile-id") }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ enabled: false, items: [] });
    expect(mockGetBrandMemoryContext).not.toHaveBeenCalled();
  });

  it("rejects profiles outside the workspace", async () => {
    mockGetClientProfile.mockResolvedValueOnce(null);

    const res = await GET(
      new Request("http://localhost/api/client-profiles/profile-id/memory"),
      { params: paramsWith("profile-id") }
    );

    expect(res.status).toBe(404);
  });
});
