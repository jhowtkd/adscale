// Calibration rounds (#546): open_round, score_attempt, return_item_for_fix,
// release_item_to_client, mark_critical_failure, withdraw_round_item,
// classify_rejection, close_round.
//
// A round is one delivered batch (4 posts for Social, 3 angles for paid
// media), scored by quality on the evaluated attempt — the first AI version
// that reached quality — and decided by the client in the common batch flow.
// One round per week per front (São Paulo calendar), one open at a time.

import { z } from "zod";
import {
  actorId,
  decideRoundOutcome,
  MIN_ATTEMPT_SCORE,
  MIN_DIMENSION_SCORE,
  recordRoundOutcome,
  err,
  ok,
  type FrontEvent,
  type FrontState,
  type Result,
  type RoundItemScore,
} from "../domain";
import type { EquipeCalibrationRound, EquipeFront, EquipeItem } from "../data";
import type { EquipeModuleDeps } from "./ports";
import {
  classifyRejectionPayloadSchema,
  closeRoundPayloadSchema,
  markCriticalFailurePayloadSchema,
  openRoundPayloadSchema,
  releaseItemToClientPayloadSchema,
  returnItemForFixPayloadSchema,
  scoreAttemptPayloadSchema,
  withdrawRoundItemPayloadSchema,
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
import { AGENT_WORK_REQUESTED_EVENT, ITEM_ADJUSTMENT_REQUESTED_EVENT } from "./item-shared";
import {
  ROUND_CLOSED_EVENT,
  ROUND_CRITICAL_FAILURE_EVENT,
  ROUND_ITEM_RELEASED_EVENT,
  ROUND_ITEM_RETURNED_EVENT,
  ROUND_ITEM_SCORED_EVENT,
  ROUND_ITEM_WITHDRAWN_EVENT,
  ROUND_OPENED_EVENT,
  ROUND_REJECTION_CLASSIFIED_EVENT,
  calibrationWeeksElapsed,
  frontKindOf,
  frontStateOf,
  isFailingCategory,
  loadFrontOrError,
  loadRoundItems,
  loadRoundOrError,
  parseRubric,
  requireCalibrationAccount,
  resolveClientDecision,
  roundItemQuality,
  roundItemScoreOf,
  roundSizeOfKind,
  roundWeekKey,
  rubricMin,
  rubricTotal,
  storedFrontStatusOf,
  type QualityClassification,
  type RoundItemQuality,
} from "./calibration-shared";

export type OpenRoundPayload = z.infer<typeof openRoundPayloadSchema>;
export type ScoreAttemptPayload = z.infer<typeof scoreAttemptPayloadSchema>;
export type ReturnItemForFixPayload = z.infer<typeof returnItemForFixPayloadSchema>;
export type ReleaseItemToClientPayload = z.infer<typeof releaseItemToClientPayloadSchema>;
export type MarkCriticalFailurePayload = z.infer<typeof markCriticalFailurePayloadSchema>;
export type WithdrawRoundItemPayload = z.infer<typeof withdrawRoundItemPayloadSchema>;
export type ClassifyRejectionPayload = z.infer<typeof classifyRejectionPayloadSchema>;
export type CloseRoundPayload = z.infer<typeof closeRoundPayloadSchema>;

type OpenRound = {
  round: EquipeCalibrationRound;
  front: EquipeFront;
  frontState: FrontState;
};

async function requireOpenRound(
  ctx: CommandContext,
  roundId: string,
  opts: { allowScopeDecision: boolean },
): Promise<Result<OpenRound>> {
  const round = await loadRoundOrError(ctx, roundId);
  if (!round.ok) return round;
  if (round.value.status !== "open") {
    return err("round_closed", `round ${roundId} is ${round.value.status}`);
  }
  const front = await loadFrontOrError(ctx, round.value.frontId);
  if (!front.ok) return front;
  const state = frontStateOf(front.value);
  if (!state.ok) return state;
  const allowed =
    state.value.status === "calibrating" ||
    (opts.allowScopeDecision && state.value.status === "scope_decision");
  if (!allowed) {
    return err("invalid_transition", `front ${front.value.id} is ${state.value.status}`);
  }
  return ok({ round: round.value, front: front.value, frontState: state.value });
}

type RoundItemState = {
  item: EquipeItem;
  quality: RoundItemQuality;
  score: Awaited<ReturnType<CommandContext["repos"]["calibrationScores"]["list"]>>[number] | null;
};

/**
 * The item must belong to the round: either still linked to the round batch
 * or withdrawn from this round (withdrawal only unlinks the batch).
 */
async function loadRoundItemState(
  ctx: CommandContext,
  round: EquipeCalibrationRound,
  itemId: string,
): Promise<Result<RoundItemState>> {
  const scope = scopeOf(ctx);
  const [item, roundEvents, scores] = await Promise.all([
    ctx.repos.items.get(scope, itemId),
    ctx.repos.events.list(scope, { objectType: "round", objectId: round.id }),
    ctx.repos.calibrationScores.list(scope),
  ]);
  if (!item) return err("unknown_item", `unknown item ${itemId}`);
  if (item.frontId !== round.frontId) {
    return err("item_not_in_round", `item ${itemId} is not in round ${round.id}`);
  }
  const quality = roundItemQuality(roundEvents, itemId);
  if (item.batchId !== round.batchId && !quality.withdrawn) {
    return err("item_not_in_round", `item ${itemId} is not in round ${round.id}`);
  }
  const score = scores.find((s) => s.roundId === round.id && s.itemId === itemId) ?? null;
  return ok({ item, quality, score });
}

function requireScored(state: RoundItemState): Result<void> {
  if (!state.score) {
    return err("unscored_item", `item ${state.item.id} has no attempt score yet`);
  }
  return ok(undefined);
}

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

/**
 * Score the evaluated attempt: the FIRST version of the item — what the IA
 * would have delivered alone. The F/M/U/E rubric (0–4 each) pins that
 * version hash; later corrections never change the note.
 */
export async function runScoreAttempt(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ScoreAttemptPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const calibrating = requireCalibrationAccount(account.value);
    if (!calibrating.ok) return calibrating;
    const opened = await requireOpenRound(ctx, payload.roundId, { allowScopeDecision: true });
    if (!opened.ok) return opened;
    const state = await loadRoundItemState(ctx, opened.value.round, payload.itemId);
    if (!state.ok) return state;
    if (state.value.score) {
      return err("already_scored", `item ${payload.itemId} is already scored in this round`);
    }
    if (state.value.quality.withdrawn) {
      return err("item_withdrawn", `item ${payload.itemId} was withdrawn from this round`);
    }
    const versions = await ctx.repos.itemVersions.list(scopeOf(ctx), {
      itemId: payload.itemId,
    });
    const attempt = [...versions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    if (!attempt) {
      return err("no_version", `item ${payload.itemId} has no version to score`);
    }
    const rubric = {
      facts: payload.facts,
      brand: payload.brand,
      usefulness: payload.usefulness,
      execution: payload.execution,
    };
    const total = rubricTotal(rubric);
    const minDimension = rubricMin(rubric);
    const verdict = total >= MIN_ATTEMPT_SCORE && minDimension >= MIN_DIMENSION_SCORE ? "pass" : "fail";
    const score = await ctx.repos.calibrationScores.create(scopeOf(ctx), {
      roundId: opened.value.round.id,
      itemId: payload.itemId,
      versionHash: attempt.versionHash,
      rubric,
      verdict,
      feedback: payload.feedback,
      scoredBy: actorId(ctx.actor),
    });
    await appendEvent(ctx, {
      eventType: ROUND_ITEM_SCORED_EVENT,
      objectType: "round",
      objectId: opened.value.round.id,
      payload: {
        itemId: payload.itemId,
        versionHash: attempt.versionHash,
        rubric,
        total,
        minDimension,
        verdict,
      },
    });
    return ok({ scoreId: score.id, versionHash: attempt.versionHash, total, minDimension, verdict });
  });
}

/**
 * Return the item for fix, once per item per round: the piece improves for
 * the client, the note stays. Asks the IA for a corrected version.
 */
export async function runReturnItemForFix(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ReturnItemForFixPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const calibrating = requireCalibrationAccount(account.value);
    if (!calibrating.ok) return calibrating;
    const opened = await requireOpenRound(ctx, payload.roundId, { allowScopeDecision: true });
    if (!opened.ok) return opened;
    const state = await loadRoundItemState(ctx, opened.value.round, payload.itemId);
    if (!state.ok) return state;
    const scored = requireScored(state.value);
    if (!scored.ok) return scored;
    const quality = state.value.quality;
    if (quality.returned) {
      return err("already_returned", `item ${payload.itemId} was already returned in this round`);
    }
    if (quality.released) {
      return err("already_released", `item ${payload.itemId} was already released to the client`);
    }
    if (quality.critical) {
      return err("item_critical", `item ${payload.itemId} has a critical failure in this round`);
    }
    if (quality.withdrawn) {
      return err("item_withdrawn", `item ${payload.itemId} was withdrawn from this round`);
    }
    const versionHash = state.value.item.currentVersionHash;
    if (!versionHash) {
      return err("no_version", `item ${payload.itemId} has no current version`);
    }
    await appendEvent(ctx, {
      eventType: ROUND_ITEM_RETURNED_EVENT,
      objectType: "round",
      objectId: opened.value.round.id,
      payload: { itemId: payload.itemId, versionHash, note: payload.note },
    });
    await appendEvent(ctx, {
      eventType: AGENT_WORK_REQUESTED_EVENT,
      objectType: "item",
      objectId: payload.itemId,
      payload: {
        kind: "calibration_correction",
        roundId: opened.value.round.id,
        versionHash,
        note: payload.note,
      },
    });
    return ok({ itemId: payload.itemId, versionHash });
  });
}

/**
 * Release the item to the client with the "em calibração · conferido por…"
 * seal. Releasing as-is is refused when any scored dimension is below 3 —
 * a low attempt must go through correction (or be marked critical) first.
 */
export async function runReleaseItemToClient(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ReleaseItemToClientPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const calibrating = requireCalibrationAccount(account.value);
    if (!calibrating.ok) return calibrating;
    const opened = await requireOpenRound(ctx, payload.roundId, { allowScopeDecision: true });
    if (!opened.ok) return opened;
    const state = await loadRoundItemState(ctx, opened.value.round, payload.itemId);
    if (!state.ok) return state;
    const scored = requireScored(state.value);
    if (!scored.ok) return scored;
    const quality = state.value.quality;
    if (quality.released) {
      return err("already_released", `item ${payload.itemId} was already released to the client`);
    }
    if (quality.critical) {
      return err("item_critical", `item ${payload.itemId} has a critical failure in this round`);
    }
    if (quality.withdrawn) {
      return err("item_withdrawn", `item ${payload.itemId} was withdrawn from this round`);
    }
    const versionHash = state.value.item.currentVersionHash;
    if (!versionHash) {
      return err("no_version", `item ${payload.itemId} has no current version`);
    }
    let corrected = false;
    if (quality.returned) {
      if (versionHash === quality.returned.versionHash) {
        return err(
          "correction_pending",
          `item ${payload.itemId} is still waiting for its corrected version`,
        );
      }
      corrected = true;
    } else {
      const rubric = parseRubric(state.value.score?.rubric);
      if (!rubric || rubricMin(rubric) < MIN_DIMENSION_SCORE) {
        return err(
          "release_blocked_low_score",
          `item ${payload.itemId} cannot go out as-is with a dimension below ${MIN_DIMENSION_SCORE}`,
        );
      }
    }
    await appendEvent(ctx, {
      eventType: ROUND_ITEM_RELEASED_EVENT,
      objectType: "round",
      objectId: opened.value.round.id,
      payload: { itemId: payload.itemId, versionHash, corrected },
    });
    return ok({ itemId: payload.itemId, versionHash, corrected });
  });
}

/**
 * Mark a critical failure on the evaluated attempt (invented price, wrong
 * person, wrong account…). Fails the round whatever else happens.
 */
export async function runMarkCriticalFailure(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: MarkCriticalFailurePayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const calibrating = requireCalibrationAccount(account.value);
    if (!calibrating.ok) return calibrating;
    const opened = await requireOpenRound(ctx, payload.roundId, { allowScopeDecision: true });
    if (!opened.ok) return opened;
    const state = await loadRoundItemState(ctx, opened.value.round, payload.itemId);
    if (!state.ok) return state;
    const scored = requireScored(state.value);
    if (!scored.ok) return scored;
    const quality = state.value.quality;
    if (quality.critical) {
      return err("already_marked", `item ${payload.itemId} already has a critical failure`);
    }
    if (quality.released) {
      return err(
        "already_released",
        `item ${payload.itemId} went to the client; failures after release go through escalation`,
      );
    }
    if (quality.withdrawn) {
      return err("item_withdrawn", `item ${payload.itemId} was withdrawn from this round`);
    }
    await appendEvent(ctx, {
      eventType: ROUND_CRITICAL_FAILURE_EVENT,
      objectType: "round",
      objectId: opened.value.round.id,
      payload: { itemId: payload.itemId, reason: payload.reason },
    });
    await requestNotification(ctx, {
      recipientRole: "strategist",
      templateKey: "round.critical_failure",
      detail: { roundId: opened.value.round.id, itemId: payload.itemId },
    });
    return ok({ itemId: payload.itemId });
  });
}

/**
 * Withdraw the item from the batch after its corrected version still does
 * not serve. The item leaves the batch and counts against the round.
 */
export async function runWithdrawRoundItem(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: WithdrawRoundItemPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const calibrating = requireCalibrationAccount(account.value);
    if (!calibrating.ok) return calibrating;
    const opened = await requireOpenRound(ctx, payload.roundId, { allowScopeDecision: true });
    if (!opened.ok) return opened;
    const state = await loadRoundItemState(ctx, opened.value.round, payload.itemId);
    if (!state.ok) return state;
    const scored = requireScored(state.value);
    if (!scored.ok) return scored;
    const quality = state.value.quality;
    if (quality.withdrawn) {
      return err("already_withdrawn", `item ${payload.itemId} was already withdrawn`);
    }
    if (quality.critical) {
      return err("item_critical", `item ${payload.itemId} has a critical failure in this round`);
    }
    if (quality.released) {
      return err("already_released", `item ${payload.itemId} was already released to the client`);
    }
    if (!quality.returned) {
      return err(
        "no_return",
        `item ${payload.itemId} can only be withdrawn after a failed correction`,
      );
    }
    if (state.value.item.currentVersionHash === quality.returned.versionHash) {
      return err(
        "correction_pending",
        `item ${payload.itemId} is still waiting for its corrected version`,
      );
    }
    await ctx.repos.items.update(scopeOf(ctx), payload.itemId, { batchId: null });
    await appendEvent(ctx, {
      eventType: ROUND_ITEM_WITHDRAWN_EVENT,
      objectType: "round",
      objectId: opened.value.round.id,
      payload: { itemId: payload.itemId, reason: payload.reason ?? null },
    });
    await requestNotification(ctx, {
      recipientRole: "strategist",
      templateKey: "round.item_withdrawn",
      detail: { roundId: opened.value.round.id, itemId: payload.itemId },
    });
    return ok({ itemId: payload.itemId });
  });
}

function latestAdjustmentCategory(itemEvents: { eventType: string; payload: unknown }[]): string | null {
  let category: string | null = null;
  for (const event of itemEvents) {
    if (event.eventType !== ITEM_ADJUSTMENT_REQUESTED_EVENT) continue;
    const payload = event.payload as Record<string, unknown> | null;
    if (payload && typeof payload.category === "string") category = payload.category;
  }
  return category;
}

/**
 * Reclassify the client's taste-vs-brand call: tightening is free, loosening
 * (fact/brand → taste) requires recorded evidence and shows up in the round
 * summary. The latest classification wins.
 */
export async function runClassifyRejection(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ClassifyRejectionPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const calibrating = requireCalibrationAccount(account.value);
    if (!calibrating.ok) return calibrating;
    const opened = await requireOpenRound(ctx, payload.roundId, { allowScopeDecision: true });
    if (!opened.ok) return opened;
    const state = await loadRoundItemState(ctx, opened.value.round, payload.itemId);
    if (!state.ok) return state;
    const itemEvents = await ctx.repos.events.list(scopeOf(ctx), {
      objectType: "item",
      objectId: payload.itemId,
    });
    const from = latestAdjustmentCategory(itemEvents);
    if (!from) {
      return err("nothing_to_classify", `item ${payload.itemId} has no client adjustment to classify`);
    }
    const to: QualityClassification = payload.category;
    const loosened = isFailingCategory(from) && to === "taste";
    if (loosened && !payload.evidence?.trim()) {
      return err("evidence_required", "loosening a fact/brand rejection requires recorded evidence");
    }
    await appendEvent(ctx, {
      eventType: ROUND_REJECTION_CLASSIFIED_EVENT,
      objectType: "round",
      objectId: opened.value.round.id,
      payload: { itemId: payload.itemId, from, to, evidence: payload.evidence ?? null, loosened },
    });
    return ok({ itemId: payload.itemId, from, to, loosened });
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
