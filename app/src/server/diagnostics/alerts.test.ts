/**
 * trace-397: read-only diagnostic alert rules.
 *
 * Each rule fires/does-not-fire at its boundaries; cohorts never mix;
 * low samples are flagged, never zeroed; delay thresholds are the real
 * generation leases; evaluators are pure and deterministic (the only clock
 * is the injected `evaluatedAt`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentryMocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => sentryMocks);

import {
  AI_TRACING_EMERGENCY_PREFIX,
  DIAGNOSTIC_JOURNAL_EMERGENCY_PREFIX,
  emitDiagnosticAlerts,
  evaluateMissingExpectedEvents,
  evaluateStalledOperations,
  evaluateTelemetryDrops,
  evaluateTerminalFailureRate,
  matchesEmergencyTelemetryPattern,
  MISSING_EVENTS_ALERT_PROPOSAL,
  STALLED_OPERATION_ALERT_PROPOSAL,
  TELEMETRY_DROP_ALERT_PROPOSAL,
  TERMINAL_FAILURE_ALERT_PROPOSAL,
  type DiagnosticAlert,
  type DiagnosticAlertCohort,
  type TelemetryLossSnapshot,
} from "./alerts";

const AT = "2026-09-18T12:00:00.000Z";

const PROD: DiagnosticAlertCohort = {
  protocol: "single",
  environment: "production",
  dataOrigin: "production",
};

const STAGING: DiagnosticAlertCohort = {
  protocol: "single",
  environment: "staging",
  dataOrigin: "staging",
};

function zeroLoss(): TelemetryLossSnapshot {
  return {
    journalDroppedEvents: 0,
    journalFailedFlushes: 0,
    aiTracingDroppedSpans: 0,
    aiTracingFailedFlushes: 0,
  };
}

describe("threshold proposals are pinned data", () => {
  it("terminal-failure proposal matches the spec values", () => {
    expect(TERMINAL_FAILURE_ALERT_PROPOSAL).toEqual({
      minTerminals: 5,
      minCompleted: 20,
      rate: 0.1,
      windowMin: 15,
    });
  });

  it("stall proposal matches the real output generation leases (60/10 min)", () => {
    // The route's 5-minute lease governs creative_work_sources, not output
    // statuses — it has no branch here (a sources-stall rule needs its own
    // query).
    expect(STALLED_OPERATION_ALERT_PROPOSAL).toEqual({
      queuedLeaseMs: 60 * 60 * 1000,
      processingLeaseMs: 10 * 60 * 1000,
    });
  });

  it("missing-events and telemetry-drop proposals are pinned", () => {
    expect(MISSING_EVENTS_ALERT_PROPOSAL).toEqual({
      minCanonicalTerminals: 10,
      missingRatio: 0.2,
      windowMin: 15,
    });
    expect(TELEMETRY_DROP_ALERT_PROPOSAL).toEqual({ minNewDrops: 1 });
  });
});

describe("evaluateTerminalFailureRate", () => {
  it("fires when the failure rate reaches the threshold", () => {
    const { alerts, insufficient } = evaluateTerminalFailureRate(
      [{ ...PROD, terminals: 25, completed: 20, failed: 2 }],
      TERMINAL_FAILURE_ALERT_PROPOSAL,
      AT,
    );
    expect(insufficient).toEqual([]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      rule: "terminal_failure_rate",
      severity: "error",
      cohort: PROD,
      observed: { failureRate: 0.1, failed: 2, completed: 20, terminals: 25 },
      sampleSize: 20,
      evaluatedAt: AT,
    });
    expect(alerts[0]?.threshold.failureRate).toBe(0.1);
  });

  it("stays silent below the rate", () => {
    const { alerts, insufficient } = evaluateTerminalFailureRate(
      [{ ...PROD, terminals: 25, completed: 20, failed: 1 }],
      TERMINAL_FAILURE_ALERT_PROPOSAL,
      AT,
    );
    expect(alerts).toEqual([]);
    expect(insufficient).toEqual([]);
  });

  it("flags low samples instead of zeroing them", () => {
    const { alerts, insufficient } = evaluateTerminalFailureRate(
      [{ ...PROD, terminals: 4, completed: 3, failed: 3 }],
      TERMINAL_FAILURE_ALERT_PROPOSAL,
      AT,
    );
    expect(alerts).toEqual([]);
    expect(insufficient).toEqual([
      {
        rule: "terminal_failure_rate",
        cohort: PROD,
        reason: "insufficient_sample",
        sampleSize: 3,
        minimum: 20,
        evaluatedAt: AT,
      },
    ]);
  });

  it("flags the terminals gate when completed is sufficient but terminals are not", () => {
    const { alerts, insufficient } = evaluateTerminalFailureRate(
      [{ ...PROD, terminals: 2, completed: 25, failed: 0 }],
      TERMINAL_FAILURE_ALERT_PROPOSAL,
      AT,
    );
    expect(alerts).toEqual([]);
    expect(insufficient).toEqual([
      expect.objectContaining({ sampleSize: 2, minimum: 5 }),
    ]);
  });

  it("never mixes cohorts: staging failures do not alert production", () => {
    const { alerts } = evaluateTerminalFailureRate(
      [
        { ...PROD, terminals: 30, completed: 30, failed: 0 },
        { ...STAGING, terminals: 30, completed: 20, failed: 10 },
      ],
      TERMINAL_FAILURE_ALERT_PROPOSAL,
      AT,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.cohort).toEqual(STAGING);
  });

  it("accepts adjusted thresholds as params without code-shape changes", () => {
    const strict = { ...TERMINAL_FAILURE_ALERT_PROPOSAL, rate: 0.5 };
    const { alerts } = evaluateTerminalFailureRate(
      [{ ...PROD, terminals: 25, completed: 20, failed: 2 }],
      strict,
      AT,
    );
    expect(alerts).toEqual([]);
  });

  it("clamps invalid counts instead of throwing", () => {
    const { alerts, insufficient } = evaluateTerminalFailureRate(
      [{ ...PROD, terminals: -1, completed: Number.NaN, failed: 5 }],
      TERMINAL_FAILURE_ALERT_PROPOSAL,
      AT,
    );
    expect(alerts).toEqual([]);
    expect(insufficient).toHaveLength(1);
  });
});

describe("evaluateStalledOperations", () => {
  it("fires one aggregated alert per stalled cohort", () => {
    const alerts = evaluateStalledOperations(
      [
        { ...PROD, state: "queued", ageMs: 61 * 60 * 1000 },
        { ...PROD, state: "processing", ageMs: 11 * 60 * 1000 },
        { ...PROD, state: "queued", ageMs: 1000 },
      ],
      STALLED_OPERATION_ALERT_PROPOSAL,
      AT,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      rule: "stalled_operation",
      severity: "warn",
      cohort: PROD,
      observed: { stalledCount: 2, maxAgeMs: 61 * 60 * 1000 },
      sampleSize: 2,
      evaluatedAt: AT,
    });
  });

  it("an age exactly at the lease is not stalled yet", () => {
    const alerts = evaluateStalledOperations(
      [
        { ...PROD, state: "queued", ageMs: 60 * 60 * 1000 },
        { ...PROD, state: "processing", ageMs: 10 * 60 * 1000 },
      ],
      STALLED_OPERATION_ALERT_PROPOSAL,
      AT,
    );
    expect(alerts).toEqual([]);
  });

  it("fires on processing beyond the 10-minute lease", () => {
    const alerts = evaluateStalledOperations(
      [{ ...PROD, state: "processing", ageMs: 10 * 60 * 1000 + 1 }],
      STALLED_OPERATION_ALERT_PROPOSAL,
      AT,
    );
    expect(alerts).toHaveLength(1);
  });

  it("fires on queue waits beyond the queued lease even after processing started", () => {
    const alerts = evaluateStalledOperations(
      [
        {
          ...PROD,
          state: "processing",
          ageMs: 60 * 1000,
          queueWaitMs: 61 * 60 * 1000,
        },
      ],
      STALLED_OPERATION_ALERT_PROPOSAL,
      AT,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.observed.stalledCount).toBe(1);
  });

  it("keeps cohorts separate and orders them deterministically", () => {
    const alerts = evaluateStalledOperations(
      [
        { ...STAGING, state: "queued", ageMs: 2 * 60 * 60 * 1000 },
        { ...PROD, state: "queued", ageMs: 2 * 60 * 60 * 1000 },
      ],
      STALLED_OPERATION_ALERT_PROPOSAL,
      AT,
    );
    expect(alerts.map((alert) => alert.cohort)).toEqual([PROD, STAGING]);
  });

  it("empty input yields no alerts", () => {
    expect(evaluateStalledOperations([], STALLED_OPERATION_ALERT_PROPOSAL, AT)).toEqual([]);
  });
});

describe("evaluateMissingExpectedEvents", () => {
  it("fires when journal terminals fall beyond the ratio", () => {
    const { alerts, insufficient } = evaluateMissingExpectedEvents(
      [{ ...PROD, canonicalTerminals: 10, journalTerminals: 7 }],
      MISSING_EVENTS_ALERT_PROPOSAL,
      AT,
    );
    expect(insufficient).toEqual([]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      rule: "missing_expected_events",
      cohort: PROD,
      observed: {
        missing: 3,
        missingRatio: 0.3,
        canonicalTerminals: 10,
        journalTerminals: 7,
      },
      sampleSize: 10,
      evaluatedAt: AT,
    });
  });

  it("stays silent when the journal covers the funnel", () => {
    const { alerts, insufficient } = evaluateMissingExpectedEvents(
      [{ ...PROD, canonicalTerminals: 10, journalTerminals: 10 }],
      MISSING_EVENTS_ALERT_PROPOSAL,
      AT,
    );
    expect(alerts).toEqual([]);
    expect(insufficient).toEqual([]);
  });

  it("a surplus of journal events is not missing", () => {
    const { alerts } = evaluateMissingExpectedEvents(
      [{ ...PROD, canonicalTerminals: 10, journalTerminals: 12 }],
      MISSING_EVENTS_ALERT_PROPOSAL,
      AT,
    );
    expect(alerts).toEqual([]);
  });

  it("flags small canonical windows instead of firing", () => {
    const { alerts, insufficient } = evaluateMissingExpectedEvents(
      [{ ...PROD, canonicalTerminals: 4, journalTerminals: 0 }],
      MISSING_EVENTS_ALERT_PROPOSAL,
      AT,
    );
    expect(alerts).toEqual([]);
    expect(insufficient).toEqual([
      expect.objectContaining({
        reason: "insufficient_sample",
        sampleSize: 4,
        minimum: 10,
      }),
    ]);
  });
});

describe("evaluateTelemetryDrops", () => {
  it("reports no_baseline without a previous snapshot (never fires spuriously)", () => {
    const current: TelemetryLossSnapshot = {
      ...zeroLoss(),
      journalDroppedEvents: 42,
    };
    const { alerts, insufficient } = evaluateTelemetryDrops(PROD, current, undefined, TELEMETRY_DROP_ALERT_PROPOSAL, AT);
    expect(alerts).toEqual([]);
    expect(insufficient).toEqual([
      {
        rule: "telemetry_drop",
        cohort: PROD,
        reason: "no_baseline",
        sampleSize: 0,
        minimum: 1,
        evaluatedAt: AT,
      },
    ]);
  });

  it("fires once per evaluation grouping every increased signal", () => {
    const previous: TelemetryLossSnapshot = {
      ...zeroLoss(),
      journalDroppedEvents: 2,
    };
    const current: TelemetryLossSnapshot = {
      journalDroppedEvents: 5,
      journalFailedFlushes: 1,
      aiTracingDroppedSpans: 0,
      aiTracingFailedFlushes: 0,
    };
    const { alerts, insufficient } = evaluateTelemetryDrops(PROD, current, previous, TELEMETRY_DROP_ALERT_PROPOSAL, AT);
    expect(insufficient).toEqual([]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      rule: "telemetry_drop",
      cohort: PROD,
      observed: {
        "journal.droppedEvents": 3,
        "journal.failedFlushes": 1,
      },
      sampleSize: 4,
      evaluatedAt: AT,
    });
  });

  it("stays silent when counters do not advance", () => {
    const snapshot: TelemetryLossSnapshot = {
      ...zeroLoss(),
      journalDroppedEvents: 5,
    };
    const { alerts, insufficient } = evaluateTelemetryDrops(
      PROD,
      { ...snapshot },
      { ...snapshot },
      TELEMETRY_DROP_ALERT_PROPOSAL,
      AT,
    );
    expect(alerts).toEqual([]);
    expect(insufficient).toEqual([]);
  });

  it("fires on AI-tracing losses too", () => {
    const { alerts } = evaluateTelemetryDrops(
      PROD,
      { ...zeroLoss(), aiTracingDroppedSpans: 1, aiTracingFailedFlushes: 2 },
      zeroLoss(),
      TELEMETRY_DROP_ALERT_PROPOSAL,
      AT,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.observed).toEqual({
      "aiTracing.droppedSpans": 1,
      "aiTracing.failedFlushes": 2,
    });
  });
});

describe("matchesEmergencyTelemetryPattern", () => {
  it("matches both static emergency prefixes", () => {
    expect(
      matchesEmergencyTelemetryPattern(
        `${DIAGNOSTIC_JOURNAL_EMERGENCY_PREFIX} drop; telemetry affected, generation unaffected`,
      ),
    ).toBe(true);
    expect(
      matchesEmergencyTelemetryPattern(
        `${AI_TRACING_EMERGENCY_PREFIX} export-failed; telemetry affected, generation unaffected`,
      ),
    ).toBe(true);
  });

  it("rejects unrelated lines and non-strings", () => {
    expect(matchesEmergencyTelemetryPattern("generation failed")).toBe(false);
    expect(matchesEmergencyTelemetryPattern("")).toBe(false);
    expect(matchesEmergencyTelemetryPattern(undefined)).toBe(false);
    expect(matchesEmergencyTelemetryPattern(42)).toBe(false);
  });
});

describe("emitDiagnosticAlerts", () => {
  function makeAlert(): DiagnosticAlert {
    return {
      rule: "terminal_failure_rate",
      severity: "error",
      cohort: PROD,
      observed: { failureRate: 0.5 },
      threshold: { failureRate: 0.1 },
      sampleSize: 20,
      evaluatedAt: AT,
    };
  }

  it("logs once and captures once per alert (single-capture path)", () => {
    const logs: Array<Record<string, unknown>> = [];
    const captures: Array<{ error: unknown; context?: Record<string, unknown>; tags?: Record<string, string | number | boolean> }> = [];
    emitDiagnosticAlerts([makeAlert(), { ...makeAlert(), cohort: STAGING }], {
      log: (fields) => {
        logs.push(fields);
      },
      capture: (error, context, tags) => {
        captures.push({ error, context, tags });
      },
    });
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({
      event: "diagnostics.alert",
      rule: "terminal_failure_rate",
      protocol: "single",
      environment: "production",
      dataOrigin: "production",
    });
    expect(logs[0]).not.toHaveProperty("workItemId");
    expect(captures).toHaveLength(2);
    expect(captures[0]?.error).toBeInstanceOf(Error);
    expect(captures[0]?.tags).toEqual({
      rule: "terminal_failure_rate",
      protocol: "single",
      environment: "production",
      dataOrigin: "production",
    });
    expect(captures[0]?.error).not.toBe(captures[1]?.error);
    // Capture-first dedup contract: the console log carries the SAME Error
    // object the capture saw, so shared dedup keeps it console-only.
    expect(logs[0]?.error).toBe(captures[0]?.error);
    expect(logs[1]?.error).toBe(captures[1]?.error);
  });

  it("emitting nothing calls nothing", () => {
    let calls = 0;
    emitDiagnosticAlerts([], {
      log: () => {
        calls += 1;
      },
      capture: () => {
        calls += 1;
      },
    });
    expect(calls).toBe(0);
  });

  it("never throws when sinks fail", () => {
    expect(() =>
      emitDiagnosticAlerts([makeAlert()], {
        log: () => {
          throw new Error("log down");
        },
        capture: () => {
          throw new Error("sentry down");
        },
      }),
    ).not.toThrow();
  });

  describe("default sinks (real logger path)", () => {
    beforeEach(() => {
      vi.stubEnv("SENTRY_DSN", "https://example@o1.ingest.sentry.io/1");
      sentryMocks.captureException.mockClear();
      sentryMocks.captureMessage.mockClear();
      vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
      sentryMocks.captureException.mockClear();
      sentryMocks.captureMessage.mockClear();
    });

    it("emits exactly one Sentry event per alert (no #406 pair)", async () => {
      emitDiagnosticAlerts([makeAlert()]);
      // The forward chain is async (dynamic Sentry import); poll for the
      // expected capture instead of sleeping a fixed window.
      await vi.waitFor(() => {
        expect(sentryMocks.captureException).toHaveBeenCalledTimes(1);
      });
      // Any paired captureMessage would ride the same resolved chain.
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      expect(sentryMocks.captureMessage).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledTimes(1);
    });
  });
});

describe("evaluators are deterministic", () => {
  it("same input yields identical output", () => {
    const input = [{ ...PROD, terminals: 25, completed: 20, failed: 5 }];
    expect(
      evaluateTerminalFailureRate(input, TERMINAL_FAILURE_ALERT_PROPOSAL, AT),
    ).toEqual(evaluateTerminalFailureRate(input, TERMINAL_FAILURE_ALERT_PROPOSAL, AT));
  });
});
