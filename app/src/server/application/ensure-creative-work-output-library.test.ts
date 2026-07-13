import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/workspace-asset", () => ({
  getWorkspaceAssetByKey: vi.fn(),
  createWorkspaceAsset: vi.fn(),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    head: vi.fn(),
  },
}));

import {
  createWorkspaceAsset,
  getWorkspaceAssetByKey,
} from "@/server/repositories/workspace-asset";
import { objectStorage } from "@/server/storage";
import { ensureCreativeWorkOutputInLibrary } from "./ensure-creative-work-output-library";

const mockGetByKey = vi.mocked(getWorkspaceAssetByKey);
const mockCreate = vi.mocked(createWorkspaceAsset);
const mockHead = vi.mocked(objectStorage.head);

const baseInput = {
  workspaceId: "ws-1",
  outputKey: "creative-work/output-1/1700000000000.png",
  theme: "Tema do Post",
  creativeLevel: "balanced",
};

describe("ensureCreativeWorkOutputInLibrary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHead.mockResolvedValue({ contentLength: 12345, contentType: "image/png" });
    mockCreate.mockResolvedValue({
      id: "asset-1",
      key: baseInput.outputKey,
      workspaceId: "ws-1",
      source: "creative_work",
    } as never);
  });

  it("creates a creative_work library asset when key is absent", async () => {
    mockGetByKey.mockResolvedValue(null);

    const result = await ensureCreativeWorkOutputInLibrary(baseInput);

    expect(result.created).toBe(true);
    expect(result.asset.id).toBe("asset-1");
    expect(mockCreate).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      name: "Post Tema do Post - balanced",
      key: baseInput.outputKey,
      type: "image/png",
      size: 12345,
      source: "creative_work",
    });
  });

  it("is idempotent: second call reuses existing asset without create", async () => {
    const existing = {
      id: "asset-existing",
      key: baseInput.outputKey,
      workspaceId: "ws-1",
      source: "creative_work",
    };
    mockGetByKey.mockResolvedValue(existing as never);

    const first = await ensureCreativeWorkOutputInLibrary(baseInput);
    const second = await ensureCreativeWorkOutputInLibrary(baseInput);

    expect(first.created).toBe(false);
    expect(second.created).toBe(false);
    expect(first.asset).toEqual(existing);
    expect(second.asset).toEqual(existing);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockHead).not.toHaveBeenCalled();
  });

  it("uses size 0 when storage head is missing", async () => {
    mockGetByKey.mockResolvedValue(null);
    mockHead.mockResolvedValue(null);

    await ensureCreativeWorkOutputInLibrary(baseInput);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ size: 0 })
    );
  });
});
