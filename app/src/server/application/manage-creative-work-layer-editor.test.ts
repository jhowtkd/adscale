import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LayerEditorStateV1 } from "@/server/layer-editor/contracts";

const access = vi.hoisted(() => vi.fn());
const output = vi.hoisted(() => vi.fn());
const holderName = vi.hoisted(() => vi.fn());
const acquire = vi.hoisted(() => vi.fn());

vi.mock("@/server/layer-editor/quota", () => ({ getLayerEditorAccess: access }));
vi.mock("@/server/repositories/creative-work-layer-editor", () => ({
  getCreativeWorkLayerEditorOutput: output,
  getCreativeWorkLayerEditorLeaseHolderName: holderName,
  acquireCreativeWorkLayerEditorLease: acquire,
  heartbeatCreativeWorkLayerEditorLease: vi.fn(),
  initializeCreativeWorkLayerEditor: vi.fn(),
  layerizationFromOutput: vi.fn(),
  releaseCreativeWorkLayerEditorLease: vi.fn(),
  saveCreativeWorkLayerEditorSnapshot: vi.fn(),
  seedLayerEditorState: vi.fn(),
}));
vi.mock("@/server/storage", () => ({ objectStorage: { signedDownloadUrl: vi.fn(async (key: string) => `signed:${key}`) } }));

import { openCreativeWorkLayerEditor } from "./manage-creative-work-layer-editor";

const state: LayerEditorStateV1 = {
  schemaVersion: 1, revision: 1, sourceLayerizationAttemptId: "attempt", canvas: { width: 20, height: 20 },
  layers: ["00000000-0000-4000-8000-000000000011", "00000000-0000-4000-8000-000000000012"].map((id, order) => ({
    id, source: { order, name: `Layer ${order}`, visible: true, x: 0, y: 0, width: 20, height: 20, key: `source-${order}` },
    order, name: `Layer ${order}`, visible: true, x: 0, y: 0, width: 20, height: 20, currentKey: `source-${order}`, currentKind: "source" as const, restorableKey: null,
  })),
  lease: { id: "00000000-0000-4000-8000-000000000013", userId: "holder-user", acquiredAt: "2026-08-22T00:00:00.000Z", expiresAt: "2099-08-22T00:01:30.000Z" },
  regeneration: null, publishedPsdKey: null, updatedAt: "2026-08-22T00:00:00.000Z",
};

describe("openCreativeWorkLayerEditor lease holder projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    access.mockResolvedValue({ enabled: true, period: null, layerize: null, regeneration: null });
    output.mockResolvedValue({ layerEditor: state, status: "completed", isSelected: true });
  });

  it("projects the workspace-scoped holder name, never the calling member name", async () => {
    holderName.mockResolvedValue("Holder A");
    const result = await openCreativeWorkLayerEditor({ workspaceId: "workspace-a", workItemId: "work", outputId: "output", userId: "viewer", userName: "Viewer B", mode: "inspect" });

    expect(result).toMatchObject({ ok: true, document: { lease: { mode: "read", heldByName: "Holder A" } } });
    expect(holderName).toHaveBeenCalledWith("workspace-a", "holder-user");
    expect(JSON.stringify(result)).not.toContain("viewer");
  });

  it("does not expose a holder from another workspace", async () => {
    holderName.mockResolvedValue(null);
    const result = await openCreativeWorkLayerEditor({ workspaceId: "workspace-b", workItemId: "work", outputId: "output", userId: "viewer", userName: "Viewer B", mode: "inspect" });

    expect(result).toMatchObject({ ok: true, document: { lease: { heldByName: null } } });
    expect(holderName).toHaveBeenCalledWith("workspace-b", "holder-user");
  });

  it("refreshes an expired same-user lease atomically before granting edit", async () => {
    const expired = { ...state, lease: { ...state.lease!, userId: "viewer", expiresAt: "2026-08-21T00:00:00.000Z" } };
    const refreshed = { ...expired, lease: { ...expired.lease!, id: "00000000-0000-4000-8000-000000000014", expiresAt: "2099-08-22T00:01:30.000Z" } };
    output.mockResolvedValue({ layerEditor: expired, status: "completed", isSelected: true });
    acquire.mockResolvedValue({ layerEditor: refreshed });

    const result = await openCreativeWorkLayerEditor({ workspaceId: "workspace-a", workItemId: "work", outputId: "output", userId: "viewer", userName: "Viewer", mode: "edit" });
    expect(result).toMatchObject({ ok: true, document: { lease: { mode: "edit", leaseId: refreshed.lease!.id } } });
    expect(acquire).toHaveBeenCalledOnce();
  });

  it("preserves an unexpired same-user lease across edit opens", async () => {
    const live = { ...state, lease: { ...state.lease!, userId: "viewer", expiresAt: "2099-08-22T00:01:30.000Z" } };
    output.mockResolvedValue({ layerEditor: live, status: "completed", isSelected: true });

    const result = await openCreativeWorkLayerEditor({ workspaceId: "workspace-a", workItemId: "work", outputId: "output", userId: "viewer", userName: "Viewer", mode: "edit" });

    expect(result).toMatchObject({ ok: true, document: { lease: { mode: "edit", leaseId: live.lease!.id } } });
    expect(acquire).not.toHaveBeenCalled();
  });

  it("denies deselected output even when the caller previously held its lease", async () => {
    output.mockResolvedValue({ layerEditor: { ...state, lease: { ...state.lease!, userId: "viewer", expiresAt: "2099-08-22T00:01:30.000Z" } }, status: "completed", isSelected: false });
    await expect(openCreativeWorkLayerEditor({ workspaceId: "workspace-a", workItemId: "work", outputId: "output", userId: "viewer", userName: "Viewer", mode: "edit" })).resolves.toMatchObject({ ok: false, status: 409 });
    expect(acquire).not.toHaveBeenCalled();
  });

  it("keeps an owner inspect request read-only without a lease id", async () => {
    output.mockResolvedValue({ layerEditor: { ...state, lease: { ...state.lease!, userId: "viewer", expiresAt: "2099-08-22T00:01:30.000Z" } }, status: "completed", isSelected: true });
    const result = await openCreativeWorkLayerEditor({ workspaceId: "workspace-a", workItemId: "work", outputId: "output", userId: "viewer", userName: "Viewer", mode: "inspect" });
    expect(result).toMatchObject({ ok: true, document: { lease: { mode: "read", leaseId: null } } });
  });
});
