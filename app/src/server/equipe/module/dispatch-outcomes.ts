// dispatch_publication outcomes (#548): the terminal writers every send
// phase funnels through (failed / verifying / published), plus the shared
// row helpers and the publish-attempt record that makes crash recovery
// safe: a retry that finds an attempt for the stored container goes to
// `verifying` instead of publishing again — never a blind re-publish.

import {
  confirmPublished,
  err,
  markDispatchFailed,
  markDispatchUncertain,
  ok,
  type ItemState,
  type Result,
} from "../domain";
import type { EquipeConnection, EquipeItem, EquipePublicationIntent } from "../data";
import { PUBLISHER_CONNECTION_EXPIRED, PUBLISHER_CONNECTION_REVOKED } from "./ports";
import {
  appendEvent,
  requestNotification,
  scopeOf,
  writeReceipt,
  type CommandContext,
} from "./shared";
import { applyPauseInternal } from "./pauses-apply";
import { instagramFailureMessage } from "../publishing/connection-errors";

export const ITEM_DISPATCH_STARTED_EVENT = "item.dispatch_started";
export const ITEM_CONTAINER_CREATED_EVENT = "item.container_created";
/**
 * Recorded in its own transaction BEFORE the publish call, with the
 * container id in the payload (`occurredAt` is the attempt time). A retry
 * that finds this event for the stored container moves the item to
 * `verifying` and lets reconcile resolve it — the publish call itself is
 * never repeated for that container.
 */
export const ITEM_PUBLISH_ATTEMPTED_EVENT = "item.publish_attempted";
export const ITEM_UNCERTAIN_EVENT = "item.uncertain";
export const ITEM_PUBLISHED_EVENT = "item.published";
export const ITEM_DISPATCH_FAILED_EVENT = "item.dispatch_failed";

export function providerOf(destination: string | null): string | null {
  if (!destination) return null;
  const provider = destination.split(":")[0];
  return provider ? provider : null;
}

export function itemStateOf(item: EquipeItem): Result<ItemState> {
  if (!item.currentVersionHash) {
    return err("invalid_transition", `item ${item.id} has no current version`);
  }
  return ok({
    status: item.status as ItemState["status"],
    currentVersion: item.currentVersionHash,
    approvedVersion: null,
  });
}

/** True when a publish attempt was already recorded for this container. */
export async function hasPublishAttemptFor(
  ctx: CommandContext,
  itemId: string,
  containerId: string,
): Promise<boolean> {
  const events = await ctx.repos.events.list(scopeOf(ctx), {
    objectType: "item",
    objectId: itemId,
  });
  return events.some(
    (event) =>
      event.eventType === ITEM_PUBLISH_ATTEMPTED_EVENT &&
      (event.payload as { containerId?: unknown } | null)?.containerId === containerId,
  );
}

export type FailedOutcomeInput = {
  code: string;
  error: string;
  step: "gate" | "create" | "publish";
  /** Stored connection at send time, for auth-failure flips. */
  connection: EquipeConnection | null;
};

function isAuthFailure(code: string): boolean {
  return code === PUBLISHER_CONNECTION_EXPIRED || code === PUBLISHER_CONNECTION_REVOKED;
}

/**
 * Terminal send failure: the item failed, the intent failed, and an
 * expired/revoked token also flips the stored connection and pauses the
 * account's publications through the #547 machinery (other scheduled items
 * hold instead of failing one by one).
 */
export async function writeFailedOutcome(
  ctx: CommandContext,
  item: EquipeItem,
  intent: EquipePublicationIntent,
  input: FailedOutcomeInput,
): Promise<Result<{ connectionId: string | null; pauseCreated: boolean }>> {
  const scope = scopeOf(ctx);
  const state = itemStateOf(item);
  if (!state.ok) return state;
  if (state.value.status !== "sending") {
    return err("invalid_transition", `cannot fail dispatch from ${state.value.status}`);
  }
  const decided = markDispatchFailed(state.value, input.code);
  if (!decided.ok) return decided;
  await ctx.repos.items.update(scope, item.id, { status: decided.value.state.status });
  await ctx.repos.intents.update(scope, intent.id, { status: "failed", lastError: input.error });
  let connectionId: string | null = null;
  let pauseCreated = false;
  if (isAuthFailure(input.code) && input.connection) {
    const stored = await ctx.repos.connections.get(scope, input.connection.id);
    if (stored) {
      const custodian = stored.custodianPersonId
        ? await ctx.repos.people.get(scope, stored.custodianPersonId)
        : null;
      const message = instagramFailureMessage(input.code, custodian?.name ?? null);
      await ctx.repos.connections.update(scope, stored.id, {
        status: input.code === PUBLISHER_CONNECTION_EXPIRED ? "expired" : "revoked",
        lastError: message,
      });
      connectionId = stored.id;
      const paused = await applyPauseInternal(ctx, {
        origin: "connection",
        scope: "account",
        reason: message,
        connectionId: stored.id,
      });
      if (!paused.ok) return paused;
      pauseCreated = paused.value.created;
      await requestNotification(ctx, {
        recipientRole: "custodian",
        templateKey: input.code === PUBLISHER_CONNECTION_EXPIRED ? "connection.expired" : "connection.revoked",
        detail: { connectionId: stored.id, itemId: item.id, message },
      });
    }
  }
  await appendEvent(ctx, {
    eventType: ITEM_DISPATCH_FAILED_EVENT,
    objectType: "item",
    objectId: item.id,
    payload: {
      step: input.step,
      code: input.code,
      error: input.error,
      connectionId,
      pauseCreated,
    },
  });
  await requestNotification(ctx, {
    recipientRole: "approver",
    templateKey: "item.failed",
    detail: { itemId: item.id, code: input.code },
  });
  return ok({ connectionId, pauseCreated });
}

export async function writeUncertainOutcome(
  ctx: CommandContext,
  item: EquipeItem,
  intent: EquipePublicationIntent,
  input: { step: "create" | "publish"; containerId: string | null; error: string },
): Promise<Result<void>> {
  const scope = scopeOf(ctx);
  if (item.status === "verifying") return ok(undefined);
  const state = itemStateOf(item);
  if (!state.ok) return state;
  const decided = markDispatchUncertain(state.value);
  if (!decided.ok) return decided;
  await ctx.repos.items.update(scope, item.id, { status: decided.value.state.status });
  await ctx.repos.intents.update(scope, intent.id, {
    status: "verifying",
    ...(input.containerId ? { containerId: input.containerId } : {}),
    lastError: input.error,
  });
  await appendEvent(ctx, {
    eventType: ITEM_UNCERTAIN_EVENT,
    objectType: "item",
    objectId: item.id,
    payload: { step: input.step, containerId: input.containerId, error: input.error },
  });
  await requestNotification(ctx, {
    recipientRole: "strategist",
    templateKey: "item.verifying",
    detail: { itemId: item.id, step: input.step },
  });
  return ok(undefined);
}

export async function writePublishedOutcome(
  ctx: CommandContext,
  item: EquipeItem,
  intent: EquipePublicationIntent,
  input: { externalId: string; permalink?: string; containerId: string | null; versionHash: string; via?: "reconcile" },
): Promise<Result<void>> {
  const scope = scopeOf(ctx);
  const state = itemStateOf(item);
  if (!state.ok) return state;
  const decided = confirmPublished(state.value, input.externalId);
  if (!decided.ok) return decided;
  await ctx.repos.items.update(scope, item.id, { status: decided.value.state.status });
  await ctx.repos.intents.update(scope, intent.id, {
    status: "published",
    externalId: input.externalId,
    publishedAt: ctx.now,
  });
  // Receipts are immutable, so the send result lands on a second receipt
  // for the same object+version — the "recibo guarda o resultado".
  const receipt = await writeReceipt(ctx, {
    objectType: "item",
    objectId: item.id,
    objectVersion: input.versionHash,
    action: "dispatch_publication",
    detail: {
      externalId: input.externalId,
      containerId: input.containerId,
      permalink: input.permalink ?? null,
      destinationIgUserId: intent.destinationIgUserId,
      ...(input.via ? { via: input.via } : {}),
    },
  });
  await appendEvent(ctx, {
    eventType: ITEM_PUBLISHED_EVENT,
    objectType: "item",
    objectId: item.id,
    payload: {
      externalId: input.externalId,
      containerId: input.containerId,
      permalink: input.permalink ?? null,
      destinationIgUserId: intent.destinationIgUserId,
      ...(input.via ? { via: input.via } : {}),
      receiptId: receipt.id,
    },
  });
  await requestNotification(ctx, {
    recipientRole: "approver",
    templateKey: "item.published",
    detail: { itemId: item.id, externalId: input.externalId, permalink: input.permalink ?? null },
  });
  await requestNotification(ctx, {
    recipientRole: "strategist",
    templateKey: "item.published",
    detail: { itemId: item.id, externalId: input.externalId },
  });
  return ok(undefined);
}

export async function loadIntentItemOrError(
  ctx: CommandContext,
  intentId: string,
): Promise<Result<{ intent: EquipePublicationIntent; item: EquipeItem }>> {
  const scope = scopeOf(ctx);
  const intent = await ctx.repos.intents.get(scope, intentId);
  if (!intent) return err("unknown_intent", `unknown intent ${intentId}`);
  const item = await ctx.repos.items.get(scope, intent.itemId);
  if (!item) return err("unknown_item", `unknown item ${intent.itemId}`);
  return ok({ intent, item });
}
