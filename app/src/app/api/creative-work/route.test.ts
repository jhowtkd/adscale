import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

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

vi.mock("@/server/repositories/creative-work", () => ({
  createCreativeWork: vi.fn(),
}));

import { getClientProfile } from "@/server/repositories/client-reference";
import { createCreativeWork } from "@/server/repositories/creative-work";

const mockGetClientProfile = vi.mocked(getClientProfile);
const mockCreateCreativeWork = vi.mocked(createCreativeWork);

const profileId = "00000000-0000-4000-8000-000000000001";

const validBody = {
  clientProfileId: profileId,
  toolKind: "social_post" as const,
  format: "4:5" as const,
  brief: {
    theme: "Novo produto",
    objective: "Gerar interesse",
    audience: "Empreendedores",
    offer: "Teste gratuito",
  },
};

describe("POST /api/creative-work", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 201 with the created work item scoped to the authenticated user", async () => {
    mockGetClientProfile.mockResolvedValue({
      id: profileId,
      workspaceId: "workspace-1",
    } as Awaited<ReturnType<typeof getClientProfile>>);
    mockCreateCreativeWork.mockResolvedValue({
      id: "work-1",
      workspaceId: "workspace-1",
      clientProfileId: profileId,
      createdByUserId: "user-1",
      toolKind: "social_post",
      status: "draft",
      brief: validBody.brief,
      format: "4:5",
      copy: null,
      identitySnapshot: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await POST(
      new Request("http://localhost/api/creative-work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.work.id).toBe("work-1");
    expect(mockGetClientProfile).toHaveBeenCalledWith("workspace-1", profileId);
    expect(mockCreateCreativeWork).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      clientProfileId: profileId,
      createdByUserId: "user-1",
      toolKind: "social_post",
      brief: validBody.brief,
      format: "4:5",
    });
  });

  it("returns 404 when the profile does not belong to the workspace", async () => {
    mockGetClientProfile.mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/api/creative-work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      })
    );

    expect(res.status).toBe(404);
    expect(mockCreateCreativeWork).not.toHaveBeenCalled();
  });

  it("returns 400 when the brief is invalid", async () => {
    const res = await POST(
      new Request("http://localhost/api/creative-work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...validBody, brief: { theme: "" } }),
      })
    );

    expect(res.status).toBe(400);
    expect(mockCreateCreativeWork).not.toHaveBeenCalled();
  });

  it("returns 400 when the format is unsupported", async () => {
    const res = await POST(
      new Request("http://localhost/api/creative-work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...validBody, format: "16:9" }),
      })
    );

    expect(res.status).toBe(400);
    expect(mockCreateCreativeWork).not.toHaveBeenCalled();
  });
});