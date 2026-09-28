import { describe, it, expect } from "vitest";
import { StaffApiError } from "./staff-api";
import { staffErrorKey } from "./staff-errors";

describe("staffErrorKey", () => {
  it("maps known module codes to message keys", () => {
    expect(staffErrorKey(new StaffApiError(403, "forbidden_actor", "x"))).toBe(
      "forbiddenAction",
    );
    expect(staffErrorKey(new StaffApiError(409, "release_blocked_low_score", "x"))).toBe(
      "releaseBlockedLowScore",
    );
    expect(staffErrorKey(new StaffApiError(400, "evidence_required", "x"))).toBe(
      "evidenceRequired",
    );
    expect(
      staffErrorKey(new StaffApiError(409, "recalibration_requires_closed_critical_content", "x")),
    ).toBe("recalibrationNeedsClosedCritical");
    expect(staffErrorKey(new StaffApiError(404, "unknown_round", "x"))).toBe("unknownRound");
  });

  it("falls back by status for unknown codes", () => {
    expect(staffErrorKey(new StaffApiError(403, "something_new", "x"))).toBe("forbidden");
    expect(staffErrorKey(new StaffApiError(404, "something_new", "x"))).toBe("notFound");
    expect(staffErrorKey(new StaffApiError(409, "something_new", "x"))).toBe("conflict");
    expect(staffErrorKey(new StaffApiError(500, "something_new", "x"))).toBe("serverError");
    expect(staffErrorKey(new StaffApiError(400, null, "x"))).toBe("generic");
    expect(staffErrorKey(new Error("boom"))).toBe("generic");
  });
});
