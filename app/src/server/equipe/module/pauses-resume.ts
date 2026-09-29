// Pausas (#547), resume side: lifting one pause, stacked-pause gating, and
// the per-item revalidation table (back to scheduled, missed_window when the
// time passed, or stays held with reasons). Apply side in ./pauses-apply.

import { z } from "zod";
import {
  canResumePause,
  err,
  isWithinAssistedWindow,
  markWindowMissed,
  ok,
  resumeHeldItem,
  type Pause,
  type PauseLevel,
  type PauseOrigin,
  type Result,
} from "../domain";
import type { EquipeItem, EquipePause } from "../data";
import type { EquipeModuleDeps } from "./ports";
import { resumePausePayloadSchema } from "./envelope";
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
  loadItemOrError,
  loadItemReview,
  storedDestinationOf,
} from "./item-shared";

export const PAUSE_LIFTED_EVENT = "pause.lifted";
export const ITEM_RESUMED_EVENT = "item.resumed";
export const ITEM_RESUME_DEFERRED_EVENT = "item.resume_deferred";

export type ResumePausePayload = z.infer<typeof resumePausePayloadSchema>;

const DOMAIN_LEVEL_OF: Record<string, PauseLevel> = {
  publishing: "publication",
  execution: "execution",
  billing: "delinquency",
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
  const loaded = await loadItemOrError(ctx, item.id);
  if (!loaded.ok) return loaded;
  item = loaded.value;
  if (item.status !== "held") return err("invalid_transition", `cannot resume item from ${item.status}`);
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
  // Sequential on purpose: one transaction client, where parallel queries
  // warn today and break in pg@9 (#574).
  const approval = await approvalReceiptFor(ctx, item.id, item.currentVersionHash);
  const review = await loadItemReview(ctx.repos, scope, item);
  const version = await ctx.repos.itemVersions.getByHash(scope, item.id, item.currentVersionHash);
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
    for (const item of held.sort((a, b) => a.id.localeCompare(b.id))) {
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
