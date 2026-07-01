import { describe, expect, it } from "vitest";
import {
  classifyAutoRetryOutcome,
  extractAutoRetryFields,
  serializeDerivationForApi,
} from "./derivation-auto-retry-observability";

describe("extractAutoRetryFields", () => {
  it("returns empty object for missing generation log", () => {
    expect(extractAutoRetryFields(null)).toEqual({});
    expect(extractAutoRetryFields(undefined)).toEqual({});
  });

  it("extracts auto-retry provenance from generation log", () => {
    expect(
      extractAutoRetryFields({
        schemaVersion: 1,
        autoRetryAttempted: true,
        autoRetryReason: "cta_drift,unreadable_required_text",
      })
    ).toEqual({
      autoRetryAttempted: true,
      autoRetryReason: "cta_drift,unreadable_required_text",
    });
  });

  it("normalizes null autoRetryReason", () => {
    expect(
      extractAutoRetryFields({
        autoRetryAttempted: false,
        autoRetryReason: null,
      })
    ).toEqual({
      autoRetryAttempted: false,
      autoRetryReason: null,
    });
  });
});

describe("classifyAutoRetryOutcome", () => {
  it("returns succeeded when pre-retry failure codes are cleared", () => {
    expect(
      classifyAutoRetryOutcome(["cta_drift"], [{ code: "wrong_brand", message: "x" }])
    ).toBe("succeeded");
    expect(classifyAutoRetryOutcome(["cta_drift"], [])).toBe("succeeded");
    expect(classifyAutoRetryOutcome(["cta_drift"], null)).toBe("succeeded");
  });

  it("returns unchanged when a pre-retry code remains", () => {
    expect(
      classifyAutoRetryOutcome(
        ["cta_drift", "unreadable_required_text"],
        [{ code: "cta_drift", message: "still wrong" }]
      )
    ).toBe("unchanged");
  });

  it("returns unchanged when pre-retry codes are empty", () => {
    expect(classifyAutoRetryOutcome([], [{ code: "cta_drift", message: "x" }])).toBe(
      "unchanged"
    );
  });
});

describe("serializeDerivationForApi", () => {
  it("omits generationLog and surfaces auto-retry fields", () => {
    const serialized = serializeDerivationForApi({
      id: "deriv-1",
      status: "completed",
      generationLog: {
        schemaVersion: 1,
        autoRetryAttempted: true,
        autoRetryReason: "cta_drift",
      },
    });

    expect(serialized).toEqual({
      id: "deriv-1",
      status: "completed",
      autoRetryAttempted: true,
      autoRetryReason: "cta_drift",
    });
    expect("generationLog" in serialized).toBe(false);
  });
});
