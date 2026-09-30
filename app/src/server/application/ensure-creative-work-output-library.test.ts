import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/workspace-asset", () => ({
  getWorkspaceAssetByKey: vi.fn(),
  createWorkspaceAsset: vi.fn(),
  createWorkspaceAssetIfKeyAbsent: vi.fn(),
  assignWorkspaceAssetBrand: vi.fn(),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    head: vi.fn(),
  },
}));

import {
  createWorkspaceAssetIfKeyAbsent,
  getWorkspaceAssetByKey,
  assignWorkspaceAssetBrand,
} from "@/server/repositories/workspace-asset";
import { objectStorage } from "@/server/storage";
import { ensureCreativeWorkOutputInLibrary } from "./ensure-creative-work-output-library";

const mockGetByKey = vi.mocked(getWorkspaceAssetByKey);
const mockCreateIfAbsent = vi.mocked(createWorkspaceAssetIfKeyAbsent);
const mockAssignBrand = vi.mocked(assignWorkspaceAssetBrand);
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
    mockCreateIfAbsent.mockResolvedValue({
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
    expect(result.asset?.id).toBe("asset-1");
    expect(result).not.toHaveProperty("conflict");
    expect(mockCreateIfAbsent).toHaveBeenCalledWith({
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
    expect(mockCreateIfAbsent).not.toHaveBeenCalled();
    expect(mockHead).not.toHaveBeenCalled();
  });

  it("uses size 0 when storage head is missing", async () => {
    mockGetByKey.mockResolvedValue(null);
    mockHead.mockResolvedValue(null);

    await ensureCreativeWorkOutputInLibrary(baseInput);

    expect(mockCreateIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({ size: 0 })
    );
  });

  it("returns the winner without error when losing the insert race in the same workspace", async () => {
    const winner = {
      id: "asset-winner",
      key: baseInput.outputKey,
      workspaceId: "ws-1",
      source: "creative_work",
    };
    mockGetByKey.mockResolvedValueOnce(null).mockResolvedValueOnce(winner as never);
    mockCreateIfAbsent.mockResolvedValue(null);

    const result = await ensureCreativeWorkOutputInLibrary(baseInput);

    expect(result.created).toBe(false);
    expect(result.asset).toEqual(winner);
    expect(result).not.toHaveProperty("conflict");
    expect(mockGetByKey).toHaveBeenCalledTimes(2);
  });

  it("reports key_owned_elsewhere instead of returning another workspace asset", async () => {
    mockGetByKey.mockResolvedValue(null);
    mockCreateIfAbsent.mockResolvedValue(null);

    const result = await ensureCreativeWorkOutputInLibrary(baseInput);

    expect(result).toEqual({ asset: null, created: false, conflict: "key_owned_elsewhere" });
  });

  it("ticket 07: forwards the creative work's clientProfileId as the asset's brand", async () => {
    mockGetByKey.mockResolvedValue(null);

    await ensureCreativeWorkOutputInLibrary({ ...baseInput, clientProfileId: "profile-1" });

    expect(mockCreateIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({ clientProfileId: "profile-1" }),
    );
  });
});

// Independent review (PR 610, R2): incoming brand must also govern existing-key paths.
describe("review (PR 610, R2): backfilling legacy existing-key paths", () => {
  beforeEach(() => vi.clearAllMocks());

  it("backfills a legacy existing output when its work supplies the brand", async () => {
    const legacy = { id: "old-output", workspaceId: "ws-1", key: baseInput.outputKey, clientProfileId: null, source: "creative_work" };
    mockGetByKey.mockResolvedValue(legacy as never);
    mockAssignBrand.mockResolvedValue({ ...legacy, clientProfileId: "brand-B" } as never);

    const result = await ensureCreativeWorkOutputInLibrary({ ...baseInput, clientProfileId: "brand-B" });

    expect(mockAssignBrand).toHaveBeenCalledWith("old-output", "ws-1", "brand-B");
    expect(result.asset?.clientProfileId).toBe("brand-B");
  });

  it("also backfills the winner of a lost insert race when it was legacy-NULL and the caller knows the brand", async () => {
    const winner = { id: "winner", workspaceId: "ws-1", key: baseInput.outputKey, clientProfileId: null, source: "creative_work" };
    mockGetByKey.mockResolvedValueOnce(null).mockResolvedValueOnce(winner as never);
    mockCreateIfAbsent.mockResolvedValue(null);
    mockAssignBrand.mockResolvedValue({ ...winner, clientProfileId: "brand-B" } as never);

    const result = await ensureCreativeWorkOutputInLibrary({ ...baseInput, clientProfileId: "brand-B" });

    expect(mockAssignBrand).toHaveBeenCalledWith("winner", "ws-1", "brand-B");
    expect(result.asset?.clientProfileId).toBe("brand-B");
  });

  it("never touches an existing asset that already has its OWN brand, even when a different clientProfileId is supplied", async () => {
    const owned = { id: "owned", workspaceId: "ws-1", key: baseInput.outputKey, clientProfileId: "brand-A", source: "creative_work" };
    mockGetByKey.mockResolvedValue(owned as never);

    const result = await ensureCreativeWorkOutputInLibrary({ ...baseInput, clientProfileId: "brand-B" });

    expect(mockAssignBrand).not.toHaveBeenCalled();
    expect(result.asset?.clientProfileId).toBe("brand-A");
  });

  it("a concurrent backfill/claim on the same legacy row (assignWorkspaceAssetBrand loses) re-reads the current owner instead of trusting a stale NULL", async () => {
    const legacy = { id: "old-output", workspaceId: "ws-1", key: baseInput.outputKey, clientProfileId: null, source: "creative_work" };
    mockGetByKey.mockResolvedValueOnce(legacy as never).mockResolvedValueOnce({ ...legacy, clientProfileId: "brand-C" } as never);
    mockAssignBrand.mockResolvedValue(null);

    const result = await ensureCreativeWorkOutputInLibrary({ ...baseInput, clientProfileId: "brand-B" });

    expect(result.asset?.clientProfileId).toBe("brand-C");
  });
});
