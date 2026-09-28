// dispatch_publication (#548): the system dispatch job claimed a due
// intent; this command revalidates the FULL domain publication gate at send
// time and calls the Publisher port. Fail → held (with reasons) or
// missed_window past the item time; never a send.
//
// The publisher is called OUTSIDE transactions, in phases: prepare (gate →
// held/missed/sending), create container, persist the container id, publish,
// outcome (published/verifying/failed). A retry reuses the stored container
// and never creates another; a timeout or ambiguous response goes to
// `verifying` (reconcile owns it from there — never a blind re-publish).
//
// Held intents are releasable by this same command: a held item whose gate
// passes now (kill switch back on, connection restored, window open) goes
// back to scheduled, and the next due dispatch sends it. Pause-held items
// stay held while any covering pause is active, because the gate itself
// refuses them.

import { z } from "zod";
import {
  confirmPublished,
  effectivePauseLevel,
  err,
  evaluatePublicationGate,
  holdItem,
  markDispatchFailed,
  markDispatchUncertain,
  markWindowMissed,
  monthWindow,
  ok,
  resumeHeldItem,
  startDispatch,
  weekWindow,
  type ConnectionState,
  type ItemState,
  type Pause,
  type PublicationSnapshot,
  type Result,
} from "../domain";
import type {
  EquipeConnection,
  EquipeEvent,
  EquipeFront,
  EquipeItem,
  EquipeItemVersion,
  EquipePublicationIntent,
} from "../data";
import type { EquipeModuleDeps, Publisher } from "./ports";
import {
  PUBLISHER_CONNECTION_EXPIRED,
  PUBLISHER_CONNECTION_REVOKED,
  PublisherFailedError,
  PublisherUncertainError,
} from "./ports";
import { dispatchPublicationPayloadSchema } from "./envelope";
import { isEquipePublishEnabled } from "./publish-enabled";
import {
  appendEvent,
  loadAccountOrError,
  requestNotification,
  scopeOf,
  transact,
  writeReceipt,
  type CommandContext,
  type CommandSuccess,
  type TxBase,
} from "./shared";
import {
  AGENT_WORK_REQUESTED_EVENT,
  approvalReceiptFor,
  hasOpenItemEscalation,
  isManualMode,
  ITEM_WINDOW_MISSED_EVENT,
  loadItemReview,
  storedDestinationOf,
  voidIntentForVersion,
  type ItemReview,
} from "./item-shared";
import { applyPauseInternal, ITEM_HELD_EVENT } from "./pauses-apply";
import { domainPauseOf, ITEM_RESUMED_EVENT } from "./pauses-resume";
import { MANUAL_PUBLISH_DECLARED_EVENT } from "./manual-publishing";
import { instagramFailureMessage } from "../publishing/connection-errors";

export type DispatchPublicationPayload = z.infer<typeof dispatchPublicationPayloadSchema>;

export const ITEM_DISPATCH_STARTED_EVENT = "item.dispatch_started";
export const ITEM_CONTAINER_CREATED_EVENT = "item.container_created";
export const ITEM_UNCERTAIN_EVENT = "item.uncertain";
export const ITEM_PUBLISHED_EVENT = "item.published";
export const ITEM_DISPATCH_FAILED_EVENT = "item.dispatch_failed";

/** Hold reasons this command writes (gate reasons or the kill switch). */
export const PUBLISH_DISABLED_HOLD_REASON = "publish_disabled";
export const MANUAL_MODE_HOLD_REASON = "manual_mode";

/**
 * Review blocked without an escalation row still blocks the send — the same
 * rule as the resume revalidation (see pauses-resume.ts). Not a domain gate
 * reason: it names a missing upstream row, not a gate condition.
 */
export const BLOCKING_REVIEW_OPEN_REASON = "blocking_review_open";

// Publish outcomes that count toward the 6/week + 26/month contract limits:
// automatic publishes and the client's manual "publiquei" (confirmation is
// just verification of the same publish, never a second count).
const PUBLISH_COUNT_EVENT_TYPES = [ITEM_PUBLISHED_EVENT, MANUAL_PUBLISH_DECLARED_EVENT];

function providerOf(destination: string | null): string | null {
  if (!destination) return null;
  const provider = destination.split(":")[0];
  return provider ? provider : null;
}

function connectionStateOf(connection: EquipeConnection | null): ConnectionState {
  if (!connection) return "missing";
  if (connection.status === "active") return "verified";
  if (connection.status === "expired" || connection.status === "revoked" || connection.status === "error") {
    return connection.status;
  }
  // Unknown stored state fails closed: nothing is sent on it.
  return "error";
}

function coversItem(pause: { status: string; scope: string; frontId: string | null }, item: EquipeItem): boolean {
  if (pause.status !== "active") return false;
  if (pause.scope === "front") return pause.frontId === item.frontId;
  return true;
}

function itemStateOf(item: EquipeItem): Result<ItemState> {
  if (!item.currentVersionHash) {
    return err("invalid_transition", `item ${item.id} has no current version`);
  }
  return ok({
    status: item.status as ItemState["status"],
    currentVersion: item.currentVersionHash,
    approvedVersion: null,
  });
}

async function countPublishedSince(ctx: CommandContext, since: Date): Promise<number> {
  const scope = scopeOf(ctx);
  const seen = new Set<string>();
  for (const eventType of PUBLISH_COUNT_EVENT_TYPES) {
    const events = await ctx.repos.events.list(scope, { eventType });
    for (const event of events) {
      if (event.objectId && event.occurredAt >= since) seen.add(event.objectId);
    }
  }
  return seen.size;
}

export type DispatchGateBuild = {
  snapshot: PublicationSnapshot;
  review: ItemReview;
  version: EquipeItemVersion;
  front: EquipeFront;
  connection: EquipeConnection | null;
  blockingEscalationOpen: boolean;
};

/** Read the full gate snapshot for an item, failing closed on corrupt data. */
export async function buildDispatchGate(
  ctx: CommandContext,
  item: EquipeItem,
): Promise<Result<DispatchGateBuild>> {
  const scope = scopeOf(ctx);
  if (!item.currentVersionHash) {
    return err("invalid_transition", `item ${item.id} has no current version`);
  }
  const [front, version, mandates, connections, approval, review, pauses, scores] =
    await Promise.all([
      ctx.repos.fronts.get(scope, item.frontId),
      ctx.repos.itemVersions.getByHash(scope, item.id, item.currentVersionHash),
      ctx.repos.mandates.list(scope),
      ctx.repos.connections.list(scope),
      approvalReceiptFor(ctx, item.id, item.currentVersionHash),
      loadItemReview(ctx.repos, scope, item),
      ctx.repos.pauses.list(scope),
      ctx.repos.calibrationScores.list(scope),
    ]);
  if (!front) return err("unknown_front", `unknown front ${item.frontId}`);
  if (!version) return err("unknown_version", `item ${item.id} has no current version row`);
  if (!version.creativeWorkOutputId) {
    return err("item_without_media", `item ${item.id} has no media to publish`);
  }
  const mandateApproved = mandates.some(
    (mandate) =>
      mandate.status === "approved" &&
      !mandate.shadow &&
      (mandate.frontId == null || mandate.frontId === item.frontId) &&
      (!mandate.validFrom || mandate.validFrom <= ctx.now) &&
      (!mandate.validUntil || mandate.validUntil >= ctx.now),
  );
  const provider = providerOf(storedDestinationOf(item, version));
  const connection =
    provider == null ? null : (connections.find((row) => row.provider === provider) ?? null);
  const domainPauses: Pause[] = [];
  for (const row of pauses) {
    if (!coversItem(row, item)) continue;
    const parsed = domainPauseOf(row);
    if (!parsed.ok) return parsed;
    domainPauses.push(parsed.value);
  }
  const blockingEscalationOpen = await hasOpenItemEscalation(ctx.repos, scope, item.id);
  const [publishedThisWeek, publishedThisMonth] = await Promise.all([
    countPublishedSince(ctx, weekWindow(ctx.now).start),
    countPublishedSince(ctx, monthWindow(ctx.now).start),
  ]);
  return ok({
    snapshot: {
      // Manual mode never reaches the gate: prepare() holds manual items
      // before building the snapshot, so the gate always sends as auto.
      manualMode: false,
      mandateApproved,
      connection: connectionStateOf(connection),
      approval: approval ? { approvedVersionHash: approval.objectVersion ?? "" } : null,
      currentVersionHash: item.currentVersionHash,
      calibrationCheckRequired: front.status === "calibrating",
      qualityChecked: scores.some(
        (score) =>
          score.itemId === item.id &&
          score.versionHash === item.currentVersionHash &&
          score.verdict === "pass",
      ),
      now: ctx.now,
      publishedThisWeek,
      publishedThisMonth,
      effectivePause: effectivePauseLevel(domainPauses),
      blockingEscalationOpen,
      offer: review.triage?.path === "update_catalog_only" ? { valid: false } : null,
    },
    review,
    version,
    front,
    connection,
    blockingEscalationOpen,
  });
}

async function holdForDispatch(
  ctx: CommandContext,
  item: EquipeItem,
  intent: EquipePublicationIntent,
  reasons: string[],
): Promise<void> {
  const scope = scopeOf(ctx);
  const state = itemStateOf(item);
  if (!state.ok) return;
  const decided = holdItem(state.value, reasons[0] ?? "gate");
  if (decided.ok) {
    await ctx.repos.items.update(scope, item.id, { status: decided.value.state.status });
  }
  if (intent.status !== "held") {
    await ctx.repos.intents.update(scope, intent.id, { status: "held" });
  }
  await appendEvent(ctx, {
    eventType: ITEM_HELD_EVENT,
    objectType: "item",
    objectId: item.id,
    payload: { reason: reasons[0] ?? "gate", reasons, heldIntentIds: [intent.id] },
  });
  await requestNotification(ctx, {
    recipientRole: "strategist",
    templateKey: "item.held",
    detail: { itemId: item.id, reasons },
  });
}

async function missForDispatch(
  ctx: CommandContext,
  item: EquipeItem,
  intent: EquipePublicationIntent,
  reasons: string[],
): Promise<Result<void>> {
  const scope = scopeOf(ctx);
  const state = itemStateOf(item);
  if (!state.ok) return state;
  const decided = markWindowMissed(state.value);
  if (!decided.ok) return decided;
  await ctx.repos.items.update(scope, item.id, { status: decided.value.state.status });
  await voidIntentForVersion(ctx, item.id, intent.versionHash);
  await appendEvent(ctx, {
    eventType: ITEM_WINDOW_MISSED_EVENT,
    objectType: "item",
    objectId: item.id,
    payload: { scheduledFor: item.scheduledFor?.toISOString() ?? null, reasons, during: "dispatch" },
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
  return ok(undefined);
}

export type PrepareDispatch =
  | { action: "send"; itemId: string; intentId: string; caption: string; mediaRef: string; versionHash: string; containerId: string | null }
  | { action: "already_published" | "none" | "stale" | "not_due" | "held" | "released" | "missed_window" | "failed"; itemId: string; intentId: string; [key: string]: unknown };

async function prepareDispatch(
  ctx: CommandContext,
  deps: EquipeModuleDeps,
  intentId: string,
): Promise<Result<Record<string, unknown>>> {
  const account = await loadAccountOrError(ctx);
  if (!account.ok) return account;
  const scope = scopeOf(ctx);
  const intent = await ctx.repos.intents.get(scope, intentId);
  if (!intent) return err("unknown_intent", `unknown intent ${intentId}`);
  const item = await ctx.repos.items.get(scope, intent.itemId);
  if (!item) return err("unknown_item", `unknown item ${intent.itemId}`);
  const ids = { itemId: item.id, intentId: intent.id };

  // Terminal or foreign states: never touch, never send.
  if (intent.status === "published") return ok({ action: "already_published", ...ids });
  if (intent.status === "failed" || intent.status === "canceled") {
    return ok({ action: "none", intentStatus: intent.status, ...ids });
  }
  if (intent.status === "verifying" || item.status === "verifying") {
    return ok({ action: "none", status: "verifying", owner: "reconcile", ...ids });
  }
  const held = item.status === "held" || intent.status === "held";
  if (!held) {
    if (item.status !== "scheduled" && item.status !== "sending") {
      return ok({ action: "none", itemStatus: item.status, ...ids });
    }
    if (intent.status !== "pending" && intent.status !== "sending") {
      return ok({ action: "none", intentStatus: intent.status, ...ids });
    }
  } else if (item.status !== "held" || intent.status !== "held") {
    // Half-held states belong to the pause machinery; dispatch stays out.
    return ok({ action: "none", held: true, consistent: false, ...ids });
  }
  if (!item.currentVersionHash) {
    return err("invalid_transition", `item ${item.id} has no current version`);
  }
  if (intent.versionHash !== item.currentVersionHash) {
    const { voided } = await voidIntentForVersion(ctx, item.id, intent.versionHash);
    return ok({ action: "stale", voided, ...ids });
  }
  const scheduledFor = item.scheduledFor ?? intent.scheduledFor;
  const pastTime = scheduledFor <= ctx.now;
  const publishEnabled = deps.isPublishEnabled ?? isEquipePublishEnabled;

  // The kill switch stops everything first, even future intents; in-flight
  // sends keep their state and the retry simply stops here.
  if (!publishEnabled()) {
    if (!held && item.status === "scheduled") {
      await holdForDispatch(ctx, item, intent, [PUBLISH_DISABLED_HOLD_REASON]);
      return ok({ action: "held", reasons: [PUBLISH_DISABLED_HOLD_REASON], ...ids });
    }
    return ok({ action: "none", held, reason: PUBLISH_DISABLED_HOLD_REASON, ...ids });
  }

  if (await isManualMode(ctx)) {
    if (!held && item.status === "scheduled") {
      await holdForDispatch(ctx, item, intent, [MANUAL_MODE_HOLD_REASON]);
      return ok({ action: "held", reasons: [MANUAL_MODE_HOLD_REASON], ...ids });
    }
    return ok({ action: "none", held, reason: MANUAL_MODE_HOLD_REASON, ...ids });
  }

  if (!held && intent.scheduledFor > ctx.now) {
    return ok({ action: "not_due", scheduledFor: intent.scheduledFor.toISOString(), ...ids });
  }

  const built = await buildDispatchGate(ctx, item);
  if (!built.ok) return built;
  const gate = evaluatePublicationGate(built.value.snapshot);
  const reasons: string[] = gate.allowed ? [] : [...gate.reasons];
  if (
    built.value.review.status === "blocked" &&
    !built.value.blockingEscalationOpen &&
    !reasons.includes("blocking_escalation_open")
  ) {
    reasons.push(BLOCKING_REVIEW_OPEN_REASON);
  }

  if (reasons.length > 0) {
    if (item.status === "sending") {
      // A retry that no longer passes the gate is a dead attempt: fail it
      // so the strategist proposes a new time, instead of retrying forever.
      const failed = await writeFailedOutcome(ctx, item, intent, {
        code: "gate_failed",
        error: `gate failed on retry: ${reasons.join(", ")}`,
        step: "gate",
        connection: null,
      });
      if (!failed.ok) return failed;
      return ok({ action: "failed", reasons, ...ids });
    }
    if (pastTime) {
      const missed = await missForDispatch(ctx, item, intent, reasons);
      if (!missed.ok) return missed;
      return ok({ action: "missed_window", reasons, ...ids });
    }
    if (!held) {
      await holdForDispatch(ctx, item, intent, reasons);
      return ok({ action: "held", reasons, ...ids });
    }
    await appendEvent(ctx, {
      eventType: ITEM_HELD_EVENT,
      objectType: "item",
      objectId: item.id,
      payload: { reason: reasons[0], reasons, heldIntentIds: [intent.id], stillHeld: true },
    });
    return ok({ action: "none", held: true, stillHeld: true, reasons, ...ids });
  }

  // Gate passed.
  if (held) {
    if (pastTime) {
      const missed = await missForDispatch(ctx, item, intent, reasons);
      if (!missed.ok) return missed;
      return ok({ action: "missed_window", reasons, ...ids });
    }
    // Release without sending: the item goes back to scheduled and the
    // next due dispatch sends it — the same resume-then-send order as
    // resume_pause ("retomar revalida antes de enviar").
    const state = itemStateOf(item);
    if (!state.ok) return state;
    const resumed = resumeHeldItem(state.value, true);
    if (!resumed.ok) return resumed;
    await ctx.repos.items.update(scope, item.id, { status: resumed.value.state.status });
    await ctx.repos.intents.update(scope, intent.id, { status: "pending" });
    await appendEvent(ctx, {
      eventType: ITEM_RESUMED_EVENT,
      objectType: "item",
      objectId: item.id,
      payload: { via: "dispatch", intentId: intent.id },
    });
    return ok({ action: "released", ...ids });
  }
  const retry = item.status === "sending";
  if (item.status === "scheduled") {
    const sending = startDispatch({
      status: "scheduled",
      currentVersion: item.currentVersionHash,
      approvedVersion: null,
    });
    if (!sending.ok) return sending;
    await ctx.repos.items.update(scope, item.id, { status: sending.value.state.status });
  }
  if (intent.status !== "sending") {
    await ctx.repos.intents.update(scope, intent.id, { status: "sending", attempts: intent.attempts + 1 });
  }
  await appendEvent(ctx, {
    eventType: ITEM_DISPATCH_STARTED_EVENT,
    objectType: "item",
    objectId: item.id,
    payload: { retry, intentId: intent.id },
  });
  return ok({
    action: "send",
    caption: built.value.version.caption,
    mediaRef: built.value.version.creativeWorkOutputId,
    versionHash: item.currentVersionHash,
    containerId: intent.containerId,
    ...ids,
  });
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

async function writeUncertainOutcome(
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

async function writePublishedOutcome(
  ctx: CommandContext,
  item: EquipeItem,
  intent: EquipePublicationIntent,
  input: { externalId: string; permalink?: string; containerId: string | null; versionHash: string },
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

async function loadIntentItemOrError(
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

/**
 * Dispatch one claimed intent: gate, two-step send, outcome. External
 * publisher calls run between transactions — a crash between phases only
 * leaves the intent `sending` (lease expires, the job retries, the stored
 * container is reused).
 */
export async function runDispatchPublication(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: DispatchPublicationPayload,
): Promise<Result<CommandSuccess>> {
  const publisher: Publisher | undefined = deps.publisher;
  if (!publisher) {
    return err("publisher_missing", "dispatch needs a publisher");
  }
  const events: EquipeEvent[] = [];
  const prepared = await transact(deps, base, (ctx) => prepareDispatch(ctx, deps, payload.intentId));
  if (!prepared.ok) return prepared;
  events.push(...prepared.value.events);
  const prep = prepared.value.data as unknown as PrepareDispatch;
  if (prep.action !== "send") {
    return ok({ accountId: prepared.value.accountId, events, data: prepared.value.data });
  }

  const input = {
    workspaceId: base.workspaceId,
    accountId: base.accountId,
    itemId: prep.itemId,
    versionHash: prep.versionHash,
    caption: prep.caption,
    mediaRef: prep.mediaRef,
  };
  let containerId = prep.containerId;
  if (!containerId) {
    try {
      containerId = (await publisher.createContainer(input)).containerId;
    } catch (error) {
      return failFromPublisher(deps, base, events, payload.intentId, "create", null, error);
    }
    const persisted = await transact(deps, base, async (ctx) => {
      const loaded = await loadIntentItemOrError(ctx, payload.intentId);
      if (!loaded.ok) return loaded;
      // The container id is stored BEFORE the publish call, so any retry
      // reuses it instead of creating another container.
      await ctx.repos.intents.update(scopeOf(ctx), loaded.value.intent.id, { containerId });
      await appendEvent(ctx, {
        eventType: ITEM_CONTAINER_CREATED_EVENT,
        objectType: "item",
        objectId: loaded.value.item.id,
        payload: { containerId },
      });
      return ok({ containerId });
    });
    if (!persisted.ok) return persisted;
    events.push(...persisted.value.events);
  }

  let published: { externalId: string; permalink?: string };
  try {
    published = await publisher.publishContainer({ ...input, containerId });
  } catch (error) {
    return failFromPublisher(deps, base, events, payload.intentId, "publish", containerId, error);
  }

  const done = await transact(deps, base, async (ctx) => {
    const loaded = await loadIntentItemOrError(ctx, payload.intentId);
    if (!loaded.ok) return loaded;
    const written = await writePublishedOutcome(ctx, loaded.value.item, loaded.value.intent, {
      externalId: published.externalId,
      permalink: published.permalink,
      containerId,
      versionHash: prep.versionHash,
    });
    if (!written.ok) return written;
    return ok({
      action: "published",
      itemId: prep.itemId,
      intentId: payload.intentId,
      externalId: published.externalId,
      permalink: published.permalink ?? null,
      containerId,
    });
  });
  if (!done.ok) return done;
  events.push(...done.value.events);
  return ok({ accountId: done.value.accountId, events, data: done.value.data });
}

async function failFromPublisher(
  deps: EquipeModuleDeps,
  base: TxBase,
  events: EquipeEvent[],
  intentId: string,
  step: "create" | "publish",
  containerId: string | null,
  error: unknown,
): Promise<Result<CommandSuccess>> {
  if (error instanceof PublisherUncertainError) {
    const outcome = await transact(deps, base, async (ctx) => {
      const loaded = await loadIntentItemOrError(ctx, intentId);
      if (!loaded.ok) return loaded;
      const written = await writeUncertainOutcome(ctx, loaded.value.item, loaded.value.intent, {
        step,
        containerId,
        error: error.message,
      });
      if (!written.ok) return written;
      return ok({ action: "verifying", step, containerId, itemId: loaded.value.item.id, intentId });
    });
    if (!outcome.ok) return outcome;
    events.push(...outcome.value.events);
    return ok({ accountId: outcome.value.accountId, events, data: outcome.value.data });
  }
  if (error instanceof PublisherFailedError) {
    const outcome = await transact(deps, base, async (ctx) => {
      const loaded = await loadIntentItemOrError(ctx, intentId);
      if (!loaded.ok) return loaded;
      const version = loaded.value.item.currentVersionHash
        ? await ctx.repos.itemVersions.getByHash(
            scopeOf(ctx),
            loaded.value.item.id,
            loaded.value.item.currentVersionHash,
          )
        : null;
      const provider = providerOf(storedDestinationOf(loaded.value.item, version));
      const connections = await ctx.repos.connections.list(scopeOf(ctx));
      const connection =
        provider == null ? null : (connections.find((row) => row.provider === provider) ?? null);
      const written = await writeFailedOutcome(ctx, loaded.value.item, loaded.value.intent, {
        code: error.code,
        error: error.message,
        step,
        connection,
      });
      if (!written.ok) return written;
      return ok({
        action: "failed",
        step,
        code: error.code,
        itemId: loaded.value.item.id,
        intentId,
        connectionId: written.value.connectionId,
      });
    });
    if (!outcome.ok) return outcome;
    events.push(...outcome.value.events);
    return ok({ accountId: outcome.value.accountId, events, data: outcome.value.data });
  }
  throw error;
}
