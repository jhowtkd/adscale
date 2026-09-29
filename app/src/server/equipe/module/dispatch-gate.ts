// dispatch_publication gate (#548): revalidate the FULL domain publication
// gate at send time and claim the intent for sending. Fail → held (with
// reasons) or missed_window past the item time; never a send. Held intents
// are releasable here: a held item whose gate passes now goes back to
// scheduled, and the next due dispatch sends it.

import {
  effectivePauseLevel,
  err,
  evaluatePublicationGate,
  holdItem,
  markWindowMissed,
  monthWindow,
  ok,
  resumeHeldItem,
  startDispatch,
  weekWindow,
  type ConnectionState,
  type Pause,
  type PublicationSnapshot,
  type Result,
} from "../domain";
import type {
  EquipeConnection,
  EquipeFront,
  EquipeItem,
  EquipeItemVersion,
  EquipePublicationIntent,
} from "../data";
import type { EquipeModuleDeps } from "./ports";
import { isEquipePublishEnabled } from "./publish-enabled";
import {
  appendEvent,
  loadAccountOrError,
  requestNotification,
  scopeOf,
  type CommandContext,
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
import {
  ITEM_DISPATCH_STARTED_EVENT,
  ITEM_PUBLISHED_EVENT,
  itemStateOf,
  providerOf,
  writeFailedOutcome,
  hasPublishAttemptFor,
  writeUncertainOutcome,
} from "./dispatch-outcomes";
import { isReleasedVersion, loadReleasedVersions } from "./calibration-conference";
import { calibrationGateSlice } from "./calibration-shared";
import { GLOBAL_STOP_HOLD_REASON } from "./global-stop";
import { ITEM_HELD_EVENT } from "./pauses-apply";
import { domainPauseOf, ITEM_RESUMED_EVENT } from "./pauses-resume";
import { MANUAL_PUBLISH_DECLARED_EVENT } from "./manual-publishing";
import { holdInstagramDestination, instagramIdentityOf, INSTAGRAM_DESTINATION_CHANGED } from "./instagram-destination";

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
  // Sequential on purpose: one transaction client, where parallel queries
  // warn today and break in pg@9 (#574).
  const front = await ctx.repos.fronts.get(scope, item.frontId);
  const version = await ctx.repos.itemVersions.getByHash(scope, item.id, item.currentVersionHash);
  const mandates = await ctx.repos.mandates.list(scope);
  const connections = await ctx.repos.connections.list(scope);
  const approval = await approvalReceiptFor(ctx, item.id, item.currentVersionHash);
  const review = await loadItemReview(ctx.repos, scope, item);
  const pauses = await ctx.repos.pauses.list(scope);
  const released = await loadReleasedVersions(ctx.repos, scope, item.frontId);
  if (!front) return err("unknown_front", `unknown front ${item.frontId}`);
  if (!version) return err("unknown_version", `item ${item.id} has no current version row`);
  if (!version.creativeWorkOutputId) {
    return err("item_without_media", `item ${item.id} has no media to publish`);
  }
  // Calibration conference (#546): the same slice the client-facing gate
  // uses — required while the front confers, checked once quality released
  // the CURRENT version. A passing score alone is not the conference, and a
  // caption edit re-arms the gate until re-release.
  const calibrationSlice = calibrationGateSlice({
    frontStatus: front.status,
    releasedToClient: isReleasedVersion(released, item),
  });
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
  const publishedThisWeek = await countPublishedSince(ctx, weekWindow(ctx.now).start);
  const publishedThisMonth = await countPublishedSince(ctx, monthWindow(ctx.now).start);
  return ok({
    snapshot: {
      // Manual mode never reaches the gate: prepare() holds manual items
      // before building the snapshot, so the gate always sends as auto.
      manualMode: false,
      mandateApproved,
      connection: connectionStateOf(connection),
      approval: approval ? { approvedVersionHash: approval.objectVersion ?? "" } : null,
      currentVersionHash: item.currentVersionHash,
      calibrationCheckRequired: calibrationSlice.calibrationCheckRequired,
      qualityChecked: calibrationSlice.qualityChecked,
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
  | { action: "send"; itemId: string; intentId: string; caption: string; mediaRef: string; versionHash: string; containerId: string | null; destinationIgUserId: string }
  | { action: "already_published" | "none" | "stale" | "not_due" | "held" | "released" | "missed_window" | "failed"; itemId: string; intentId: string; [key: string]: unknown };

export async function prepareDispatch(
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
  if (item.status === "sending" && intent.containerId && await hasPublishAttemptFor(ctx, item.id, intent.containerId)) {
    const written = await writeUncertainOutcome(ctx, item, intent, {
      step: "publish", containerId: intent.containerId,
      error: "tentativa de publish já registrada — resultado desconhecido após queda",
    });
    if (!written.ok) return written;
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

  // #583 — the global stop is the single source of truth for EVERY account
  // (including accounts opened while it is active): nothing is sent while it
  // lasts. Same shape as the kill switch above — EQUIPE_PUBLISH_ENABLED on top.
  if (await ctx.internal.globalStops.getActive()) {
    if (!held && item.status === "scheduled") {
      await holdForDispatch(ctx, item, intent, [GLOBAL_STOP_HOLD_REASON]);
      return ok({ action: "held", reasons: [GLOBAL_STOP_HOLD_REASON], ...ids });
    }
    return ok({ action: "none", held, reason: GLOBAL_STOP_HOLD_REASON, ...ids });
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
  const pinned = built.value.version.destinationIgUserId;
  if (!pinned || pinned !== intent.destinationIgUserId ||
      pinned !== instagramIdentityOf(built.value.connection)?.igUserId ||
      intent.lastError === INSTAGRAM_DESTINATION_CHANGED) {
    await holdInstagramDestination(ctx, item, intent);
    return ok({ action: "held", reasons: [INSTAGRAM_DESTINATION_CHANGED], ...ids });
  }
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
    destinationIgUserId: pinned,
    ...ids,
  });
}
