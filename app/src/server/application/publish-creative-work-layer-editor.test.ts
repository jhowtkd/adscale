import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LayerEditorStateV1 } from "@/server/layer-editor/contracts";

const getEditorOutput = vi.hoisted(() => vi.fn());
const stateFromOutput = vi.hoisted(() => vi.fn());
const materialize = vi.hoisted(() => vi.fn());
const storageHead = vi.hoisted(() => vi.fn());
const storageGet = vi.hoisted(() => vi.fn());
const storagePut = vi.hoisted(() => vi.fn());
const publishVersion = vi.hoisted(() => vi.fn());
const editorAccess = vi.hoisted(() => vi.fn());
const findPublication = vi.hoisted(() => vi.fn());
const store = vi.hoisted(() => ({ existing: null as Record<string, unknown> | null, inserted: null as Record<string, unknown> | null, insertCount: 0, maxVersion: 2 }));

vi.mock("@/server/repositories/creative-work-layer-editor", () => ({
  getCreativeWorkLayerEditorOutput: getEditorOutput,
  layerEditorFromOutput: stateFromOutput,
  findCreativeWorkLayerEditorPublicationByOperation: findPublication,
  publishCreativeWorkLayerEditorVersion: publishVersion,
}));
vi.mock("@/server/layer-editor/artifacts", () => ({ materializeLayerEditorDraft: materialize }));
vi.mock("@/server/storage", () => ({ objectStorage: { head: storageHead, get: storageGet, put: storagePut } }));
vi.mock("@/server/layer-editor/quota", () => ({ getLayerEditorAccess: editorAccess }));

import { publishCreativeWorkLayerEditor } from "./publish-creative-work-layer-editor";

const input = {
  workspaceId: "workspace-1", workItemId: "work-1", outputId: "00000000-0000-4000-8000-000000000001",
  userId: "user-1", leaseId: "00000000-0000-4000-8000-000000000002", expectedRevision: 4,
  operationId: "00000000-0000-4000-8000-000000000003",
};
const parent = { id: input.outputId, creativeLevel: "balanced", targetFormat: "4:5", directionId: null, directionSnapshot: null, isSelected: true, quality: { score: 1 } };
const state: LayerEditorStateV1 = {
  schemaVersion: 1, revision: 4, sourceLayerizationAttemptId: "attempt-1", canvas: { width: 100, height: 100 },
  layers: [
    { id: "00000000-0000-4000-8000-000000000004", source: { order: 0, name: "Old name", visible: true, x: 0, y: 0, width: 40, height: 40, key: "private/source-a.png" }, order: 1, name: "Edited name", visible: false, x: 4, y: 5, width: 30, height: 31, currentKey: "private/current-a.png", currentKind: "regenerated", restorableKey: "private/source-a.png" },
    { id: "00000000-0000-4000-8000-000000000005", source: { order: 1, name: "Background", visible: true, x: 0, y: 0, width: 100, height: 100, key: "private/source-b.png" }, order: 0, name: "Background edited", visible: true, x: 0, y: 0, width: 100, height: 100, currentKey: "private/current-b.png", currentKind: "source", restorableKey: null },
  ],
  lease: { id: input.leaseId, userId: input.userId, acquiredAt: "2026-08-22T00:00:00.000Z", expiresAt: "2099-08-22T00:01:30.000Z" },
  regeneration: null, publishedPsdKey: null, updatedAt: "2026-08-22T00:00:00.000Z",
};

describe("publishCreativeWorkLayerEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.existing = null;
    store.inserted = null;
    store.insertCount = 0;
    store.maxVersion = 2;
    getEditorOutput.mockResolvedValue(parent);
    editorAccess.mockResolvedValue({ enabled: true });
    findPublication.mockResolvedValue(null);
    stateFromOutput.mockImplementation((row: { layerEditor?: LayerEditorStateV1 } | null) => row === parent ? state : row?.layerEditor ?? null);
    materialize.mockResolvedValue({ pngKey: "draft/piece.png", psdKey: "draft/piece.psd" });
    storageHead.mockResolvedValue({ size: 1 });
    storageGet.mockImplementation(async (key: string) => Buffer.from(key));
    storagePut.mockResolvedValue(undefined);
    publishVersion.mockImplementation(async (request: { outputKey: string; rebasedEditor: LayerEditorStateV1 }) => {
      if (store.existing) return { output: store.existing, replay: true };
      store.inserted = { ...request.rebasedEditor, outputKey: request.outputKey };
      store.insertCount += 1;
      store.existing = { id: "child-1", parentOutputId: parent.id, isSelected: false, status: "completed", outputKey: request.outputKey };
      return { output: store.existing, replay: false };
    });
  });

  it("creates deterministic artifacts and an unselected quality-null child with rebased source", async () => {
    const parentJson = JSON.stringify(parent);
    const sourceJson = JSON.stringify(state);
    const sourceArtifacts = new Map([
      ["private/current-a.png", Buffer.from("source-a")],
      ["private/current-b.png", Buffer.from("source-b")],
    ]);
    const sourceHashes = new Map([...sourceArtifacts].map(([key, value]) => [key, value.toString("hex")]));
    storageGet.mockImplementation(async (key: string) => sourceArtifacts.get(key) ?? Buffer.from(key));
    const result = await publishCreativeWorkLayerEditor(input);

    expect(result).toMatchObject({ ok: true, replay: false, output: { id: "child-1", parentOutputId: parent.id, isSelected: false, status: "completed" } });
    expect(JSON.stringify(result)).not.toMatch(/outputKey|layerEditor|publishedPsdKey|private\//);
    const prefix = `creative-work/${input.workItemId}/layer-editor/${input.outputId}/published/${input.operationId}/revision-${state.revision}`;
    expect(storagePut).toHaveBeenNthCalledWith(1, `${prefix}/piece.png`, Buffer.from("draft/piece.png"), "image/png");
    expect(storagePut).toHaveBeenNthCalledWith(2, `${prefix}/piece.psd`, Buffer.from("draft/piece.psd"), "image/vnd.adobe.photoshop");
    expect(publishVersion).toHaveBeenCalledWith(expect.objectContaining({ parentOutputId: parent.id, outputKey: `${prefix}/piece.png`, psdKey: `${prefix}/piece.psd` }));
    const child = store.inserted as LayerEditorStateV1;
    expect(child).toMatchObject({ revision: 1, lease: null, regeneration: null, publishedPsdKey: `${prefix}/piece.psd` });
    expect(child.layers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: state.layers[0]?.id, currentKind: "source", restorableKey: null, source: expect.objectContaining({ key: "private/current-a.png", order: 1, name: "Edited name", visible: false, x: 4, y: 5, width: 30, height: 31 }) }),
    ]));
    expect(parent).toEqual(expect.objectContaining({ isSelected: true, quality: { score: 1 } }));
    expect(state.layers[0]).toMatchObject({ currentKey: "private/current-a.png", restorableKey: "private/source-a.png" });
    expect(JSON.stringify(parent)).toBe(parentJson);
    expect(JSON.stringify(state)).toBe(sourceJson);
    expect([...sourceArtifacts].map(([key, value]) => [key, value.toString("hex")])).toEqual([...sourceHashes]);
  });

  it("replays the same published child and inserts only once", async () => {
    const first = await publishCreativeWorkLayerEditor(input);
    const replay = await publishCreativeWorkLayerEditor(input);

    expect(first).toMatchObject({ ok: true, replay: false });
    expect(replay).toMatchObject({ ok: true, replay: true, output: { id: "child-1" } });
    expect(store.insertCount).toBe(1);
  });

  it("rejects a reused operation for a different revision before writing artifacts", async () => {
    findPublication.mockResolvedValue({ id: "child-1", parentOutputId: parent.id, operationKey: `layer-editor-publish:${input.operationId}:${parent.id}:3`, status: "completed", isSelected: false, creativeLevel: "balanced", targetFormat: "4:5", versionNumber: 2 });

    await expect(publishCreativeWorkLayerEditor(input)).resolves.toMatchObject({ ok: false, code: "layer_editor_publish_conflict" });
    expect(storagePut).not.toHaveBeenCalled();
    expect(materialize).not.toHaveBeenCalled();
  });

  it("replays a matching operation before materializing or overwriting artifacts", async () => {
    findPublication.mockResolvedValue({ id: "child-1", parentOutputId: parent.id, operationKey: `layer-editor-publish:${input.operationId}:${parent.id}:4`, status: "completed", isSelected: false, creativeLevel: "balanced", targetFormat: "4:5", versionNumber: 2 });

    await expect(publishCreativeWorkLayerEditor(input)).resolves.toMatchObject({ ok: true, replay: true, output: { id: "child-1" } });
    expect(storagePut).not.toHaveBeenCalled();
    expect(materialize).not.toHaveBeenCalled();
  });

  it("serializes concurrent duplicate operations into one child", async () => {
    const [left, right] = await Promise.all([publishCreativeWorkLayerEditor(input), publishCreativeWorkLayerEditor(input)]);

    expect([left, right].filter((result) => result.ok && !result.replay)).toHaveLength(1);
    expect([left, right].filter((result) => result.ok && result.replay)).toHaveLength(1);
    expect(store.insertCount).toBe(1);
  });

  it.each([
    ["stale revision", { expectedRevision: 3 }],
    ["wrong lease", { leaseId: "00000000-0000-4000-8000-000000000099" }],
  ])("returns a typed conflict for %s", async (_label, override) => {
    await expect(publishCreativeWorkLayerEditor({ ...input, ...override })).resolves.toEqual({ ok: false, code: "layer_editor_publish_conflict" });
    expect(materialize).not.toHaveBeenCalled();
  });

  it("returns a typed error when a saved source or draft artifact is missing", async () => {
    storageHead.mockResolvedValueOnce(null);

    await expect(publishCreativeWorkLayerEditor(input)).resolves.toEqual({ ok: false, code: "layer_editor_artifact_missing" });

    expect(materialize).not.toHaveBeenCalled();
  });

  it("does not replay an operation key that belongs to another parent", async () => {
    publishVersion.mockResolvedValue(null);

    await expect(publishCreativeWorkLayerEditor(input)).resolves.toEqual({ ok: false, code: "layer_editor_publish_conflict" });
    expect(store.insertCount).toBe(0);
  });

  it("requires an active layer editor entitlement before publishing", async () => {
    editorAccess.mockResolvedValue({ enabled: false });

    await expect(publishCreativeWorkLayerEditor(input)).resolves.toEqual({ ok: false, code: "layer_editor_not_available" });
    expect(materialize).not.toHaveBeenCalled();
  });
});
