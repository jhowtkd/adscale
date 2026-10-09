// The free plan of a workspace (ticket 11, part 2): it gets the Estrategista (on the Equipe ledger,
// US$ 1 per account) and nothing of the classic product that spends: no campaign assistant, no credit spend (the
// trial's included), no classic checkout, no classic AI. The rule fails CLOSED and is decided per workspace, in order:
//
//   1. any PAID Equipe account in the workspace          -> not the free plan: it is a customer, whatever the order;
//   2. an ACTIVE PAID ACCESS to the classic product      -> not the free plan (`workspaceHasActivePaidAccess`), even
//      with a free account: a workspace that opened its account free and pays afterwards stops being on the free plan;
//   3. a FREE Equipe account                             -> the free plan;
//   4. no Equipe account, or only CLOSED ones            -> the free plan: a sign-up that never opened the home must not
//      get the trial's classic product through a URL or the API. With only closed accounts, `closedAccountId` says so:
//      the conversation does not reopen for a closed account, so the way out is a person, not the conversation.

import { asc, eq } from "drizzle-orm";
import { db } from "../../db";
import { EQUIPE_PAID_ACCOUNT_STATUS, equipeAccounts } from "../../db/equipe-schema";
import { workspaceHasActivePaidAccess } from "../../billing/access";
import type { EquipeAccount, EquipeAccountRepository } from "../data";
import type { EquipeModuleDeps } from "./ports";

/**
 * The free plan of a workspace. `accountId` is its free account, null when it has none (case 4); then
 * `closedAccountId` is its most recent closed account when every account it has is closed.
 */
export type FreePlanAccount = { accountId: string | null; closedAccountId?: string };

type AccountFacts = Pick<EquipeAccount, "id" | "status" | "createdAt">;

/** What the rule reads: the workspace's accounts (oldest first) and, from case 2 on, its classic paid access. */
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
 * The single rule: the workspace's free plan, or null when the workspace pays. Every gate of the free plan
 * (credit spend, the classic AI, the checkout, the campaign chat, the billing status the screens read) asks this.
 */
export async function findFreePlanAccount(
  workspaceId: string,
  readers: FreePlanReaders = dbFreePlanReaders,
): Promise<FreePlanAccount | null> {
  const accounts = await readers.readAccounts(workspaceId);
  if (accounts.some((account) => PAID_STATUS.has(account.status))) return null;
  if (await readers.hasActivePaidAccess(workspaceId)) return null;
  const free = accounts.find((account) => account.status === "free");
  if (free) return { accountId: free.id };
  const closed = accounts.filter((account) => account.status === "closed").at(-1);
  return closed ? { accountId: null, closedAccountId: closed.id } : { accountId: null };
}

/** The rule's readers over the module's own repositories and its classic paid access port; without the port, not paid. */
export function freePlanReadersFor(deps: Pick<EquipeModuleDeps, "uow" | "hasClassicPaidAccess">): FreePlanReaders {
  return {
    readAccounts: accountsFromRepository(deps.uow.repos.accounts),
    hasActivePaidAccess: deps.hasClassicPaidAccess ?? (async () => false),
  };
}

/**
 * Whether the free plan's limits bind an account (spec 2026-10-07 §3): the lifetime AI cap and its diagnosis reserve, the
 * plan card and the refused attachments. Only a `free` account, and only while its workspace does not pay: a paid account
 * of any brand of the workspace, or a classic paid access, lifts them, as both lift the classic gates
 * (`findFreePlanAccount`). What a free account may DO (its commands and task kinds) is its status, not this.
 */
export async function freePlanLimitsApply(
  account: Pick<EquipeAccount, "status"> | null | undefined,
  workspaceId: string,
  readers: FreePlanReaders,
): Promise<boolean> {
  if (account?.status !== "free") return false;
  const accounts = await readers.readAccounts(workspaceId);
  if (accounts.some((entry) => PAID_STATUS.has(entry.status))) return false;
  return !(await readers.hasActivePaidAccess(workspaceId));
}

/** The same rule for one account of the module, read through its repositories. */
export async function accountOnFreePlan(
  deps: Pick<EquipeModuleDeps, "uow" | "hasClassicPaidAccess">,
  scope: { workspaceId: string; accountId: string },
): Promise<boolean> {
  const account = await deps.uow.repos.accounts.get(scope.workspaceId, scope.accountId);
  return freePlanLimitsApply(account, scope.workspaceId, freePlanReadersFor(deps));
}
