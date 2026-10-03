// The reading job keeps a logo's plate with its asset (ticket 16, review of PR 618): the importer is given a way to merge `metadata` into an asset, and it is the repository's.
import { describe, expect, it, vi } from "vitest";

const created = vi.hoisted(() => ({ site: [] as unknown[], instagram: [] as unknown[] }));
const updateWorkspaceAsset = vi.hoisted(() => vi.fn(async () => ({ id: "asset-1" })));

vi.mock("@/server/jobs/client", () => ({ inngest: { createFunction: vi.fn(() => ({})), send: vi.fn() } }));
vi.mock("./shared", () => ({ createProdJobDeps: vi.fn(() => ({})), moduleDepsFor: vi.fn(() => ({})) }));
vi.mock("../handoff/read", () => ({ createHandoffReadHandler: vi.fn(), claimHandoffProviderAttempt: vi.fn(), loadHandoffInstagramRun: vi.fn(), recordHandoffInstagramRun: vi.fn() }));
vi.mock("../handoff/readers", () => ({ createHandoffReaders: vi.fn() }));
vi.mock("../handoff/instagram-cost", () => ({ createInstagramCostHandler: vi.fn() }));
vi.mock("../handoff/site-enrichment", () => ({ createSiteEnrichment: vi.fn((options: unknown) => { created.site.push(options); return {}; }) }));
vi.mock("../handoff/instagram-enrichment", () => ({ createInstagramEnrichment: vi.fn((options: unknown) => { created.instagram.push(options); return {}; }) }));
vi.mock("../handoff/site-vision", () => ({ createSiteVision: vi.fn(), createInstagramVision: vi.fn() }));
vi.mock("../agents/budgeted-client", () => ({ createBudgetedModelClient: vi.fn() }));
vi.mock("../agents/anthropic-client", () => ({ AnthropicEquipeModelClient: vi.fn() }));
vi.mock("../agents/ledger", () => ({ DrizzleLedgerStore: vi.fn(), estimateCostUsdCents: vi.fn() }));
vi.mock("../agents/roles", () => ({ resolveStrategistModel: vi.fn() }));
vi.mock("@/server/storage", () => ({ objectStorage: { name: "r2" } }));
vi.mock("@/server/validation/env", () => ({ env: {} }));
vi.mock("@/server/repositories/workspace-asset", () => ({ createWorkspaceAssetIfKeyAbsent: vi.fn(), getWorkspaceAssetByKey: vi.fn(), updateWorkspaceAsset }));

type Options = { updateAssetMetadata?: (assetId: string, workspaceId: string, metadata: Record<string, unknown>) => Promise<unknown>; saveAsset: unknown; findAsset: unknown };

describe("handoff-read: the image options of the site and Instagram readers", () => {
  it("both get a way to update an asset's metadata, and it calls the repository with { metadata } (merged there)", async () => {
    await import("./handoff-read");
    expect(created.site).toHaveLength(1);
    expect(created.instagram).toHaveLength(1);
    for (const options of [created.site[0], created.instagram[0]] as Options[]) {
      expect(typeof options.updateAssetMetadata).toBe("function");
      updateWorkspaceAsset.mockClear();
      await options.updateAssetMetadata!("asset-9", "ws-9", { surface: "dark" });
      expect(updateWorkspaceAsset).toHaveBeenCalledTimes(1);
      expect(updateWorkspaceAsset).toHaveBeenCalledWith("asset-9", "ws-9", { metadata: { surface: "dark" } });
    }
  });
  it("the same repository functions as before keep storing and finding the assets", async () => {
    const repo = await import("@/server/repositories/workspace-asset");
    for (const options of [created.site[0], created.instagram[0]] as Options[]) {
      expect(options.saveAsset).toBe(repo.createWorkspaceAssetIfKeyAbsent);
      expect(options.findAsset).toBe(repo.getWorkspaceAssetByKey);
    }
  });
});
