import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { LayerizationState } from "@/server/layerize/contracts";

const mocks = vi.hoisted(() => {
  const selectResults: unknown[][] = [];
  const updateResults: unknown[][] = [];
  const where = vi.fn();
  const set = vi.fn();
  const selectChain: Record<string, unknown> = {};
  selectChain.from = vi.fn(() => selectChain);
  selectChain.where = vi.fn((condition: unknown) => {
    where(condition);
    return selectChain;
  });
  selectChain.limit = vi.fn(() => selectChain);
  selectChain.then = (resolve: (value: unknown) => void) => Promise.resolve(selectResults.shift() ?? []).then(resolve);
  const update = vi.fn(() => ({
    set: vi.fn((value: unknown) => {
      set(value);
      return ({
      where: vi.fn((condition: unknown) => {
        where(condition);
        return { returning: vi.fn(async () => updateResults.shift() ?? []) };
      }),
      });
    }),
  }));
  return { selectResults, updateResults, where, set, update, select: vi.fn(() => selectChain) };
});

vi.mock("@/server/db", () => ({
  db: { select: mocks.select, update: mocks.update },
}));

import {
  acceptCreativeWorkLayerizationCallback,
  claimExpiredCreativeWorkLayerizationRecovery,
  claimCreativeWorkLayerizationFinalization,
  failCreativeWorkLayerization,
  failQueuedCreativeWorkLayerization,
  hashLayerizationCallbackToken,
  markCreativeWorkLayerizationReconciling,
  releaseCreativeWorkLayerizationRecoveryLease,
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
    latencyMs: null,
    providerRequestId: null,
    providerModel: "bytedance/seedream-v5.0-pro/layer-decomposition",
    providerEndpoint: "https://api.atlascloud.ai/api/v1/model/generateImage",
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

  it("patches reconciliation atomically without writing a stale provider identity", async () => {
    mocks.selectResults.push([row(state())]);
    mocks.updateResults.push([row(state({ status: "reconciling", providerRequestId: "request-1", callbackConsumedAt: now }))]);

    await markCreativeWorkLayerizationReconciling("workspace-1", "work-1", "output-1");

    const setValue = mocks.set.mock.calls.at(-1)?.[0] as { layerization?: unknown };
    const layerizationPatch = serialized(setValue.layerization);
    expect(layerizationPatch.sql).toContain("||");
    expect(layerizationPatch.params.some((param) => typeof param === "string" && param.includes("providerRequestId"))).toBe(false);
    expect(layerizationPatch.params.some((param) => typeof param === "string" && param.includes("callbackConsumedAt"))).toBe(false);
  });

  it("claims expired recovery atomically with a five-minute dispatch lease", async () => {
    const claimed = row(state({ providerRequestId: "request-1", updatedAt: now }));
    mocks.updateResults.push([claimed]);

    await expect(claimExpiredCreativeWorkLayerizationRecovery({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      outputId: "output-1",
      attemptId: "attempt-1",
      now: new Date("2026-08-12T15:00:00.000Z"),
    })).resolves.toEqual(claimed);

    const recoveryWhere = serialized(mocks.where.mock.calls.at(-1)?.[0]);
    expect(recoveryWhere.sql).toContain("queued");
    expect(recoveryWhere.sql).toContain("finalizing");
    expect(recoveryWhere.sql).toContain("callbackDeadlineAt");
    expect(recoveryWhere.sql).toContain("attemptId");
    expect(recoveryWhere.sql).toContain("updatedAt");
    expect(recoveryWhere.params).toContain("2026-08-12T14:55:00.000Z");
    expect(recoveryWhere.params).toContain("attempt-1");
    const setValue = mocks.set.mock.calls.at(-1)?.[0] as { layerization?: unknown };
    const layerizationPatch = serialized(setValue.layerization);
    expect(layerizationPatch.sql).toContain("jsonb_build_object");
    expect(layerizationPatch.params).toContain("2026-08-12T15:00:00.000Z");
  });

  it("reclaims stale finalization with the same five-minute lease", async () => {
    const claimed = row(state({ status: "finalizing", providerRequestId: "request-1" }));
    mocks.updateResults.push([claimed]);

    await expect(claimCreativeWorkLayerizationFinalization(
      "workspace-1",
      "work-1",
      "output-1",
      new Date("2026-08-12T15:00:00.000Z"),
    )).resolves.toEqual(claimed);

    const finalizationWhere = serialized(mocks.where.mock.calls.at(-1)?.[0]);
    expect(finalizationWhere.sql).toContain("finalizing");
    expect(finalizationWhere.sql).toContain("updatedAt");
    expect(finalizationWhere.params).toContain("2026-08-12T14:55:00.000Z");
  });

  it("releases only the lease claimed by the same attempt", async () => {
    mocks.updateResults.push([{ id: "output-1" }]);

    await expect(releaseCreativeWorkLayerizationRecoveryLease({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      outputId: "output-1",
      attemptId: "attempt-1",
      claimedAt: "2026-08-12T15:00:00.000Z",
      now: new Date("2026-08-12T15:00:00.000Z"),
    })).resolves.toBe(true);

    const releaseWhere = serialized(mocks.where.mock.calls.at(-1)?.[0]);
    expect(releaseWhere.sql).toContain("attemptId");
    expect(releaseWhere.sql).toContain("updatedAt");
    expect(releaseWhere.params).toContain("attempt-1");
    expect(releaseWhere.params).toContain("2026-08-12T15:00:00.000Z");
    const setValue = mocks.set.mock.calls.at(-1)?.[0] as { layerization?: unknown };
    const layerizationPatch = serialized(setValue.layerization);
    expect(layerizationPatch.params.some((param) => typeof param === "string" && param.includes("2026-08-12T14:55:00.000Z"))).toBe(true);
  });

  it("fails a dispatch only while the same attempt is still queued", async () => {
    mocks.updateResults.push([row(state({ status: "failed", failureCode: "dispatch_failed" }))]);

    await expect(failQueuedCreativeWorkLayerization({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      outputId: "output-1",
      attemptId: "attempt-1",
      code: "dispatch_failed",
    })).resolves.toMatchObject({ layerization: { status: "failed" } });

    const failureWhere = serialized(mocks.where.mock.calls.at(-1)?.[0]);
    expect(failureWhere.sql).toContain("queued");
    expect(failureWhere.sql).toContain("attemptId");
    expect(failureWhere.params).toContain("attempt-1");
  });

  it("rejects a callback for a different provider request", async () => {
    mocks.selectResults.push([row(state({
      providerRequestId: "request-1",
      callbackTokenHash: hashLayerizationCallbackToken("token"),
    }))]);

    await expect(acceptCreativeWorkLayerizationCallback({
      workItemId: "work-1",
      outputId: "output-1",
      attemptId: "attempt-1",
      token: "token",
      requestId: "request-2",
    })).resolves.toMatchObject({ accepted: false, replay: false });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
