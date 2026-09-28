// Pausas (#547): client, team, content-incident, connection, global stop,
// execution suspension and delinquency. Stacked pauses: the most restrictive
// wins and the front only returns when every covering pause is lifted.
// Resume revalidates each held item (future time, window, valid approval,
// current offer, verified connection, no open block) exactly per the flow's
// table: back to scheduled, missed_window when the time passed, or stays.

import { z } from "zod";
import {
  actorId,
  canResumePause,
  err,
  holdItem,
  isWithinAssistedWindow,
  markWindowMissed,
  ok,
  resumeHeldItem,
  type Pause,
  type PauseLevel,
  type PauseOrigin,
  type Result,
} from "../domain";
import type { AccountScope, EquipeItem, EquipePause } from "../data";
import type { EquipeModuleDeps } from "./ports";
import {
  pauseAccountTeamPayloadSchema,
  pauseConnectionPayloadSchema,
  pauseDelinquencyPayloadSchema,
  pauseFrontContentPayloadSchema,
  pauseGlobalPayloadSchema,
  pausePublicationsPayloadSchema,
  resumePausePayloadSchema,
  suspendExecutionPayloadSchema,
} from "./envelope";
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
  approvalReceiptFor,
  hasOpenItemEscalation,
  isManualMode,
  ITEM_WINDOW_MISSED_EVENT,
  loadItemReview,
  storedDestinationOf,
} from "./item-shared";

export const PAUSE_APPLIED_EVENT = "pause.applied";
export const PAUSE_LIFTED_EVENT = "pause.lifted";
export const ITEM_HELD_EVENT = "item.held";
export const ITEM_RESUMED_EVENT = "item.resumed";
export const ITEM_RESUME_DEFERRED_EVENT = "item.resume_deferred";

export type PausePublicationsPayload = z.infer<typeof pausePublicationsPayloadSchema>;
export type PauseAccountTeamPayload = z.infer<typeof pauseAccountTeamPayloadSchema>;
export type PauseFrontContentPayload = z.infer<typeof pauseFrontContentPayloadSchema>;
export type PauseConnectionPayload = z.infer<typeof pauseConnectionPayloadSchema>;
export type PauseGlobalPayload = z.infer<typeof pauseGlobalPayloadSchema>;
export type SuspendExecutionPayload = z.infer<typeof suspendExecutionPayloadSchema>;
export type PauseDelinquencyPayload = z.infer<typeof pauseDelinquencyPayloadSchema>;
export type ResumePausePayload = z.infer<typeof resumePausePayloadSchema>;

// Stored levels (publishing/execution/billing) vs domain levels
// (publication/execution/delinquency).
const STORED_LEVEL_OF: Record<PauseLevel, string> = {
  publication: "publishing",
  execution: "execution",
  delinquency: "billing",
};

const DOMAIN_LEVEL_OF: Record<string, PauseLevel> = {
  publishing: "publication",
  execution: "execution",
  billing: "delinquency",
};

const LEVEL_OF_ORIGIN: Record<PauseOrigin, PauseLevel> = {
  client: "publication",
  team: "publication",
  content_incident: "publication",
  connection: "publication",
  global_stop: "publication",
  security: "execution",
  delinquency: "delinquency",
};

function isPauseOrigin(value: unknown): value is PauseOrigin {
  return (
    value === "client" ||
    value === "team" ||
    value === "content_incident" ||
    value === "connection" ||
    value === "global_stop" ||
    value === "security" ||
    value === "delinquency"
  );
}

/** Stored row → domain pause (who-resumes is decided in the domain). */
export function domainPauseOf(row: EquipePause): Result<Pause> {
  if (!isPauseOrigin(row.origin)) {
    return err("unknown_pause_origin", `pause ${row.id} has unknown origin ${row.origin}`);
  }
  const level = DOMAIN_LEVEL_OF[row.level];
  if (!level) {
    return err("unknown_pause_level", `pause ${row.id} has unknown level ${row.level}`);
  }
  return ok({
    id: row.id,
    level,
    origin: row.origin,
    scope: row.scope === "front" ? "front" : "account",
    scopeId: row.scope === "front" ? row.frontId : null,
    pausedBy: row.origin === "team" ? row.resumableBy.replace(/^staff:/, "") : row.resumableBy,
    pausedAt: row.createdAt,
  });
}

function resumableByFor(origin: PauseOrigin, ctx: CommandContext): string {
  switch (origin) {
    case "client":
      return "client";
    case "team":
      return `staff:${actorId(ctx.actor)}`;
    case "content_incident":
      return "quality";
    case "connection":
      return "system";
    case "global_stop":
      return "operations";
    case "security":
      return "operations";
    case "delinquency":
      return "system";
  }
}

function notifyRoleFor(origin: PauseOrigin): string {
  return origin === "security" || origin === "global_stop" ? "operations" : "strategist";
}

export type ApplyPauseInput = {
  origin: PauseOrigin;
  /** Front scope; null for account/global scope. */
  frontId?: string | null;
  /** "global" only for the global stop (still an account-scoped row). */
  scope: "account" | "front" | "global";
  reason?: string | null;
  escalationId?: string;
  connectionId?: string;
};

/**
 * Create a pause row and hold what it covers. Shared by the explicit pause
 * commands and the escalation side effects: when the same pause is already
 * active it is reused (`created: false`) and the explicit commands turn that
 * into `pause_already_active`.
 */
export async function applyPauseInternal(
  ctx: CommandContext,
  input: ApplyPauseInput,
): Promise<Result<{ pause: EquipePause; created: boolean; heldItemIds: string[] }>> {
  const scope = scopeOf(ctx);
  const frontId = input.scope === "front" ? (input.frontId ?? null) : null;
  const active = (await ctx.repos.pauses.list(scope)).filter((row) => row.status === "active");
  const existing = active.find(
    (row) => row.origin === input.origin && row.scope === input.scope && (row.frontId ?? null) === frontId,
  );
  if (existing) {
    return ok({ pause: existing, created: false, heldItemIds: [] });
  }
  const pause = await ctx.repos.pauses.create(scope, {
    frontId,
    level: STORED_LEVEL_OF[LEVEL_OF_ORIGIN[input.origin]] as "publishing" | "execution" | "billing",
    scope: input.scope,
    origin: input.origin,
    resumableBy: resumableByFor(input.origin, ctx),
    reason: input.reason ?? null,
  });
  const heldItemIds = await holdScheduledItems(ctx, scope, frontId);
  await appendEvent(ctx, {
    eventType: PAUSE_APPLIED_EVENT,
    objectType: "pause",
    objectId: pause.id,
    payload: {
      origin: input.origin,
      level: pause.level,
      scope: input.scope,
      frontId,
      heldItemIds,
      ...(input.escalationId ? { escalationId: input.escalationId } : {}),
      ...(input.connectionId ? { connectionId: input.connectionId } : {}),
    },
  });
  await requestNotification(ctx, {
    recipientRole: notifyRoleFor(input.origin),
    templateKey: "pause.applied",
    detail: { pauseId: pause.id, origin: input.origin, heldItemIds },
  });
  return ok({ pause, created: true, heldItemIds });
}

/**
 * Every pause level holds the scheduled items it covers ("segurados") and
 * holds their pending dispatch intents; awaiting items keep their state —
 * production, review and approval continue under a publication pause.
 */
async function holdScheduledItems(
  ctx: CommandContext,
  scope: AccountScope,
  frontId: string | null,
): Promise<string[]> {
  const items = await ctx.repos.items.list(scope, frontId ? { frontId } : undefined);
  const held: string[] = [];
  for (const item of items) {
    if (item.status !== "scheduled") continue;
    const decided = holdItem(
      { status: "scheduled", currentVersion: item.currentVersionHash ?? "", approvedVersion: null },
      "pause",
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
      payload: { reason: "pause", heldIntentIds: intents.map((intent) => intent.id) },
    });
    held.push(item.id);
  }
  return held;
}

async function applyExplicitPause(
  deps: EquipeModuleDeps,
  base: TxBase,
  input: ApplyPauseInput & { frontMustExist?: string; connectionMustExist?: string },
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    if (input.frontMustExist) {
      const front = await ctx.repos.fronts.get(scopeOf(ctx), input.frontMustExist);
      if (!front) return err("unknown_front", `unknown front ${input.frontMustExist}`);
    }
    if (input.connectionMustExist) {
      const connection = await ctx.repos.connections.get(scopeOf(ctx), input.connectionMustExist);
      if (!connection) return err("unknown_connection", `unknown connection ${input.connectionMustExist}`);
    }
    const applied = await applyPauseInternal(ctx, input);
    if (!applied.ok) return applied;
    if (!applied.value.created) {
      return err("pause_already_active", "this pause is already active");
    }
    return ok({ pauseId: applied.value.pause.id, heldItemIds: applied.value.heldItemIds });
  });
}

/** The client pauses their own account's publications (only they resume). */
export async function runPausePublications(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: PausePublicationsPayload,
): Promise<Result<CommandSuccess>> {
  return applyExplicitPause(deps, base, {
    origin: "client",
    scope: "account",
    reason: payload.reason,
  });
}

/** Support/operations pause the account inside an exception. */
export async function runPauseAccountTeam(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: PauseAccountTeamPayload,
): Promise<Result<CommandSuccess>> {
  return applyExplicitPause(deps, base, {
    origin: "team",
    scope: "account",
    reason: payload.reason,
  });
}

/** Quality (or the system, on a critical escalation) pauses the front. */
export async function runPauseFrontContent(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: PauseFrontContentPayload,
): Promise<Result<CommandSuccess>> {
  return applyExplicitPause(deps, base, {
    origin: "content_incident",
    scope: "front",
    frontId: payload.frontId,
    frontMustExist: payload.frontId,
    reason: payload.reason,
  });
}

/** Automatic pause while a connection is down. */
export async function runPauseConnection(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: PauseConnectionPayload,
): Promise<Result<CommandSuccess>> {
  return applyExplicitPause(deps, base, {
    origin: "connection",
    scope: "account",
    reason: payload.reason,
    connectionId: payload.connectionId,
    connectionMustExist: payload.connectionId,
  });
}

/** Authorized operations halt publications everywhere (one row per account). */
export async function runPauseGlobal(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: PauseGlobalPayload,
): Promise<Result<CommandSuccess>> {
  return applyExplicitPause(deps, base, {
    origin: "global_stop",
    scope: "global",
    reason: payload.reason,
  });
}

/**
 * Execution suspension (security / cross-account): scheduled items hold and
 * the contained connections are revoked. The #549 job fans this out to every
 * affected account; the command itself is account-scoped.
 */
export async function runSuspendExecution(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: SuspendExecutionPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const scope = scopeOf(ctx);
    for (const connectionId of payload.connectionIds) {
      const connection = await ctx.repos.connections.get(scope, connectionId);
      if (!connection) return err("unknown_connection", `unknown connection ${connectionId}`);
    }
    const applied = await applyPauseInternal(ctx, {
      origin: "security",
      scope: "account",
      reason: payload.reason,
    });
    if (!applied.ok) return applied;
    if (!applied.value.created) {
      return err("pause_already_active", "execution is already suspended");
    }
    const revokedConnectionIds: string[] = [];
    for (const connectionId of payload.connectionIds) {
      await ctx.repos.connections.update(scope, connectionId, {
        status: "revoked",
        lastError: `execution suspended (pause ${applied.value.pause.id})`,
      });
      revokedConnectionIds.push(connectionId);
    }
    return ok({
      pauseId: applied.value.pause.id,
      heldItemIds: applied.value.heldItemIds,
      revokedConnectionIds,
    });
  });
}

/** Automatic suspension for delinquency, per the contract. */
export async function runPauseDelinquency(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: PauseDelinquencyPayload,
): Promise<Result<CommandSuccess>> {
  return applyExplicitPause(deps, base, {
    origin: "delinquency",
    scope: "account",
    reason: payload.reason,
  });
}

function coversItem(pause: EquipePause, item: EquipeItem): boolean {
  if (pause.status !== "active") return false;
  if (pause.scope === "front") return pause.frontId === item.frontId;
  return true;
}

function providerOf(destination: string | null): string | null {
  if (!destination) return null;
  const provider = destination.split(":")[0];
  return provider ? provider : null;
}

export type RevalidationOutcome =
  | { result: "resumed" }
  | { result: "missed_window" }
  | { result: "deferred"; reasons: string[] };

/**
 * Revalidate one held item before it goes back to scheduled: future time,
 * assisted window, approval valid for the version, current offer, verified
 * connection, no other open block. Cancelled / do-not-publish / blocked
 * items are never held, so they never reach this function — they stay as
 * the flow's table requires. Time passed → missed_window (new time needs
 * client approval); any other failed check → stays held with reasons.
 */
export async function revalidateHeldItem(
  ctx: CommandContext,
  item: EquipeItem,
): Promise<Result<RevalidationOutcome>> {
  const scope = scopeOf(ctx);
  if (!item.currentVersionHash) {
    return err("invalid_transition", `item ${item.id} has no current version`);
  }
  if (!item.scheduledFor || item.scheduledFor <= ctx.now) {
    const decided = markWindowMissed({
      status: "held",
      currentVersion: item.currentVersionHash,
      approvedVersion: null,
    });
    if (!decided.ok) return decided;
    await ctx.repos.items.update(scope, item.id, { status: decided.value.state.status });
    await appendEvent(ctx, {
      eventType: ITEM_WINDOW_MISSED_EVENT,
      objectType: "item",
      objectId: item.id,
      payload: { scheduledFor: item.scheduledFor?.toISOString() ?? null, during: "pause" },
    });
    await requestNotification(ctx, {
      recipientRole: "approver",
      templateKey: "item.window_missed",
      detail: { itemId: item.id },
    });
    return ok({ result: "missed_window" });
  }
  const reasons: string[] = [];
  if (!isWithinAssistedWindow(item.scheduledFor)) {
    reasons.push("outside_assisted_window");
  }
  const [approval, review, version] = await Promise.all([
    approvalReceiptFor(ctx, item.id, item.currentVersionHash),
    loadItemReview(ctx.repos, scope, item),
    ctx.repos.itemVersions.getByHash(scope, item.id, item.currentVersionHash),
  ]);
  if (!approval) {
    reasons.push("version_not_approved");
  }
  // Current offer, with the data items carry: a triage that pointed at the
  // catalog (commercial condition) means the offer side is not current; the
  // full catalog re-check has no offer-id link on items (see commit notes).
  if (review.triage?.path === "update_catalog_only") {
    reasons.push("offer_not_current");
  }
  if (review.status === "blocked") {
    const escalationOpen = await hasOpenItemEscalation(ctx.repos, scope, item.id);
    reasons.push(escalationOpen ? "blocking_escalation_open" : "blocking_review_open");
  }
  if (!(await isManualMode(ctx))) {
    const provider = providerOf(storedDestinationOf(item, version));
    const connections = await ctx.repos.connections.list(scope);
    const verified = provider !== null && connections.some((c) => c.provider === provider && c.status === "active");
    if (!verified) {
      reasons.push("connection_not_verified");
    }
  }
  if (reasons.length > 0) {
    await appendEvent(ctx, {
      eventType: ITEM_RESUME_DEFERRED_EVENT,
      objectType: "item",
      objectId: item.id,
      payload: { reasons },
    });
    return ok({ result: "deferred", reasons });
  }
  const decided = resumeHeldItem(
    { status: "held", currentVersion: item.currentVersionHash, approvedVersion: null },
    true,
  );
  if (!decided.ok) return decided;
  await ctx.repos.items.update(scope, item.id, { status: decided.value.state.status });
  const intent = await ctx.repos.intents.getByItemVersion(scope, item.id, item.currentVersionHash);
  if (intent && intent.status === "held") {
    await ctx.repos.intents.update(scope, intent.id, { status: "pending" });
  }
  await appendEvent(ctx, {
    eventType: ITEM_RESUMED_EVENT,
    objectType: "item",
    objectId: item.id,
    payload: { releasedIntentId: intent && intent.status === "held" ? intent.id : null },
  });
  return ok({ result: "resumed" });
}

/**
 * Lift one pause. Who may resume depends on its origin (domain
 * `canResumePause`); the front/account only returns when no covering pause
 * remains — then every held item is revalidated before anything goes out.
 */
export async function runResumePause(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ResumePausePayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const scope = scopeOf(ctx);
    const pause = await ctx.repos.pauses.get(scope, payload.pauseId);
    if (!pause) return err("unknown_pause", `unknown pause ${payload.pauseId}`);
    if (pause.status !== "active") {
      return err("pause_not_active", `pause ${payload.pauseId} is not active`);
    }
    const domain = domainPauseOf(pause);
    if (!domain.ok) return domain;
    const allowed = canResumePause(domain.value, ctx.actor);
    if (!allowed.ok) return allowed;
    await ctx.repos.pauses.update(scope, pause.id, { status: "lifted", liftedAt: ctx.now });
    await appendEvent(ctx, {
      eventType: PAUSE_LIFTED_EVENT,
      objectType: "pause",
      objectId: pause.id,
      payload: { origin: pause.origin, scope: pause.scope, frontId: pause.frontId },
    });
    const remaining = (await ctx.repos.pauses.list(scope)).filter((row) => row.status === "active");
    const held = (await ctx.repos.items.list(scope, { status: "held" })).filter(
      (item) => !remaining.some((other) => coversItem(other, item)),
    );
    const resumed: string[] = [];
    const missed: string[] = [];
    const deferred: Array<{ itemId: string; reasons: string[] }> = [];
    for (const item of held) {
      const outcome = await revalidateHeldItem(ctx, item);
      if (!outcome.ok) return outcome;
      if (outcome.value.result === "resumed") resumed.push(item.id);
      else if (outcome.value.result === "missed_window") missed.push(item.id);
      else deferred.push({ itemId: item.id, reasons: outcome.value.reasons });
    }
    await requestNotification(ctx, {
      recipientRole: "strategist",
      templateKey: "pause.lifted",
      detail: { pauseId: pause.id, resumed, missed, deferred: deferred.map((d) => d.itemId) },
    });
    return ok({
      pauseId: pause.id,
      stillPaused: remaining.length > 0,
      resumed,
      missed,
      deferred,
    });
  });
}
