import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LayerEditorStateV1 } from "@/server/layer-editor/contracts";

const store = vi.hoisted(() => ({
  row: null as { layerEditor: LayerEditorStateV1 } | null,
  update: null as Record<string, unknown> | null,
  casLoses: false,
}));
const publicationTransaction = vi.hoisted(() => vi.fn());

vi.mock("@/server/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => store.row ? [store.row] : [] }) }) }),
    update: () => ({ set: (value: Record<string, unknown>) => ({ where: () => ({ returning: async () => {
      store.update = value;
      return store.casLoses || !store.row ? [] : [{ ...store.row, layerEditor: value.layerEditor }];
    } }) }) }),
    transaction: (...args: unknown[]) => publicationTransaction(...args),
  },
}));

import {
  acceptLayerRegenerationCandidate,
  discardLayerRegenerationCandidate,
  layerEditorFromOutput,
  markLayerRegenerationProcessing,
  publishCreativeWorkLayerEditorVersion,
  rollbackReservedLayerRegeneration,
  reserveLayerRegeneration,
  recoverStaleLayerRegeneration,
  saveCreativeWorkLayerEditorSnapshot,
} from "./creative-work-layer-editor";

const scope = { workspaceId: "workspace-1", workItemId: "work-1", outputId: "output-1" };
const layerId = "00000000-0000-4000-8000-000000000001";
const otherLayerId = "00000000-0000-4000-8000-000000000002";
const leaseId = "00000000-0000-4000-8000-000000000003";
const operationId = "00000000-0000-4000-8000-000000000004";
const now = new Date("2026-08-22T00:00:00.000Z");

function editorState(overrides: Partial<LayerEditorStateV1> = {}): LayerEditorStateV1 {
  return {
    schemaVersion: 1, revision: 4, sourceLayerizationAttemptId: "attempt-1", canvas: { width: 100, height: 100 },
    layers: [
      { id: layerId, source: { order: 0, name: "Product", visible: true, x: 10, y: 10, width: 20, height: 20, key: "private/source-product.png" }, order: 0, name: "Product", visible: true, x: 10, y: 10, width: 20, height: 20, currentKey: "private/source-product.png", currentKind: "source", restorableKey: null },
      { id: otherLayerId, source: { order: 1, name: "Background", visible: true, x: 0, y: 0, width: 100, height: 100, key: "private/background.png" }, order: 1, name: "Background", visible: true, x: 0, y: 0, width: 100, height: 100, currentKey: "private/background.png", currentKind: "source", restorableKey: null },
    ],
    lease: { id: leaseId, userId: "user-1", acquiredAt: "2026-08-21T23:59:00.000Z", expiresAt: "2026-08-22T00:01:30.000Z" },
    regeneration: null, publishedPsdKey: null, updatedAt: "2026-08-21T23:59:00.000Z",
    ...overrides,
  };
}

const mutation = { ...scope, userId: "user-1", leaseId, expectedRevision: 4, now };

describe("creative work layer editor regeneration repository", () => {
  beforeEach(() => {
    store.row = { layerEditor: editorState() };
    store.update = null;
    store.casLoses = false;
  });

  it.each([
    ["a different lease", { leaseId: "00000000-0000-4000-8000-000000000099" }],
    ["a stale revision", { expectedRevision: 3 }],
    ["an unknown layer", { layerId: "00000000-0000-4000-8000-000000000099" }],
  ])("does not reserve for %s", async (_label, override) => {
    await expect(reserveLayerRegeneration({ ...mutation, ...override, operationId, layerId: override.layerId ?? layerId, instruction: "New color", usageKey: "usage-1" })).resolves.toBeNull();
    expect(store.update).toBeNull();
  });

  it("does not reserve with an expired lease or an active candidate", async () => {
    store.row = { layerEditor: editorState({ lease: { ...editorState().lease!, expiresAt: "2026-08-21T23:59:59.000Z" } }) };
    await expect(reserveLayerRegeneration({ ...mutation, operationId, layerId, instruction: "New color", usageKey: "usage-1" })).resolves.toBeNull();

    store.update = null;
    store.row = { layerEditor: editorState({ regeneration: { id: operationId, status: "ready", layerId, instruction: "Previous", requestedByUserId: "user-1", usageKey: "usage-old", candidateKey: "private/candidate.png", providerRequestId: "request-1", failureCode: null, createdAt: now.toISOString(), updatedAt: now.toISOString() } }) };
    await expect(reserveLayerRegeneration({ ...mutation, operationId: "00000000-0000-4000-8000-000000000005", layerId, instruction: "New color", usageKey: "usage-2" })).resolves.toBeNull();
    expect(store.update).toBeNull();
  });

  it("does not overwrite a reserved regeneration with a snapshot save", async () => {
    store.row = { layerEditor: editorState({ regeneration: { id: operationId, status: "reserved", layerId, instruction: "New color", requestedByUserId: "user-1", usageKey: "usage-1", candidateKey: null, providerRequestId: null, failureCode: null, createdAt: now.toISOString(), updatedAt: now.toISOString() } }) };
    const snapshot = store.row.layerEditor.layers.map(({ id, order, name, visible, x, y, width, height }) => ({ id, order, name, visible, x, y, width, height, useSource: false }));

    await expect(saveCreativeWorkLayerEditorSnapshot({ ...mutation, snapshot, now })).resolves.toBeNull();
    expect(store.update).toBeNull();
  });

  it("rolls back only its matching reserved operation", async () => {
    store.row = { layerEditor: editorState({ regeneration: { id: operationId, status: "reserved", layerId, instruction: "New color", requestedByUserId: "user-1", usageKey: "usage-1", candidateKey: null, providerRequestId: null, failureCode: null, createdAt: now.toISOString(), updatedAt: now.toISOString() } }) };
    const rolledBack = await rollbackReservedLayerRegeneration({ ...scope, operationId, now });
    expect(layerEditorFromOutput(rolledBack)?.regeneration).toBeNull();
    expect(layerEditorFromOutput(rolledBack)?.revision).toBe(5);

    store.row = { layerEditor: editorState({ regeneration: { id: operationId, status: "processing", layerId, instruction: "New color", requestedByUserId: "user-1", usageKey: "usage-1", candidateKey: null, providerRequestId: null, failureCode: null, createdAt: now.toISOString(), updatedAt: now.toISOString() } }) };
    await expect(rollbackReservedLayerRegeneration({ ...scope, operationId, now })).resolves.toBeNull();
  });

  it("preserves the renewed lease and reserved state when a transition CAS loses", async () => {
    const reserved = editorState({ regeneration: { id: operationId, status: "reserved", layerId, instruction: "New color", requestedByUserId: "user-1", usageKey: "usage-1", candidateKey: null, providerRequestId: null, failureCode: null, createdAt: now.toISOString(), updatedAt: now.toISOString() } });
    store.row = { layerEditor: reserved };
    store.casLoses = true;

    await expect(markLayerRegenerationProcessing({ ...scope, operationId, now })).resolves.toBeNull();
    expect(layerEditorFromOutput(store.row)?.lease).toEqual(reserved.lease);
    expect(layerEditorFromOutput(store.row)?.regeneration).toMatchObject({ status: "reserved" });
  });

  it("advances a reserved operation after its lease has been released", async () => {
    store.row = { layerEditor: editorState({ lease: null, regeneration: { id: operationId, status: "reserved", layerId, instruction: "New color", requestedByUserId: "user-1", usageKey: "usage-1", candidateKey: null, providerRequestId: null, failureCode: null, createdAt: now.toISOString(), updatedAt: now.toISOString() } }) };

    await expect(markLayerRegenerationProcessing({ ...scope, operationId, now })).resolves.not.toBeNull();
    // The transition updates only revision/regeneration, so a concurrent
    // release (lease: null) is not part of its predicate or replacement.
    expect(store.update?.layerEditor).not.toEqual(expect.objectContaining({ lease: expect.anything() }));
  });

  it("marks only an expired processing operation submission_unknown without retrying it", async () => {
    store.row = { layerEditor: editorState({ regeneration: { id: operationId, status: "processing", layerId, instruction: "New color", requestedByUserId: "user-1", usageKey: "usage-1", candidateKey: null, providerRequestId: null, failureCode: null, createdAt: "2026-08-22T00:00:00.000Z", updatedAt: "2026-08-22T00:00:00.000Z" } }) };

    await expect(recoverStaleLayerRegeneration({ ...scope, now: new Date("2026-08-22T00:06:00.000Z") })).resolves.not.toBeNull();
    expect(store.update).not.toBeNull();
    store.row = { layerEditor: editorState({ regeneration: { id: operationId, status: "processing", layerId, instruction: "New color", requestedByUserId: "user-1", usageKey: "usage-1", candidateKey: null, providerRequestId: null, failureCode: null, createdAt: "2026-08-22T00:05:59.000Z", updatedAt: "2026-08-22T00:05:59.000Z" } }) };
    await expect(recoverStaleLayerRegeneration({ ...scope, now: new Date("2026-08-22T00:06:00.000Z") })).resolves.toBeNull();
  });

  it("accepts only the selected candidate layer and clears restoration for the immutable result", async () => {
    store.row = { layerEditor: editorState({ regeneration: { id: operationId, status: "ready", layerId, instruction: "New color", requestedByUserId: "user-1", usageKey: "usage-1", candidateKey: "private/candidate.png", providerRequestId: "request-1", failureCode: null, createdAt: now.toISOString(), updatedAt: now.toISOString() } }) };
    const originalOther = store.row.layerEditor.layers[1];

    const updated = await acceptLayerRegenerationCandidate({ ...mutation, operationId, immutableKey: "immutable/accepted.png" });
    const state = layerEditorFromOutput(updated);

    expect(state?.layers.find((layer) => layer.id === layerId)).toMatchObject({ currentKey: "immutable/accepted.png", currentKind: "regenerated", restorableKey: null });
    expect(state?.layers.find((layer) => layer.id === otherLayerId)).toEqual(originalOther);
    expect(state?.regeneration).toBeNull();
  });

  it("leaves the candidate and layers intact when its accept CAS loses", async () => {
    const candidate = { id: operationId, status: "ready" as const, layerId, instruction: "New color", requestedByUserId: "user-1", usageKey: "usage-1", candidateKey: "private/candidate.png", providerRequestId: "request-1", failureCode: null, createdAt: now.toISOString(), updatedAt: now.toISOString() };
    store.row = { layerEditor: editorState({ regeneration: candidate }) };
    store.casLoses = true;

    await expect(acceptLayerRegenerationCandidate({ ...mutation, operationId, immutableKey: "immutable/accepted.png" })).resolves.toBeNull();
    expect(store.row.layerEditor.regeneration).toEqual(candidate);
    expect(store.row.layerEditor.layers[0]?.currentKey).toBe("private/source-product.png");
  });

  it("discards a candidate without mutating any layer", async () => {
    store.row = { layerEditor: editorState({ regeneration: { id: operationId, status: "ready", layerId, instruction: "New color", requestedByUserId: "user-1", usageKey: "usage-1", candidateKey: "private/candidate.png", providerRequestId: "request-1", failureCode: null, createdAt: now.toISOString(), updatedAt: now.toISOString() } }) };
    const originalLayers = store.row.layerEditor.layers;

    const updated = await discardLayerRegenerationCandidate({ ...mutation, operationId });
    const state = layerEditorFromOutput(updated);

    expect(state?.layers).toEqual(originalLayers);
    expect(state?.regeneration).toBeNull();
  });

  it("does not discard failed or submission-unknown terminal evidence", async () => {
    for (const status of ["failed", "submission_unknown"] as const) {
      store.row = { layerEditor: editorState({ regeneration: { id: operationId, status, layerId, instruction: "New color", requestedByUserId: "user-1", usageKey: "usage-1", candidateKey: null, providerRequestId: null, failureCode: "failure", createdAt: now.toISOString(), updatedAt: now.toISOString() } }) };
      await expect(discardLayerRegenerationCandidate({ ...mutation, operationId })).resolves.toBeNull();
      expect(store.row.layerEditor.regeneration?.status).toBe(status);
    }
  });
});

describe("creative work layer editor publication repository", () => {
  it("creates one unselected child and replays it through the operation key", async () => {
    const parentState = editorState();
    const parent = { id: scope.outputId, workspaceId: scope.workspaceId, workItemId: scope.workItemId, creativeLevel: "balanced", targetFormat: "4:5", directionId: null, directionSnapshot: null, layerEditor: parentState };
    const rebasedEditor: LayerEditorStateV1 = { ...parentState, revision: 1, lease: null, regeneration: null, publishedPsdKey: "published/piece.psd", layers: parentState.layers.map((layer) => ({ ...layer, source: { ...layer.source, key: layer.currentKey, order: layer.order, name: layer.name, visible: layer.visible, x: layer.x, y: layer.y, width: layer.width, height: layer.height }, currentKind: "source", restorableKey: null })) };
    let existing: Record<string, unknown> | null = null;
    let insertCount = 0;
    let inserted: Record<string, unknown> | null = null;
    let queue = Promise.resolve();
    publicationTransaction.mockImplementation(async (callback: (tx: never) => unknown) => {
      const previous = queue;
      let release!: () => void;
      queue = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      const tx = {
        execute: vi.fn(async () => undefined),
        select: (fields?: unknown) => ({ from: () => ({ where: () => fields
          ? Promise.resolve([{ maxVersion: 7 }])
          : { for: (lock: string) => ({ limit: async () => { expect(lock).toBe("update"); return [parent]; } }), limit: async () => existing ? [existing] : [] },
        }) }),
        insert: () => ({ values: (values: Record<string, unknown>) => ({ returning: async () => {
          insertCount += 1;
          inserted = values;
          existing = { id: "published-child", ...values };
          return [existing];
        } }) }),
      };
      try { return await callback(tx as never); } finally { release(); }
    });
    const publication = { ...mutation, parentOutputId: parent.id, operationId, outputKey: "published/piece.png", psdKey: "published/piece.psd", rebasedEditor };
    const parentJson = JSON.stringify(parent);

    const [first, replay] = await Promise.all([
      publishCreativeWorkLayerEditorVersion(publication),
      publishCreativeWorkLayerEditorVersion(publication),
    ]);

    expect(first).toMatchObject({ replay: false, output: { id: "published-child", parentOutputId: parent.id, isSelected: false, quality: null, imageCallCount: 0, cost: null, status: "completed" } });
    expect(replay).toMatchObject({ replay: true, output: { id: "published-child" } });
    expect(insertCount).toBe(1);
    expect((inserted?.layerEditor as LayerEditorStateV1)).toMatchObject({ revision: 1, lease: null, regeneration: null, publishedPsdKey: "published/piece.psd" });
    expect(JSON.stringify(parent)).toBe(parentJson);
  });

  it("rejects stale state or an operation replay from another parent", async () => {
    const parentState = editorState();
    const parent = { id: scope.outputId, workspaceId: scope.workspaceId, workItemId: scope.workItemId, creativeLevel: "balanced", targetFormat: "4:5", directionId: null, directionSnapshot: null, layerEditor: parentState };
    publicationTransaction.mockImplementation(async (callback: (tx: never) => unknown) => {
      const tx = {
        execute: vi.fn(async () => undefined),
        select: () => ({ from: () => ({ where: () => ({ for: () => ({ limit: async () => [parent] }), limit: async () => [{ id: "other", parentOutputId: "other-parent", outputKey: "other.png" }] }) }) }),
        insert: vi.fn(),
      };
      return callback(tx as never);
    });
    const rebasedEditor = { ...parentState, revision: 1, lease: null, regeneration: null, publishedPsdKey: "published/piece.psd" };
    const publication = { ...mutation, parentOutputId: parent.id, operationId, outputKey: "published/piece.png", psdKey: "published/piece.psd", rebasedEditor };

    await expect(publishCreativeWorkLayerEditorVersion({ ...publication, expectedRevision: 3 })).resolves.toBeNull();
    await expect(publishCreativeWorkLayerEditorVersion(publication)).resolves.toBeNull();
  });
});
