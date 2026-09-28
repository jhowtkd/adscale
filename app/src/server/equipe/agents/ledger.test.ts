// Cost ledger: totals per account and conservative cost estimates.

import { describe, expect, it } from "vitest";
import { estimateCostCents, MemoryLedgerStore } from "./ledger";
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
    costCents: 1,
    ...overrides,
  };
}

describe("MemoryLedgerStore", () => {
  it("totals costs per account", async () => {
    const ledger = new MemoryLedgerStore();
    await ledger.record(entry({ costCents: 40 }));
    await ledger.record(entry({ costCents: 60 }));
    await ledger.record(entry({ accountId: "account-2", costCents: 999 }));
    expect(await ledger.totalCostCents("workspace-1", "account-1")).toBe(100);
    expect(await ledger.totalCostCents("workspace-1", "account-2")).toBe(999);
    expect(await ledger.totalCostCents("workspace-1", "unknown")).toBe(0);
  });

  it("stores the prompt version with each call", async () => {
    const ledger = new MemoryLedgerStore();
    const row = await ledger.record(entry());
    expect(row.promptVersion).toBe("equipe-prompts/v1");
  });
});

describe("estimateCostCents", () => {
  it("rounds up to the next cent", () => {
    // 1000 in * 0.015 + 1000 out * 0.06 = 0.075 -> 1 cent.
    expect(estimateCostCents("gpt-4o-mini", 1000, 1000)).toBe(1);
    expect(estimateCostCents("gpt-4o-mini", 0, 0)).toBe(0);
  });

  it("falls back to a conservative price for unknown models", () => {
    expect(estimateCostCents("gpt-future", 1000, 1000)).toBe(
      estimateCostCents("gpt-5.6-sol", 1000, 1000),
    );
  });
});
