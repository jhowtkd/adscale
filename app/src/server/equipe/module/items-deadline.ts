// Item limits (#545): expire_item_deadline (system job) moves undecided,
// adjusting and held items to "perdeu a janela" once the item limit
// (scheduled time − 2 h) passes — silence never approves — and
// propose_new_schedule (agent) brings a missed item back to decision with
// a new time, which is a new version since time is in the hash.

import { z } from "zod";
import { actorId, err, markWindowMissed, ok, proposeNewSchedule, type Result } from "../domain";
import type { EquipeModuleDeps } from "./ports";
import { expireItemDeadlinePayloadSchema, proposeNewSchedulePayloadSchema } from "./envelope";
import {
  appendEvent,
  loadAccountOrError,
  requestNotification,
  scopeOf,
  transact,
  type CommandSuccess,
  type TxBase,
} from "./shared";
import {
  AGENT_WORK_REQUESTED_EVENT,
  destinationFromEvents,
  domainStateOf,
  fromDomainItemStatus,
  ITEM_RESCHEDULED_EVENT,
  ITEM_WINDOW_MISSED_EVENT,
  itemDeadlineFor,
  itemVersionHash,
  loadItemOrError,
  versionContentOf,
} from "./item-shared";

export type ExpireItemDeadlinePayload = z.infer<typeof expireItemDeadlinePayloadSchema>;
export type ProposeNewSchedulePayload = z.infer<typeof proposeNewSchedulePayloadSchema>;

/**
 * At the item limit, undecided/adjusting/held items miss their window and
 * nothing is published. Already-decided items are a no-op — a timeout path
 * never approves anything.
 */
export async function runExpireItemDeadline(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ExpireItemDeadlinePayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const loaded = await loadItemOrError(ctx, payload.itemId);
    if (!loaded.ok) return loaded;
    const scope = scopeOf(ctx);
    const item = loaded.value;
    const receipts = await ctx.repos.receipts.listByObject(scope, "item", item.id);
    const state = domainStateOf(item, receipts);
    if (!state.ok) return state;
    const expirable =
      state.value.status === "awaiting_approval" ||
      state.value.status === "adjusting" ||
      state.value.status === "held";
    if (!expirable) {
      return ok({ itemId: item.id, expired: false, status: item.status });
    }
    const limit = item.deadlineAt ?? (item.scheduledFor ? itemDeadlineFor(item.scheduledFor) : null);
    if (!limit) {
      return err("no_deadline", `item ${item.id} has no scheduled time`);
    }
    if (ctx.now < limit) {
      return err("deadline_not_reached", `item ${item.id} is still decidable until ${limit.toISOString()}`);
    }
    const decided = markWindowMissed(state.value);
    if (!decided.ok) return decided;
    await ctx.repos.items.update(scope, item.id, {
      status: fromDomainItemStatus(decided.value.state.status),
    });
    await appendEvent(ctx, {
      eventType: ITEM_WINDOW_MISSED_EVENT,
      objectType: "item",
      objectId: item.id,
      payload: { scheduledFor: item.scheduledFor?.toISOString() ?? null },
    });
    await appendEvent(ctx, {
      eventType: AGENT_WORK_REQUESTED_EVENT,
      objectType: "item",
      objectId: item.id,
      payload: { kind: "reschedule_proposal" },
    });
    await requestNotification(ctx, {
      recipientRole: "approver",
      templateKey: "item.window_missed",
      detail: { itemId: item.id },
    });
    return ok({ itemId: item.id, expired: true });
  });
}

/**
 * The agent proposes a new time for a missed item: a new version (new hash)
 * goes back to decision, and the client approves the item at the new time.
 */
export async function runProposeNewSchedule(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ProposeNewSchedulePayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const loaded = await loadItemOrError(ctx, payload.itemId);
    if (!loaded.ok) return loaded;
    const scope = scopeOf(ctx);
    const item = loaded.value;
    if (!item.currentVersionHash) {
      return err("invalid_transition", `item ${item.id} has no current version`);
    }
    if (payload.scheduledFor <= ctx.now) {
      return err("invalid_schedule", "the new time must be in the future");
    }
    const current = await ctx.repos.itemVersions.getByHash(scope, item.id, item.currentVersionHash);
    if (!current) {
      return err("invalid_transition", `item ${item.id} has no current version`);
    }
    const itemEvents = await ctx.repos.events.list(scope, { objectType: "item", objectId: item.id });
    const destination = destinationFromEvents(itemEvents);
    if (!destination) {
      return err("invalid_transition", `item ${item.id} has no recorded destination account`);
    }
    const receipts = await ctx.repos.receipts.listByObject(scope, "item", item.id);
    const state = domainStateOf(item, receipts);
    if (!state.ok) return state;
    const decided = proposeNewSchedule(state.value);
    if (!decided.ok) return decided;
    const versionHash = itemVersionHash({
      ...versionContentOf(current, destination),
      scheduledFor: payload.scheduledFor,
    });
    await ctx.repos.itemVersions.create(scope, {
      itemId: item.id,
      versionHash,
      creativeWorkOutputId: current.creativeWorkOutputId,
      caption: current.caption,
      scheduledFor: payload.scheduledFor,
      authorRole: "agent",
      authorId: actorId(ctx.actor),
      reviewerFindings: null,
    });
    await ctx.repos.items.update(scope, item.id, {
      status: fromDomainItemStatus(decided.value.state.status),
      currentVersionHash: versionHash,
      scheduledFor: payload.scheduledFor,
      deadlineAt: itemDeadlineFor(payload.scheduledFor),
    });
    await appendEvent(ctx, {
      eventType: ITEM_RESCHEDULED_EVENT,
      objectType: "item",
      objectId: item.id,
      payload: {
        versionHash,
        previousVersionHash: item.currentVersionHash,
        destinationAccount: destination,
        scheduledFor: payload.scheduledFor.toISOString(),
      },
    });
    await requestNotification(ctx, {
      recipientRole: "approver",
      templateKey: "item.rescheduled",
      detail: { itemId: item.id, versionHash },
    });
    return ok({ itemId: item.id, versionHash, scheduledFor: payload.scheduledFor });
  });
}
