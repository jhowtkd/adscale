import { describe, expect, it } from "vitest";
import {
  closeFront,
  expireCalibrationTime,
  initialFrontState,
  pauseFront,
  recordRoundOutcome,
  reduceFrontScope,
  releaseFront,
  reopenCalibration,
  type FrontState,
} from "./front";
import type { RoundOutcome } from "./round";

function recordSequence(outcomes: RoundOutcome[]): FrontState {
  let state = initialFrontState();
  outcomes.forEach((outcome, index) => {
    const result = recordRoundOutcome(state, outcome, index + 1);
    if (!result.ok) throw new Error(`setup failed at round ${index + 1}`);
    state = result.value.state;
  });
  return state;
}

describe("calibration sequence", () => {
  it("releases after 3 consecutive passes plus quality approval", () => {
    const state = recordSequence(["passed", "passed", "passed"]);
    expect(state.status).toBe("calibrating");
    expect(state.consecutivePasses).toBe(3);
    const released = releaseFront(state, "quality-founder");
    expect(released.ok).toBe(true);
    if (released.ok) {
      expect(released.value.state.status).toBe("released");
      expect(released.value.events).toEqual([{ type: "front.released", releasedBy: "quality-founder" }]);
    }
  });

  it("refuses release before 3 consecutive passes", () => {
    const state = recordSequence(["passed", "passed"]);
    const released = releaseFront(state, "quality-founder");
    expect(released.ok).toBe(false);
    if (!released.ok) expect(released.error.code).toBe("release_requires_3_consecutive");
  });

  it("resets the sequence on failure but keeps it on inconclusive", () => {
    const failed = recordSequence(["passed", "passed", "failed"]);
    expect(failed.consecutivePasses).toBe(0);
    expect(failed.roundsCompleted).toBe(3);
    const kept = recordSequence(["passed", "inconclusive"]);
    expect(kept.consecutivePasses).toBe(1);
    expect(kept.roundsCompleted).toBe(2);
  });
});

describe("scope-decision limit (6 rounds or 6 weeks)", () => {
  it("opens a scope decision on the 6th round without 3 consecutive", () => {
    const result = recordRoundOutcome(
      recordSequence(["passed", "failed", "passed", "failed", "passed"]),
      "inconclusive",
      5,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.state.status).toBe("scope_decision");
      expect(result.value.events.at(-1)).toEqual({
        type: "front.scope_decision_opened",
        reason: "6_rounds_without_3_consecutive",
      });
    }
  });

  it("opens a scope decision at 6 weeks even with fewer rounds", () => {
    const result = recordRoundOutcome(recordSequence(["passed", "passed"]), "inconclusive", 6);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.state.status).toBe("scope_decision");
  });

  it("expires on time alone when the 6th week passes", () => {
    const expired = expireCalibrationTime(recordSequence(["passed"]), 6);
    expect(expired.ok).toBe(true);
    if (expired.ok) expect(expired.value.state.status).toBe("scope_decision");
    expect(expireCalibrationTime(recordSequence(["passed"]), 5).ok).toBe(false);
  });

  it("lets a 3rd consecutive pass on round 6 skip the scope decision", () => {
    const state = recordSequence(["failed", "failed", "failed", "passed", "passed", "passed"]);
    expect(state.status).toBe("calibrating");
    expect(releaseFront(state, "quality-founder").ok).toBe(true);
  });
});

describe("scope-decision exits", () => {
  function inScopeDecision(): FrontState {
    const result = recordRoundOutcome(recordSequence(["failed", "failed", "failed", "failed", "failed"]), "failed", 5);
    if (!result.ok) throw new Error("setup failed");
    return result.value.state;
  }

  it("reduces scope and restarts the sequence", () => {
    const reduced = reduceFrontScope(inScopeDecision());
    expect(reduced.ok).toBe(true);
    if (reduced.ok) {
      expect(reduced.value.state).toEqual({ status: "calibrating", consecutivePasses: 0, roundsCompleted: 0 });
    }
  });

  it("pauses the front with adjustment", () => {
    const paused = pauseFront(inScopeDecision());
    expect(paused.ok).toBe(true);
    if (paused.ok) expect(paused.value.state.status).toBe("paused");
  });

  it("closes the front", () => {
    const closed = closeFront(inScopeDecision());
    expect(closed.ok).toBe(true);
    if (closed.ok) expect(closed.value.state.status).toBe("closed");
  });
});

describe("recalibration", () => {
  it("reopens calibration after a critical content failure, sequence reset", () => {
    const released = releaseFront(recordSequence(["passed", "passed", "passed"]), "quality-founder");
    if (!released.ok) throw new Error("setup failed");
    const reopened = reopenCalibration(released.value.state, "critical content failure");
    expect(reopened.ok).toBe(true);
    if (reopened.ok) {
      expect(reopened.value.state).toEqual({ status: "calibrating", consecutivePasses: 0, roundsCompleted: 0 });
    }
  });

  it("rejects recording rounds outside calibration", () => {
    const released = releaseFront(recordSequence(["passed", "passed", "passed"]), "quality-founder");
    if (!released.ok) throw new Error("setup failed");
    expect(recordRoundOutcome(released.value.state, "passed", 4).ok).toBe(false);
  });
});
