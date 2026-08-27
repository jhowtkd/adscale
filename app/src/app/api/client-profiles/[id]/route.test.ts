import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "./route";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({ workspace: { id: "workspace-1" } }),
  ),
}));

vi.mock("@/server/repositories/client-reference", () => ({
  deleteEmptyClientProfile: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { deleteEmptyClientProfile } from "@/server/repositories/client-reference";

const mockDeleteEmptyClientProfile = vi.mocked(deleteEmptyClientProfile);

describe("DELETE /api/client-profiles/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes an empty profile in the authenticated workspace", async () => {
    mockDeleteEmptyClientProfile.mockResolvedValue({ status: "deleted" });

    const response = await DELETE(
      new Request(`http://localhost/api/client-profiles/${PROFILE_ID}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: PROFILE_ID }) },
    );

    expect(response.status).toBe(204);
    expect(mockDeleteEmptyClientProfile).toHaveBeenCalledWith("workspace-1", PROFILE_ID);
  });

  it("blocks deletion while the profile owns work or brand assets", async () => {
    mockDeleteEmptyClientProfile.mockResolvedValue({ status: "in_use" });

    const response = await DELETE(
      new Request(`http://localhost/api/client-profiles/${PROFILE_ID}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: PROFILE_ID }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "clientProfileInUse" });
  });
});
