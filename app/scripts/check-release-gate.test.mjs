import test from "node:test";
import assert from "node:assert/strict";

import {
  EXPECTED_A11Y_KEYS,
  EXPECTED_INTERACTION_KEYS,
  EXPECTED_LAYOUT_KEYS,
  validateReleaseEvidence,
} from "./check-release-gate.mjs";

function completeEvidence() {
  return {
    verifiedAt: "2026-08-11T00:00:00.000Z",
    layoutChecks: EXPECTED_LAYOUT_KEYS.map((key) => ({ key, result: "pass" })),
    a11yChecks: EXPECTED_A11Y_KEYS.map((key) => ({
      key,
      result: "pass",
      violations: 0,
      blockingIncomplete: 0,
    })),
    interactionChecks: EXPECTED_INTERACTION_KEYS.map((key) => ({
      key,
      result: "pass",
      mainCount: 1,
      skipLinkCount: 1,
      invalidLabelledBy: [],
      focusOrder: true,
      accessibleControls: true,
      textResizeOverflowX: 0,
      lowHeightOverflowX: 0,
      touchTargetMin: 44,
    })),
    automated: { unit: "pass", lint: "pass", build: "pass", "visual-release": "pass" },
    requirements: {
      "RESP-07": { result: "pass" },
      "QA-15": { result: "pass" },
      "QA-16": { result: "pass" },
      "QA-17": {
        result: "pass",
        a11y: "pass",
        interaction: "pass",
        manualAssistiveTechnology: "pass",
        manualZoom200: "pass",
        manualDegradedStates: "pass",
        manualEvidence: "VoiceOver, zoom real e estados degradados validados.",
        expectedA11yChecks: EXPECTED_A11Y_KEYS.length,
        completedA11yChecks: EXPECTED_A11Y_KEYS.length,
        expectedInteractionChecks: EXPECTED_INTERACTION_KEYS.length,
        completedInteractionChecks: EXPECTED_INTERACTION_KEYS.length,
      },
    },
  };
}

test("requires studio carousel and edit in the unified layout set", () => {
  assert.ok(EXPECTED_LAYOUT_KEYS.some((key) => key.startsWith("SCN-STUDIO-CAROUSEL@")));
  assert.ok(EXPECTED_LAYOUT_KEYS.some((key) => key.startsWith("SCN-STUDIO-EDIT@")));
  assert.equal(EXPECTED_LAYOUT_KEYS.length, 70);
});

test("rejects empty visual evidence instead of auto-passing", () => {
  const errors = validateReleaseEvidence({ layoutChecks: [] }, { preflight: true });
  assert.ok(errors.some((error) => error.includes("empty visual evidence")));
  assert.ok(errors.some((error) => error.includes("SCN-STUDIO-CAROUSEL")));
});

test("accepts only the current 70 layout, 65 Axe and 5 interaction checks", () => {
  assert.deepEqual(validateReleaseEvidence(completeEvidence()), []);
});

test("rejects stale width-only layout evidence", () => {
  const evidence = completeEvidence();
  evidence.layoutChecks = evidence.layoutChecks.map((check) => ({
    ...check,
    key: check.key.replace(/@(\d+)x\d+$/, "@$1"),
  }));

  assert.ok(validateReleaseEvidence(evidence).some((error) => error.includes("missing layout check SCN-DASHBOARD@390x844")));
});

test("keeps QA-17 blocked without explicit manual evidence", () => {
  const evidence = completeEvidence();
  evidence.requirements["QA-17"].manualAssistiveTechnology = "pending";
  evidence.requirements["QA-17"].manualEvidence = "";

  const errors = validateReleaseEvidence(evidence);
  assert.ok(errors.some((error) => error.includes("manual assistive-technology")));
  assert.ok(errors.some((error) => error.includes("manual evidence")));
});
