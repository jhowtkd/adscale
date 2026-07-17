import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

const retryMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/application/retry-creative-work-output", () => ({
  retryCreativeWorkOutput: (...args: unknown[]) => retryMock(...args),
}));

function makeParams(id: string, outputId: string) {
  return Promise.resolve({ id, outputId });
}

const queuedOutput = {
  id: "output-1",
  workspaceId: "workspace-1",
  workItemId: "work-1",
  creativeLevel: "balanced",
  status: "queued",
  failureCode: null,
  isSelected: false,
};

describe("POST /api/creative-work/[id]/outputs/[outputId]/retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    retryMock.mockResolvedValue({
      ok: true,
      value: { output: queuedOutput },
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200 with requeued output from the command", async () => {
    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/retry", {
        method: "POST",
      }),
      { params: makeParams("work-1", "output-1") }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.output.status).toBe("queued");
    expect(retryMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      outputId: "output-1",
    });
  });

  it("maps work_not_found to 404", async () => {
    retryMock.mockResolvedValue({
      ok: false,
      error: { code: "work_not_found" },
    });

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/retry", {
        method: "POST",
      }),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(404);
  });

  it("maps output_not_found to 404", async () => {
    retryMock.mockResolvedValue({
      ok: false,
      error: { code: "output_not_found" },
    });

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/retry", {
        method: "POST",
      }),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(404);
  });

  it("maps output_not_retriable to 409", async () => {
    retryMock.mockResolvedValue({
      ok: false,
      error: { code: "output_not_retriable", status: "queued" },
    });

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/retry", {
        method: "POST",
      }),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(409);
  });

  it("keeps a failed revision out of the generic free retry API", async () => {
    retryMock.mockResolvedValue({
      ok: false,
      error: { code: "output_not_retriable", status: "revision_requires_paid_command" },
    });

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-v2/retry", { method: "POST" }),
      { params: makeParams("work-1", "output-v2") },
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ details: { status: "revision_requires_paid_command" } });
  });
});
