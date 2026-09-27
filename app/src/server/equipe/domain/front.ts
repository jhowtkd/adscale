// Frente (front) calibration sequence — one sequence per front.
// Released after 3 consecutive passing rounds; 6 rounds or 6 weeks without
// 3 consecutive opens a scope decision ("decisão de escopo").

import { err, ok, type Result, type Transition } from "./result";
import type { RoundOutcome } from "./round";

export type FrontStatus =
  | "calibrating" // Em calibração
  | "released" // Liberada
  | "scope_decision" // Decisão de escopo
  | "paused" // Frente pausada
  | "closed"; // Frente encerrada

export type FrontState = {
  status: FrontStatus;
  /** Consecutive passing rounds (0–3); a failed round resets it. */
  consecutivePasses: number;
  /** Rounds recorded in the current sequence. */
  roundsCompleted: number;
};

export type FrontEvent =
  | { type: "front.round_recorded"; outcome: RoundOutcome; consecutivePasses: number; roundsCompleted: number }
  | { type: "front.released"; releasedBy: string }
  | { type: "front.scope_decision_opened"; reason: string }
  | { type: "front.scope_reduced" }
  | { type: "front.paused" }
  | { type: "front.closed" }
  | { type: "front.recalibration_opened"; reason: string };

export const PASSES_TO_RELEASE = 3;
export const MAX_CALIBRATION_ROUNDS = 6;
export const MAX_CALIBRATION_WEEKS = 6;

export function initialFrontState(): FrontState {
  return { status: "calibrating", consecutivePasses: 0, roundsCompleted: 0 };
}

function mustBe(state: FrontState, expected: FrontStatus, action: string): Result<void> {
  if (state.status !== expected) {
    return err("invalid_transition", `cannot ${action} from ${state.status}`);
  }
  return ok(undefined);
}

function limitExceeded(roundsCompleted: number, weeksElapsed: number): string | null {
  if (roundsCompleted >= MAX_CALIBRATION_ROUNDS) return `${MAX_CALIBRATION_ROUNDS}_rounds_without_3_consecutive`;
  if (weeksElapsed >= MAX_CALIBRATION_WEEKS) return `${MAX_CALIBRATION_WEEKS}_weeks_without_3_consecutive`;
  return null;
}

/**
 * Record a round outcome: passed +1, failed resets, inconclusive keeps.
 * `weeksElapsed` is whole weeks since calibration (re)started, computed by
 * the caller with the clock. Reaching 3 consecutive passes keeps the front
 * calibrating until quality explicitly releases it.
 */
export function recordRoundOutcome(
  state: FrontState,
  outcome: RoundOutcome,
  weeksElapsed: number,
): Result<Transition<FrontState, FrontEvent>> {
  const gate = mustBe(state, "calibrating", "record round outcome");
  if (!gate.ok) return gate;
  const consecutivePasses = outcome === "passed" ? state.consecutivePasses + 1 : outcome === "failed" ? 0 : state.consecutivePasses;
  const roundsCompleted = state.roundsCompleted + 1;
  const events: FrontEvent[] = [{ type: "front.round_recorded", outcome, consecutivePasses, roundsCompleted }];
  const limit = consecutivePasses >= PASSES_TO_RELEASE ? null : limitExceeded(roundsCompleted, weeksElapsed);
  if (limit) {
    events.push({ type: "front.scope_decision_opened", reason: limit });
    return ok({ state: { status: "scope_decision", consecutivePasses, roundsCompleted }, events });
  }
  return ok({ state: { status: "calibrating", consecutivePasses, roundsCompleted }, events });
}

/** Time-only trigger: 6 weeks elapsed without a 6th round being recorded. */
export function expireCalibrationTime(
  state: FrontState,
  weeksElapsed: number,
): Result<Transition<FrontState, FrontEvent>> {
  const gate = mustBe(state, "calibrating", "expire calibration time");
  if (!gate.ok) return gate;
  if (state.consecutivePasses >= PASSES_TO_RELEASE || weeksElapsed < MAX_CALIBRATION_WEEKS) {
    return err("limit_not_reached", "calibration time limit not reached");
  }
  return ok({
    state: { status: "scope_decision", consecutivePasses: state.consecutivePasses, roundsCompleted: state.roundsCompleted },
    events: [{ type: "front.scope_decision_opened", reason: `${MAX_CALIBRATION_WEEKS}_weeks_without_3_consecutive` }],
  });
}

/** Quality releases the front once 3 consecutive rounds passed. */
export function releaseFront(
  state: FrontState,
  releasedBy: string,
): Result<Transition<FrontState, FrontEvent>> {
  const gate = mustBe(state, "calibrating", "release front");
  if (!gate.ok) return gate;
  if (state.consecutivePasses < PASSES_TO_RELEASE) {
    return err("release_requires_3_consecutive", `release requires ${PASSES_TO_RELEASE} consecutive passes`);
  }
  return ok({
    state: { status: "released", consecutivePasses: state.consecutivePasses, roundsCompleted: state.roundsCompleted },
    events: [{ type: "front.released", releasedBy }],
  });
}

/** Scope-decision exits: reduce scope (sequence restarts), pause, or close. */
export function reduceFrontScope(state: FrontState): Result<Transition<FrontState, FrontEvent>> {
  const gate = mustBe(state, "scope_decision", "reduce front scope");
  if (!gate.ok) return gate;
  return ok({
    state: { status: "calibrating", consecutivePasses: 0, roundsCompleted: 0 },
    events: [{ type: "front.scope_reduced" }],
  });
}

export function pauseFront(state: FrontState): Result<Transition<FrontState, FrontEvent>> {
  const gate = mustBe(state, "scope_decision", "pause front");
  if (!gate.ok) return gate;
  return ok({
    state: { ...state, status: "paused" },
    events: [{ type: "front.paused" }],
  });
}

export function closeFront(state: FrontState): Result<Transition<FrontState, FrontEvent>> {
  const gate = mustBe(state, "scope_decision", "close front");
  if (!gate.ok) return gate;
  return ok({
    state: { ...state, status: "closed" },
    events: [{ type: "front.closed" }],
  });
}

/** Critical content failure after release reopens calibration, sequence reset. */
export function reopenCalibration(
  state: FrontState,
  reason: string,
): Result<Transition<FrontState, FrontEvent>> {
  const gate = mustBe(state, "released", "reopen calibration");
  if (!gate.ok) return gate;
  return ok({
    state: { status: "calibrating", consecutivePasses: 0, roundsCompleted: 0 },
    events: [{ type: "front.recalibration_opened", reason }],
  });
}
