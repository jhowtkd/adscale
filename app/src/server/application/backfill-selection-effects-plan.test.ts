import { describe, expect, it } from "vitest";
import {
  parseBackfillArgs,
  planSelectionEffectsBackfill,
  type ProvenReceiptRow,
} from "./backfill-selection-effects-plan";

function receiptRow(overrides: Partial<ProvenReceiptRow> = {}): ProvenReceiptRow {
  return {
    outputId: "out-1",
    workspaceId: "ws-1",
    workItemId: "work-1",
    isSelected: true,
    receiptId: "receipt-1",
    receiptRequestedAt: "2026-09-01T10:00:00.000Z",
    hasOutboxRow: false,
    ...overrides,
  };
}

describe("parseBackfillArgs (ICE-03B)", () => {
  it("dry-run is the default; apply is explicit", () => {
    expect(parseBackfillArgs([])).toEqual({ ok: true, plan: { dryRun: true, limit: 100 } });
    expect(parseBackfillArgs(["--apply"])).toEqual({
      ok: true,
      plan: { dryRun: false, limit: 100 },
    });
    expect(parseBackfillArgs(["--dry-run", "--limit", "10"])).toEqual({
      ok: true,
      plan: { dryRun: true, limit: 10 },
    });
  });

  it("accepts an optional workspace scope and validates the limit", () => {
    expect(parseBackfillArgs(["--workspace", "ws-1"])).toEqual({
      ok: true,
      plan: { dryRun: true, limit: 100, workspaceId: "ws-1" },
    });
    expect(parseBackfillArgs(["--limit", "0"])).toMatchObject({ ok: false });
    expect(parseBackfillArgs(["--limit", "abc"])).toMatchObject({ ok: false });
    expect(parseBackfillArgs(["--force"])).toMatchObject({ ok: false });
  });
});

describe("planSelectionEffectsBackfill (ICE-03B)", () => {
  it("enqueues only proven receipts: selected output plus receipt id", () => {
    const plan = planSelectionEffectsBackfill([
      receiptRow(),
      receiptRow({ outputId: "out-2", hasOutboxRow: true }),
      receiptRow({ outputId: "out-3", isSelected: false }),
      receiptRow({ outputId: "out-4", receiptId: "" }),
    ]);
    expect(plan.candidates.map((candidate) => candidate.outputId)).toEqual(["out-1"]);
    expect(plan.candidates[0]).toMatchObject({
      workspaceId: "ws-1",
      workItemId: "work-1",
      requestedAt: "2026-09-01T10:00:00.000Z",
    });
    expect(plan.skipped).toEqual([
      { outputId: "out-2", reason: "outbox_row_exists" },
      { outputId: "out-3", reason: "not_selected" },
      { outputId: "out-4", reason: "receipt_missing" },
    ]);
  });

  it("preserves the original request date, never the backfill date", () => {
    const plan = planSelectionEffectsBackfill([receiptRow()]);
    expect(plan.candidates[0].requestedAt).toBe("2026-09-01T10:00:00.000Z");
  });

  it("an invalid receipt date skips instead of inventing one", () => {
    const plan = planSelectionEffectsBackfill([
      receiptRow({ receiptRequestedAt: "not-a-date" }),
    ]);
    expect(plan.candidates).toEqual([]);
    expect(plan.skipped).toEqual([{ outputId: "out-1", reason: "receipt_date_invalid" }]);
  });
});
