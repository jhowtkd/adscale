// Item lifecycle machine plus the review-status precedence.
// Lifecycle ("Depois de aprovar"): awaiting_approval → scheduled → sending →
// published, with held/missed_window/failed detours and a manual-mode branch
// (available_for_download → declared → confirmed). Approvals bind to the
// exact version hash ("Mudou a peça, muda a versão").

import { err, ok, type Result, type Transition } from "./result";

export type ItemStatus =
  | "awaiting_approval"
  | "adjusting"
  | "scheduled"
  | "held" // Segurado
  | "missed_window" // Perdeu a janela
  | "do_not_publish" // Não publicar
  | "cancelled"
  | "sending"
  | "verifying"
  | "published"
  | "failed"
  | "available_for_download" // Manual mode: approved, client publishes
  | "published_declared" // Manual mode: client says they published
  | "published_confirmed"; // Manual mode: confirmed on the platform

export type ItemState = {
  status: ItemStatus;
  /** Hash of the current version; approvals bind to it. */
  currentVersion: string;
  /** Version hash the receipt approved, if any. */
  approvedVersion: string | null;
};

export type ItemEvent =
  | { type: "item.approved"; version: string; approvedBy: string; mode: "auto" | "manual" }
  | { type: "item.adjustment_requested"; reason: string }
  | { type: "item.edited"; newVersion: string }
  | { type: "item.version_superseded"; supersededVersion: string }
  | { type: "item.new_version_ready"; version: string }
  | { type: "item.window_missed" }
  | { type: "item.rescheduled" }
  | { type: "item.declined"; reason: string }
  | { type: "item.cancelled" }
  | { type: "item.held"; reason: string }
  | { type: "item.resumed" }
  | { type: "item.dispatch_started" }
  | { type: "item.uncertain" }
  | { type: "item.published"; receipt: string }
  | { type: "item.failed"; reason: string }
  | { type: "item.declared_published" }
  | { type: "item.manual_publish_confirmed" };

export function initialItemState(currentVersion: string): ItemState {
  return { status: "awaiting_approval", currentVersion, approvedVersion: null };
}

function mustBeIn(state: ItemState, expected: ItemStatus[], action: string): Result<void> {
  if (!expected.includes(state.status)) {
    return err("invalid_transition", `cannot ${action} from ${state.status}`);
  }
  return ok(undefined);
}

/**
 * Approve the exact version the approver saw. In manual mode the item goes
 * to "available_for_download" instead of "scheduled".
 */
export function approveItem(
  state: ItemState,
  args: { version: string; approvedBy: string; mode: "auto" | "manual" },
): Result<Transition<ItemState, ItemEvent>> {
  const gate = mustBeIn(state, ["awaiting_approval"], "approve item");
  if (!gate.ok) return gate;
  if (args.version !== state.currentVersion) {
    return err("version_mismatch", "version changed since opened; review again");
  }
  const next: ItemStatus = args.mode === "auto" ? "scheduled" : "available_for_download";
  return ok({
    state: { ...state, status: next, approvedVersion: args.version },
    events: [{ type: "item.approved", version: args.version, approvedBy: args.approvedBy, mode: args.mode }],
  });
}

export function requestItemAdjustment(
  state: ItemState,
  reason: string,
): Result<Transition<ItemState, ItemEvent>> {
  const gate = mustBeIn(state, ["awaiting_approval"], "request adjustment");
  if (!gate.ok) return gate;
  return ok({
    state: { ...state, status: "adjusting" },
    events: [{ type: "item.adjustment_requested", reason }],
  });
}

/**
 * Client edits the caption: a new version is born. Editing a scheduled item
 * voids the old approval ("substituída", never sent); the new version needs
 * approval before the item limit.
 */
export function editItem(
  state: ItemState,
  newVersion: string,
): Result<Transition<ItemState, ItemEvent>> {
  const gate = mustBeIn(state, ["awaiting_approval", "scheduled"], "edit item");
  if (!gate.ok) return gate;
  const events: ItemEvent[] = [{ type: "item.edited", newVersion }];
  if (state.status === "scheduled" && state.approvedVersion) {
    events.push({ type: "item.version_superseded", supersededVersion: state.approvedVersion });
  }
  return ok({
    state: { ...state, status: "adjusting", currentVersion: newVersion, approvedVersion: null },
    events,
  });
}

export function submitNewVersion(
  state: ItemState,
  version: string,
): Result<Transition<ItemState, ItemEvent>> {
  const gate = mustBeIn(state, ["adjusting"], "submit new version");
  if (!gate.ok) return gate;
  return ok({
    state: { ...state, status: "awaiting_approval", currentVersion: version },
    events: [{ type: "item.new_version_ready", version }],
  });
}

/**
 * Item limit passed without a decision → "perdeu a janela". Covers
 * "adjusting" too: while a new version is being produced the client cannot
 * decide, so the item misses its window like any undecided item. Covers
 * "scheduled" as well: the dispatch (#548) revalidates the gate at send
 * time, and a scheduled item whose time passed with a failing gate misses
 * its window instead of going back to held.
 */
export function markWindowMissed(state: ItemState): Result<Transition<ItemState, ItemEvent>> {
  const gate = mustBeIn(state, ["awaiting_approval", "held", "adjusting", "scheduled"], "mark window missed");
  if (!gate.ok) return gate;
  return ok({
    state: { ...state, status: "missed_window", approvedVersion: null },
    events: [{ type: "item.window_missed" }],
  });
}

/** New time proposed (after a miss or a failure) → back to decision. */
export function proposeNewSchedule(state: ItemState): Result<Transition<ItemState, ItemEvent>> {
  const gate = mustBeIn(state, ["missed_window", "failed"], "propose new schedule");
  if (!gate.ok) return gate;
  return ok({
    state: { ...state, status: "awaiting_approval" },
    events: [{ type: "item.rescheduled" }],
  });
}

export function declineToPublish(
  state: ItemState,
  reason: string,
): Result<Transition<ItemState, ItemEvent>> {
  const gate = mustBeIn(state, ["awaiting_approval", "held"], "decline to publish");
  if (!gate.ok) return gate;
  return ok({
    state: { ...state, status: "do_not_publish", approvedVersion: null },
    events: [{ type: "item.declined", reason }],
  });
}

export function cancelScheduledItem(state: ItemState): Result<Transition<ItemState, ItemEvent>> {
  const gate = mustBeIn(state, ["scheduled", "held"], "cancel scheduled item");
  if (!gate.ok) return gate;
  return ok({
    state: { ...state, status: "cancelled", approvedVersion: null },
    events: [{ type: "item.cancelled" }],
  });
}

/** Pause, suspension or open block holds a scheduled item ("segurado"). */
export function holdItem(state: ItemState, reason: string): Result<Transition<ItemState, ItemEvent>> {
  const gate = mustBeIn(state, ["scheduled"], "hold item");
  if (!gate.ok) return gate;
  return ok({
    state: { ...state, status: "held" },
    events: [{ type: "item.held", reason }],
  });
}

/**
 * Resume after a pause: the held item must have been revalidated (future
 * time, window, valid approval, current offer, verified connection, no open
 * block) before returning to scheduled.
 */
export function resumeHeldItem(
  state: ItemState,
  revalidated: boolean,
): Result<Transition<ItemState, ItemEvent>> {
  const gate = mustBeIn(state, ["held"], "resume held item");
  if (!gate.ok) return gate;
  if (!revalidated) {
    return err("revalidation_required", "held items must be revalidated before resuming");
  }
  return ok({
    state: { ...state, status: "scheduled" },
    events: [{ type: "item.resumed" }],
  });
}

/** At the scheduled time, with conditions rechecked → sending. */
export function startDispatch(state: ItemState): Result<Transition<ItemState, ItemEvent>> {
  const gate = mustBeIn(state, ["scheduled"], "start dispatch");
  if (!gate.ok) return gate;
  return ok({
    state: { ...state, status: "sending" },
    events: [{ type: "item.dispatch_started" }],
  });
}

/** Uncertain platform response → verifying; never republish blindly. */
export function markDispatchUncertain(state: ItemState): Result<Transition<ItemState, ItemEvent>> {
  const gate = mustBeIn(state, ["sending"], "mark dispatch uncertain");
  if (!gate.ok) return gate;
  return ok({
    state: { ...state, status: "verifying" },
    events: [{ type: "item.uncertain" }],
  });
}

export function confirmPublished(
  state: ItemState,
  receipt: string,
): Result<Transition<ItemState, ItemEvent>> {
  const gate = mustBeIn(state, ["sending", "verifying"], "confirm published");
  if (!gate.ok) return gate;
  return ok({
    state: { ...state, status: "published" },
    events: [{ type: "item.published", receipt }],
  });
}

export function markDispatchFailed(
  state: ItemState,
  reason: string,
): Result<Transition<ItemState, ItemEvent>> {
  const gate = mustBeIn(state, ["sending", "verifying"], "mark dispatch failed");
  if (!gate.ok) return gate;
  return ok({
    state: { ...state, status: "failed" },
    events: [{ type: "item.failed", reason }],
  });
}

/** Manual mode: the client marks the downloaded item as published. */
export function declareManualPublished(state: ItemState): Result<Transition<ItemState, ItemEvent>> {
  const gate = mustBeIn(state, ["available_for_download"], "declare manual published");
  if (!gate.ok) return gate;
  return ok({
    state: { ...state, status: "published_declared" },
    events: [{ type: "item.declared_published" }],
  });
}

/** Manual mode: a read connection confirms the post on the platform. */
export function confirmManualPublished(state: ItemState): Result<Transition<ItemState, ItemEvent>> {
  const gate = mustBeIn(state, ["published_declared"], "confirm manual published");
  if (!gate.ok) return gate;
  return ok({
    state: { ...state, status: "published_confirmed" },
    events: [{ type: "item.manual_publish_confirmed" }],
  });
}

// Review-status precedence ("Dentro do lote"): one status per item, the most
// restrictive wins: bloqueado > editado em revisão > edição com aviso >
// pede confirmação > pronto.

export type ItemReviewStatus =
  | "blocked" // Bloqueado
  | "edited_in_review" // Editado por você · em revisão
  | "edit_with_warning" // Edição com aviso
  | "needs_confirmation" // Pede confirmação
  | "ready"; // Pronto

export type ItemReviewFlags = {
  /** Objective failure, pending brand-person fidelity, or open escalation. */
  blocked: boolean;
  /** Client edited the caption; revalidation still running. */
  editedInReview: boolean;
  /** Revalidation found a problem in the edit. */
  editWarning: boolean;
  /** Cites offer/price, or first item of a new format. */
  needsConfirmation: boolean;
};

export function resolveReviewStatus(flags: ItemReviewFlags): ItemReviewStatus {
  if (flags.blocked) return "blocked";
  if (flags.editedInReview) return "edited_in_review";
  if (flags.editWarning) return "edit_with_warning";
  if (flags.needsConfirmation) return "needs_confirmation";
  return "ready";
}

/** Only "pronto" items enter "aprovar todos os prontos". */
export function isBatchApprovable(status: ItemReviewStatus): boolean {
  return status === "ready";
}
