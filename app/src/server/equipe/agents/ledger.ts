// Cost ledger for Equipe agent work (#550).
//
// One entry per direct model call: account, role, model, tokens, estimated
// cost in USD cents, prompt version. The monthly per-account cap sums
// costUsdCents for the current calendar month in America/Sao_Paulo; past
// it, new agent work refuses and emits `agent.budget_exceeded` (see
// runner.ts). Delegated engine calls (Redação, Direção de arte) are NOT
// recorded here — their cost flows through the spend/billing that already
// exists.

import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { equipeAgentLedger } from "@/server/db/equipe-schema";
import { monthWindow } from "../domain";
import type { EquipeAgentRole } from "./roles";

export const BUDGET_EXCEEDED_EVENT = "agent.budget_exceeded";

export type LedgerEntryInput = {
  workspaceId: string;
  accountId: string;
  role: EquipeAgentRole;
  model: string;
  promptVersion: string;
  taskKind: string;
  /** Uncached input tokens only — cache reads are counted separately. */
  inputTokens: number;
  outputTokens: number;
  /** Prompt-cache reads/writes; 0 when the provider reports none. */
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsdCents: number;
};

export type LedgerEntry = LedgerEntryInput & {
  id: string;
  createdAt: Date;
};

export interface LedgerStore {
  record(entry: LedgerEntryInput): Promise<LedgerEntry>;
  /**
   * Spend in USD cents for the account in the São Paulo civil month
   * containing `now`. The caller passes the clock — never Date.now().
   */
  monthlyTotalCostUsdCents(workspaceId: string, accountId: string, now: Date): Promise<number>;
}

export class MemoryLedgerStore implements LedgerStore {
  readonly entries: LedgerEntry[] = [];

  async record(entry: LedgerEntryInput): Promise<LedgerEntry> {
    const row: LedgerEntry = {
      ...entry,
      cacheReadTokens: entry.cacheReadTokens ?? 0,
      cacheWriteTokens: entry.cacheWriteTokens ?? 0,
      id: `ledger-${this.entries.length + 1}`,
      createdAt: new Date(),
    };
    this.entries.push(row);
    return row;
  }

  async monthlyTotalCostUsdCents(workspaceId: string, accountId: string, now: Date): Promise<number> {
    const { start, endExclusive } = monthWindow(now);
    return this.entries
      .filter(
        (entry) =>
          entry.workspaceId === workspaceId &&
          entry.accountId === accountId &&
          entry.createdAt >= start &&
          entry.createdAt < endExclusive,
      )
      .reduce((sum, entry) => sum + entry.costUsdCents, 0);
  }
}

type LedgerDb = Pick<typeof db, "insert" | "select">;

export class DrizzleLedgerStore implements LedgerStore {
  constructor(private readonly database: LedgerDb = db) {}

  async record(entry: LedgerEntryInput): Promise<LedgerEntry> {
    // equipe_agent_ledger has no cache columns (adding them needs a
    // migration) and no metadata field, so per-call cache counts are
    // NOT persisted here — only echoed below. Their cost already flows
    // through costUsdCents, which is what the monthly cap sums.
    const [row] = await this.database
      .insert(equipeAgentLedger)
      .values({
        workspaceId: entry.workspaceId,
        accountId: entry.accountId,
        role: entry.role,
        model: entry.model,
        promptVersion: entry.promptVersion,
        taskKind: entry.taskKind,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        costUsdCents: entry.costUsdCents,
      })
      .returning();
    if (!row) throw new Error("ledgerInsertFailed");
    return {
      workspaceId: row.workspaceId,
      accountId: row.accountId,
      role: row.role as EquipeAgentRole,
      model: row.model,
      promptVersion: row.promptVersion,
      taskKind: row.taskKind,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cacheReadTokens: entry.cacheReadTokens ?? 0,
      cacheWriteTokens: entry.cacheWriteTokens ?? 0,
      costUsdCents: row.costUsdCents,
      id: row.id,
      createdAt: row.createdAt,
    };
  }

  async monthlyTotalCostUsdCents(workspaceId: string, accountId: string, now: Date): Promise<number> {
    const { start, endExclusive } = monthWindow(now);
    const [row] = await this.database
      .select({ total: sql<number | null>`coalesce(sum(${equipeAgentLedger.costUsdCents}), 0)` })
      .from(equipeAgentLedger)
      .where(
        and(
          eq(equipeAgentLedger.workspaceId, workspaceId),
          eq(equipeAgentLedger.accountId, accountId),
          gte(equipeAgentLedger.createdAt, start),
          lt(equipeAgentLedger.createdAt, endExclusive),
        ),
      );
    return Number(row?.total ?? 0);
  }
}

// Estimated prices per provider in USD cents per 1k tokens. Estimates,
// not invoices: the ledger supports the pilot cap, not billing. Output
// tokens already include reasoning tokens on every provider — no extra
// math. `input` prices UNCACHED input only; cache reads/writes price
// separately. OpenAI cache reads price at the input rate (unknown
// discount → conservative); Meta caches automatically with no write
// surcharge. Update from real invoices.
const PRICE_USD_CENTS_PER_1K: Record<
  string,
  { input: number; output: number; cacheRead: number; cacheWrite: number }
> = {
  "gpt-5.6-sol": { input: 0.3, output: 1.2, cacheRead: 0.3, cacheWrite: 0 },
  "gpt-5.6": { input: 0.3, output: 1.2, cacheRead: 0.3, cacheWrite: 0 },
  "gpt-4o-mini": { input: 0.015, output: 0.06, cacheRead: 0.015, cacheWrite: 0 },
  "gpt-4o": { input: 0.25, output: 1.0, cacheRead: 0.25, cacheWrite: 0 },
  // Muse Spark, Contributor tier (Meta trains on these calls).
  "muse-spark-1.3-contributor": { input: 0.01, output: 0.02, cacheRead: 0.0002, cacheWrite: 0 },
  "muse-spark-1.2-contributor": { input: 0.01, output: 0.02, cacheRead: 0.0002, cacheWrite: 0 },
  // Muse Spark, Standard tier.
  "muse-spark-1.3": { input: 0.125, output: 0.425, cacheRead: 0.015, cacheWrite: 0 },
  "muse-spark-1.2": { input: 0.125, output: 0.425, cacheRead: 0.015, cacheWrite: 0 },
  "muse-spark-1.1": { input: 0.125, output: 0.425, cacheRead: 0.015, cacheWrite: 0 },
  "claude-opus-5-5": { input: 0.4, output: 2.0, cacheRead: 0.02, cacheWrite: 0.5 },
};

const FALLBACK_PRICE = { input: 0.3, output: 1.2, cacheRead: 0.3, cacheWrite: 0 };

/** Conservative estimate: rounds UP to the next cent. */
export function estimateCostUsdCents(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
): number {
  const price = PRICE_USD_CENTS_PER_1K[model] ?? FALLBACK_PRICE;
  const cents =
    (inputTokens / 1000) * price.input +
    (outputTokens / 1000) * price.output +
    (cacheReadTokens / 1000) * price.cacheRead +
    (cacheWriteTokens / 1000) * price.cacheWrite;
  return Math.ceil(cents);
}
