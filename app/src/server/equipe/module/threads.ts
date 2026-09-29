// Conversation map (#551): which assistant conversations belong to the
// Equipe. The map is the `equipe_threads` table — one primary thread plus
// parallel threads by topic per account. The assistant tables never change.
//
// `ensure_primary_thread` is idempotent (find-or-create the primary);
// `open_parallel_thread` opens one parallel conversation per call. An
// assistant thread maps to at most one entry: rebinding a conversation
// would orphan its history, so mismatches fail with `thread_conflict`.

import { z } from "zod";
import { err, ok, type Result } from "../domain";
import type { EquipeAccount, EquipeRepositories, EquipeThread } from "../data";
import type { EquipeModuleDeps } from "./ports";
import { ensurePrimaryThreadPayloadSchema, openParallelThreadPayloadSchema } from "./envelope";
import {
  appendEvent,
  loadAccountOrError,
  scopeOf,
  transact,
  type CommandContext,
  type CommandSuccess,
  type TxBase,
} from "./shared";

export const PRIMARY_THREAD_ENSURED_EVENT = "thread.primary_ensured";
export const PARALLEL_THREAD_OPENED_EVENT = "thread.parallel_opened";

export type EnsurePrimaryThreadPayload = z.infer<typeof ensurePrimaryThreadPayloadSchema>;
export type OpenParallelThreadPayload = z.infer<typeof openParallelThreadPayloadSchema>;

/**
 * Idempotent: returns the primary thread, creating it when the account has
 * none. A primary bound to another assistant thread is a conflict — the
 * main conversation is never rebound silently.
 */
export async function runEnsurePrimaryThread(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: EnsurePrimaryThreadPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, (ctx) => ensurePrimaryThreadInTx(ctx, payload.assistantThreadId));
}

export async function ensurePrimaryThreadInTx(
  ctx: CommandContext,
  assistantThreadId?: string,
): Promise<Result<Record<string, unknown>>> {
  const account = await ctx.repos.accounts.get(ctx.workspaceId, ctx.accountId, { forUpdate: true });
  if (!account) return err("unknown_account", "unknown account");
  const scope = scopeOf(ctx);
  const existing = await ctx.repos.threads.list(scope);
  const primary = existing.find((row) => row.kind === "primary");
  if (primary?.assistantThreadId && assistantThreadId && primary.assistantThreadId !== assistantThreadId) {
    return err("thread_conflict", "account already has a primary conversation");
  }
  const targetId = assistantThreadId ?? primary?.assistantThreadId;
  const thread = targetId
    ? await ctx.repos.conversations.get(ctx.workspaceId, targetId)
    : await ctx.repos.conversations.ensurePrimary(ctx.workspaceId, account.clientProfileId);
  if (!thread || thread.clientProfileId !== account.clientProfileId) {
    return err("thread_conflict", "conversation must belong to the account's workspace and brand");
  }
  if (primary?.assistantThreadId) return ok({ threadId: primary.id, assistantThreadId: thread.id, created: false });
  if (existing.some((row) => row.assistantThreadId === thread.id)) {
    return err("thread_conflict", "conversation is already parallel");
  }
  const created = primary
    ? await ctx.repos.threads.update(scope, primary.id, { assistantThreadId: thread.id })
    : await ctx.repos.threads.create(scope, { kind: "primary", topic: null, assistantThreadId: thread.id });
  await appendEvent(ctx, {
    eventType: PRIMARY_THREAD_ENSURED_EVENT,
    objectType: "thread",
    objectId: created.id,
    payload: { assistantThreadId: thread.id },
  });
  return ok({ threadId: created.id, assistantThreadId: thread.id, created: true });
}

/**
 * Opens a parallel conversation on a topic. The assistant thread must not
 * be mapped already — one conversation, one map entry.
 */
export async function runOpenParallelThread(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: OpenParallelThreadPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    await ctx.repos.accounts.get(ctx.workspaceId, ctx.accountId, { forUpdate: true });
    const thread = await ctx.repos.conversations.get(ctx.workspaceId, payload.assistantThreadId);
    if (!thread || thread.clientProfileId !== account.value.clientProfileId) {
      return err("thread_conflict", "conversation must belong to the account's workspace and brand");
    }
    const scope = scopeOf(ctx);
    const existing = await ctx.repos.threads.list(scope);
    const mapped = existing.find((row) => row.assistantThreadId === payload.assistantThreadId);
    if (mapped) {
      return err(
        "thread_conflict",
        `assistant thread ${payload.assistantThreadId} is already mapped`,
      );
    }
    const created = await ctx.repos.threads.create(scope, {
      kind: "parallel",
      topic: payload.topic,
      assistantThreadId: payload.assistantThreadId,
    });
    await appendEvent(ctx, {
      eventType: PARALLEL_THREAD_OPENED_EVENT,
      objectType: "thread",
      objectId: created.id,
      payload: { assistantThreadId: payload.assistantThreadId, topic: payload.topic },
    });
    return ok({ threadId: created.id, topic: payload.topic });
  });
}

export type EquipeThreadsView = {
  workspaceId: string;
  accountId: string;
  primary: EquipeThread | null;
  parallel: EquipeThread[];
};

/** The account's conversations: primary plus parallel by topic. */
export async function getEquipeThreads(
  repos: EquipeRepositories,
  workspaceId: string,
  accountId: string,
): Promise<EquipeThreadsView | null> {
  const account = await repos.accounts.get(workspaceId, accountId);
  if (!account) return null;
  const rows = await repos.threads.list({ workspaceId, accountId });
  return {
    workspaceId,
    accountId,
    primary: rows.find((row) => row.kind === "primary") ?? null,
    parallel: rows
      .filter((row) => row.kind === "parallel")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
  };
}

export type EquipeThreadMatch = {
  account: EquipeAccount;
  thread: EquipeThread;
};

/**
 * Dispatch lookup: the account owns the client profile, and the map entry
 * pins the assistant thread to it. Null when the conversation is not an
 * Equipe conversation — the chat then keeps its current behavior.
 */
export async function findEquipeThreadByAssistantThread(
  repos: EquipeRepositories,
  workspaceId: string,
  clientProfileId: string,
  assistantThreadId: string,
): Promise<EquipeThreadMatch | null> {
  const account = await repos.accounts.findByClientProfile(workspaceId, clientProfileId);
  if (!account) return null;
  const rows = await repos.threads.list({ workspaceId, accountId: account.id });
  const thread = rows.find((row) => row.assistantThreadId === assistantThreadId) ?? null;
  if (!thread) return null;
  return { account, thread };
}
