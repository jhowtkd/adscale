// Calibration monitor (#549, system job): the automatic watch after a
// front is released, plus the quality-hours budget during calibration.
//
// - Released fronts: client rejections for fact or brand above 20% over
//   the last 10 items open a content escalation to quality. Each item
//   counts once, by its latest client decision (approval vs adjustment
//   request); undecided items count as non-rejections, so the trigger is
//   3+ rejections in the window. Skipped while the front already has an
//   open escalation — a human is on it.
// - Calibrating fronts: recorded quality effort above 6 h alerts quality,
//   above 8 h alerts the founder to decide. Each fires once per front.
//   Effort is read from `quality.effort_recorded` events (minutes per
//   front), booked by the quality staff through `record_quality_effort`.

import { z } from "zod";
import { err, ok, type Result } from "../domain";
import type { EquipeEvent, EquipeFront, EquipeItem } from "../data";
import type { EquipeModuleDeps } from "./ports";
import { recordQualityEffortPayloadSchema, runCalibrationMonitorPayloadSchema } from "./envelope";
import { loadFrontOrError, loadRoundOrError } from "./calibration-shared";
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
  ITEM_ADJUSTMENT_REQUESTED_EVENT,
  ITEM_APPROVED_EVENT,
} from "./item-shared";
import {
  createEscalationInternal,
  isTerminalStatus,
} from "./escalations-shared";

export type RunCalibrationMonitorPayload = z.infer<typeof runCalibrationMonitorPayloadSchema>;
export type RecordQualityEffortPayload = z.infer<typeof recordQualityEffortPayloadSchema>;

/** Quality effort bookings the monitor sums, in minutes per front. */
export const QUALITY_EFFORT_RECORDED_EVENT = "quality.effort_recorded";
export const QUALITY_HOURS_ALERTED_EVENT = "quality.hours_alerted";
export const QUALITY_HOURS_ESCALATED_EVENT = "quality.hours_escalated";

/** Rejection window: the last N items of the front, by delivery order. */
export const REJECTION_WINDOW_ITEMS = 10;
/** Spike above this fraction of the window opens the escalation. */
export const REJECTION_SPIKE_RATE = 0.2;

/** Quality budget per front: alert above 6 h, founder decides above 8 h. */
export const QUALITY_HOURS_WARNING_MINUTES = 6 * 60;
export const QUALITY_HOURS_BUDGET_MINUTES = 8 * 60;

const REJECTION_CATEGORIES = new Set(["fact", "brand"]);

function latestDecision(events: EquipeEvent[]): { type: string; occurredAt: Date; category: unknown } | null {
  let latest: { type: string; occurredAt: Date; category: unknown } | null = null;
  for (const event of events) {
    if (event.eventType !== ITEM_APPROVED_EVENT && event.eventType !== ITEM_ADJUSTMENT_REQUESTED_EVENT) {
      continue;
    }
    if (latest && event.occurredAt <= latest.occurredAt) continue;
    const payload = event.payload as Record<string, unknown> | null;
    latest = {
      type: event.eventType,
      occurredAt: event.occurredAt,
      category: payload?.category,
    };
  }
  return latest;
}

async function isItemRejected(ctx: CommandContext, item: EquipeItem): Promise<boolean> {
  const events = await ctx.repos.events.list(scopeOf(ctx), {
    objectType: "item",
    objectId: item.id,
  });
  const decision = latestDecision(events);
  return (
    decision?.type === ITEM_ADJUSTMENT_REQUESTED_EVENT &&
    typeof decision.category === "string" &&
    REJECTION_CATEGORIES.has(decision.category)
  );
}

async function hasOpenFrontEscalation(ctx: CommandContext, frontId: string): Promise<boolean> {
  const scope = scopeOf(ctx);
  // Sequential on purpose: one transaction client, where parallel queries
  // warn today and break in pg@9 (#574).
  const escalations = await ctx.repos.escalations.list(scope);
  const items = await ctx.repos.items.list(scope, { frontId });
  const itemIds = new Set(items.map((item) => item.id));
  return escalations.some((escalation) => {
    if (isTerminalStatus(escalation.status)) return false;
    if (escalation.frontId === frontId) return true;
    return escalation.itemId !== null && itemIds.has(escalation.itemId);
  });
}

async function sweepReleasedFront(
  ctx: CommandContext,
  front: EquipeFront,
): Promise<{ frontId: string; rejections: number; window: number; escalated: boolean }> {
  const items = (await ctx.repos.items.list(scopeOf(ctx), { frontId: front.id }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, REJECTION_WINDOW_ITEMS);
  let rejections = 0;
  for (const item of items) {
    if (await isItemRejected(ctx, item)) rejections += 1;
  }
  const result = { frontId: front.id, rejections, window: items.length, escalated: false };
  if (rejections / REJECTION_WINDOW_ITEMS <= REJECTION_SPIKE_RATE) return result;
  if (await hasOpenFrontEscalation(ctx, front.id)) return result;
  const created = await createEscalationInternal(ctx, {
    kind: "content",
    severity: "normal",
    frontId: front.id,
    reason:
      `rejeições do cliente por fato ou marca acima de 20% ` +
      `nos últimos ${REJECTION_WINDOW_ITEMS} itens (${rejections}/${REJECTION_WINDOW_ITEMS})`,
    origin: "auto",
  });
  if (!created.ok) return result;
  return { ...result, escalated: true };
}

function effortMinutesOf(event: EquipeEvent): number {
  const payload = event.payload as Record<string, unknown> | null;
  const minutes = payload?.minutes;
  return typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}

async function sweepCalibratingFront(
  ctx: CommandContext,
  front: EquipeFront,
): Promise<{ frontId: string; minutes: number; warned: boolean; escalated: boolean }> {
  const events = await ctx.repos.events.list(scopeOf(ctx), {
    objectType: "front",
    objectId: front.id,
  });
  let minutes = 0;
  let warned = false;
  let escalated = false;
  for (const event of events) {
    if (event.eventType === QUALITY_EFFORT_RECORDED_EVENT) minutes += effortMinutesOf(event);
    if (event.eventType === QUALITY_HOURS_ALERTED_EVENT) warned = true;
    if (event.eventType === QUALITY_HOURS_ESCALATED_EVENT) escalated = true;
  }
  const result = { frontId: front.id, minutes, warned: false, escalated: false };
  if (minutes > QUALITY_HOURS_WARNING_MINUTES && !warned) {
    await appendEvent(ctx, {
      eventType: QUALITY_HOURS_ALERTED_EVENT,
      objectType: "front",
      objectId: front.id,
      payload: { minutes },
    });
    await requestNotification(ctx, {
      recipientRole: "quality",
      templateKey: "quality.hours_warning",
      detail: { frontId: front.id, minutes },
    });
    result.warned = true;
  }
  if (minutes > QUALITY_HOURS_BUDGET_MINUTES && !escalated) {
    await appendEvent(ctx, {
      eventType: QUALITY_HOURS_ESCALATED_EVENT,
      objectType: "front",
      objectId: front.id,
      payload: { minutes },
    });
    await requestNotification(ctx, {
      recipientRole: "founder",
      templateKey: "quality.hours_over_budget",
      detail: { frontId: front.id, minutes },
    });
    result.escalated = true;
  }
  return result;
}

/**
 * Book quality time on a front (QUALITY staff only): appends a
 * `quality.effort_recorded` event the monitor sums per front. The round is
 * an optional annotation — when given it must exist on this front. Each
 * booking is its own event; there is no daily cap beyond the 8 h payload
 * limit, so a long day is booked as several entries.
 */
export async function runRecordQualityEffort(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: RecordQualityEffortPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const front = await loadFrontOrError(ctx, payload.frontId);
    if (!front.ok) return front;
    if (payload.roundId) {
      const round = await loadRoundOrError(ctx, payload.roundId);
      if (!round.ok) return round;
      if (round.value.frontId !== front.value.id) {
        return err("round_not_in_front", `round ${payload.roundId} is not on front ${front.value.id}`);
      }
    }
    const event = await appendEvent(ctx, {
      eventType: QUALITY_EFFORT_RECORDED_EVENT,
      objectType: "front",
      objectId: front.value.id,
      payload: {
        frontId: front.value.id,
        ...(payload.roundId ? { roundId: payload.roundId } : {}),
        minutes: payload.minutes,
        ...(payload.note ? { note: payload.note } : {}),
      },
    });
    return ok({ eventId: event.id, frontId: front.value.id, minutes: payload.minutes });
  });
}

/**
 * Monitor every front of the account: rejection spikes on released fronts,
 * quality-hours budget on calibrating ones. Fully idempotent: the open
 * escalation and the once-per-front markers make re-runs quiet.
 */
export async function runCalibrationMonitor(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: RunCalibrationMonitorPayload,
): Promise<Result<CommandSuccess>> {
  void payload;
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    if (account.value.status !== "calibrating" && account.value.status !== "active") {
      return ok({ skipped: account.value.status });
    }
    const released: Array<{ frontId: string; rejections: number; window: number; escalated: boolean }> = [];
    const budgets: Array<{ frontId: string; minutes: number; warned: boolean; escalated: boolean }> = [];
    for (const front of await ctx.repos.fronts.list(scopeOf(ctx))) {
      if (front.status === "released") {
        released.push(await sweepReleasedFront(ctx, front));
      } else if (front.status === "calibrating") {
        budgets.push(await sweepCalibratingFront(ctx, front));
      }
    }
    return ok({ released, budgets });
  });
}
