// Calibration quality verdicts (#546): mark_critical_failure,
// withdraw_round_item, classify_rejection.
//
// A critical failure on the evaluated attempt fails the round whatever else
// happens; a withdrawal drops the item from the batch after its corrected
// version still does not serve; the rejection classification re-labels the
// client's taste-vs-brand call (loosening needs recorded evidence).

import { z } from "zod";
import { err, ok, type Result } from "../domain";
import type { EquipeModuleDeps } from "./ports";
import {
  classifyRejectionPayloadSchema,
  markCriticalFailurePayloadSchema,
  withdrawRoundItemPayloadSchema,
} from "./envelope";
import {
  appendEvent,
  loadAccountOrError,
  requestNotification,
  scopeOf,
  transact,
  type CommandSuccess,
  type TxBase,
} from "./shared";
import { ITEM_ADJUSTMENT_REQUESTED_EVENT } from "./item-shared";
import {
  ROUND_CRITICAL_FAILURE_EVENT,
  ROUND_ITEM_WITHDRAWN_EVENT,
  ROUND_REJECTION_CLASSIFIED_EVENT,
  isFailingCategory,
  requireCalibrationAccount,
  type QualityClassification,
} from "./calibration-shared";
import { loadRoundItemState, requireOpenRound, requireScored } from "./calibration-round-access";

export type MarkCriticalFailurePayload = z.infer<typeof markCriticalFailurePayloadSchema>;
export type WithdrawRoundItemPayload = z.infer<typeof withdrawRoundItemPayloadSchema>;
export type ClassifyRejectionPayload = z.infer<typeof classifyRejectionPayloadSchema>;

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
