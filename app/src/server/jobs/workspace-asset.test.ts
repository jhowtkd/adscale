import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateChatCompletion = vi.hoisted(() => vi.fn());
const mockGetObject = vi.hoisted(() => vi.fn());
const mockGetWorkspaceAssetById = vi.hoisted(() => vi.fn());
const mockUpdateWorkspaceAsset = vi.hoisted(() => vi.fn());
const mockIsFreeAssetWorkspace = vi.hoisted(() => vi.fn());

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreateChatCompletion } };
  },
}));

vi.mock("@/server/storage", () => ({
  objectStorage: { get: (...args: unknown[]) => mockGetObject(...args) },
}));

vi.mock("@/server/ai/normalize-image-for-ai", () => ({
  normalizeImageForAi: async ({ buffer }: { buffer: Buffer }) => ({
    buffer, mimeType: "image/png", width: 512, height: 512,
    originalBytes: buffer.byteLength, finalBytes: buffer.byteLength, hasTransparency: false,
  }),
}));

vi.mock("@/server/repositories/workspace-asset", () => ({
  getWorkspaceAssetById: (...args: unknown[]) => mockGetWorkspaceAssetById(...args),
  updateWorkspaceAsset: (...args: unknown[]) => mockUpdateWorkspaceAsset(...args),
}));

vi.mock("@/server/equipe/handoff/assets", () => ({
  isFreeAssetWorkspace: (...args: unknown[]) => mockIsFreeAssetWorkspace(...args),
}));

vi.mock("@/server/validation/env", () => ({
  env: { OPENAI_API_KEY: "test-key" },
}));

vi.mock("./client", () => ({
  inngest: {
    createFunction: vi.fn((opts: unknown, handler: unknown) => ({ opts, fn: handler })),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { workspaceAssetAnalyzeJob } from "./workspace-asset";

const baseEventData = {
  assetId: "asset-1",
  workspaceId: "workspace-1",
  key: "workspaces/workspace-1/assets/photo.png",
};

async function runAnalyzeJob(eventData: typeof baseEventData = baseEventData) {
  const event = { data: eventData };
  const step = { run: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn()) };
  return (workspaceAssetAnalyzeJob as unknown as {
    fn: (args: { event: unknown; step: unknown }) => Promise<unknown>;
  }).fn({ event, step });
}

describe("workspaceAssetAnalyzeJob (ticket 07: free-plan guard survives legacy/queued events)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWorkspaceAssetById.mockResolvedValue({ id: baseEventData.assetId, workspaceId: baseEventData.workspaceId, key: baseEventData.key });
    mockIsFreeAssetWorkspace.mockResolvedValue(false);
    mockGetObject.mockResolvedValue(Buffer.from("fake-png-bytes"));
    mockCreateChatCompletion.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        description: "Uma foto de produto", tags: ["produto", "azul"], category: "product",
        dominantColors: ["#0000ff"], hasText: false, hasFaces: false, brandSafe: true, confidence: 0.9,
      }) } }],
    });
  });

  it("free workspace: never reaches storage/OpenAI, even for an event already queued before the account turned free", async () => {
    mockIsFreeAssetWorkspace.mockResolvedValue(true);

    const result = await runAnalyzeJob();

    expect(mockGetObject).not.toHaveBeenCalled();
    expect(mockCreateChatCompletion).not.toHaveBeenCalled();
    expect(mockUpdateWorkspaceAsset).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, assetId: baseEventData.assetId, skipped: true });
  });

  it("checks the free-plan gate before touching OpenAI, not only in the upload route (defense in depth for an old event)", async () => {
    // Simulates a `workspace.asset.analyze` event sent while the workspace was
    // still paid, then dispatched only after the account dropped to free.
    mockIsFreeAssetWorkspace.mockResolvedValue(true);
    await runAnalyzeJob();
    expect(mockIsFreeAssetWorkspace).toHaveBeenCalledWith(baseEventData.workspaceId);
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it("asset no longer exists (deleted before the job ran): skips without calling OpenAI", async () => {
    mockGetWorkspaceAssetById.mockResolvedValue(null);

    const result = await runAnalyzeJob();

    expect(mockGetObject).not.toHaveBeenCalled();
    expect(mockUpdateWorkspaceAsset).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, assetId: baseEventData.assetId, skipped: true });
  });

  it("ticket 07: skips a provisional handoff asset, even on a paid workspace (the confirm step decides what survives)", async () => {
    mockGetWorkspaceAssetById.mockResolvedValue({
      id: baseEventData.assetId, workspaceId: baseEventData.workspaceId, key: baseEventData.key,
      metadata: { provisional: true, handoffId: "handoff-1" },
    });

    const result = await runAnalyzeJob();

    expect(mockGetObject).not.toHaveBeenCalled();
    expect(mockUpdateWorkspaceAsset).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, assetId: baseEventData.assetId, skipped: true });
  });

  it("stale event: the asset's key changed since the event was queued, so it skips instead of analyzing the wrong file", async () => {
    mockGetWorkspaceAssetById.mockResolvedValue({ id: baseEventData.assetId, workspaceId: baseEventData.workspaceId, key: "workspaces/workspace-1/assets/replaced.png" });

    const result = await runAnalyzeJob();

    expect(mockGetObject).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, assetId: baseEventData.assetId, skipped: true });
  });

  it("paid workspace with a matching key: analyzes and persists as before (guard does not regress the normal path)", async () => {
    const result = await runAnalyzeJob();

    expect(mockGetObject).toHaveBeenCalledWith(baseEventData.key);
    expect(mockCreateChatCompletion).toHaveBeenCalledTimes(1);
    expect(mockUpdateWorkspaceAsset).toHaveBeenCalledWith(
      baseEventData.assetId, baseEventData.workspaceId,
      expect.objectContaining({ aiDescription: "Uma foto de produto", tags: ["produto", "azul"] }),
    );
    expect(result).toMatchObject({ success: true, assetId: baseEventData.assetId, tags: ["produto", "azul"] });
  });
});
