import { describe, expect, it } from "vitest";
import {
  claimSelectionEffects,
  selectionEffectIdempotencyKey,
} from "./selection-effects";

describe("selectionEffectIdempotencyKey", () => {
  const input = {
    workspaceId: "ws-1",
    outputId: "out-1",
    kind: "value_event" as const,
    effectVersion: 1,
  };

  it("is deterministic for the same obligation", () => {
    expect(selectionEffectIdempotencyKey(input)).toBe(selectionEffectIdempotencyKey(input));
  });

  it("differs per piece, kind and effect version", () => {
    const base = selectionEffectIdempotencyKey(input);
    expect(selectionEffectIdempotencyKey({ ...input, outputId: "out-2" })).not.toBe(base);
    expect(selectionEffectIdempotencyKey({ ...input, kind: "library" })).not.toBe(base);
    expect(selectionEffectIdempotencyKey({ ...input, effectVersion: 2 })).not.toBe(base);
  });
});

describe("claimSelectionEffects row mapping (ICE-03B)", () => {
  function fakeExecutor(rows: Array<Record<string, unknown>>) {
    return { execute: async () => ({ rows }) };
  }

  const baseRow = {
    id: "effect-1",
    workspace_id: "ws-1",
    work_item_id: "work-1",
    output_id: "out-1",
    kind: "value_event",
    effect_version: 1,
    payload: { version: 1, kind: "value_event" },
    attempts: 2,
  };

  it("returns requested_at as a Date for cohort preservation", async () => {
    const approval = new Date("2026-09-01T10:00:00.000Z");
    const [claimed] = await claimSelectionEffects(
      fakeExecutor([{ ...baseRow, requested_at: approval }]),
      { owner: "owner-1", limit: 10, leaseSeconds: 300 },
    );
    expect(claimed.requestedAt).toBeInstanceOf(Date);
    expect(claimed.requestedAt.getTime()).toBe(approval.getTime());
    expect(claimed.attempts).toBe(2);
  });

  it("coerces a string requested_at to a Date", async () => {
    const [claimed] = await claimSelectionEffects(
      fakeExecutor([{ ...baseRow, requested_at: "2026-09-01T10:00:00.000Z" }]),
      { owner: "owner-1", limit: 10, leaseSeconds: 300 },
    );
    expect(claimed.requestedAt).toEqual(new Date("2026-09-01T10:00:00.000Z"));
  });

  it("reads naive wall-clock requested_at as UTC in any process timezone", async () => {
    // Raw pg shape for tz-naive columns: no zone designator. Must map to
    // the UTC instant, never process-local wall-clock.
    const [claimed] = await claimSelectionEffects(
      fakeExecutor([{ ...baseRow, requested_at: "2026-09-01 10:00:00" }]),
      { owner: "owner-1", limit: 10, leaseSeconds: 300 },
    );
    expect(claimed.requestedAt.getTime()).toBe(
      new Date("2026-09-01T10:00:00.000Z").getTime(),
    );
  });
});
