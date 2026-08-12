import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { LayerizationState } from "@/server/layerize/contracts";

const mocks = vi.hoisted(() => {
  const selectResults: unknown[][] = [];
  const updateResults: unknown[][] = [];
  const where = vi.fn();
  const selectChain: Record<string, unknown> = {};
  selectChain.from = vi.fn(() => selectChain);
  selectChain.where = vi.fn((condition: unknown) => {
    where(condition);
    return selectChain;
  });
  selectChain.limit = vi.fn(() => selectChain);
  selectChain.then = (resolve: (value: unknown) => void) => Promise.resolve(selectResults.shift() ?? []).then(resolve);
  const update = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn((condition: unknown) => {
        where(condition);
        return { returning: vi.fn(async () => updateResults.shift() ?? []) };
      }),
    })),
  }));
  return { selectResults, updateResults, where, update, select: vi.fn(() => selectChain) };
});

vi.mock("@/server/db", () => ({
  db: { select: mocks.select, update: mocks.update },
}));

import {
  acceptCreativeWorkLayerizationCallback,
  claimCreativeWorkLayerizationFinalization,
  failCreativeWorkLayerization,
  hashLayerizationCallbackToken,
} from "./creative-work-layerization";

const dialect = new PgDialect();
const serialized = (condition: unknown) => dialect.sqlToQuery(condition as SQL);
const now = "2026-08-12T12:00:00.000Z";

function state(overrides: Partial<LayerizationState> = {}): LayerizationState {
  return {
    status: "processing",
    attemptId: "attempt-1",
    callbackTokenHash: "a".repeat(64),
    callbackConsumedAt: null,
    requestedByUserId: "owner-1",
    createdAt: now,
    updatedAt: now,
    callbackDeadlineAt: "2099-08-12T14:00:00.000Z",
    providerRequestId: null,
    providerModel: "bytedance/seedream/v5/pro/layerize",
    providerEndpoint: "https://queue.fal.run/bytedance/seedream/v5/pro/layerize",
    estimatedCostUsd: null,
    baseWidth: null,
    baseHeight: null,
    layers: [],
    psdKey: null,
    diagnosticZipKey: null,
    fidelity: null,
    failureCode: null,
    ...overrides,
  };
}

function row(layerization: LayerizationState) {
  return { id: "output-1", workspaceId: "workspace-1", workItemId: "work-1", layerization };
}

describe("creative work layerization state transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectResults.length = 0;
    mocks.updateResults.length = 0;
  });

  it("recovers a submission_unknown attempt from a valid callback", async () => {
    const unknown = state({
      status: "submission_unknown",
      failureCode: "submission_unknown",
      callbackTokenHash: hashLayerizationCallbackToken("token"),
    });
    const recovered = state({ providerRequestId: "request-1", callbackConsumedAt: now });
    mocks.selectResults.push([row(unknown)]);
    mocks.updateResults.push([row(recovered)]);

    const result = await acceptCreativeWorkLayerizationCallback({
      workItemId: "work-1",
      outputId: "output-1",
      attemptId: "attempt-1",
      token: "token",
      requestId: "request-1",
    });

    expect(result).toMatchObject({ accepted: true, replay: false });
  });

  it("allows a callback-consumed attempt to claim finalization and failure", async () => {
    const callbackState = state({ callbackConsumedAt: now, providerRequestId: "request-1" });
    mocks.selectResults.push([row(callbackState)], [row(callbackState)]);
    mocks.updateResults.push([row(state({ status: "finalizing" }))], [row(state({ status: "failed", failureCode: "provider_error" }))]);

    await claimCreativeWorkLayerizationFinalization("workspace-1", "work-1", "output-1");
    const finalizationWhere = serialized(mocks.where.mock.calls.at(-1)?.[0]);
    expect(finalizationWhere.sql).not.toContain("callbackConsumedAt");

    await failCreativeWorkLayerization({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      outputId: "output-1",
      code: "provider_error",
    });
    const failureWhere = serialized(mocks.where.mock.calls.at(-1)?.[0]);
    expect(failureWhere.sql).not.toContain("callbackConsumedAt");
  });
});
