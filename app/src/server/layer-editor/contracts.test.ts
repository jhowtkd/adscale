import { describe, expect, it } from "vitest";

import { layerEditorStateSchema } from "./contracts";

const layer = (id: string, order: number) => ({
  id,
  source: { order, name: `Layer ${order}`, visible: true, x: 0, y: 0, width: 100, height: 100, key: `source/${id}.png` },
  order,
  name: `Layer ${order}`,
  visible: true,
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  currentKey: `source/${id}.png`,
  currentKind: "source",
  restorableKey: null,
});

const state = {
  schemaVersion: 1,
  revision: 1,
  sourceLayerizationAttemptId: "attempt-1",
  canvas: { width: 100, height: 100 },
  layers: [
    layer("00000000-0000-4000-8000-000000000001", 0),
    layer("00000000-0000-4000-8000-000000000002", 1),
  ],
  lease: null,
  regeneration: null,
  publishedPsdKey: null,
  updatedAt: "2026-08-21T12:00:00.000Z",
};

const regeneration = {
  id: "00000000-0000-4000-8000-000000000010",
  status: "reserved" as const,
  layerId: "00000000-0000-4000-8000-000000000001",
  instruction: "New color",
  requestedByUserId: "user-1",
  usageKey: "usage-1",
  candidateKey: null,
  providerRequestId: null,
  failureCode: null,
  createdAt: "2026-08-21T12:00:00.000Z",
  updatedAt: "2026-08-21T12:00:00.000Z",
};

describe("layerEditorStateSchema", () => {
  it("rejects a document with duplicate order or a box outside the canvas", () => {
    expect(layerEditorStateSchema.safeParse({ ...state, layers: [state.layers[0], { ...state.layers[1], order: 0 }] }).success).toBe(false);
    expect(layerEditorStateSchema.safeParse({ ...state, layers: [{ ...state.layers[0], width: 101 }, state.layers[1]] }).success).toBe(false);
  });

  it("accepts a persisted regeneration without renderPolicy and rejects version 2", () => {
    expect(layerEditorStateSchema.safeParse({ ...state, regeneration }).success).toBe(true);
    expect(layerEditorStateSchema.safeParse({ ...state, regeneration: { ...regeneration, renderPolicy: { version: 2 } } }).success).toBe(false);
  });
});
