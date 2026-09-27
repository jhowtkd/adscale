import { describe, expect, it } from "vitest";
import { fromSaoPauloWallTime } from "./calendar";
import {
  evaluatePublicationGate,
  type PublicationSnapshot,
} from "./publication-gate";

const FRIDAY_NOON = fromSaoPauloWallTime(2026, 10, 30, 12, 0);

function baseSnapshot(): PublicationSnapshot {
  return {
    mandateApproved: true,
    connection: "verified",
    manualMode: false,
    approval: { approvedVersionHash: "v1" },
    currentVersionHash: "v1",
    calibrationCheckRequired: false,
    qualityChecked: false,
    now: FRIDAY_NOON,
    publishedThisWeek: 2,
    publishedThisMonth: 10,
    effectivePause: null,
    blockingEscalationOpen: false,
    offer: { valid: true },
  };
}

describe("publication gate", () => {
  it("allows when every condition holds", () => {
    expect(evaluatePublicationGate(baseSnapshot())).toEqual({ allowed: true });
  });

  it("allows calibration items once quality checked them", () => {
    const snapshot = baseSnapshot();
    snapshot.calibrationCheckRequired = true;
    expect(evaluatePublicationGate(snapshot)).toEqual({
      allowed: false,
      reasons: ["calibration_check_missing"],
    });
    snapshot.qualityChecked = true;
    expect(evaluatePublicationGate(snapshot)).toEqual({ allowed: true });
  });

  it("blocks on mandate, connection, and version receipt", () => {
    expect(evaluatePublicationGate({ ...baseSnapshot(), mandateApproved: false })).toEqual({
      allowed: false,
      reasons: ["mandate_not_approved"],
    });
    expect(evaluatePublicationGate({ ...baseSnapshot(), connection: "expired" })).toEqual({
      allowed: false,
      reasons: ["connection_not_verified"],
    });
    expect(evaluatePublicationGate({ ...baseSnapshot(), approval: null })).toEqual({
      allowed: false,
      reasons: ["version_not_approved"],
    });
    // Edited after approval: the receipt no longer matches the version.
    expect(evaluatePublicationGate({ ...baseSnapshot(), currentVersionHash: "v2" })).toEqual({
      allowed: false,
      reasons: ["version_not_approved"],
    });
  });

  it("ignores the connection in manual mode", () => {
    const snapshot = { ...baseSnapshot(), manualMode: true, connection: "missing" as const };
    expect(evaluatePublicationGate(snapshot)).toEqual({ allowed: true });
  });

  it("blocks outside the assisted window", () => {
    const saturday = fromSaoPauloWallTime(2026, 10, 31, 12, 0);
    expect(evaluatePublicationGate({ ...baseSnapshot(), now: saturday })).toEqual({
      allowed: false,
      reasons: ["outside_assisted_window"],
    });
  });

  it("blocks at the weekly (6) and monthly (26) limits", () => {
    expect(evaluatePublicationGate({ ...baseSnapshot(), publishedThisWeek: 6 })).toEqual({
      allowed: false,
      reasons: ["weekly_limit_reached"],
    });
    expect(evaluatePublicationGate({ ...baseSnapshot(), publishedThisWeek: 5 })).toEqual({ allowed: true });
    expect(evaluatePublicationGate({ ...baseSnapshot(), publishedThisMonth: 26 })).toEqual({
      allowed: false,
      reasons: ["monthly_limit_reached"],
    });
  });

  it("blocks on any pause level and on open blocking escalations", () => {
    expect(evaluatePublicationGate({ ...baseSnapshot(), effectivePause: "publication" })).toEqual({
      allowed: false,
      reasons: ["paused_publication"],
    });
    expect(evaluatePublicationGate({ ...baseSnapshot(), effectivePause: "execution" })).toEqual({
      allowed: false,
      reasons: ["paused_execution"],
    });
    expect(evaluatePublicationGate({ ...baseSnapshot(), blockingEscalationOpen: true })).toEqual({
      allowed: false,
      reasons: ["blocking_escalation_open"],
    });
  });

  it("stops the send when the offer expired between approval and dispatch", () => {
    expect(evaluatePublicationGate({ ...baseSnapshot(), offer: { valid: false } })).toEqual({
      allowed: false,
      reasons: ["offer_not_valid"],
    });
    // Items citing no offer are unaffected.
    expect(evaluatePublicationGate({ ...baseSnapshot(), offer: null })).toEqual({ allowed: true });
  });

  it("lists every blocking reason at once", () => {
    const result = evaluatePublicationGate({
      ...baseSnapshot(),
      mandateApproved: false,
      connection: "revoked",
      approval: null,
    });
    expect(result).toEqual({
      allowed: false,
      reasons: ["mandate_not_approved", "connection_not_verified", "version_not_approved"],
    });
  });
});
