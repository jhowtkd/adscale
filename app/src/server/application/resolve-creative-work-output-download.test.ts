import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: vi.fn(),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    signedDownloadUrl: vi.fn(),
  },
}));

import { getCreativeWork } from "@/server/repositories/creative-work";
import { objectStorage } from "@/server/storage";
import { resolveCreativeWorkOutputDownload } from "./resolve-creative-work-output-download";

const mockGet = vi.mocked(getCreativeWork);
const mockSigned = vi.mocked(objectStorage.signedDownloadUrl);

const workItem = {
  id: "work-1",
  workspaceId: "ws-1",
  brief: { theme: "Tema", objective: "O", audience: "A", offer: "Of" },
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

describe("resolveCreativeWorkOutputDownload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSigned.mockResolvedValue("https://signed.example.com/asset.png");
  });

  it("returns signed url for completed output", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [completedOutput],
    } as never);

    const result = await resolveCreativeWorkOutputDownload({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.url).toBe("https://signed.example.com/asset.png");
    expect(result.value.outputKey).toBe(completedOutput.outputKey);
    expect(mockSigned).toHaveBeenCalledWith(completedOutput.outputKey);
  });

  it("rejects missing work", async () => {
    mockGet.mockResolvedValue(null);
    const result = await resolveCreativeWorkOutputDownload({
      workspaceId: "ws-1",
      workItemId: "missing",
      outputId: "output-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("work_not_found");
    expect(mockSigned).not.toHaveBeenCalled();
  });

  it("rejects missing output", async () => {
    mockGet.mockResolvedValue({ work: workItem, outputs: [] } as never);
    const result = await resolveCreativeWorkOutputDownload({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("output_not_found");
  });

  it("rejects non-ready output", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [{ ...completedOutput, status: "failed", outputKey: null }],
    } as never);
    const result = await resolveCreativeWorkOutputDownload({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("output_not_ready");
      if (result.error.code === "output_not_ready") {
        expect(result.error.status).toBe("failed");
      }
    }
    expect(mockSigned).not.toHaveBeenCalled();
  });
});
