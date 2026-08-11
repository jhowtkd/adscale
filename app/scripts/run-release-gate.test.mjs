import test from "node:test";
import assert from "node:assert/strict";

import {
  attestQa17,
  resetReleaseGateEvidence,
} from "./run-release-gate.mjs";

test("starts every release run with fresh evidence", () => {
  const reset = resetReleaseGateEvidence({
    capturedAt: "stale",
    verifiedAt: "stale",
    layoutChecks: [{ key: "stale" }],
    a11yChecks: [{ key: "stale" }],
    interactionChecks: [{ key: "stale" }],
    automated: { unit: "pass" },
    requirements: { "QA-17": { result: "pass", manualAssistiveTechnology: "pass" } },
  }, "2026-08-11T00:00:00.000Z");

  assert.equal(reset.capturedAt, "2026-08-11T00:00:00.000Z");
  assert.deepEqual(reset.layoutChecks, []);
  assert.deepEqual(reset.a11yChecks, []);
  assert.deepEqual(reset.interactionChecks, []);
  assert.equal(reset.automated.unit, "pending");
  assert.equal(reset.requirements["QA-17"].result, "pending");
  assert.equal(reset.requirements["QA-17"].manualAssistiveTechnology, "pending");
  assert.equal(reset.verifiedAt, undefined);
});

test("promotes QA-17 only with an explicit manual attestation", () => {
  const evidence = {
    requirements: {
      "QA-17": {
        result: "pending",
        a11y: "pass",
        interaction: "pass",
        completedA11yChecks: 65,
        completedInteractionChecks: 5,
      },
    },
  };

  assert.throws(() => attestQa17(evidence, ""), /manual QA-17 evidence/i);
  const attested = attestQa17(evidence, "VoiceOver, zoom real e estados degradados validados.", "2026-08-11T01:00:00.000Z");
  assert.equal(attested.requirements["QA-17"].result, "pass");
  assert.equal(attested.requirements["QA-17"].manualAssistiveTechnology, "pass");
  assert.equal(attested.requirements["QA-17"].manualZoom200, "pass");
  assert.equal(attested.requirements["QA-17"].manualDegradedStates, "pass");
  assert.equal(attested.verifiedAt, "2026-08-11T01:00:00.000Z");
});
