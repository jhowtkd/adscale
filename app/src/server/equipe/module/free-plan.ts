// The free plan of a workspace (ticket 11, part 2): with the pilot on, it gets the Estrategista (on the Equipe ledger,
// US$ 1 per account) and nothing of the classic product that spends: no campaign assistant, no credit spend (the
// trial's included), no classic checkout, no classic AI. The rule fails CLOSED and is decided per workspace, in order:
//
//   1. pilot off for the workspace                       -> not the free plan (no query at all);
//   2. any PAID Equipe account in the workspace          -> not the free plan: it is a customer, whatever the order;
//   3. an ACTIVE PAID ACCESS to the classic product      -> not the free plan (`workspaceHasActivePaidAccess`), even
//      with a free account: a paying classic customer that got one before the home stopped opening it keeps paying;
//   4. a FREE Equipe account                             -> the free plan;
//   5. no Equipe account, or only CLOSED ones            -> the free plan: a sign-up that never opened the home must not
//      get the trial's classic product through a URL or the API. With only closed accounts, `closedAccountId` says so:
//      the conversation does not reopen for a closed account, so the way out is a person, not the conversation.
//
// A classic customer with an active paid access, and every paid Equipe account, are untouched.

import { asc, eq } from "drizzle-orm";
import { db } from "../../db";
import { EQUIPE_PAID_ACCOUNT_STATUS, equipeAccounts } from "../../db/equipe-schema";
import { workspaceHasActivePaidAccess } from "../../billing/access";
import type { EquipeAccount, EquipeAccountRepository } from "../data";
import { isEquipeEnabledForWorkspace, type EquipeEnabledOverrides } from "./equipe-enabled";

/**
 * The free plan of a workspace. `accountId` is its free account, null when it has none (case 5); then
 * `closedAccountId` is its most recent closed account when every account it has is closed.
 */
export type FreePlanAccount = { accountId: string | null; closedAccountId?: string };

type AccountFacts = Pick<EquipeAccount, "id" | "status" | "createdAt">;

/** What the rule reads: the workspace's accounts (oldest first) and, from case 3 on, its classic paid access. */
export type FreePlanReaders = {
  readAccounts: (workspaceId: string) => Promise<AccountFacts[]>;
  hasActivePaidAccess: (workspaceId: string) => Promise<boolean>;
};

/** One indexed query: the workspace's accounts, in the order every client screen uses. */
export async function readWorkspaceAccountsFromDb(workspaceId: string): Promise<AccountFacts[]> {
  return db
    .select({ id: equipeAccounts.id, status: equipeAccounts.status, createdAt: equipeAccounts.createdAt })
    .from(equipeAccounts)
    .where(eq(equipeAccounts.workspaceId, workspaceId))
    .orderBy(asc(equipeAccounts.createdAt), asc(equipeAccounts.id));
}

export const dbFreePlanReaders: FreePlanReaders = {
  readAccounts: readWorkspaceAccountsFromDb,
  hasActivePaidAccess: workspaceHasActivePaidAccess,
};

/** The same accounts over the Equipe repositories (memory or a transaction's), for the module and its tests. */
export function accountsFromRepository(
  accounts: Pick<EquipeAccountRepository, "list">,
): FreePlanReaders["readAccounts"] {
  return async (workspaceId) =>
    [...(await accounts.list(workspaceId))].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
    );
}

const PAID_STATUS: ReadonlySet<string> = new Set(EQUIPE_PAID_ACCOUNT_STATUS);

/**
 * The single rule: the workspace's free plan while the pilot is on for it, else null. Every gate of the free plan
 * (credit spend, the classic AI, the checkout, the campaign chat, the billing status the screens read) asks this.
 */
export async function findFreePlanAccount(
  workspaceId: string,
  readers: FreePlanReaders = dbFreePlanReaders,
  overrides?: EquipeEnabledOverrides,
): Promise<FreePlanAccount | null> {
  if (!isEquipeEnabledForWorkspace(workspaceId, overrides)) return null;
  const accounts = await readers.readAccounts(workspaceId);
  if (accounts.some((account) => PAID_STATUS.has(account.status))) return null;
  if (await readers.hasActivePaidAccess(workspaceId)) return null;
  const free = accounts.find((account) => account.status === "free");
  if (free) return { accountId: free.id };
  const closed = accounts.filter((account) => account.status === "closed").at(-1);
  return closed ? { accountId: null, closedAccountId: closed.id } : { accountId: null };
}

/**
 * Whether the pilot's product (the conversation home, its shell and its chat rules) applies to the workspace (ticket 11,
 * part 2). Not for a classic paying customer with no live Equipe account (none, or only closed ones): it keeps the
 * classic home, and the home never opens a free account for it. Pilot off: false, with no query.
 */
export async function usesEquipeProduct(
  workspaceId: string,
  readers: FreePlanReaders = dbFreePlanReaders,
  overrides?: EquipeEnabledOverrides,
): Promise<boolean> {
  if (!isEquipeEnabledForWorkspace(workspaceId, overrides)) return false;
  const accounts = await readers.readAccounts(workspaceId);
  if (accounts.some((account) => account.status !== "closed")) return true;
  return !(await readers.hasActivePaidAccess(workspaceId));
}
