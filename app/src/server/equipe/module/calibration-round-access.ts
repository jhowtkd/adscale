// Shared loaders of the calibration round commands (#546): the open round
// with its front, and the item with its per-round quality state + score.

import {
  err,
  ok,
  type FrontState,
  type Result,
} from "../domain";
import type { EquipeCalibrationRound, EquipeFront, EquipeItem } from "../data";
import type { CommandContext } from "./shared";
import { scopeOf } from "./shared";
import {
  frontStateOf,
  loadFrontOrError,
  loadRoundOrError,
  roundItemQuality,
  type RoundItemQuality,
} from "./calibration-shared";

export type OpenRound = {
  round: EquipeCalibrationRound;
  front: EquipeFront;
  frontState: FrontState;
};

export async function requireOpenRound(
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

export type RoundItemState = {
  item: EquipeItem;
  quality: RoundItemQuality;
  score: Awaited<ReturnType<CommandContext["repos"]["calibrationScores"]["list"]>>[number] | null;
};

/**
 * The item must belong to the round: either still linked to the round batch
 * or withdrawn from this round (withdrawal only unlinks the batch).
 */
export async function loadRoundItemState(
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

export function requireScored(state: RoundItemState): Result<void> {
  if (!state.score) {
    return err("unscored_item", `item ${state.item.id} has no attempt score yet`);
  }
  return ok(undefined);
}
