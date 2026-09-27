// Publication gate ("Quando algo pode ser publicado"): the same rule during
// calibration and after activation. A pure function of a snapshot — every
// condition must hold at send time, or the gate lists every blocking reason.

import { isWithinAssistedWindow } from "./calendar";
import type { PauseLevel } from "./pause";

export const WEEKLY_PUBLICATION_LIMIT = 6;
export const MONTHLY_PUBLICATION_LIMIT = 26;

export type ConnectionState = "verified" | "missing" | "expired" | "revoked" | "error";

export type PublicationBlockReason =
  | "mandate_not_approved"
  | "connection_not_verified"
  | "version_not_approved"
  | "calibration_check_missing"
  | "outside_assisted_window"
  | "weekly_limit_reached"
  | "monthly_limit_reached"
  | "paused_publication"
  | "paused_execution"
  | "paused_delinquency"
  | "blocking_escalation_open"
  | "offer_not_valid";

export type PublicationSnapshot = {
  /** Publication mandate approved by the client. */
  mandateApproved: boolean;
  /** Instagram connection state (ignored in manual mode: nothing is sent). */
  connection: ConnectionState;
  manualMode: boolean;
  /** Receipt for the exact version being sent, if the client approved it. */
  approval: { approvedVersionHash: string } | null;
  currentVersionHash: string;
  /** Calibration requires a quality check before the client sees the item. */
  calibrationCheckRequired: boolean;
  qualityChecked: boolean;
  /** Moment of sending; must fall in the assisted window. */
  now: Date;
  publishedThisWeek: number;
  publishedThisMonth: number;
  /** Most restrictive stacked pause, if any (see pause.ts). */
  effectivePause: PauseLevel | null;
  blockingEscalationOpen: boolean;
  /** Current offer the item depends on; null when the item cites no offer. */
  offer: { valid: boolean } | null;
};

export type PublicationGateResult = { allowed: true } | { allowed: false; reasons: PublicationBlockReason[] };

export function evaluatePublicationGate(snapshot: PublicationSnapshot): PublicationGateResult {
  const reasons: PublicationBlockReason[] = [];
  if (!snapshot.mandateApproved) reasons.push("mandate_not_approved");
  if (!snapshot.manualMode && snapshot.connection !== "verified") reasons.push("connection_not_verified");
  if (!snapshot.approval || snapshot.approval.approvedVersionHash !== snapshot.currentVersionHash) {
    reasons.push("version_not_approved");
  }
  if (snapshot.calibrationCheckRequired && !snapshot.qualityChecked) {
    reasons.push("calibration_check_missing");
  }
  if (!isWithinAssistedWindow(snapshot.now)) reasons.push("outside_assisted_window");
  if (snapshot.publishedThisWeek >= WEEKLY_PUBLICATION_LIMIT) reasons.push("weekly_limit_reached");
  if (snapshot.publishedThisMonth >= MONTHLY_PUBLICATION_LIMIT) reasons.push("monthly_limit_reached");
  if (snapshot.effectivePause === "publication") reasons.push("paused_publication");
  if (snapshot.effectivePause === "execution") reasons.push("paused_execution");
  if (snapshot.effectivePause === "delinquency") reasons.push("paused_delinquency");
  if (snapshot.blockingEscalationOpen) reasons.push("blocking_escalation_open");
  if (snapshot.offer && !snapshot.offer.valid) reasons.push("offer_not_valid");
  if (reasons.length === 0) return { allowed: true };
  return { allowed: false, reasons };
}
