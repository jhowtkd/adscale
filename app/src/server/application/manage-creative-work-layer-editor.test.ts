import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LayerEditorStateV1 } from "@/server/layer-editor/contracts";

const access = vi.hoisted(() => vi.fn());
const output = vi.hoisted(() => vi.fn());
const holderName = vi.hoisted(() => vi.fn());
const acquire = vi.hoisted(() => vi.fn());
const recover = vi.hoisted(() => vi.fn());
const recoverReserved = vi.hoisted(() => vi.fn());
const releaseQuota = vi.hoisted(() => vi.fn());
const postDispatchLock = vi.hoisted(() => vi.fn(async (_input: unknown, run: (executor: unknown) => Promise<unknown>) => run({})));
const accept = vi.hoisted(() => vi.fn());
const discard = vi.hoisted(() => vi.fn());
const storageGet = vi.hoisted(() => vi.fn());
const storagePut = vi.hoisted(() => vi.fn());
const storageDelete = vi.hoisted(() => vi.fn());

vi.mock("@/server/layer-editor/quota", () => ({ getLayerEditorAccess: access, releaseLayerEditorQuota: releaseQuota, withLayerEditorPostDispatchLock: postDispatchLock }));
vi.mock("@/server/repositories/creative-work-layer-editor", () => ({
  getCreativeWorkLayerEditorOutput: output,
  getCreativeWorkLayerEditorLeaseHolderName: holderName,
  acquireCreativeWorkLayerEditorLease: acquire,
  acceptLayerRegenerationCandidate: accept,
  discardLayerRegenerationCandidate: discard,
  recoverStaleLayerRegeneration: recover,
  recoverStaleReservedLayerRegeneration: recoverReserved,
  heartbeatCreativeWorkLayerEditorLease: vi.fn(),
  initializeCreativeWorkLayerEditor: vi.fn(),
  layerizationFromOutput: vi.fn(),
  releaseCreativeWorkLayerEditorLease: vi.fn(),
  saveCreativeWorkLayerEditorSnapshot: vi.fn(),
  seedLayerEditorState: vi.fn(),
}));
vi.mock("@/server/storage", () => ({ objectStorage: { signedDownloadUrl: vi.fn(async (key: string) => `signed:${key}`), get: (...args: unknown[]) => storageGet(...args), put: (...args: unknown[]) => storagePut(...args), delete: (...args: unknown[]) => storageDelete(...args) } }));

import { acceptCreativeWorkLayerRegenerationCandidate, discardCreativeWorkLayerRegenerationCandidate, openCreativeWorkLayerEditor, recoverCreativeWorkLayerEditorStaleRegeneration } from "./manage-creative-work-layer-editor";

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
    recover.mockResolvedValue(null);
    recoverReserved.mockResolvedValue(null);
    releaseQuota.mockResolvedValue({ released: true });
    postDispatchLock.mockImplementation(async (_input: unknown, run: (executor: unknown) => Promise<unknown>) => run({}));
    accept.mockResolvedValue({ id: "output" });
    discard.mockResolvedValue({ id: "output" });
    storageGet.mockResolvedValue(Buffer.from("candidate"));
    storagePut.mockResolvedValue(undefined);
    storageDelete.mockResolvedValue(undefined);
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

  it("opens edit on a completed output that is not selected", async () => {
    const live = { ...state, lease: { ...state.lease!, userId: "viewer", expiresAt: "2099-08-22T00:01:30.000Z" }, layers: state.layers.map((layer, index) => ({ ...layer, description: index === 0 ? "Woman facing camera" : null })) };
    output.mockResolvedValue({ layerEditor: live, status: "completed", isSelected: false });
    const result = await openCreativeWorkLayerEditor({ workspaceId: "workspace-a", workItemId: "work", outputId: "output", userId: "viewer", userName: "Viewer", mode: "edit" });
    expect(result).toMatchObject({ ok: true, document: { lease: { mode: "edit", leaseId: live.lease!.id }, layers: [{ description: "Woman facing camera" }, { description: null }] } });
    expect(acquire).not.toHaveBeenCalled();
  });

  it("keeps an owner inspect request read-only without a lease id", async () => {
    output.mockResolvedValue({ layerEditor: { ...state, lease: { ...state.lease!, userId: "viewer", expiresAt: "2099-08-22T00:01:30.000Z" } }, status: "completed", isSelected: true });
    const result = await openCreativeWorkLayerEditor({ workspaceId: "workspace-a", workItemId: "work", outputId: "output", userId: "viewer", userName: "Viewer", mode: "inspect" });
    expect(result).toMatchObject({ ok: true, document: { lease: { mode: "read", leaseId: null } } });
  });

  it("projects a stale processing regeneration only after conservative terminal recovery", async () => {
    const processing = { ...state, regeneration: { id: "00000000-0000-4000-8000-000000000099", status: "processing" as const, layerId: state.layers[0]!.id, instruction: "Change", requestedByUserId: "viewer", usageKey: "usage", candidateKey: null, providerRequestId: null, failureCode: null, createdAt: "2026-08-22T00:00:00.000Z", updatedAt: "2026-08-22T00:00:00.000Z" } };
    const recovered = { ...processing, regeneration: { ...processing.regeneration, status: "submission_unknown" as const, failureCode: "layer_regeneration_submission_unknown" } };
    output.mockResolvedValue({ layerEditor: processing, status: "completed", isSelected: true });
    recover.mockResolvedValue({ layerEditor: recovered });

    const result = await openCreativeWorkLayerEditor({ workspaceId: "workspace-a", workItemId: "work", outputId: "output", userId: "viewer", userName: "Viewer", mode: "inspect" });

    expect(recover).toHaveBeenCalledWith(expect.objectContaining({ outputId: "output", now: expect.any(Date) }));
    expect(result).toMatchObject({ ok: true, document: { regeneration: { status: "submission_unknown" } } });
  });

  it("transitions and compensates a stale reservation exactly once in one operation transaction", async () => {
    const reserved = { ...state, regeneration: { id: "00000000-0000-4000-8000-000000000099", status: "reserved" as const, layerId: state.layers[0]!.id, instruction: "Change", requestedByUserId: "viewer", usageKey: "usage", candidateKey: null, providerRequestId: null, failureCode: null, createdAt: "2026-08-22T00:00:00.000Z", updatedAt: "2026-08-22T00:00:00.000Z" } };
    const terminal = { ...reserved, regeneration: { ...reserved.regeneration, status: "failed" as const, failureCode: "layer_regeneration_dispatch_stale" } };
    output.mockResolvedValue({ layerEditor: reserved });
    recoverReserved.mockResolvedValueOnce({ layerEditor: terminal }).mockResolvedValueOnce(null);
    const recovery = { workspaceId: "workspace-a", workItemId: "work", outputId: "output", now: new Date("2026-08-22T00:06:00.000Z") };

    await expect(recoverCreativeWorkLayerEditorStaleRegeneration(recovery)).resolves.toMatchObject({ layerEditor: terminal });
    await expect(recoverCreativeWorkLayerEditorStaleRegeneration(recovery)).resolves.toBeNull();
    expect(postDispatchLock).toHaveBeenCalledWith(expect.objectContaining({ operationId: reserved.regeneration.id }), expect.any(Function));
    expect(releaseQuota).toHaveBeenCalledTimes(1);
    expect(releaseQuota).toHaveBeenCalledWith(expect.objectContaining({ operationId: reserved.regeneration.id, kind: "layer_regeneration_v1" }), recovery.now, expect.anything());
  });

  it("owns the immutable acceptance key and cleans only a CAS loser", async () => {
    const regeneration = { id: "00000000-0000-4000-8000-000000000099", status: "ready" as const, layerId: state.layers[0]!.id, instruction: "Change", requestedByUserId: "viewer", usageKey: "usage", candidateKey: "candidate/private.png", providerRequestId: "request", failureCode: null, createdAt: "2026-08-22T00:00:00.000Z", updatedAt: "2026-08-22T00:00:00.000Z" };
    output.mockResolvedValue({ layerEditor: { ...state, regeneration }, status: "completed", isSelected: true });
    accept.mockResolvedValue(null);
    const input = { workspaceId: "workspace-a", workItemId: "work", outputId: "output", userId: "viewer", leaseId: state.lease!.id, expectedRevision: 1, operationId: regeneration.id };

    await expect(acceptCreativeWorkLayerRegenerationCandidate(input)).resolves.toEqual({ ok: false, code: "layer_editor_revision_conflict" });
    const immutableKey = storagePut.mock.calls[0]?.[0];
    expect(immutableKey).toMatch(/^creative-work\/work\/layer-editor\/output\/layers\/.+\/revisions\/2\//);
    expect(storageDelete).toHaveBeenCalledWith(immutableKey);
    expect(storageDelete).not.toHaveBeenCalledWith(regeneration.candidateKey);
  });

  it("gates discard by entitlement and deletes a candidate only after its transition", async () => {
    const regeneration = { id: "00000000-0000-4000-8000-000000000099", status: "ready" as const, layerId: state.layers[0]!.id, instruction: "Change", requestedByUserId: "viewer", usageKey: "usage", candidateKey: "candidate/private.png", providerRequestId: "request", failureCode: null, createdAt: "2026-08-22T00:00:00.000Z", updatedAt: "2026-08-22T00:00:00.000Z" };
    output.mockResolvedValue({ layerEditor: { ...state, regeneration }, status: "completed", isSelected: true });
    const input = { workspaceId: "workspace-a", workItemId: "work", outputId: "output", userId: "viewer", leaseId: state.lease!.id, expectedRevision: 1, operationId: regeneration.id };
    await expect(discardCreativeWorkLayerRegenerationCandidate(input)).resolves.toEqual({ ok: true });
    expect(storageDelete).toHaveBeenCalledWith(regeneration.candidateKey);
    access.mockResolvedValue({ enabled: false });
    await expect(discardCreativeWorkLayerRegenerationCandidate(input)).resolves.toEqual({ ok: false, code: "layer_editor_not_available" });
    expect(discard).toHaveBeenCalledOnce();
  });
});
