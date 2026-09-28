// Calibration round lifecycle (#546): open_round, close_round.
//
// A round is one delivered batch (4 posts for Social, 3 angles for paid
// media), scored by quality on the evaluated attempt — the first AI version
// that reached quality — and decided by the client in the common batch flow.
// One round per week per front (São Paulo calendar), one open at a time.

import { z } from "zod";
import {
  actorId,
  decideRoundOutcome,
  err,
  ok,
  recordRoundOutcome,
  type FrontEvent,
  type Result,
  type RoundItemScore,
} from "../domain";
import type { EquipeModuleDeps } from "./ports";
import { closeRoundPayloadSchema, openRoundPayloadSchema } from "./envelope";
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
  ROUND_CLOSED_EVENT,
  ROUND_OPENED_EVENT,
  calibrationWeeksElapsed,
  frontKindOf,
  frontStateOf,
  loadFrontOrError,
  loadRoundItems,
  requireCalibrationAccount,
  resolveClientDecision,
  roundItemQuality,
  roundItemScoreOf,
  roundSizeOfKind,
  roundWeekKey,
  storedFrontStatusOf,
} from "./calibration-shared";
import { requireOpenRound } from "./calibration-round-access";

export type OpenRoundPayload = z.infer<typeof openRoundPayloadSchema>;
export type CloseRoundPayload = z.infer<typeof closeRoundPayloadSchema>;

/**
 * Open the weekly round for a front: the agent (or a system job) points the
 * round at one delivered batch with exactly the round size — 4 posts for
 * Social, 3 angles for paid media. Refuses a second round in the same São
 * Paulo week, and any new round while one is still open.
 */
export async function runOpenRound(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: OpenRoundPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const calibrating = requireCalibrationAccount(account.value);
    if (!calibrating.ok) return calibrating;
    const front = await loadFrontOrError(ctx, payload.frontId);
    if (!front.ok) return front;
    const kind = frontKindOf(front.value);
    if (!kind) {
      return err("invalid_front", `front ${front.value.id} has unknown key ${front.value.key}`);
    }
    const state = frontStateOf(front.value);
    if (!state.ok) return state;
    if (state.value.status !== "calibrating") {
      return err("invalid_transition", `front ${front.value.id} is ${state.value.status}`);
    }
    const scope = scopeOf(ctx);
    const batch = await ctx.repos.batches.get(scope, payload.batchId);
    if (!batch) {
      return err("unknown_batch", `unknown batch ${payload.batchId}`);
    }
    if (batch.frontId !== front.value.id) {
      return err(
        "batch_front_mismatch",
        `batch ${payload.batchId} does not belong to front ${front.value.id}`,
      );
    }
    const items = await ctx.repos.items.list(scope, { batchId: batch.id });
    const expectedSize = roundSizeOfKind(kind);
    if (items.length !== expectedSize) {
      return err(
        "round_size_mismatch",
        `a ${kind} round needs ${expectedSize} items, batch has ${items.length}`,
      );
    }
    const weekKey = roundWeekKey(ctx.now);
    const existing = (await ctx.repos.calibrationRounds.list(scope)).filter(
      (round) => round.frontId === front.value.id,
    );
    if (existing.some((round) => round.status === "open")) {
      return err("round_already_open", `front ${front.value.id} already has an open round`);
    }
    if (existing.some((round) => round.weekKey === weekKey)) {
      return err(
        "round_already_open_this_week",
        `front ${front.value.id} already has a round in week ${weekKey}`,
      );
    }
    const sequence = existing.reduce((max, round) => Math.max(max, round.sequence), 0) + 1;
    const round = await ctx.repos.calibrationRounds.create(scope, {
      frontId: front.value.id,
      batchId: batch.id,
      weekKey,
      sequence,
      status: "open",
    });
    const frontPatch: { status?: "calibrating"; calibrationStartedAt?: Date } = {};
    if (front.value.status === "draft") frontPatch.status = "calibrating";
    if (!front.value.calibrationStartedAt) frontPatch.calibrationStartedAt = ctx.now;
    if (Object.keys(frontPatch).length > 0) {
      await ctx.repos.fronts.update(scope, front.value.id, frontPatch);
    }
    const itemIds = [...items]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
      .map((item) => item.id);
    await appendEvent(ctx, {
      eventType: ROUND_OPENED_EVENT,
      objectType: "round",
      objectId: round.id,
      payload: {
        frontId: front.value.id,
        batchId: batch.id,
        weekKey,
        sequence,
        itemIds,
      },
    });
    await requestNotification(ctx, {
      recipientRole: "quality",
      templateKey: "round.opened",
      detail: { roundId: round.id, frontId: front.value.id, weekKey },
    });
    return ok({ roundId: round.id, sequence, weekKey, itemIds });
  });
}

async function appendFrontEvents(
  ctx: CommandContext,
  events: FrontEvent[],
  frontId: string,
): Promise<void> {
  for (const event of events) {
    await appendEvent(ctx, {
      eventType: event.type,
      objectType: "front",
      objectId: frontId,
      payload: event,
    });
  }
}

/**
 * Close the round once every item has its quality note — client decisions
 * may still be missing (the batch deadline also closes it). Failure beats
 * inconclusive; the outcome feeds the front sequence, and hitting 6 rounds
 * or 6 weeks without 3 consecutive passes opens the scope decision.
 */
export async function runCloseRound(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: CloseRoundPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const calibrating = requireCalibrationAccount(account.value);
    if (!calibrating.ok) return calibrating;
    const opened = await requireOpenRound(ctx, payload.roundId, { allowScopeDecision: false });
    if (!opened.ok) return opened;
    const kind = frontKindOf(opened.value.front);
    if (!kind) {
      return err("invalid_front", `front ${opened.value.front.id} has unknown key`);
    }
    const scope = scopeOf(ctx);
    const { items } = await loadRoundItems(scope, ctx.repos, opened.value.round);
    const expectedSize = roundSizeOfKind(kind);
    if (items.length !== expectedSize) {
      return err(
        "round_size_mismatch",
        `a ${kind} round needs ${expectedSize} items, found ${items.length}`,
      );
    }
    const [scores, roundEvents] = await Promise.all([
      ctx.repos.calibrationScores.list(scope),
      ctx.repos.events.list(scope, { objectType: "round", objectId: opened.value.round.id }),
    ]);
    const gate: RoundItemScore[] = [];
    const summaryItems: Array<Record<string, unknown>> = [];
    const loosenings: Array<Record<string, unknown>> = [];
    for (const item of items) {
      const score = scores.find((s) => s.roundId === opened.value.round.id && s.itemId === item.id);
      if (!score) {
        return err("unscored_item", `item ${item.id} has no attempt score yet`);
      }
      const quality = roundItemQuality(roundEvents, item.id);
      const [receipts, itemEvents] = await Promise.all([
        ctx.repos.receipts.listByObject(scope, "item", item.id),
        ctx.repos.events.list(scope, { objectType: "item", objectId: item.id }),
      ]);
      const decision = resolveClientDecision({
        item,
        receipts,
        itemEvents,
        classification: quality.classification,
      });
      const input = roundItemScoreOf(score, quality, decision.verdict);
      if (!input.ok) return input;
      gate.push(input.value);
      summaryItems.push({
        itemId: item.id,
        attemptScore: input.value.attemptScore,
        minDimension: input.value.minDimension,
        criticalFailure: input.value.criticalFailure,
        withdrawn: input.value.withdrawn,
        clientVerdict: decision.verdict,
        clientCategory: decision.clientCategory,
        effectiveCategory: decision.effectiveCategory,
      });
      if (quality.classification?.loosened) {
        loosenings.push({
          itemId: item.id,
          from: quality.classification.from,
          to: quality.classification.to,
          evidence: quality.classification.evidence,
        });
      }
    }
    const evaluated = decideRoundOutcome({ frontKind: kind, items: gate });
    if (!evaluated.ok) return evaluated;
    const weeksElapsed = calibrationWeeksElapsed(
      opened.value.front.calibrationStartedAt,
      ctx.now,
    );
    const recorded = recordRoundOutcome(opened.value.frontState, evaluated.value.outcome, weeksElapsed);
    if (!recorded.ok) return recorded;
    await ctx.repos.fronts.update(scope, opened.value.front.id, {
      status: storedFrontStatusOf(recorded.value.state.status),
      calibrationSequence: recorded.value.state.consecutivePasses,
      roundsUsed: recorded.value.state.roundsCompleted,
    });
    const scopeDecision = recorded.value.state.status === "scope_decision";
    await ctx.repos.calibrationRounds.update(scope, opened.value.round.id, {
      status: "closed",
      closedAt: ctx.now,
      decision: {
        outcome: evaluated.value.outcome,
        requiredDecisions: evaluated.value.requiredDecisions,
        decisions: evaluated.value.decisions,
        failures: evaluated.value.failures,
        consecutivePasses: recorded.value.state.consecutivePasses,
        roundsCompleted: recorded.value.state.roundsCompleted,
        items: summaryItems,
        loosenings,
        closedBy: actorId(ctx.actor),
      },
    });
    await appendFrontEvents(ctx, recorded.value.events, opened.value.front.id);
    await appendEvent(ctx, {
      eventType: ROUND_CLOSED_EVENT,
      objectType: "round",
      objectId: opened.value.round.id,
      payload: {
        outcome: evaluated.value.outcome,
        requiredDecisions: evaluated.value.requiredDecisions,
        decisions: evaluated.value.decisions,
        failures: evaluated.value.failures,
        consecutivePasses: recorded.value.state.consecutivePasses,
        roundsCompleted: recorded.value.state.roundsCompleted,
        scopeDecision,
      },
    });
    await requestNotification(ctx, {
      recipientRole: "strategist",
      templateKey: "round.closed",
      detail: { roundId: opened.value.round.id, outcome: evaluated.value.outcome },
    });
    if (scopeDecision) {
      await requestNotification(ctx, {
        recipientRole: "quality",
        templateKey: "front.scope_decision_opened",
        detail: { frontId: opened.value.front.id, roundId: opened.value.round.id },
      });
      await requestNotification(ctx, {
        recipientRole: "strategist",
        templateKey: "front.scope_decision_opened",
        detail: { frontId: opened.value.front.id, roundId: opened.value.round.id },
      });
    }
    return ok({
      roundId: opened.value.round.id,
      outcome: evaluated.value.outcome,
      consecutivePasses: recorded.value.state.consecutivePasses,
      roundsCompleted: recorded.value.state.roundsCompleted,
      scopeDecision,
    });
  });
}
