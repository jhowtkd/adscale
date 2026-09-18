import { describe, expect, it } from "vitest";
import {
  assertLedgerEquivalence,
  buildDiagnosticsSplitEvidence,
  DIAGNOSTICS_SPLIT_ROWS,
  isDiagnosticsSplitRow,
  knownSecretsFromEnv,
  matchRequiredTraceSet,
  scanForSecrets,
  validateDiagnosticsSplitEvidence,
  type BuildSplitEvidenceInput,
  type SplitObservedEvent,
} from "./diagnostics-split-evidence";

function observedEvent(overrides: Partial<SplitObservedEvent> = {}): SplitObservedEvent {
  return {
    eventId: "evt-1",
    event: "selection.confirmed",
    stage: "selection",
    status: "completed",
    correlation: "full",
    operationId: "op-1",
    parentOperationId: null,
    outputId: "out-1",
    process: "web",
    dataOrigin: "synthetic",
    hasCall: false,
    hasError: false,
    hasExternalRefs: false,
    hasLangfuseRefs: false,
    contentAvailability: null,
    ...overrides,
  };
}

function successInput(overrides: Partial<BuildSplitEvidenceInput> = {}): BuildSplitEvidenceInput {
  return {
    row: "success",
    sha: "abc1234",
    nodeVersion: "v22.0.0",
    workspaceId: "ws-1",
    workItemId: "work-1",
    outputIds: ["out-1"],
    selectedOutputId: "out-1",
    downloadedFormat: "original",
    observedEvents: [
      observedEvent({ eventId: "evt-1", event: "selection.confirmed", operationId: "op-select" }),
      observedEvent({ eventId: "evt-2", event: "export.prepared", stage: "export", operationId: "op-export" }),
      observedEvent({ eventId: "evt-3", event: "export.served", stage: "export", operationId: "op-export" }),
    ],
    ledger: { debits: 1, refunds: 0, duplicateCharges: 0 },
    journeyResult: "completed",
    durationMs: 1000,
    startedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

describe("diagnostics split rows", () => {
  it("covers the seven-ticket matrix", () => {
    expect([...DIAGNOSTICS_SPLIT_ROWS]).toEqual([
      "success",
      "restart",
      "replay",
      "lost-context",
      "unavailable-exporter",
      "vendor-down",
      "instrumented-off",
    ]);
    expect(isDiagnosticsSplitRow("replay")).toBe(true);
    expect(isDiagnosticsSplitRow("bogus")).toBe(false);
  });
});

describe("matchRequiredTraceSet", () => {
  it("passes on exact and superset observations", () => {
    expect(
      matchRequiredTraceSet(
        { "selection.confirmed": 1, "export.prepared": 1, "export.served": 1 },
        { "selection.confirmed": 1, "export.prepared": 1, "export.served": 1 },
      ),
    ).toEqual([]);
    // Extra model-call emissions never fail the subset match.
    expect(
      matchRequiredTraceSet(
        {
          "selection.confirmed": 1,
          "export.prepared": 1,
          "export.served": 1,
          "model.call.started": 4,
          "model.call.completed": 4,
        },
        { "selection.confirmed": 1, "export.prepared": 1, "export.served": 1 },
      ),
    ).toEqual([]);
  });

  it("reports each missing name with observed counts", () => {
    expect(
      matchRequiredTraceSet(
        { "selection.confirmed": 1 },
        { "selection.confirmed": 1, "export.prepared": 1, "export.served": 1 },
      ),
    ).toEqual([
      "expected at least 1 export.prepared event(s), observed 0",
      "expected at least 1 export.served event(s), observed 0",
    ]);
  });
});

describe("scanForSecrets", () => {
  it("flags known secret values and ignores short ones", () => {
    const corpus = JSON.stringify({ attributes: { note: "key sk-test-openai-key-value here" } });
    expect(
      scanForSecrets(corpus, [
        { label: "OPENAI_API_KEY", value: "sk-test-openai-key-value" },
        { label: "SHORT", value: "short" },
      ]),
    ).toEqual(["secret value leaked: OPENAI_API_KEY"]);
    expect(scanForSecrets("nothing sensitive", [{ label: "X", value: "short" }])).toEqual([]);
  });

  it("flags generic secret shapes without a known value", () => {
    expect(scanForSecrets("-----BEGIN RSA PRIVATE KEY-----\n...", [])).toEqual([
      "secret pattern matched: private-key-block",
    ]);
    expect(scanForSecrets("key=sk-live-abc123", [])).toEqual([
      "secret pattern matched: live-stripe-key",
    ]);
    expect(scanForSecrets("token sk-test-ci is fine", [])).toEqual([]);
  });

  it("collects known secrets from env with a length gate", () => {
    expect(
      knownSecretsFromEnv({
        BETTER_AUTH_SECRET: "01234567890123456789012345678901",
        STRIPE_SECRET_KEY: "short",
        UNRELATED: "01234567890123456789",
      }),
    ).toEqual([{ label: "BETTER_AUTH_SECRET", value: "01234567890123456789012345678901" }]);
  });
});

describe("assertLedgerEquivalence", () => {
  it("accepts exactly-once settlement and rejects the rest", () => {
    expect(assertLedgerEquivalence({ debits: 1, refunds: 0, duplicateCharges: 0 }, { debits: 1, refunds: 0 })).toEqual([]);
    expect(assertLedgerEquivalence(null, { debits: 1, refunds: 0 })).toEqual([
      "settlement ledger was not observed",
    ]);
    expect(
      assertLedgerEquivalence({ debits: 2, refunds: 0, duplicateCharges: 1 }, { debits: 1, refunds: 0 }),
    ).toEqual([
      "expected 1 debit row(s), observed 2",
      "duplicate charges observed: 1",
    ]);
    expect(
      assertLedgerEquivalence({ debits: 1, refunds: 1, duplicateCharges: 0 }, { debits: 1, refunds: 0 }),
    ).toEqual(["expected 0 refund row(s), observed 1"]);
  });
});

describe("validateDiagnosticsSplitEvidence", () => {
  it("accepts a green success row", () => {
    const validation = validateDiagnosticsSplitEvidence(
      buildDiagnosticsSplitEvidence(successInput()),
    );
    expect(validation).toEqual({ ok: true, failures: [] });
  });

  it("derives counts, operations and tallies from observed events", () => {
    const evidence = buildDiagnosticsSplitEvidence(
      successInput({
        observedEvents: [
          observedEvent({ eventId: "a", event: "selection.confirmed", operationId: "op-1" }),
          observedEvent({
            eventId: "b",
            event: "model.call.completed",
            stage: "image",
            operationId: "op-1",
            correlation: "partial",
            hasLangfuseRefs: true,
          }),
          observedEvent({ eventId: "c", event: "export.prepared", stage: "export", operationId: "op-2" }),
          observedEvent({ eventId: "d", event: "export.served", stage: "export", operationId: "op-2" }),
        ],
      }),
    );
    expect(evidence.eventCounts).toEqual({
      "selection.confirmed": 1,
      "model.call.completed": 1,
      "export.prepared": 1,
      "export.served": 1,
    });
    expect(evidence.operationIds).toEqual(["op-1", "op-2"]);
    expect(evidence.partialEvents).toBe(1);
    expect(evidence.langfuseRefs).toBe(1);
  });

  it("rejects missing traces, secrets, redacted content and non-synthetic origins", () => {
    const validation = validateDiagnosticsSplitEvidence(
      buildDiagnosticsSplitEvidence(
        successInput({
          sha: "  ",
          contentMode: "redacted",
          observedEvents: [
            observedEvent({ event: "selection.confirmed", contentAvailability: "redacted" }),
            observedEvent({ eventId: "zzz", event: "not.a.real.event", stage: "nope", operationId: "op-x" }),
          ],
          secretFindings: ["secret value leaked: OPENAI_API_KEY"],
        }),
      ),
    );
    expect(validation.ok).toBe(false);
    expect(validation.failures).toContain("sha is required");
    expect(validation.failures).toContain(
      "content gate #391 stays BLOCKED: content mode must be metadata_only, got redacted",
    );
    expect(validation.failures).toContain("secret value leaked: OPENAI_API_KEY");
    expect(validation.failures).toContain("event outside frozen vocabulary: not.a.real.event");
    expect(validation.failures).toContain("stage outside frozen vocabulary: nope");
    expect(validation.failures).toContain(
      "redacted content capture requires gate #391: run stays metadata_only",
    );
    expect(validation.failures).toContain(
      "expected at least 1 export.prepared event(s), observed 0",
    );
  });

  it("requires exactly-once selection traces and ledger on journey rows", () => {
    const validation = validateDiagnosticsSplitEvidence(
      buildDiagnosticsSplitEvidence(
        successInput({
          row: "restart",
          restarted: false,
          observedEvents: [
            observedEvent({ eventId: "a", event: "selection.confirmed", operationId: "op-1" }),
            observedEvent({ eventId: "b", event: "selection.confirmed", operationId: "op-2" }),
            observedEvent({ eventId: "c", event: "export.prepared", stage: "export", operationId: "op-3" }),
            observedEvent({ eventId: "d", event: "export.served", stage: "export", operationId: "op-3" }),
          ],
          ledger: { debits: 2, refunds: 0, duplicateCharges: 1 },
        }),
      ),
    );
    expect(validation.ok).toBe(false);
    expect(validation.failures).toContain("restart: the worker was never rebooted around the dispatch");
    expect(validation.failures).toContain("restart: expected exactly 1 selection.confirmed, observed 2");
    expect(validation.failures).toContain("expected 1 debit row(s), observed 2");
  });

  it("requires a partial event on lost-context and zero AI-trace refs off-vendor", () => {
    const lost = validateDiagnosticsSplitEvidence(
      buildDiagnosticsSplitEvidence(successInput({ row: "lost-context" })),
    );
    expect(lost.failures).toContain("lost-context: expected at least 1 partial-correlation event");

    const vendor = validateDiagnosticsSplitEvidence(
      buildDiagnosticsSplitEvidence(
        successInput({
          row: "vendor-down",
          observedEvents: [
            observedEvent({ event: "selection.confirmed", hasLangfuseRefs: true }),
            observedEvent({ eventId: "c", event: "export.prepared", stage: "export", operationId: "op-3" }),
            observedEvent({ eventId: "d", event: "export.served", stage: "export", operationId: "op-3" }),
          ],
        }),
      ),
    );
    expect(vendor.failures).toContain(
      "vendor-down: expected zero exported AI-trace refs, observed 1",
    );
  });

  it("validates the in-process unavailable-exporter row", () => {
    const ok = validateDiagnosticsSplitEvidence(
      buildDiagnosticsSplitEvidence({
        row: "unavailable-exporter",
        sha: "abc1234",
        nodeVersion: "v22.0.0",
        workspaceId: "ws-synthetic",
        workItemId: "work-synthetic",
        outputIds: [],
        topology: "in-process",
        degraded: true,
        observedEvents: [],
        ledger: null,
        journeyResult: "not-applicable",
        durationMs: 10,
        startedAt: new Date(0).toISOString(),
      }),
    );
    expect(ok).toEqual({ ok: true, failures: [] });

    const bad = validateDiagnosticsSplitEvidence(
      buildDiagnosticsSplitEvidence({
        row: "unavailable-exporter",
        sha: "abc1234",
        nodeVersion: "v22.0.0",
        workspaceId: "ws-synthetic",
        workItemId: "work-synthetic",
        outputIds: [],
        observedEvents: [],
        ledger: { debits: 1, refunds: 0, duplicateCharges: 0 },
        journeyResult: "completed",
        durationMs: 10,
        startedAt: new Date(0).toISOString(),
      }),
    );
    expect(bad.ok).toBe(false);
    expect(bad.failures).toContain(
      "unavailable-exporter must surface degraded telemetry, not silence",
    );
  });
});
