import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

const selectMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/application/select-creative-work-output", () => ({
  selectCreativeWorkOutputCommand: (...args: unknown[]) => selectMock(...args),
}));

function makeParams(id: string, outputId: string) {
  return Promise.resolve({ id, outputId });
}

const selectedOutput = {
  id: "output-1",
  workspaceId: "workspace-1",
  workItemId: "work-1",
  creativeLevel: "balanced",
  status: "completed",
  outputKey: "creative-work/output-1/out.png",
  isSelected: true,
};

describe("POST /api/creative-work/[id]/outputs/[outputId]/select", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectMock.mockResolvedValue({
      ok: true,
      value: { output: selectedOutput },
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls command with default saveToLibrary and returns output", async () => {
    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: makeParams("work-1", "output-1") }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.output.isSelected).toBe(true);
    expect(selectMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      outputId: "output-1",
      saveToLibrary: true,
      confirmObjective: false,
      saveAsRecipe: false,
    });
  });

  it("passes saveToLibrary=false to the command", async () => {
    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saveToLibrary: false }),
      }),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(200);
    expect(selectMock).toHaveBeenCalledWith(
      expect.objectContaining({ saveToLibrary: false })
    );
  });

  it("passes explicit objective confirmation to the command", async () => {
    await POST(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmObjective: true }),
      }),
      { params: makeParams("work-1", "output-1") }
    );

    expect(selectMock).toHaveBeenCalledWith(
      expect.objectContaining({ confirmObjective: true })
    );
  });

  it("maps work_not_found to 404", async () => {
    selectMock.mockResolvedValue({
      ok: false,
      error: { code: "work_not_found" },
    });

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(404);
  });

  it("maps output_not_found to 404", async () => {
    selectMock.mockResolvedValue({
      ok: false,
      error: { code: "output_not_found" },
    });

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(404);
  });

  it("maps output_not_selectable to 409", async () => {
    selectMock.mockResolvedValue({
      ok: false,
      error: { code: "output_not_selectable", status: "processing" },
    });

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(409);
  });

  it.each([
    ["objective_selection_blocked", { rationale: "objective_legacy_fail", nextStep: "generate_again" }],
    ["objective_confirmation_required", { rationale: "objective_inconclusive", nextStep: "review_then_confirm" }],
  ])("returns the domain policy for %s", async (code, policy) => {
    selectMock.mockResolvedValue({ ok: false, error: { code, policy } });

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual(expect.objectContaining({ details: policy }));
  });

  it("returns 400 when the body is invalid", async () => {
    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saveToLibrary: "yes" }),
      }),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(400);
    expect(selectMock).not.toHaveBeenCalled();
  });
});
