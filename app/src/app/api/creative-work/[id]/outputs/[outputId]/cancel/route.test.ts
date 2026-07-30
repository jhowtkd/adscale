import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

const cancelMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() => Promise.resolve({
    user: { id: "user-1" },
    workspace: { id: "workspace-1" },
  })),
}));

vi.mock("@/server/application/cancel-creative-work-output", () => ({
  cancelCreativeWorkOutput: (...args: unknown[]) => cancelMock(...args),
}));

describe("POST /api/creative-work/[id]/outputs/[outputId]/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cancelMock.mockResolvedValue({
      ok: true,
      value: { output: { id: "output-1", status: "failed" }, refunded: true },
    });
  });

  it("returns the cancellation terminal result", async () => {
    const response = await POST(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/cancel", { method: "POST" }),
      { params: Promise.resolve({ id: "work-1", outputId: "output-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ canceled: true, refunded: true });
    expect(cancelMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      outputId: "output-1",
      userId: "user-1",
    });
  });

  it("maps a lost cancellation race to conflict", async () => {
    cancelMock.mockResolvedValue({
      ok: false,
      error: { code: "output_not_cancellable", status: "completed" },
    });

    const response = await POST(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/cancel", { method: "POST" }),
      { params: Promise.resolve({ id: "work-1", outputId: "output-1" }) },
    );

    expect(response.status).toBe(409);
  });
});
