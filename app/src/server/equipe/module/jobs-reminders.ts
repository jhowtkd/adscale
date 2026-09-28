// Capped reminders + the implantação stall path (#549, system job).
//
// One sweep per account, one transaction: implantação reminders at 2 and 5
// business days without progress, an automatic "implantação travada"
// support exception at 7, and "implantação pausada" at 10; batch reminders
// 24 h before "aprovar até" and 4 h before the first pending item limit;
// capped reminders while an escalation waits for the client.
//
// Idempotency: every reminder writes a `reminder.sent` marker with its
// threshold key, and a threshold whose marker exists is never sent again.
// A catch-up run (job downtime) only fires the highest due action per
// object and marks the lower thresholds superseded, so a stalled account
// never receives the day-2 and day-5 reminders in the same run.
//
// Progress ("avanço") is any non-system event: client, staff or agent
// activity moves the account forward, while system job runs never reset
// the stall clock. Suspended accounts get no reminders; closed ones no-op.

import { z } from "zod";
import {
  businessDaysElapsed,
  ok,
  type Result,
} from "../domain";
import type { EquipeBatch, EquipeEscalation, EquipeEvent } from "../data";
import type { EquipeModuleDeps } from "./ports";
import { runRemindersPayloadSchema } from "./envelope";
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
import { pauseImplantationInTx } from "./onboarding";
import { createExceptionInternal } from "./exceptions";
import { ESCALATION_DEFERRED_EVENT } from "./escalations-shared";

export type RunRemindersPayload = z.infer<typeof runRemindersPayloadSchema>;

export const REMINDER_SENT_EVENT = "reminder.sent";

/** Implantação stall thresholds, in business days without progress. */
export const IMPLANTATION_REMINDER_DAY_1 = 2;
export const IMPLANTATION_REMINDER_DAY_2 = 5;
export const IMPLANTATION_EXCEPTION_DAY = 7;
export const IMPLANTATION_PAUSE_DAY = 10;

/** Batch "aprovar até" reminder lead time. */
export const BATCH_REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;
/** First pending item limit reminder lead time. */
export const ITEM_LIMIT_REMINDER_LEAD_MS = 4 * 60 * 60 * 1000;
/** Capped client-wait reminders per escalation: one per business day, max 2. */
export const CLIENT_WAIT_REMINDER_CAP = 2;

type ReminderMarker = {
  scope: string;
  threshold?: unknown;
  batchId?: unknown;
  escalationId?: unknown;
  index?: unknown;
};

function markerOf(event: EquipeEvent): ReminderMarker | null {
  if (event.eventType !== REMINDER_SENT_EVENT) return null;
  const payload = event.payload as Record<string, unknown> | null;
  if (!payload || typeof payload !== "object" || typeof payload.scope !== "string") return null;
  return payload as ReminderMarker;
}

/** Latest non-system activity: client, staff or agent events move the stall clock. */
export async function implantationProgressAt(
  ctx: CommandContext,
  accountCreatedAt: Date,
): Promise<Date> {
  const events = await ctx.repos.events.list(scopeOf(ctx));
  let latest = accountCreatedAt;
  for (const event of events) {
    if (event.actorType === "system") continue;
    if (event.occurredAt > latest) latest = event.occurredAt;
  }
  return latest;
}

async function sendMarker(
  ctx: CommandContext,
  objectType: string,
  objectId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await appendEvent(ctx, {
    eventType: REMINDER_SENT_EVENT,
    objectType,
    objectId,
    payload,
  });
}

export type ImplantationReminderAction =
  | { action: "none"; businessDaysStalled: number }
  | { action: "reminded"; threshold: string; businessDaysStalled: number }
  | { action: "exception_opened"; exceptionId: string; businessDaysStalled: number }
  | { action: "paused"; businessDaysStalled: number };

async function sweepImplantation(
  ctx: CommandContext,
  accountStatus: string,
  accountCreatedAt: Date,
): Promise<Result<ImplantationReminderAction>> {
  if (accountStatus !== "deploying") {
    return ok({ action: "none", businessDaysStalled: 0 });
  }
  const progressAt = await implantationProgressAt(ctx, accountCreatedAt);
  const stalled = businessDaysElapsed(progressAt, ctx.now);
  const scope = scopeOf(ctx);
  const markers = (await ctx.repos.events.list(scope, { eventType: REMINDER_SENT_EVENT }))
    .map(markerOf)
    .filter((marker): marker is ReminderMarker => marker?.scope === "implantation");
  const sent = new Set(markers.map((marker) => marker.threshold));
  const due: string[] = [];
  if (stalled >= IMPLANTATION_REMINDER_DAY_1 && !sent.has("day2")) due.push("day2");
  if (stalled >= IMPLANTATION_REMINDER_DAY_2 && !sent.has("day5")) due.push("day5");
  if (stalled >= IMPLANTATION_EXCEPTION_DAY && !sent.has("exception")) due.push("exception");
  if (stalled >= IMPLANTATION_PAUSE_DAY && !sent.has("paused")) due.push("paused");
  if (due.length === 0) {
    return ok({ action: "none", businessDaysStalled: stalled });
  }
  // Catch-up rule: only the highest due action fires; lower thresholds are
  // marked superseded so they never send late.
  const fire = due[due.length - 1]!;
  for (const threshold of due) {
    if (threshold !== fire) {
      await sendMarker(ctx, "account", ctx.accountId, {
        scope: "implantation",
        threshold,
        supersededBy: fire,
        businessDaysStalled: stalled,
      });
    }
  }
  if (fire === "day2" || fire === "day5") {
    const pendingSteps = (await ctx.repos.onboarding.list(scope))
      .filter((step) => step.status === "pending" || step.status === "in_progress")
      .map((step) => step.step);
    await sendMarker(ctx, "account", ctx.accountId, {
      scope: "implantation",
      threshold: fire,
      businessDaysStalled: stalled,
    });
    await requestNotification(ctx, {
      recipientRole: "approver",
      templateKey: fire === "day2" ? "implantation.reminder_day2" : "implantation.reminder_day5",
      detail: {
        businessDaysStalled: stalled,
        pendingSteps,
        ...(fire === "day5" ? { simplifyOffer: true } : {}),
      },
    });
    return ok({ action: "reminded", threshold: fire, businessDaysStalled: stalled });
  }
  if (fire === "exception") {
    const created = await createExceptionInternal(ctx, {
      trigger: "stalled_implantation",
      reason: `implantação sem avanço há ${stalled} dias úteis`,
    });
    if (!created.ok) return created;
    await sendMarker(ctx, "account", ctx.accountId, {
      scope: "implantation",
      threshold: "exception",
      exceptionId: created.value.id,
      businessDaysStalled: stalled,
    });
    return ok({
      action: "exception_opened",
      exceptionId: created.value.id,
      businessDaysStalled: stalled,
    });
  }
  const paused = await pauseImplantationInTx(
    ctx,
    accountStatus,
    `implantação sem avanço há ${stalled} dias úteis`,
  );
  if (!paused.ok) return paused;
  await sendMarker(ctx, "account", ctx.accountId, {
    scope: "implantation",
    threshold: "paused",
    businessDaysStalled: stalled,
  });
  return ok({ action: "paused", businessDaysStalled: stalled });
}

function itemLimitOf(item: { deadlineAt: Date | null; scheduledFor: Date | null }): Date | null {
  if (item.deadlineAt) return item.deadlineAt;
  if (item.scheduledFor) return itemDeadlineFor(item.scheduledFor);
  return null;
}

async function sweepBatch(
  ctx: CommandContext,
  batch: EquipeBatch,
  markers: ReminderMarker[],
): Promise<{ batchId: string; reminded: string[] }> {
  const reminded: string[] = [];
  const sent = new Set(
    markers
      .filter((marker) => marker.batchId === batch.id)
      .map((marker) => marker.threshold),
  );
  const scope = scopeOf(ctx);
  const items = (await ctx.repos.items.list(scope, { batchId: batch.id })).filter(
    (item) => item.status === "awaiting_approval" || item.status === "adjusting",
  );
  if (items.length === 0) return { batchId: batch.id, reminded };
  if (batch.approveByAt && !sent.has("t24h")) {
    const dueAt = new Date(batch.approveByAt.getTime() - BATCH_REMINDER_LEAD_MS);
    // A threshold that already passed expired silently: no late "24 h
    // before" reminder after the deadline.
    if (ctx.now >= dueAt && ctx.now <= batch.approveByAt) {
      await sendMarker(ctx, "batch", batch.id, {
        scope: "batch",
        batchId: batch.id,
        threshold: "t24h",
      });
      await requestNotification(ctx, {
        recipientRole: "approver",
        templateKey: "batch.reminder_24h",
        detail: { batchId: batch.id, approveByAt: batch.approveByAt.toISOString() },
      });
      reminded.push("t24h");
    }
  }
  if (!sent.has("item4h")) {
    let first: { itemId: string; limit: Date } | null = null;
    for (const item of items) {
      const limit = itemLimitOf(item);
      if (!limit) continue;
      if (!first || limit < first.limit) first = { itemId: item.id, limit };
    }
    if (first) {
      const dueAt = new Date(first.limit.getTime() - ITEM_LIMIT_REMINDER_LEAD_MS);
      if (ctx.now >= dueAt && ctx.now <= first.limit) {
        await sendMarker(ctx, "batch", batch.id, {
          scope: "batch",
          batchId: batch.id,
          threshold: "item4h",
        });
        await requestNotification(ctx, {
          recipientRole: "approver",
          templateKey: "batch.reminder_item_4h",
          detail: { batchId: batch.id, itemId: first.itemId, limit: first.limit.toISOString() },
        });
        reminded.push("item4h");
      }
    }
  }
  return { batchId: batch.id, reminded };
}

async function deferredAtOf(ctx: CommandContext, escalation: EquipeEscalation): Promise<Date> {
  const events = await ctx.repos.events.list(scopeOf(ctx), {
    objectType: "escalation",
    objectId: escalation.id,
  });
  let latest: Date | null = null;
  for (const event of events) {
    if (event.eventType !== ESCALATION_DEFERRED_EVENT) continue;
    if (!latest || event.occurredAt > latest) latest = event.occurredAt;
  }
  return latest ?? escalation.updatedAt;
}

async function sweepClientWait(
  ctx: CommandContext,
  escalation: EquipeEscalation,
  markers: ReminderMarker[],
): Promise<{ escalationId: string; reminded: number[] }> {
  const reminded: number[] = [];
  if (escalation.dueAt && ctx.now >= escalation.dueAt) return { escalationId: escalation.id, reminded };
  const sent = new Set(
    markers
      .filter((marker) => marker.escalationId === escalation.id)
      .map((marker) => marker.index),
  );
  const deferredAt = await deferredAtOf(ctx, escalation);
  const elapsed = businessDaysElapsed(deferredAt, ctx.now);
  const due: number[] = [];
  for (let index = 1; index <= CLIENT_WAIT_REMINDER_CAP; index += 1) {
    if (elapsed >= index && !sent.has(index)) due.push(index);
  }
  if (due.length === 0) return { escalationId: escalation.id, reminded };
  // Same catch-up rule as the implantation path: only the highest due
  // reminder fires; lower ones are marked superseded.
  const fire = due[due.length - 1]!;
  for (const index of due) {
    if (index !== fire) {
      await sendMarker(ctx, "escalation", escalation.id, {
        scope: "escalation_wait",
        escalationId: escalation.id,
        index,
        supersededBy: fire,
      });
    }
  }
  await sendMarker(ctx, "escalation", escalation.id, {
    scope: "escalation_wait",
    escalationId: escalation.id,
    index: fire,
  });
  await requestNotification(ctx, {
    recipientRole: "approver",
    templateKey: "escalation.client_reminder",
    detail: {
      escalationId: escalation.id,
      dueAt: escalation.dueAt?.toISOString() ?? null,
      reminder: fire,
    },
  });
  reminded.push(fire);
  return { escalationId: escalation.id, reminded };
}

/**
 * Run every due reminder for the account: implantation stall path, batch
 * thresholds and capped client-wait reminders. Each threshold fires at most
 * once; re-runs are quiet no-ops.
 */
export async function runReminders(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: RunRemindersPayload,
): Promise<Result<CommandSuccess>> {
  void payload;
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    if (account.value.status === "closed") {
      return ok({ skipped: "closed" });
    }
    const implantation = await sweepImplantation(ctx, account.value.status, account.value.createdAt);
    if (!implantation.ok) return implantation;
    const batches: Array<{ batchId: string; reminded: string[] }> = [];
    const waits: Array<{ escalationId: string; reminded: number[] }> = [];
    if (account.value.status !== "suspended") {
      const scope = scopeOf(ctx);
      const markers = (await ctx.repos.events.list(scope, { eventType: REMINDER_SENT_EVENT }))
        .map(markerOf)
        .filter((marker): marker is ReminderMarker => marker !== null);
      const batchMarkers = markers.filter((marker) => marker.scope === "batch");
      const waitMarkers = markers.filter((marker) => marker.scope === "escalation_wait");
      for (const batch of await ctx.repos.batches.list(scope)) {
        if (batch.status !== "open" && batch.status !== "delivered") continue;
        batches.push(await sweepBatch(ctx, batch, batchMarkers));
      }
      for (const escalation of await ctx.repos.escalations.list(scope)) {
        if (escalation.status !== "awaiting_client") continue;
        waits.push(await sweepClientWait(ctx, escalation, waitMarkers));
      }
    }
    return ok({
      implantation: implantation.value,
      batches: batches.filter((entry) => entry.reminded.length > 0),
      clientWaits: waits.filter((entry) => entry.reminded.length > 0),
    });
  });
}
