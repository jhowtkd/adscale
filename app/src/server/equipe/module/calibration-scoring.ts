// Calibration scoring and client handoff (#546): score_attempt,
// return_item_for_fix, submit_corrected_version, release_item_to_client.
//
// Quality scores the evaluated attempt — the FIRST version — and either
// releases it as-is or returns it for fix; the agent submits one corrected
// version through a real command, and quality releases that. A client caption
// edit after release needs the re-check again via the same release command.

import { z } from "zod";
import {
  actorId,
  MIN_ATTEMPT_SCORE,
  MIN_DIMENSION_SCORE,
  err,
  ok,
  type Result,
} from "../domain";
import type { EquipeModuleDeps } from "./ports";
import {
  releaseItemToClientPayloadSchema,
  returnItemForFixPayloadSchema,
  scoreAttemptPayloadSchema,
  submitCorrectedVersionPayloadSchema,
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
import {
  AGENT_WORK_REQUESTED_EVENT,
  itemVersionHash,
  storedDestinationOf,
  versionContentOf,
} from "./item-shared";
import {
  ROUND_ITEM_CORRECTED_EVENT,
  ROUND_ITEM_RELEASED_EVENT,
  ROUND_ITEM_RETURNED_EVENT,
  ROUND_ITEM_SCORED_EVENT,
  parseRubric,
  requireCalibrationAccount,
  rubricMin,
  rubricTotal,
} from "./calibration-shared";
import { loadRoundItemState, requireOpenRound, requireScored } from "./calibration-round-access";

export type ScoreAttemptPayload = z.infer<typeof scoreAttemptPayloadSchema>;
export type ReturnItemForFixPayload = z.infer<typeof returnItemForFixPayloadSchema>;
export type SubmitCorrectedVersionPayload = z.infer<typeof submitCorrectedVersionPayloadSchema>;
export type ReleaseItemToClientPayload = z.infer<typeof releaseItemToClientPayloadSchema>;

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
 * The agent submits the corrected version for an item returned for fix, in
 * an open round: one new immutable version (same hashing as the batch flow),
 * linked as the corrected attempt, back in the quality queue. The evaluated
 * attempt stays the FIRST version — the score never moves.
 */
export async function runSubmitCorrectedVersion(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: SubmitCorrectedVersionPayload,
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
    const quality = state.value.quality;
    if (!quality.returned) {
      return err("no_return", `item ${payload.itemId} was not returned for fix in this round`);
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
    const scope = scopeOf(ctx);
    const item = state.value.item;
    const currentHash = item.currentVersionHash;
    if (!currentHash) {
      return err("no_version", `item ${payload.itemId} has no current version`);
    }
    if (currentHash !== quality.returned.versionHash) {
      return err(
        "already_corrected",
        `item ${payload.itemId} already has its corrected version in this round`,
      );
    }
    const current = await ctx.repos.itemVersions.getByHash(scope, item.id, currentHash);
    if (!current) {
      return err("invalid_transition", `item ${item.id} has no current version`);
    }
    if (payload.creativeWorkOutputId) {
      const output = await deps.gateway.getCreativeWorkOutput(payload.creativeWorkOutputId);
      if (!output || output.workspaceId !== ctx.workspaceId) {
        return err(
          "unknown_creative_output",
          `creative output ${payload.creativeWorkOutputId} is not in workspace ${ctx.workspaceId}`,
        );
      }
      if (!item.creativeWorkId || output.workId !== item.creativeWorkId) {
        return err(
          "output_work_mismatch",
          `creative output ${payload.creativeWorkOutputId} is not from this item's work`,
        );
      }
    }
    const destination = storedDestinationOf(item, current);
    if (!destination) {
      return err("invalid_transition", `item ${item.id} has no recorded destination account`);
    }
    const versionHash = itemVersionHash({
      ...versionContentOf(current, destination),
      output: payload.creativeWorkOutputId ?? current.creativeWorkOutputId,
      caption: payload.caption ?? current.caption,
    });
    if (versionHash === currentHash) {
      return err("no_change", "the corrected version is identical to the returned one");
    }
    await ctx.repos.itemVersions.create(scope, {
      itemId: item.id,
      versionHash,
      creativeWorkOutputId: payload.creativeWorkOutputId ?? current.creativeWorkOutputId,
      caption: payload.caption ?? current.caption,
      scheduledFor: current.scheduledFor,
      destination,
      destinationIgUserId: current.destinationIgUserId,
      authorRole: "agent",
      authorId: actorId(ctx.actor),
      reviewerFindings: null,
    });
    await ctx.repos.items.update(scope, item.id, { currentVersionHash: versionHash });
    await appendEvent(ctx, {
      eventType: ROUND_ITEM_CORRECTED_EVENT,
      objectType: "round",
      objectId: opened.value.round.id,
      payload: { itemId: payload.itemId, versionHash, previousVersionHash: currentHash },
    });
    await requestNotification(ctx, {
      recipientRole: "quality",
      templateKey: "round.correction_submitted",
      detail: { roundId: opened.value.round.id, itemId: payload.itemId, versionHash },
    });
    return ok({ itemId: payload.itemId, versionHash, previousVersionHash: currentHash });
  });
}

/**
 * Release the item to the client with the "em calibração · conferido por…"
 * seal. Releasing as-is is refused when any scored dimension is below 3 —
 * a low attempt must go through correction (or be marked critical) first. A
 * client caption edit after release needs the re-check again: the same
 * command releases the new current version.
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
    const versionHash = state.value.item.currentVersionHash;
    if (!versionHash) {
      return err("no_version", `item ${payload.itemId} has no current version`);
    }
    if (quality.released && quality.released.versionHash === versionHash) {
      return err("already_released", `item ${payload.itemId} was already released to the client`);
    }
    if (quality.critical) {
      return err("item_critical", `item ${payload.itemId} has a critical failure in this round`);
    }
    if (quality.withdrawn) {
      return err("item_withdrawn", `item ${payload.itemId} was withdrawn from this round`);
    }
    const recheck = quality.released !== null;
    let corrected = recheck;
    if (!recheck) {
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
    } else if (quality.returned && versionHash === quality.returned.versionHash) {
      return err(
        "correction_pending",
        `item ${payload.itemId} is still waiting for its corrected version`,
      );
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
