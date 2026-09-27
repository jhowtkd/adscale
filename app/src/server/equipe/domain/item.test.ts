import { describe, expect, it } from "vitest";
import {
  approveItem,
  cancelScheduledItem,
  confirmManualPublished,
  confirmPublished,
  declareManualPublished,
  declineToPublish,
  editItem,
  holdItem,
  initialItemState,
  isBatchApprovable,
  markDispatchFailed,
  markDispatchUncertain,
  markWindowMissed,
  proposeNewSchedule,
  requestItemAdjustment,
  resolveReviewStatus,
  resumeHeldItem,
  startDispatch,
  submitNewVersion,
  type ItemState,
} from "./item";

function scheduled(): ItemState {
  const approved = approveItem(initialItemState("v1"), { version: "v1", approvedBy: "ana", mode: "auto" });
  if (!approved.ok) throw new Error("setup failed");
  return approved.value.state;
}

describe("approval and versioning", () => {
  it("schedules the exact approved version with a receipt", () => {
    const result = approveItem(initialItemState("v1"), { version: "v1", approvedBy: "ana", mode: "auto" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.state).toEqual({ status: "scheduled", currentVersion: "v1", approvedVersion: "v1" });
      expect(result.value.events).toEqual([
        { type: "item.approved", version: "v1", approvedBy: "ana", mode: "auto" },
      ]);
    }
  });

  it("rejects approval when the version changed", () => {
    const result = approveItem(initialItemState("v2"), { version: "v1", approvedBy: "ana", mode: "auto" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("version_mismatch");
  });

  it("sends manual-mode approvals to download instead of scheduling", () => {
    const result = approveItem(initialItemState("v1"), { version: "v1", approvedBy: "ana", mode: "manual" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.state.status).toBe("available_for_download");
  });

  it("edits void the old approval and require a new decision", () => {
    const edited = editItem(scheduled(), "v2");
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.value.state).toEqual({ status: "adjusting", currentVersion: "v2", approvedVersion: null });
    expect(edited.value.events).toContainEqual({ type: "item.version_superseded", supersededVersion: "v1" });
    const ready = submitNewVersion(edited.value.state, "v2");
    expect(ready.ok).toBe(true);
    if (ready.ok) expect(ready.value.state.status).toBe("awaiting_approval");
  });

  it("routes adjustment requests back to a new version", () => {
    const requested = requestItemAdjustment(initialItemState("v1"), "marca: voz fora do guia");
    expect(requested.ok).toBe(true);
    if (!requested.ok) return;
    expect(requested.value.state.status).toBe("adjusting");
  });
});

describe("missed window and rescheduling", () => {
  it("misses the window, then returns with a new time", () => {
    const missed = markWindowMissed(initialItemState("v1"));
    expect(missed.ok).toBe(true);
    if (!missed.ok) return;
    expect(missed.value.state.status).toBe("missed_window");
    const back = proposeNewSchedule(missed.value.state);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.value.state.status).toBe("awaiting_approval");
  });

  it("declines or cancels without publishing", () => {
    expect(declineToPublish(initialItemState("v1"), "fora do momento").ok).toBe(true);
    const cancelled = cancelScheduledItem(scheduled());
    expect(cancelled.ok).toBe(true);
    if (cancelled.ok) expect(cancelled.value.state.status).toBe("cancelled");
  });
});

describe("held items", () => {
  it("holds on pause and resumes only after revalidation", () => {
    const held = holdItem(scheduled(), "client pause");
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    expect(held.value.state.status).toBe("held");
    const blind = resumeHeldItem(held.value.state, false);
    expect(blind.ok).toBe(false);
    if (!blind.ok) expect(blind.error.code).toBe("revalidation_required");
    const resumed = resumeHeldItem(held.value.state, true);
    expect(resumed.ok).toBe(true);
    if (resumed.ok) expect(resumed.value.state.status).toBe("scheduled");
  });

  it("misses the window when the time passes during the hold", () => {
    const held = holdItem(scheduled(), "client pause");
    if (!held.ok) throw new Error("setup failed");
    const missed = markWindowMissed(held.value.state);
    expect(missed.ok).toBe(true);
    if (missed.ok) expect(missed.value.state.status).toBe("missed_window");
  });
});

describe("dispatch", () => {
  it("publishes on platform receipt", () => {
    const sending = startDispatch(scheduled());
    if (!sending.ok) throw new Error("setup failed");
    const published = confirmPublished(sending.value.state, "ig-media-1");
    expect(published.ok).toBe(true);
    if (published.ok) {
      expect(published.value.state.status).toBe("published");
      expect(published.value.events).toEqual([{ type: "item.published", receipt: "ig-media-1" }]);
    }
  });

  it("verifies uncertain responses, then confirms or fails", () => {
    const sending = startDispatch(scheduled());
    if (!sending.ok) throw new Error("setup failed");
    const verifying = markDispatchUncertain(sending.value.state);
    if (!verifying.ok) throw new Error("setup failed");
    expect(verifying.value.state.status).toBe("verifying");
    expect(confirmPublished(verifying.value.state, "ig-media-1").ok).toBe(true);

    const sendingAgain = startDispatch(scheduled());
    if (!sendingAgain.ok) throw new Error("setup failed");
    const verifyingAgain = markDispatchUncertain(sendingAgain.value.state);
    if (!verifyingAgain.ok) throw new Error("setup failed");
    const failed = markDispatchFailed(verifyingAgain.value.state, "connection expired");
    expect(failed.ok).toBe(true);
    if (failed.ok) {
      expect(failed.value.state.status).toBe("failed");
      expect(proposeNewSchedule(failed.value.state).ok).toBe(true);
    }
  });

  it("fails directly on error or disconnection", () => {
    const sending = startDispatch(scheduled());
    if (!sending.ok) throw new Error("setup failed");
    expect(markDispatchFailed(sending.value.state, "account disconnected").ok).toBe(true);
  });
});

describe("manual publication", () => {
  it("goes declared, then confirmed on the platform", () => {
    const approved = approveItem(initialItemState("v1"), { version: "v1", approvedBy: "ana", mode: "manual" });
    if (!approved.ok) throw new Error("setup failed");
    const declared = declareManualPublished(approved.value.state);
    if (!declared.ok) throw new Error("setup failed");
    expect(declared.value.state.status).toBe("published_declared");
    const confirmed = confirmManualPublished(declared.value.state);
    expect(confirmed.ok).toBe(true);
    if (confirmed.ok) expect(confirmed.value.state.status).toBe("published_confirmed");
  });
});

describe("terminal states", () => {
  it("rejects transitions out of published, cancelled, and declined", () => {
    const sending = startDispatch(scheduled());
    if (!sending.ok) throw new Error("setup failed");
    const published = confirmPublished(sending.value.state, "r");
    if (!published.ok) throw new Error("setup failed");
    expect(cancelScheduledItem(published.value.state).ok).toBe(false);
    expect(editItem(published.value.state, "v9").ok).toBe(false);
  });
});

describe("review-status precedence", () => {
  const CLEAR = { blocked: false, editedInReview: false, editWarning: false, needsConfirmation: false };

  it("resolves blocked first, then edit states, then confirmation, then ready", () => {
    expect(resolveReviewStatus(CLEAR)).toBe("ready");
    expect(resolveReviewStatus({ ...CLEAR, needsConfirmation: true })).toBe("needs_confirmation");
    expect(resolveReviewStatus({ ...CLEAR, editWarning: true, needsConfirmation: true })).toBe("edit_with_warning");
    expect(resolveReviewStatus({ ...CLEAR, editedInReview: true, editWarning: true })).toBe("edited_in_review");
    expect(
      resolveReviewStatus({ blocked: true, editedInReview: true, editWarning: true, needsConfirmation: true }),
    ).toBe("blocked");
  });

  it("admits only ready items to batch approval", () => {
    expect(isBatchApprovable("ready")).toBe(true);
    expect(isBatchApprovable("needs_confirmation")).toBe(false);
    expect(isBatchApprovable("edit_with_warning")).toBe(false);
    expect(isBatchApprovable("edited_in_review")).toBe(false);
    expect(isBatchApprovable("blocked")).toBe(false);
  });
});
