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
    expect(row.promptVersion).toBe("equipe-prompts/v6");
  });

  it("records cache reads/writes per call, defaulting to zero", async () => {
    const ledger = new MemoryLedgerStore();
    const cached = await ledger.record(entry({ cacheReadTokens: 9000, cacheWriteTokens: 2000 }));
    expect(cached).toMatchObject({ cacheReadTokens: 9000, cacheWriteTokens: 2000 });
    const plain = await ledger.record(entry());
    expect(plain).toMatchObject({ cacheReadTokens: 0, cacheWriteTokens: 0 });
  });
});

describe("estimateCostUsdCents", () => {
  it("rounds up to the next cent", () => {
    // 1000 in * 0.015 + 1000 out * 0.06 = 0.075 -> 1 cent.
    expect(estimateCostUsdCents("gpt-4o-mini", 1000, 1000)).toBe(1);
    expect(estimateCostUsdCents("gpt-4o-mini", 0, 0)).toBe(0);
  });

  it("prices the Meta Contributor tier", () => {
    // 60k in * 0.01 + 30k out * 0.02 = 0.6 + 0.6 = 1.2 -> 2 cents.
    expect(estimateCostUsdCents("muse-spark-1.3-contributor", 60_000, 30_000)).toBe(2);
    expect(estimateCostUsdCents("muse-spark-1.2-contributor", 60_000, 30_000)).toBe(2);
  });

  it("prices the Meta Standard tier", () => {
    // 8k in * 0.125 + 2k out * 0.425 = 1 + 0.85 = 1.85 -> 2 cents.
    expect(estimateCostUsdCents("muse-spark-1.3", 8000, 2000)).toBe(2);
    expect(estimateCostUsdCents("muse-spark-1.2", 8000, 2000)).toBe(2);
    expect(estimateCostUsdCents("muse-spark-1.1", 8000, 2000)).toBe(2);
  });

  it("prices claude-opus-5-5", () => {
    // 10k in * 0.4 + 1k out * 2.0 = 4 + 2 = 6 cents.
    expect(estimateCostUsdCents("claude-opus-5-5", 10_000, 1000)).toBe(6);
  });

  it("prices Opus cache reads and writes at their own rates", () => {
    // 1k uncached in * 0.4 + 1k out * 2.0 + 8k reads * 0.02 + 2k writes * 0.5
    // = 0.4 + 2 + 0.16 + 1 = 3.56 -> 4 cents.
    expect(estimateCostUsdCents("claude-opus-5-5", 1000, 1000, 8000, 2000)).toBe(4);
    // Cache reads alone: 10k * 0.02 = 0.2 -> 1 cent.
    expect(estimateCostUsdCents("claude-opus-5-5", 0, 0, 10_000, 0)).toBe(1);
  });

  it("prices Muse cache reads with no write surcharge", () => {
    // Contributor: 60k in * 0.01 + 30k out * 0.02 + 100k reads * 0.0002
    // = 0.6 + 0.6 + 0.02 = 1.22 -> 2 cents.
    expect(estimateCostUsdCents("muse-spark-1.3-contributor", 60_000, 30_000, 100_000, 50_000)).toBe(2);
    // Standard: 8k in * 0.125 + 2k out * 0.425 + 8k reads * 0.015
    // = 1 + 0.85 + 0.12 = 1.97 -> 2 cents.
    expect(estimateCostUsdCents("muse-spark-1.3", 8000, 2000, 8000, 8000)).toBe(2);
  });

  it("prices OpenAI cache reads at the input rate (conservative)", () => {
    // Unknown discount → same as input: 1k reads * 0.015 = 0.015 -> 1 cent.
    expect(estimateCostUsdCents("gpt-4o-mini", 0, 0, 1000, 0)).toBe(1);
    expect(estimateCostUsdCents("gpt-4o-mini", 0, 0, 1000, 0)).toBe(
      estimateCostUsdCents("gpt-4o-mini", 1000, 0, 0, 0),
    );
  });

  it("falls back to a conservative price for unknown models", () => {
    expect(estimateCostUsdCents("gpt-future", 1000, 1000)).toBe(
      estimateCostUsdCents("gpt-5.6-sol", 1000, 1000),
    );
  });
});
