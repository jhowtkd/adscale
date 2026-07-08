import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(),
}));

vi.mock("@/server/progression/service", () => ({
  getWorkspaceProgression: vi.fn(),
}));

import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getWorkspaceProgression } from "@/server/progression/service";
import { GET } from "./route";

const mockRequireWorkspaceAccess = vi.mocked(requireWorkspaceAccess);
const mockGetWorkspaceProgression = vi.mocked(getWorkspaceProgression);

describe("workspace progression route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireWorkspaceAccess.mockResolvedValue({
      workspace: { id: "workspace-1", name: "Lab", slug: "lab" },
      user: { id: "user-1", email: "test@example.com", name: "Test" },
    } as Awaited<ReturnType<typeof requireWorkspaceAccess>>);
  });

  it("returns workspace progression payload", async () => {
    mockGetWorkspaceProgression.mockResolvedValue({
      level: {
        key: "aprendiz",
        label: "Aprendiz de Laboratorio",
        shortLabel: "Aprendiz",
        description: "Monte seu laboratorio.",
      },
      progressPercent: 14,
      completed: [],
      nextAction: {
        key: "campaign_created",
        label: "Primeira campanha",
        description: "Crie sua primeira campanha.",
        href: "/campaigns?new=1",
        blocked: false,
      },
      lastCalculatedAt: "2026-06-06T00:00:00.000Z",
    });

    const response = await GET(new Request("http://localhost/api/workspace/progression"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.level.key).toBe("aprendiz");
    expect(mockGetWorkspaceProgression).toHaveBeenCalledWith("workspace-1");
  });
});
