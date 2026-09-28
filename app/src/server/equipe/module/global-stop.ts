// Parada global de publicações (#583): parar/retomar TUDO sem deploy.
//
// Source of truth: ONE platform-wide `equipe_global_stops` row (migration
// 0124), read by the dispatch gate for EVERY account — including accounts
// opened while the stop is active, which need no row of their own. The
// per-account `global_stop` pause rows are gone (see pauses-apply): the
// fan-out below writes only item holds + audit events + notifications per
// account, never pause rows, so there is a single place that says "stopped".
//
// Both commands are operations-only with a required reason, and both run
// without an account in context (like open_account): the staff route sends
// no accountId, and the workspace gate is skipped — this is a platform
// switch, one level below EQUIPE_PUBLISH_ENABLED (which stays on top: the
// dispatch gate checks the env kill switch first, then the global stop).
//
// Closed accounts are skipped: nothing may move there anymore.

import { z } from "zod";
import { actorId, err, holdItem, ok, type Result } from "../domain";
import {
  EquipeConflictError,
  type EquipeItem,
  type EquipePause,
  type InternalEquipeRepositories,
} from "../data";
import type { EquipeModuleDeps } from "./ports";
import {
  resumeAllPublicationsPayloadSchema,
  stopAllPublicationsPayloadSchema,
} from "./envelope";
import {
  appendEvent,
  requestNotification,
  scopeOf,
  transact,
  type CommandContext,
  type CommandSuccess,
  type TxBase,
} from "./shared";
import { ITEM_HELD_EVENT } from "./pauses-apply";
import { revalidateHeldItem } from "./pauses-resume";

export type StopAllPublicationsPayload = z.infer<typeof stopAllPublicationsPayloadSchema>;
export type ResumeAllPublicationsPayload = z.infer<typeof resumeAllPublicationsPayloadSchema>;

/** Held reason every item carries while the global stop covers it. */
export const GLOBAL_STOP_HOLD_REASON = "parada global";

export const GLOBAL_STOP_APPLIED_EVENT = "global_stop.applied";
export const GLOBAL_STOP_LIFTED_EVENT = "global_stop.lifted";

/** #549 recipient roles: operations queue + founder (platform-owner allowlist). */
const GLOBAL_STOP_NOTIFY_ROLES = ["operations", "founder"] as const;

function coversItem(pause: EquipePause, item: EquipeItem): boolean {
  if (pause.status !== "active") return false;
  if (pause.scope === "front") return pause.frontId === item.frontId;
  return true;
}

/**
 * Hold this account's scheduled items under the global stop: items go to
 * held and their pending intents are held, each with an `item.held` event
 * carrying the "parada global" reason. Awaiting items keep their state —
 * production, review and approval continue, exactly like other pauses.
 */
async function holdScheduledItemsForGlobalStop(ctx: CommandContext): Promise<string[]> {
  const scope = scopeOf(ctx);
  const items = await ctx.repos.items.list(scope);
  const held: string[] = [];
  for (const item of items) {
    if (item.status !== "scheduled") continue;
    const decided = holdItem(
      { status: "scheduled", currentVersion: item.currentVersionHash ?? "", approvedVersion: null },
      GLOBAL_STOP_HOLD_REASON,
    );
    if (!decided.ok) continue;
    await ctx.repos.items.update(scope, item.id, { status: decided.value.state.status });
    const intents = await ctx.repos.intents.list(scope, { itemId: item.id, status: "pending" });
    for (const intent of intents) {
      await ctx.repos.intents.update(scope, intent.id, { status: "held" });
    }
    await appendEvent(ctx, {
      eventType: ITEM_HELD_EVENT,
      objectType: "item",
      objectId: item.id,
      payload: {
        reason: GLOBAL_STOP_HOLD_REASON,
        reasons: [GLOBAL_STOP_HOLD_REASON],
        heldIntentIds: intents.map((intent) => intent.id),
      },
    });
    held.push(item.id);
  }
  return held;
}

async function notifyGlobalStop(
  ctx: CommandContext,
  templateKey: string,
  detail: Record<string, unknown>,
): Promise<void> {
  for (const recipientRole of GLOBAL_STOP_NOTIFY_ROLES) {
    await requestNotification(ctx, { recipientRole, templateKey, detail });
  }
}

export type ApplyGlobalStopResult = {
  stopId: string;
  /** False when a stop was already active: the call was a no-op. */
  created: boolean;
  stoppedAccounts: string[];
  heldByAccount: Record<string, string[]>;
};

/**
 * Stop fan-out inside the caller's transaction: one global row + every
 * non-closed account's scheduled items held with "parada global", audit
 * event + operations/founder notifications per account. Idempotent: when a
 * stop is already active it is a no-op returning the existing stop id.
 * Restores the caller's workspace/account scope before returning.
 */
export async function applyGlobalStopInternal(
  ctx: CommandContext,
  input: { reason: string; escalationId?: string },
): Promise<ApplyGlobalStopResult> {
  const already = await ctx.internal.globalStops.getActive();
  if (already) {
    return { stopId: already.id, created: false, stoppedAccounts: [], heldByAccount: {} };
  }
  let stop;
  try {
    stop = await ctx.internal.globalStops.create({
      reason: input.reason,
      stoppedBy: actorId(ctx.actor),
      stoppedAt: ctx.now,
    });
  } catch (error) {
    // Lost a concurrent stop: the winner's row is the stop.
    if (error instanceof EquipeConflictError) {
      const winner = await ctx.internal.globalStops.getActive();
      if (winner) {
        return { stopId: winner.id, created: false, stoppedAccounts: [], heldByAccount: {} };
      }
    }
    throw error;
  }
  const callerWorkspaceId = ctx.workspaceId;
  const callerAccountId = ctx.accountId;
  const accounts = (await ctx.internal.listAccounts()).filter(
    (account) => account.status !== "closed",
  );
  const heldByAccount: Record<string, string[]> = {};
  for (const account of accounts) {
    ctx.workspaceId = account.workspaceId;
    ctx.accountId = account.id;
    const heldItemIds = await holdScheduledItemsForGlobalStop(ctx);
    await appendEvent(ctx, {
      eventType: GLOBAL_STOP_APPLIED_EVENT,
      objectType: "global_stop",
      objectId: stop.id,
      payload: {
        reason: input.reason,
        heldItemIds,
        ...(input.escalationId ? { escalationId: input.escalationId } : {}),
      },
    });
    await notifyGlobalStop(ctx, "global_stop.applied", {
      stopId: stop.id,
      heldItemIds,
      ...(input.escalationId ? { escalationId: input.escalationId } : {}),
    });
    heldByAccount[account.id] = heldItemIds;
  }
  ctx.workspaceId = callerWorkspaceId;
  ctx.accountId = callerAccountId;
  return {
    stopId: stop.id,
    created: true,
    stoppedAccounts: accounts.map((account) => account.id),
    heldByAccount,
  };
}

/**
 * Operations halt publications everywhere: one global row + every
 * non-closed account's scheduled items held with "parada global". Each
 * account records the audit event and notifies operations and the founder.
 * A second stop refuses — only the escalation path is idempotent.
 */
export async function runStopAllPublications(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: StopAllPublicationsPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const already = await ctx.internal.globalStops.getActive();
    if (already) {
      return err("global_stop_already_active", "publications are already stopped globally");
    }
    const applied = await applyGlobalStopInternal(ctx, { reason: payload.reason });
    if (!applied.created) {
      // Lost a concurrent stop: same domain error as the check above.
      return err("global_stop_already_active", "publications are already stopped globally");
    }
    return ok({
      stopId: applied.stopId,
      stoppedAccounts: applied.stoppedAccounts,
      heldByAccount: applied.heldByAccount,
    });
  });
}

export type ResumeAllDeferred = { accountId: string; itemId: string; reasons: string[] };

/**
 * Operations resume publications everywhere: the global row is lifted,
 * then every non-closed account revalidates its held items with the SAME
 * rules as other pauses (future time, window, approval of the current
 * version, offer, connection, no other block). Items still covered by
 * another pause stay held; each account records the audit event and
 * notifies operations and the founder.
 */
export async function runResumeAllPublications(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ResumeAllPublicationsPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const active = await ctx.internal.globalStops.getActive();
    if (!active) {
      return err("global_stop_not_active", "no global publication stop is active");
    }
    await ctx.internal.globalStops.update(active.id, {
      status: "lifted",
      liftedAt: ctx.now,
      liftedBy: actorId(ctx.actor),
      liftReason: payload.reason,
    });
    const accounts = (await ctx.internal.listAccounts()).filter(
      (account) => account.status !== "closed",
    );
    const resumed: string[] = [];
    const missed: string[] = [];
    const deferred: ResumeAllDeferred[] = [];
    for (const account of accounts) {
      ctx.workspaceId = account.workspaceId;
      ctx.accountId = account.id;
      const scope = scopeOf(ctx);
      const remaining = (await ctx.repos.pauses.list(scope)).filter(
        (row) => row.status === "active",
      );
      const held = (await ctx.repos.items.list(scope, { status: "held" })).filter(
        (item) => !remaining.some((other) => coversItem(other, item)),
      );
      const accountResumed: string[] = [];
      const accountMissed: string[] = [];
      const accountDeferred: Array<{ itemId: string; reasons: string[] }> = [];
      for (const item of held) {
        const outcome = await revalidateHeldItem(ctx, item);
        if (!outcome.ok) return outcome;
        if (outcome.value.result === "resumed") {
          resumed.push(item.id);
          accountResumed.push(item.id);
        } else if (outcome.value.result === "missed_window") {
          missed.push(item.id);
          accountMissed.push(item.id);
        } else {
          deferred.push({ accountId: account.id, itemId: item.id, reasons: outcome.value.reasons });
          accountDeferred.push({ itemId: item.id, reasons: outcome.value.reasons });
        }
      }
      await appendEvent(ctx, {
        eventType: GLOBAL_STOP_LIFTED_EVENT,
        objectType: "global_stop",
        objectId: active.id,
        payload: {
          reason: payload.reason,
          resumed: accountResumed,
          missed: accountMissed,
          deferred: accountDeferred.map((d) => d.itemId),
        },
      });
      await notifyGlobalStop(ctx, "global_stop.lifted", {
        stopId: active.id,
        resumed: accountResumed,
        missed: accountMissed,
        deferred: accountDeferred.map((d) => d.itemId),
      });
    }
    ctx.workspaceId = base.workspaceId;
    ctx.accountId = base.accountId;
    return ok({
      stopId: active.id,
      resumedAccounts: accounts.map((account) => account.id),
      resumed,
      missed,
      deferred,
    });
  });
}

export type GlobalStopState =
  | { active: false }
  | {
      active: true;
      stopId: string;
      reason: string;
      stoppedBy: string;
      stoppedByName: string | null;
      stoppedAt: Date;
    };

/** What the internal consoles show: active or not, plus who/when/reason. */
export async function getGlobalStopState(
  internal: InternalEquipeRepositories,
): Promise<GlobalStopState> {
  const active = await internal.globalStops.getActive();
  if (!active) return { active: false };
  const staff = await internal.staff.get(active.stoppedBy);
  return {
    active: true,
    stopId: active.id,
    reason: active.reason,
    stoppedBy: active.stoppedBy,
    stoppedByName: staff?.displayName ?? null,
    stoppedAt: active.stoppedAt,
  };
}
