// The free plan of a workspace (ticket 11, part 2): with the pilot on, a workspace whose entry account is `free` gets
// the Estrategista (on the Equipe ledger, US$ 1 per account) and nothing of the classic product that spends: no
// campaign assistant, no credit spend, trial credits included. The entry account is the oldest one (created_at, id),
// the one the client screens open and the free→paid conversion keeps. A classic workspace (pilot off, or no Equipe
// account) and a paid entry account are untouched: the rule answers null and costs no query with the pilot off.

import { asc, eq } from "drizzle-orm";
import { db } from "../../db";
import { equipeAccounts } from "../../db/equipe-schema";
import type { EquipeAccount, EquipeAccountRepository } from "../data";
import { isEquipeEnabledForWorkspace, type EquipeEnabledOverrides } from "./equipe-enabled";

export type FreePlanAccount = { accountId: string };

/** Reads the entry account of a workspace (oldest by created_at, id), or null when it has none. */
export type EntryAccountReader = (workspaceId: string) => Promise<Pick<EquipeAccount, "id" | "status"> | null>;

/** One indexed query: the workspace's accounts in the order every client screen uses, first one only. */
export const readEntryAccountFromDb: EntryAccountReader = async (workspaceId) => {
  const [entry] = await db
    .select({ id: equipeAccounts.id, status: equipeAccounts.status })
    .from(equipeAccounts)
    .where(eq(equipeAccounts.workspaceId, workspaceId))
    .orderBy(asc(equipeAccounts.createdAt), asc(equipeAccounts.id))
    .limit(1);
  return entry ?? null;
};

/** The same reader over the Equipe repositories (memory or a transaction's), for the module and its tests. */
export function entryAccountFromRepository(accounts: Pick<EquipeAccountRepository, "list">): EntryAccountReader {
  return async (workspaceId) => {
    const [entry] = [...(await accounts.list(workspaceId))].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
    );
    return entry ?? null;
  };
}

/**
 * The single rule: the workspace's free entry account while the pilot is on for it, else null. Every gate of the free
 * plan (the campaign chat, the credit spend, the campaign panel through `/api/equipe/accounts`) asks this question.
 */
export async function findFreePlanAccount(
  workspaceId: string,
  readEntry: EntryAccountReader = readEntryAccountFromDb,
  overrides?: EquipeEnabledOverrides,
): Promise<FreePlanAccount | null> {
  if (!isEquipeEnabledForWorkspace(workspaceId, overrides)) return null;
  const entry = await readEntry(workspaceId);
  return entry?.status === "free" ? { accountId: entry.id } : null;
}
