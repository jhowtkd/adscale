// Cost ledger for Equipe agent work (#550).
//
// One entry per direct model call: account, role, model, tokens, estimated
// cost, prompt version. The per-account cap sums costCents; past it, new
// agent work refuses and emits `agent.budget_exceeded` (see runner.ts).
// Delegated engine calls (Redação, Direção de arte) are NOT recorded here —
// their cost flows through the spend/billing that already exists.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { equipeAgentLedger } from "@/server/db/equipe-schema";
import type { EquipeAgentRole } from "./roles";

export const BUDGET_EXCEEDED_EVENT = "agent.budget_exceeded";

export type LedgerEntryInput = {
  workspaceId: string;
  accountId: string;
  role: EquipeAgentRole;
  model: string;
  promptVersion: string;
  taskKind: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
};

export type LedgerEntry = LedgerEntryInput & {
  id: string;
  createdAt: Date;
};

export interface LedgerStore {
  record(entry: LedgerEntryInput): Promise<LedgerEntry>;
  totalCostCents(workspaceId: string, accountId: string): Promise<number>;
}

export class MemoryLedgerStore implements LedgerStore {
  readonly entries: LedgerEntry[] = [];

  async record(entry: LedgerEntryInput): Promise<LedgerEntry> {
    const row: LedgerEntry = {
      ...entry,
      id: `ledger-${this.entries.length + 1}`,
      createdAt: new Date(),
    };
    this.entries.push(row);
    return row;
  }

  async totalCostCents(workspaceId: string, accountId: string): Promise<number> {
    return this.entries
      .filter((entry) => entry.workspaceId === workspaceId && entry.accountId === accountId)
      .reduce((sum, entry) => sum + entry.costCents, 0);
  }
}

type LedgerDb = Pick<typeof db, "insert" | "select">;

export class DrizzleLedgerStore implements LedgerStore {
  constructor(private readonly database: LedgerDb = db) {}

  async record(entry: LedgerEntryInput): Promise<LedgerEntry> {
    const [row] = await this.database.insert(equipeAgentLedger).values(entry).returning();
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
      costCents: row.costCents,
      id: row.id,
      createdAt: row.createdAt,
    };
  }

  async totalCostCents(workspaceId: string, accountId: string): Promise<number> {
    const [row] = await this.database
      .select({ total: sql<number | null>`coalesce(sum(${equipeAgentLedger.costCents}), 0)` })
      .from(equipeAgentLedger)
      .where(
        and(
          eq(equipeAgentLedger.workspaceId, workspaceId),
          eq(equipeAgentLedger.accountId, accountId),
        ),
      );
    return Number(row?.total ?? 0);
  }
}

// Estimated prices in cents per 1k tokens. Estimates, not invoices: the
// ledger supports the pilot cap, not billing. Update from real invoices.
const PRICE_CENTS_PER_1K: Record<string, { input: number; output: number }> = {
  "gpt-5.6-sol": { input: 0.3, output: 1.2 },
  "gpt-5.6": { input: 0.3, output: 1.2 },
  "gpt-4o-mini": { input: 0.015, output: 0.06 },
  "gpt-4o": { input: 0.25, output: 1.0 },
};

const FALLBACK_PRICE = { input: 0.3, output: 1.2 };

/** Conservative estimate: rounds UP to the next cent. */
export function estimateCostCents(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICE_CENTS_PER_1K[model] ?? FALLBACK_PRICE;
  const cents = (inputTokens / 1000) * price.input + (outputTokens / 1000) * price.output;
  return Math.ceil(cents);
}
