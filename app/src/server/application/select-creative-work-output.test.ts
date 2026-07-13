import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: vi.fn(),
  selectCreativeWorkOutput: vi.fn(),
}));

vi.mock("@/server/application/ensure-creative-work-output-library", () => ({
  ensureCreativeWorkOutputInLibrary: vi.fn(),
}));

import {
  getCreativeWork,
  selectCreativeWorkOutput,
} from "@/server/repositories/creative-work";
import { ensureCreativeWorkOutputInLibrary } from "@/server/application/ensure-creative-work-output-library";
import { selectCreativeWorkOutputCommand } from "./select-creative-work-output";

const mockGet = vi.mocked(getCreativeWork);
const mockSelect = vi.mocked(selectCreativeWorkOutput);
const mockEnsure = vi.mocked(ensureCreativeWorkOutputInLibrary);

const workItem = {
  id: "work-1",
  workspaceId: "ws-1",
  brief: { theme: "Tema do Post", objective: "O", audience: "A", offer: "Of" },
};

const completedOutput = {
  id: "output-1",
  workspaceId: "ws-1",
  workItemId: "work-1",
  creativeLevel: "balanced",
  status: "completed",
  outputKey: "creative-work/output-1/out.png",
  isSelected: false,
};

describe("selectCreativeWorkOutputCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockResolvedValue({
      ...completedOutput,
      isSelected: true,
    } as never);
    mockEnsure.mockResolvedValue({
      asset: { id: "asset-1" } as never,
      created: true,
    });
  });

  it("selects completed output and ensures library by default", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [completedOutput],
    } as never);

    const result = await selectCreativeWorkOutputCommand({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.output.isSelected).toBe(true);
    expect(mockSelect).toHaveBeenCalledWith("ws-1", "work-1", "output-1");
    expect(mockEnsure).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      outputKey: completedOutput.outputKey,
      theme: "Tema do Post",
      creativeLevel: "balanced",
    });
  });

  it("skips library ensure when saveToLibrary=false", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [completedOutput],
    } as never);

    const result = await selectCreativeWorkOutputCommand({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
      saveToLibrary: false,
    });

    expect(result.ok).toBe(true);
    expect(mockEnsure).not.toHaveBeenCalled();
  });

  it("rejects missing work", async () => {
    mockGet.mockResolvedValue(null);
    const result = await selectCreativeWorkOutputCommand({
      workspaceId: "ws-1",
      workItemId: "missing",
      outputId: "output-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("work_not_found");
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("rejects missing output", async () => {
    mockGet.mockResolvedValue({ work: workItem, outputs: [] } as never);
    const result = await selectCreativeWorkOutputCommand({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("output_not_found");
  });

  it("rejects non-completed output", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [{ ...completedOutput, status: "processing" }],
    } as never);
    const result = await selectCreativeWorkOutputCommand({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("output_not_selectable");
      if (result.error.code === "output_not_selectable") {
        expect(result.error.status).toBe("processing");
      }
    }
    expect(mockSelect).not.toHaveBeenCalled();
  });
});
