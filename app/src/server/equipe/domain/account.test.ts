import { describe, expect, it } from "vitest";
import {
  activateAccount,
  closeAccount,
  enterCalibration,
  initialAccountState,
  openAccountScopeDecision,
  pauseImplantation,
  reactivateFromSuspension,
  reduceAccountScope,
  resumeImplantation,
  suspendForDelinquency,
} from "./account";

const FULL_ENTRY = {
  planAndMandatesApproved: true,
  brandVoiceApproved: true,
  connectionsVerified: true,
  manualModeAgreed: false,
  secondInstallmentPaid: true,
};

function calibrating() {
  const entered = enterCalibration(initialAccountState(), FULL_ENTRY);
  if (!entered.ok) throw new Error("setup failed");
  return entered.value.state;
}

describe("implantation", () => {
  it("enters calibration when every condition holds", () => {
    const result = enterCalibration(initialAccountState(), FULL_ENTRY);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.state.status).toBe("calibrating");
      expect(result.value.events).toEqual([{ type: "account.entered_calibration", from: "implantation" }]);
    }
  });

  it("accepts agreed manual mode instead of verified connections", () => {
    const result = enterCalibration(initialAccountState(), {
      ...FULL_ENTRY,
      connectionsVerified: false,
      manualModeAgreed: true,
    });
    expect(result.ok).toBe(true);
  });

  it("lists every missing entry condition", () => {
    const result = enterCalibration(initialAccountState(), {
      planAndMandatesApproved: false,
      brandVoiceApproved: true,
      connectionsVerified: false,
      manualModeAgreed: false,
      secondInstallmentPaid: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("calibration_entry_blocked");
      expect(result.error.message).toContain("plan_and_mandates");
      expect(result.error.message).toContain("connections_or_manual_mode");
      expect(result.error.message).toContain("second_installment");
    }
  });

  it("pauses after 10 business days and resumes when resolved", () => {
    const paused = pauseImplantation(initialAccountState());
    expect(paused.ok).toBe(true);
    if (!paused.ok) return;
    expect(paused.value.state.status).toBe("implantation_paused");
    const resumed = resumeImplantation(paused.value.state);
    expect(resumed.ok).toBe(true);
    if (resumed.ok) expect(resumed.value.state.status).toBe("implantation");
  });
});

describe("activation and scope decision", () => {
  it("activates when the first front is released", () => {
    const result = activateAccount(calibrating(), "front-social");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.state.status).toBe("active");
      expect(result.value.events).toEqual([{ type: "account.activated", releasedFrontId: "front-social" }]);
    }
  });

  it("opens a scope decision when no front passes, then reduces scope", () => {
    const opened = openAccountScopeDecision(calibrating(), "no front passed within the limit");
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.value.state.status).toBe("scope_decision");
    const reduced = reduceAccountScope(opened.value.state);
    expect(reduced.ok).toBe(true);
    if (reduced.ok) expect(reduced.value.state.status).toBe("calibrating");
  });
});

describe("suspension and exit", () => {
  function active() {
    const result = activateAccount(calibrating(), "front-social");
    if (!result.ok) throw new Error("setup failed");
    return result.value.state;
  }

  it("suspends for delinquency and reactivates on regularization", () => {
    const suspended = suspendForDelinquency(active(), "invoice overdue");
    expect(suspended.ok).toBe(true);
    if (!suspended.ok) return;
    expect(suspended.value.state.status).toBe("suspended");
    const reactivated = reactivateFromSuspension(suspended.value.state);
    expect(reactivated.ok).toBe(true);
    if (reactivated.ok) expect(reactivated.value.state.status).toBe("active");
  });

  it("closes from active, suspended, or scope decision", () => {
    expect(closeAccount(active()).ok).toBe(true);
    const suspended = suspendForDelinquency(active(), "invoice overdue");
    if (!suspended.ok) throw new Error("setup failed");
    expect(closeAccount(suspended.value.state).ok).toBe(true);
    const scope = openAccountScopeDecision(calibrating(), "no front passed");
    if (!scope.ok) throw new Error("setup failed");
    const closed = closeAccount(scope.value.state);
    expect(closed.ok).toBe(true);
    if (closed.ok) expect(closed.value.events).toEqual([{ type: "account.closed", from: "scope_decision" }]);
  });

  it("rejects invalid transitions", () => {
    expect(activateAccount(initialAccountState(), "front-social").ok).toBe(false);
    expect(suspendForDelinquency(calibrating(), "x").ok).toBe(false);
    expect(closeAccount(initialAccountState()).ok).toBe(false);
    expect(resumeImplantation(initialAccountState()).ok).toBe(false);
  });
});
