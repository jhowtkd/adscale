import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LayerEditorStateV1 } from "@/server/layer-editor/contracts";

const access = vi.hoisted(() => vi.fn());
const output = vi.hoisted(() => vi.fn());
const holderName = vi.hoisted(() => vi.fn());

vi.mock("@/server/layer-editor/quota", () => ({ getLayerEditorAccess: access }));
vi.mock("@/server/repositories/creative-work-layer-editor", () => ({
  getCreativeWorkLayerEditorOutput: output,
  getCreativeWorkLayerEditorLeaseHolderName: holderName,
  acquireCreativeWorkLayerEditorLease: vi.fn(),
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
});
