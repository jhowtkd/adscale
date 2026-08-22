import { describe, expect, it } from "vitest";

import { toPublicLayerizationState } from "./contracts";

describe("toPublicLayerizationState", () => {
  it("projects Layerize without storage or provider data", () => {
    const value = toPublicLayerizationState({
      status: "completed", attemptId: "attempt-1", callbackTokenHash: "a".repeat(64), callbackConsumedAt: null,
      requestedByUserId: "user-1", createdAt: "2026-08-21T12:00:00.000Z", updatedAt: "2026-08-21T12:00:00.000Z",
      callbackDeadlineAt: "2026-08-21T13:00:00.000Z", latencyMs: 1, providerRequestId: "request-1", providerModel: "atlas",
      providerEndpoint: "https://provider.example.test", estimatedCostUsd: 1, baseWidth: 100, baseHeight: 100,
      layers: [{ order: 0, isBase: true, name: "Layer", description: "Layer", x: 0, y: 0, width: 100, height: 100,
        normalizedBoundingBox: { x: 0, y: 0, width: 1, height: 1 }, storageKey: "private/layer.png", sourceBytes: 10 }],
      psdKey: "private/piece.psd", diagnosticZipKey: "private/piece.zip", fidelity: null, failureCode: null,
    });
    expect(value).toMatchObject({ operationId: "attempt-1" });
    expect(value).not.toHaveProperty("attemptId");
    expect(value?.layers[0]).not.toHaveProperty("storageKey");
    expect(value).not.toHaveProperty("callbackTokenHash");
    expect(value).not.toHaveProperty("providerEndpoint");
    expect(value).not.toHaveProperty("providerRequestId");
    expect(value).not.toHaveProperty("psdKey");
  });

  it("uses an allowlist for public layers and never forwards future internals", () => {
    const value = toPublicLayerizationState({
      status: "completed", attemptId: "attempt-1", callbackTokenHash: "a".repeat(64), callbackConsumedAt: null,
      requestedByUserId: "user-1", createdAt: "2026-08-21T12:00:00.000Z", updatedAt: "2026-08-21T12:00:00.000Z",
      callbackDeadlineAt: "2026-08-21T13:00:00.000Z", latencyMs: 1, providerRequestId: "request-1", providerModel: "atlas",
      providerEndpoint: "https://provider.example.test", estimatedCostUsd: 1, baseWidth: 100, baseHeight: 100,
      layers: [{ order: 0, isBase: true, name: "Layer", description: "Layer", x: 0, y: 0, width: 100, height: 100,
        normalizedBoundingBox: { x: 0, y: 0, width: 1, height: 1 }, storageKey: "private/layer.png", sourceBytes: 10 }],
      psdKey: "private/piece.psd", diagnosticZipKey: "private/piece.zip", fidelity: null, failureCode: null,
    });
    expect(value?.layers[0]).toEqual({
      order: 0, isBase: true, name: "Layer", description: "Layer", x: 0, y: 0, width: 100, height: 100,
      normalizedBoundingBox: { x: 0, y: 0, width: 1, height: 1 },
    });
    expect(JSON.stringify(value)).not.toContain("private");
  });
});
