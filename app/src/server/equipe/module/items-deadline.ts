// Item limits (#545): expire_item_deadline (system job) moves undecided,
// adjusting and held items to "perdeu a janela" once the item limit
// (scheduled time − 2 h) passes — silence never approves — and
// propose_new_schedule (agent) brings a missed item back to decision with
// a new time, which is a new version since time is in the hash.

import { z } from "zod";
import { actorId, err, markWindowMissed, ok, proposeNewSchedule, type Result } from "../domain";
import type { EquipeModuleDeps } from "./ports";
import { expireItemDeadlinePayloadSchema, proposeNewSchedulePayloadSchema } from "./envelope";
import { instagramIdentityOf, INSTAGRAM_DESTINATION_CHANGED } from "./instagram-destination";
import {
  appendEvent,
  loadAccountOrError,
  requestNotification,
  scopeOf,
  transact,
  type CommandContext,
  type CommandSuccess,
  type TxBase,
} from "./shared";
import {
  AGENT_WORK_REQUESTED_EVENT,
  domainStateOf,
  ITEM_RESCHEDULED_EVENT,
  ITEM_WINDOW_MISSED_EVENT,
  itemDeadlineFor,
  itemVersionHash,
  loadItemOrError,
  storedDestinationOf,
  versionContentOf,
  voidIntentForVersion,
  resolveItemReview,
  versionFindings,
} from "./item-shared";

export type ExpireItemDeadlinePayload = z.infer<typeof expireItemDeadlinePayloadSchema>;
export type ProposeNewSchedulePayload = z.infer<typeof proposeNewSchedulePayloadSchema>;

/**
 * Expire one item inside the caller's transaction. Shared by the single
 * command and the #549 deadlines sweep: already-decided items are a no-op
 * — a timeout path never approves anything.
 */
export async function expireItemDeadlineInTx(
  ctx: CommandContext,
  itemId: string,
): Promise<Result<Record<string, unknown>>> {
  const loaded = await loadItemOrError(ctx, itemId);
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
    status: decided.value.state.status,
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
    payload: { kind: "reschedule_proposal", versionHash: item.currentVersionHash },
  });
  await requestNotification(ctx, {
    recipientRole: "approver",
    templateKey: "item.window_missed",
    detail: { itemId: item.id },
  });
  return ok({ itemId: item.id, expired: true });
}

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
    return expireItemDeadlineInTx(ctx, payload.itemId);
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
  return transact(deps, base, (ctx) => proposeNewScheduleInTx(ctx, payload));
}

export async function proposeNewScheduleInTx(ctx: CommandContext, payload: ProposeNewSchedulePayload): Promise<Result<Record<string, unknown>>> {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const loaded = await loadItemOrError(ctx, payload.itemId, true);
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
    let destination = storedDestinationOf(item, current);
    let destinationIgUserId = current.destinationIgUserId;
    const oldIntent = await ctx.repos.intents.getByItemVersion(scope, item.id, item.currentVersionHash);
    const destinationChanged = oldIntent?.lastError === INSTAGRAM_DESTINATION_CHANGED;
    if (item.status === "held" && !destinationChanged) {
      return err("invalid_transition", "item segurado por outro motivo; retome a pausa antes de reagendar");
    }
    if (destinationChanged) {
      const connection = (await ctx.repos.connections.list(scope)).find((row) => row.provider === "instagram");
      const identity = connection?.status === "active" ? instagramIdentityOf(connection) : null;
      if (!identity) return err("connection_missing", "conecte o Instagram antes de propor a nova versão");
      destinationIgUserId = identity.igUserId;
      destination = `instagram:${identity.igUsername ? `@${identity.igUsername}` : identity.igUserId}`;
    }
    if (!destination) {
      return err("invalid_transition", `item ${item.id} has no recorded destination account`);
    }
    const receipts = await ctx.repos.receipts.listByObject(scope, "item", item.id);
    const state = domainStateOf(item, receipts);
    if (!state.ok) return state;
    const decided = proposeNewSchedule(state.value);
    if (!decided.ok) return decided;
    // Moving a date must not erase a pending review or a content blocker.
    const itemEvents = await ctx.repos.events.list(scope, { objectType: "item", objectId: item.id });
    const review = resolveItemReview({ item, currentVersion: current, itemEvents });
    const findings = versionFindings(current, itemEvents);
    const needsReview = review.flags.editedInReview;
    const pendingAdjustment = itemEvents.findLast((event) => event.eventType === AGENT_WORK_REQUESTED_EVENT &&
      (event.payload as { kind?: string; versionHash?: string } | null)?.kind === "adjustment" &&
      (event.payload as { versionHash?: string }).versionHash === item.currentVersionHash);
    const versionHash = itemVersionHash({
      ...versionContentOf(current, destination),
      destinationIgUserId,
      scheduledFor: payload.scheduledFor,
    });
    if (versionHash === item.currentVersionHash) return err("no_change", "a nova versão precisa alterar destino ou horário");
    await ctx.repos.itemVersions.create(scope, {
      itemId: item.id,
      versionHash,
      creativeWorkOutputId: current.creativeWorkOutputId,
      caption: current.caption,
      scheduledFor: payload.scheduledFor,
      destination,
      destinationIgUserId,
      authorRole: "agent",
      authorId: actorId(ctx.actor),
      reviewerFindings: { ...findings,
        blocked: findings.blocked === true || review.triage?.path === "block_and_escalate" || review.triage?.path === "update_catalog_only",
        needsConfirmation: review.flags.needsConfirmation,
        warnings: review.triage?.warnings ?? findings.warnings ?? [],
      },
    });
    await ctx.repos.items.update(scope, item.id, {
      status: needsReview || pendingAdjustment ? "adjusting" : decided.value.state.status,
      destination,
      currentVersionHash: versionHash,
      scheduledFor: payload.scheduledFor,
      deadlineAt: itemDeadlineFor(payload.scheduledFor),
    });
    await voidIntentForVersion(ctx, item.id, item.currentVersionHash);
    await appendEvent(ctx, {
      eventType: ITEM_RESCHEDULED_EVENT,
      objectType: "item",
      objectId: item.id,
      payload: {
        versionHash,
        previousVersionHash: item.currentVersionHash,
        destinationAccount: destination,
        scheduledFor: payload.scheduledFor.toISOString(),
        needsReview,
      },
    });
    if (needsReview) {
      const reviewVisual = itemEvents.some((event) => event.eventType === AGENT_WORK_REQUESTED_EVENT &&
        (event.payload as { versionHash?: string; reviewVisual?: boolean } | null)?.versionHash === item.currentVersionHash &&
        (event.payload as { reviewVisual?: boolean }).reviewVisual === true);
      await appendEvent(ctx, { eventType: AGENT_WORK_REQUESTED_EVENT, objectType: "item", objectId: item.id,
        payload: { kind: "caption_revalidation", versionHash, ...(reviewVisual ? { reviewVisual: true } : {}) } });
    }
    if (pendingAdjustment) {
      await appendEvent(ctx, { eventType: AGENT_WORK_REQUESTED_EVENT, objectType: "item", objectId: item.id,
        payload: { ...(pendingAdjustment.payload as Record<string, unknown>), versionHash } });
    }
    await requestNotification(ctx, {
      recipientRole: "approver",
      templateKey: "item.rescheduled",
      detail: { itemId: item.id, versionHash },
    });
    return ok({ itemId: item.id, versionHash, scheduledFor: payload.scheduledFor });
}
