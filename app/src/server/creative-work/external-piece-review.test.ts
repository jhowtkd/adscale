import { describe, expect, it } from "vitest";
import {
  assertExternalApprovalAllowed,
  assertGuestPackageAccess,
  buildPieceReviewEntry,
  isPieceReviewLink,
  normalizeAuthorLabel,
  normalizeReviewArea,
  normalizeReviewBody,
  pinReviewToVersion,
} from "./external-piece-review";

describe("external piece review", () => {
  it("pins feedback to the exact authorized version", () => {
    expect(pinReviewToVersion({
      authorizedOutputId: "out-1",
      authorizedVersion: 3,
      requestedOutputId: "out-1",
    })).toEqual({ ok: true, outputId: "out-1", outputVersion: 3 });

    expect(pinReviewToVersion({
      authorizedOutputId: "out-1",
      authorizedVersion: 3,
      requestedOutputId: "out-2",
    }).ok).toBe(false);
  });

  it("drops access for expired or revoked links and hides other pieces", () => {
    expect(assertGuestPackageAccess({
      tokenStatus: "expired",
      requestedOutputId: "out-1",
      authorizedOutputId: "out-1",
    })).toEqual({ ok: false, error: "share_unavailable" });

    expect(assertGuestPackageAccess({
      tokenStatus: "removed",
      requestedOutputId: "out-1",
      authorizedOutputId: "out-1",
    })).toEqual({ ok: false, error: "share_unavailable" });

    expect(assertGuestPackageAccess({
      tokenStatus: "valid",
      requestedOutputId: "out-other",
      authorizedOutputId: "out-1",
    })).toEqual({ ok: false, error: "package_forbidden" });

    expect(assertGuestPackageAccess({
      tokenStatus: "valid",
      requestedOutputId: "out-1",
      authorizedOutputId: "out-1",
    }).ok).toBe(true);
  });

  it("does not let external approval replace an objective rejection", () => {
    expect(assertExternalApprovalAllowed(
      { schemaVersion: 1, objectiveVerdict: "fail" },
      "approve",
    )).toEqual({ ok: false, error: "objective_rejection" });

    expect(assertExternalApprovalAllowed(
      { qualityVerdict: "invalid", hardFailures: [{ code: "cta_drift" }] },
      "approve",
    )).toEqual({ ok: false, error: "objective_rejection" });

    expect(assertExternalApprovalAllowed(
      { schemaVersion: 1, objectiveVerdict: "fail" },
      "request_changes",
    ).ok).toBe(true);

    expect(assertExternalApprovalAllowed(
      { schemaVersion: 1, objectiveVerdict: "pass" },
      "approve",
    ).ok).toBe(true);
  });

  it("requires identification and an area inside the piece", () => {
    expect(normalizeAuthorLabel("  Ana  ")).toEqual({ ok: true, label: "Ana" });
    expect(normalizeAuthorLabel("   ").ok).toBe(false);
    expect(normalizeReviewBody("", "request_changes").ok).toBe(false);
    expect(normalizeReviewBody("", "approve")).toEqual({ ok: true, body: null });
    expect(normalizeReviewArea({ x: 0.2, y: 0.3, width: 0.1, height: 0.1 }).ok).toBe(true);
    expect(normalizeReviewArea({ x: 0.9, y: 0.9, width: 0.2, height: 0.2 }).ok).toBe(false);
    expect(isPieceReviewLink({ creativeWorkId: "w", outputId: "o", outputVersion: 1 })).toBe(true);
    expect(isPieceReviewLink({ creativeWorkId: null, outputId: null, outputVersion: null })).toBe(false);

    const entry = buildPieceReviewEntry({
      outputId: "out-1",
      outputVersion: 2,
      authorLabel: "Ana",
      decision: "comment",
      body: "Logo alto demais",
      area: { x: 0.1, y: 0.1, width: 0.2, height: 0.15 },
    });
    expect(entry.outputVersion).toBe(2);
    expect(entry.area?.x).toBe(0.1);
  });
});
