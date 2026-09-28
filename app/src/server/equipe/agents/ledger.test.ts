// Cost ledger: monthly totals per account and conservative cost estimates.

import { describe, expect, it } from "vitest";
import { fromSaoPauloWallTime } from "../domain";
import { estimateCostUsdCents, MemoryLedgerStore } from "./ledger";
import { EQUIPE_PROMPT_VERSION } from "./prompts";

function entry(overrides: Partial<Parameters<MemoryLedgerStore["record"]>[0]> = {}) {
  return {
    workspaceId: "workspace-1",
    accountId: "account-1",
    role: "strategist" as const,
    model: "gpt-5.6-sol",
    promptVersion: EQUIPE_PROMPT_VERSION,
    taskKind: "strategist_turn",
    inputTokens: 1000,
    outputTokens: 500,
    costUsdCents: 1,
    ...overrides,
  };
}

describe("MemoryLedgerStore", () => {
  it("totals the current São Paulo month per account", async () => {
    const now = fromSaoPauloWallTime(2026, 10, 15, 12, 0);
    const ledger = new MemoryLedgerStore();
    const lastMonth = await ledger.record(entry({ costUsdCents: 9999 }));
    lastMonth.createdAt = fromSaoPauloWallTime(2026, 9, 30, 23, 59);
    await ledger.record(entry({ costUsdCents: 40 }));
    await ledger.record(entry({ costUsdCents: 60 }));
    await ledger.record(entry({ accountId: "account-2", costUsdCents: 999 }));
    for (const row of ledger.entries) {
      if (row !== lastMonth) row.createdAt = now;
    }
    expect(await ledger.monthlyTotalCostUsdCents("workspace-1", "account-1", now)).toBe(100);
    expect(await ledger.monthlyTotalCostUsdCents("workspace-1", "account-2", now)).toBe(999);
    expect(await ledger.monthlyTotalCostUsdCents("workspace-1", "unknown", now)).toBe(0);
  });

  it("stores the prompt version with each call", async () => {
    const ledger = new MemoryLedgerStore();
    const row = await ledger.record(entry());
    expect(row.promptVersion).toBe("equipe-prompts/v1");
  });
});

describe("estimateCostUsdCents", () => {
  it("rounds up to the next cent", () => {
    // 1000 in * 0.015 + 1000 out * 0.06 = 0.075 -> 1 cent.
    expect(estimateCostUsdCents("gpt-4o-mini", 1000, 1000)).toBe(1);
    expect(estimateCostUsdCents("gpt-4o-mini", 0, 0)).toBe(0);
  });

  it("falls back to a conservative price for unknown models", () => {
    expect(estimateCostUsdCents("gpt-future", 1000, 1000)).toBe(
      estimateCostUsdCents("gpt-5.6-sol", 1000, 1000),
    );
  });
});
