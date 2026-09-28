// Deadline sweep (#549, system job): item limits, escalation/exception
// SLAs, client-wait expiry and the calibration 6-week trigger.
//
// One sweep per account, one transaction. Every object is attempted through
// the same inner function as its single command, so the sweep and the
// command can never disagree; a per-object failure is collected and the
// sweep continues with the rest — one poisoned row never blocks the batch.
// SLA breaches write one `sla.breached` marker per object and alert the
// owning queue plus the founder; re-runs stay quiet.

import { z } from "zod";
import { ok, type Result } from "../domain";
import type { EquipeEscalation, EquipeException } from "../data";
import type { EquipeModuleDeps } from "./ports";
import { runDeadlinesPayloadSchema } from "./envelope";
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
import { itemDeadlineFor } from "./item-shared";
import { expireItemDeadlineInTx } from "./items-deadline";
import { expireEscalationClientWaitInTx } from "./escalations-resolve";
import { isTerminalStatus } from "./escalations-shared";
import { openScopeDecisionInTx } from "./calibration-release";
import {
  calibrationWeeksElapsed,
  frontStateOf,
} from "./calibration-shared";

export type RunDeadlinesPayload = z.infer<typeof runDeadlinesPayloadSchema>;

export const SLA_BREACHED_EVENT = "sla.breached";

/** Overdue while the owner has not resolved: alert the queue and the founder. */
export const SLA_ALERT_RECIPIENT_FOUNDER = "founder";

type SweepFailure = { objectType: string; objectId: string; code: string; message: string };

function failureOf(objectType: string, objectId: string, error: { code: string; message: string }): SweepFailure {
  return { objectType, objectId, code: error.code, message: error.message };
}

async function hasSlaMarker(
  ctx: CommandContext,
  objectType: string,
  objectId: string,
): Promise<boolean> {
  const events = await ctx.repos.events.list(scopeOf(ctx), { objectType, objectId });
  return events.some((event) => event.eventType === SLA_BREACHED_EVENT);
}

async function alertSlaBreach(
  ctx: CommandContext,
  input: {
    objectType: "escalation" | "exception";
    objectId: string;
    queueRole: string;
    templateKey: string;
    dueAt: Date;
  },
): Promise<void> {
  await appendEvent(ctx, {
    eventType: SLA_BREACHED_EVENT,
    objectType: input.objectType,
    objectId: input.objectId,
    payload: { dueAt: input.dueAt.toISOString(), alerted: [input.queueRole, SLA_ALERT_RECIPIENT_FOUNDER] },
  });
  const detail = { [`${input.objectType}Id`]: input.objectId, dueAt: input.dueAt.toISOString() };
  await requestNotification(ctx, {
    recipientRole: input.queueRole,
    templateKey: input.templateKey,
    detail,
  });
  await requestNotification(ctx, {
    recipientRole: SLA_ALERT_RECIPIENT_FOUNDER,
    templateKey: input.templateKey,
    detail,
  });
}

async function sweepItems(ctx: CommandContext): Promise<{ expired: string[]; failures: SweepFailure[] }> {
  const expired: string[] = [];
  const failures: SweepFailure[] = [];
  const items = await ctx.repos.items.list(scopeOf(ctx), {
    status: ["awaiting_approval", "adjusting", "held"],
  });
  for (const item of items) {
    const limit = item.deadlineAt ?? (item.scheduledFor ? itemDeadlineFor(item.scheduledFor) : null);
    if (!limit || limit > ctx.now) continue;
    const outcome = await expireItemDeadlineInTx(ctx, item.id);
    if (!outcome.ok) {
      failures.push(failureOf("item", item.id, outcome.error));
      continue;
    }
    if (outcome.value.expired) expired.push(item.id);
  }
  return { expired, failures };
}

async function sweepEscalations(ctx: CommandContext): Promise<{
  waitsExpired: string[];
  slaBreached: string[];
  failures: SweepFailure[];
}> {
  const waitsExpired: string[] = [];
  const slaBreached: string[] = [];
  const failures: SweepFailure[] = [];
  for (const escalation of await ctx.repos.escalations.list(scopeOf(ctx))) {
    if (isTerminalStatus(escalation.status) || escalation.status === "merged") continue;
    if (!escalation.dueAt || escalation.dueAt >= ctx.now) continue;
    if (escalation.status === "awaiting_client") {
      const outcome = await expireEscalationClientWaitInTx(ctx, escalation.id);
      if (!outcome.ok) {
        failures.push(failureOf("escalation", escalation.id, outcome.error));
        continue;
      }
      if (outcome.value.expired) waitsExpired.push(escalation.id);
      continue;
    }
    await sweepEscalationSla(ctx, escalation, slaBreached);
  }
  return { waitsExpired, slaBreached, failures };
}

async function sweepEscalationSla(
  ctx: CommandContext,
  escalation: EquipeEscalation,
  slaBreached: string[],
): Promise<void> {
  if (!escalation.dueAt) return;
  if (await hasSlaMarker(ctx, "escalation", escalation.id)) return;
  await alertSlaBreach(ctx, {
    objectType: "escalation",
    objectId: escalation.id,
    queueRole: escalation.ownerRole,
    templateKey: "escalation.sla_breached",
    dueAt: escalation.dueAt,
  });
  slaBreached.push(escalation.id);
}

async function sweepExceptions(ctx: CommandContext): Promise<{ slaBreached: string[] }> {
  const slaBreached: string[] = [];
  for (const exception of await ctx.repos.exceptions.list(scopeOf(ctx))) {
    if (!isOpenException(exception)) continue;
    if (!exception.dueAt || exception.dueAt >= ctx.now) continue;
    if (await hasSlaMarker(ctx, "exception", exception.id)) continue;
    // The support queue owns every exception (flow 4); the stored
    // `ownerRole` default is not a staff role, so the queue role here is
    // the literal queue, not the row value.
    await alertSlaBreach(ctx, {
      objectType: "exception",
      objectId: exception.id,
      queueRole: "support",
      templateKey: "exception.sla_breached",
      dueAt: exception.dueAt,
    });
    slaBreached.push(exception.id);
  }
  return { slaBreached };
}

function isOpenException(exception: EquipeException): boolean {
  return exception.status === "open" || exception.status === "claimed";
}

async function sweepScopeDecisions(
  ctx: CommandContext,
  accountStatus: string,
): Promise<{ opened: string[]; failures: SweepFailure[] }> {
  const opened: string[] = [];
  const failures: SweepFailure[] = [];
  if (accountStatus !== "calibrating" && accountStatus !== "active") {
    return { opened, failures };
  }
  for (const front of await ctx.repos.fronts.list(scopeOf(ctx))) {
    if (front.status !== "calibrating" && front.status !== "draft") continue;
    if (front.calibrationSequence >= 3) continue;
    if (calibrationWeeksElapsed(front.calibrationStartedAt, ctx.now) < 6) continue;
    const state = frontStateOf(front);
    if (!state.ok) {
      failures.push(failureOf("front", front.id, state.error));
      continue;
    }
    const outcome = await openScopeDecisionInTx(ctx, front.id);
    if (!outcome.ok) {
      failures.push(failureOf("front", front.id, outcome.error));
      continue;
    }
    opened.push(front.id);
  }
  return { opened, failures };
}

/**
 * Run every due deadline for the account: expired item limits, overdue
 * client waits, breached escalation/exception SLAs and fronts hitting the
 * 6-week calibration trigger. Fully idempotent: re-runs expire nothing
 * twice and alert no SLA twice.
 */
export async function runDeadlines(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: RunDeadlinesPayload,
): Promise<Result<CommandSuccess>> {
  void payload;
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    if (account.value.status === "closed") {
      return ok({ skipped: "closed" });
    }
    const items = await sweepItems(ctx);
    const escalations = await sweepEscalations(ctx);
    const exceptions = await sweepExceptions(ctx);
    const scope = await sweepScopeDecisions(ctx, account.value.status);
    return ok({
      itemsExpired: items.expired,
      clientWaitsExpired: escalations.waitsExpired,
      slaBreached: {
        escalations: escalations.slaBreached,
        exceptions: exceptions.slaBreached,
      },
      scopeDecisionsOpened: scope.opened,
      failures: [...items.failures, ...escalations.failures, ...scope.failures],
    });
  });
}
