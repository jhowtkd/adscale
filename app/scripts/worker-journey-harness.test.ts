import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  buildJourneyEvidence,
  buildReplayEventId,
  classifyExecutor,
  countJourneyProviderCalls,
  hasJourneyFailureRecord,
  HARNESS_SCENARIOS,
  parseHarnessArgs,
  readJourneyLedger,
  recoveryEffectsSettled,
  recoveryRequestedKinds,
  REPLAY_GENERATE_EVENT,
  resolveHarnessConfig,
  resolveRemoteUncertainty,
  sendReplayEvent,
  summarizeJourneyLedger,
  summarizeJourneyOutputs,
  summarizeRecoveryEffects,
} from "./worker-journey-harness";

vi.mock("inngest", () => {
  const send = vi.fn(async () => ({ ids: ["evt-test"] }));
  function InngestMock() {
    return { send };
  }
  return { Inngest: InngestMock, __send: send };
});

describe("harness args", () => {
  it("parses a full invocation", () => {
    const args = parseHarnessArgs([
      "--scenario",
      "no-worker",
      "--web-port",
      "3101",
      "--queue-port",
      "8289",
      "--report",
      "/tmp/report.json",
      "--timeout-ms",
      "5000",
      "--observe-ms",
      "7000",
      "--build",
      "--plan",
    ]);
    expect(args).toEqual({
      scenario: "no-worker",
      webPort: 3101,
      queuePort: 8289,
      reportPath: "/tmp/report.json",
      timeoutMs: 5000,
      observeMs: 7000,
      build: true,
      plan: true,
      help: false,
    });
  });

  it("applies defaults for a minimal invocation", () => {
    const args = parseHarnessArgs(["--scenario", "success"]);
    expect(args).toMatchObject({
      scenario: "success",
      webPort: 3100,
      queuePort: 8288,
      timeoutMs: 240_000,
      observeMs: 30_000,
      build: false,
      plan: false,
      help: false,
    });
    expect(args.reportPath).toMatch(/worker-journey-success\.json$/);
  });

  it("rejects unknown scenarios, flags and bad ports", () => {
    expect(() => parseHarnessArgs(["--scenario", "bogus"])).toThrow(/scenario/);
    expect(() => parseHarnessArgs(["--scenario", "success", "--nope"])).toThrow(/unknown flag/);
    expect(() => parseHarnessArgs(["--scenario", "success", "--web-port", "abc"])).toThrow(
      /web-port/,
    );
    expect(() => parseHarnessArgs([])).toThrow(/scenario/);
  });

  it("accepts every failure-matrix scenario", () => {
    expect(HARNESS_SCENARIOS).toEqual([
      "success",
      "no-worker",
      "replay",
      "restart",
      "failure",
      "ambiguous-timeout",
      "pre-provider-failure",
    ]);
    for (const scenario of HARNESS_SCENARIOS) {
      expect(parseHarnessArgs(["--scenario", scenario]).scenario).toBe(scenario);
    }
  });
});

describe("harness config resolution", () => {
  const fullEnv: NodeJS.ProcessEnv = {
    DATABASE_URL: "postgres://test:test@localhost:5432/x",
    BETTER_AUTH_SECRET: "01234567890123456789012345678901",
    EMAIL_FROM: "ADScale <a@b.c>",
    OPENAI_API_KEY: "sk-test",
    INNGEST_EVENT_KEY: "test",
    INNGEST_SIGNING_KEY: "test",
    R2_ACCOUNT_ID: "test",
    R2_ACCESS_KEY_ID: "test",
    R2_SECRET_ACCESS_KEY: "test",
    R2_BUCKET: "test",
    R2_PUBLIC_BASE_URL: "https://test.example.com",
    STRIPE_SECRET_KEY: "sk_test",
    STRIPE_WEBHOOK_SECRET: "whsec_test",
    STRIPE_STARTER_PRICE_ID: "price_starter",
    STRIPE_GROWTH_PRICE_ID: "price_growth",
    STRIPE_SCALE_PRICE_ID: "price_scale",
    STRIPE_SUCCESS_URL: "http://localhost:3100/success",
    STRIPE_CANCEL_URL: "http://localhost:3100/cancel",
  };

  it("resolves defaults and localhost URLs from a complete env", () => {
    const { config, problems } = resolveHarnessConfig(
      parseHarnessArgs(["--scenario", "success"]),
      fullEnv,
      { nodeVersion: "v22.23.2", pinnedNodeMajor: "22" },
    );
    expect(problems).toEqual([]);
    expect(config.webPort).toBe(3100);
    expect(config.baseUrl).toBe("http://localhost:3100");
    expect(config.queueUrl).toBe("http://127.0.0.1:8288");
    expect(config.target).toBe("worker");
  });

  it("lists every missing required variable instead of failing on the first", () => {
    const { problems } = resolveHarnessConfig(parseHarnessArgs(["--scenario", "success"]), {});
    expect(problems.join("\n")).toMatch(/DATABASE_URL/);
    expect(problems.join("\n")).toMatch(/BETTER_AUTH_SECRET/);
    expect(problems.length).toBeGreaterThan(5);
  });

  it("flags a runtime mismatch against the pinned major", () => {
    const { problems } = resolveHarnessConfig(
      parseHarnessArgs(["--scenario", "success"]),
      fullEnv,
      { nodeVersion: "v26.7.0", pinnedNodeMajor: "22" },
    );
    expect(problems.join("\n")).toMatch(/Node 22.*v26\.7\.0/);
  });
});

describe("provider-call attribution", () => {
  const line = (outputPrefix: string) =>
    JSON.stringify({ ts: "2026-09-16T00:00:00.000Z", outputPrefix, outcome: "success" });

  it("counts only records for the journey outputs and skips malformed lines", () => {
    const jsonl = [
      line("creative-work/out-1"),
      line("creative-work/out-2"),
      line("creative-work/other"),
      "not json",
      "",
    ].join("\n");
    expect(countJourneyProviderCalls(jsonl, ["out-1", "out-2"])).toBe(2);
    expect(countJourneyProviderCalls("", ["out-1"])).toBe(0);
  });
});

describe("executor classification", () => {
  it("needs worker calls plus a connection for the worker verdict", () => {
    expect(
      classifyExecutor({ workerCalls: 2, webCalls: 0, leakedCalls: 0, anyCompleted: true }),
    ).toBe("worker");
  });

  it("reports none when nothing executed anywhere", () => {
    expect(
      classifyExecutor({ workerCalls: 0, webCalls: 0, leakedCalls: 0, anyCompleted: false }),
    ).toBe("none");
  });

  it("reports unexpected on web execution, leaked attribution or phantom completion", () => {
    expect(
      classifyExecutor({ workerCalls: 2, webCalls: 1, leakedCalls: 0, anyCompleted: true }),
    ).toBe("unexpected");
    expect(
      classifyExecutor({ workerCalls: 0, webCalls: 0, leakedCalls: 1, anyCompleted: false }),
    ).toBe("unexpected");
    expect(
      classifyExecutor({ workerCalls: 0, webCalls: 0, leakedCalls: 0, anyCompleted: true }),
    ).toBe("unexpected");
  });
});

describe("output summarization", () => {
  it("recognizes completed outputs with bytes", () => {
    expect(
      summarizeJourneyOutputs([
        { id: "a", status: "completed", hasOutput: true, imageCallCount: 2 },
        { id: "b", status: "completed", hasOutput: true, imageCallCount: 1 },
      ]),
    ).toEqual({ allCompletedWithBytes: true, unexecuted: false, anyCompleted: true, failed: false });
  });

  it("recognizes unexecuted outputs", () => {
    expect(
      summarizeJourneyOutputs([
        { id: "a", status: "queued", hasOutput: false, imageCallCount: 0 },
        { id: "b", status: "processing", hasOutput: false, imageCallCount: 0 },
      ]),
    ).toEqual({ allCompletedWithBytes: false, unexecuted: true, anyCompleted: false, failed: false });
  });

  it("marks partial or failed states as neither completed nor unexecuted", () => {
    expect(
      summarizeJourneyOutputs([
        { id: "a", status: "completed", hasOutput: true, imageCallCount: 1 },
        { id: "b", status: "failed", hasOutput: false, imageCallCount: 0 },
      ]),
    ).toEqual({ allCompletedWithBytes: false, unexecuted: false, anyCompleted: true, failed: false });
    expect(summarizeJourneyOutputs([])).toEqual({
      allCompletedWithBytes: false,
      unexecuted: false,
      anyCompleted: false,
      failed: false,
    });
  });

  it("recognizes a terminal all-failed set", () => {
    expect(
      summarizeJourneyOutputs([
        { id: "a", status: "failed", hasOutput: false, imageCallCount: 1 },
      ]),
    ).toEqual({ allCompletedWithBytes: false, unexecuted: false, anyCompleted: false, failed: true });
  });
});

describe("evidence building", () => {
  const settledLedger = { duplicateCharges: 0, ledgerDebits: 1, ledgerRefunds: 0 } as const;

  it("builds a valid success record from collected observations", () => {
    const evidence = buildJourneyEvidence({
      scenario: "success",
      sha: "deadbeef",
      nodeVersion: "20.19.0",
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputIds: ["out-1"],
      workerConnected: true,
      executorObserved: "worker",
      providerCalls: 3,
      ...settledLedger,
      remoteUncertainty: "none",
      outputsSummary: { allCompletedWithBytes: true, unexecuted: false, anyCompleted: true, failed: false },
    });
    expect(evidence).toMatchObject({
      schemaVersion: 1,
      syntheticOrigin: true,
      workerTarget: "worker",
      resultObserved: "completed",
      duplicateCharges: 0,
      ledgerDebits: 1,
      ledgerRefunds: 0,
      remoteUncertainty: "none",
    });
  });

  it("builds an unexecuted record for the no-worker scenario", () => {
    const evidence = buildJourneyEvidence({
      scenario: "no-worker",
      sha: "deadbeef",
      nodeVersion: "20.19.0",
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputIds: ["out-1"],
      workerConnected: false,
      executorObserved: "none",
      providerCalls: 0,
      duplicateCharges: null,
      ledgerDebits: null,
      ledgerRefunds: null,
      remoteUncertainty: "none",
      outputsSummary: { allCompletedWithBytes: false, unexecuted: true, anyCompleted: false, failed: false },
    });
    expect(evidence.resultObserved).toBe("unexecuted");
  });

  it("marks ambiguous collections unknown so the validator fails them", () => {
    const evidence = buildJourneyEvidence({
      scenario: "success",
      sha: "deadbeef",
      nodeVersion: "20.19.0",
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputIds: ["out-1"],
      workerConnected: true,
      executorObserved: "worker",
      providerCalls: 1,
      ...settledLedger,
      remoteUncertainty: "none",
      outputsSummary: { allCompletedWithBytes: false, unexecuted: false, anyCompleted: true, failed: false },
    });
    expect(evidence.resultObserved).toBe("unknown");
  });

  it("derives failed for terminal scenarios and unexecuted for the unknown unit", () => {
    const failed = buildJourneyEvidence({
      scenario: "failure",
      sha: "deadbeef",
      nodeVersion: "20.19.0",
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputIds: ["out-1"],
      workerConnected: true,
      executorObserved: "worker",
      providerCalls: 1,
      duplicateCharges: 0,
      ledgerDebits: 1,
      ledgerRefunds: 1,
      remoteUncertainty: "none",
      outputsSummary: { allCompletedWithBytes: false, unexecuted: false, anyCompleted: false, failed: true },
    });
    expect(failed.resultObserved).toBe("failed");
    const unknown = buildJourneyEvidence({
      scenario: "pre-provider-failure",
      sha: "deadbeef",
      nodeVersion: "20.19.0",
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputIds: ["out-1"],
      workerConnected: true,
      executorObserved: "none",
      providerCalls: 0,
      duplicateCharges: 0,
      ledgerDebits: 0,
      ledgerRefunds: 0,
      remoteUncertainty: "none",
      outputsSummary: { allCompletedWithBytes: false, unexecuted: false, anyCompleted: false, failed: false },
    });
    expect(unknown.resultObserved).toBe("unexecuted");
  });
});

describe("remote uncertainty", () => {
  const line = (outputPrefix: string, outcome: string) =>
    JSON.stringify({ ts: "2026-09-16T00:00:00.000Z", outputPrefix, outcome });

  it("detects journey failure records and ignores the rest", () => {
    const jsonl = [
      line("creative-work/out-1", "failure"),
      line("creative-work/out-1", "success"),
      line("creative-work/other", "failure"),
      "not json",
    ].join("\n");
    expect(hasJourneyFailureRecord(jsonl, ["out-1"])).toBe(true);
    expect(hasJourneyFailureRecord(jsonl, ["out-9"])).toBe(false);
    expect(hasJourneyFailureRecord("", ["out-1"])).toBe(false);
  });

  it("indicates ambiguity only for the timeout probe with an observed failure", () => {
    expect(resolveRemoteUncertainty("ambiguous-timeout", true)).toBe("ambiguous_provider_timeout");
    expect(resolveRemoteUncertainty("ambiguous-timeout", false)).toBe("none");
    expect(resolveRemoteUncertainty("failure", true)).toBe("none");
    expect(resolveRemoteUncertainty("success", true)).toBe("none");
  });
});

describe("settlement ledger", () => {
  const row = (idempotency_key: string, metadata: Record<string, unknown> | null = null) => ({
    idempotency_key,
    type: "image_derivation",
    amount: 5,
    metadata,
  });

  it("counts one debit and zero refunds for a settled journey", () => {
    const summary = summarizeJourneyLedger(
      [row("creative-work:work-1:initial"), row("creative-work:other:initial")],
      "work-1",
      ["out-1"],
    );
    expect(summary).toMatchObject({ debits: 1, refunds: 0, duplicateCharges: 0 });
    expect(summary.debitKeys).toEqual(["creative-work:work-1:initial"]);
  });

  it("counts terminal and compensatory refunds via keys and metadata", () => {
    const summary = summarizeJourneyLedger(
      [
        row("creative-work:work-1:initial"),
        row("creative-work:work-1:output:out-1:terminal-refund"),
        row("creative-output:out-1:compensatory-refund", { creativeWorkId: "work-1", outputId: "out-1" }),
        row("creative-output:out-9:compensatory-refund", { creativeWorkId: "work-9", outputId: "out-9" }),
      ],
      "work-1",
      ["out-1"],
    );
    expect(summary).toMatchObject({ debits: 1, refunds: 2, duplicateCharges: 0 });
  });

  it("flags extra debits as duplicate charges", () => {
    const summary = summarizeJourneyLedger(
      [row("creative-work:work-1:initial"), row("creative-work:work-1:initial:retry")],
      "work-1",
      ["out-1"],
    );
    expect(summary).toMatchObject({ debits: 2, duplicateCharges: 1 });
  });

  it("ignores dispatch-ack bookkeeping rows when counting charges", () => {
    const summary = summarizeJourneyLedger(
      [
        row("creative-work:work-1:initial"),
        {
          idempotency_key: "creative-work:work-1:initial:dispatch-ack",
          type: "generation_dispatch_ack",
          amount: 0,
          metadata: { creativeWorkId: "work-1" },
        },
      ],
      "work-1",
      ["out-1"],
    );
    expect(summary).toMatchObject({ debits: 1, refunds: 0, duplicateCharges: 0 });
    expect(summary.debitKeys).toEqual(["creative-work:work-1:initial"]);
  });

  it("queries the canonical usage ledger scoped to the journey", async () => {
    const seen: Array<{ sql: string; params: unknown[] }> = [];
    const rows = await readJourneyLedger(
      "postgres://unused",
      { workspaceId: "ws-1", workId: "work-1", outputIds: ["out-1"], since: "2026-09-17T00:00:00.000Z" },
      async (sql, params) => {
        seen.push({ sql, params });
        return [];
      },
    );
    expect(rows).toEqual([]);
    expect(seen).toHaveLength(1);
    expect(seen[0].sql).toMatch(/adscale_app\.usage_events/);
    expect(seen[0].sql).toMatch(/workspace_id = \$1/);
    expect(seen[0].params).toEqual(["ws-1", "2026-09-17T00:00:00.000Z", "work-1", ["out-1"]]);
  });
});

describe("replay dispatch", () => {
  it("targets the worker-side generate trigger with a fresh event id", async () => {
    expect(REPLAY_GENERATE_EVENT).toBe("creative-work.generate.v2");
    expect(buildReplayEventId("out-1", "abc")).toBe("creative-work-generate:out-1:replay-abc");
    await sendReplayEvent({
      queueUrl: "http://127.0.0.1:8288",
      eventKey: "test",
      eventId: "creative-work-generate:out-1:replay-abc",
      data: { workspaceId: "ws-1", workItemId: "work-1", outputId: "out-1", generationCorrelationId: "corr-1" },
    });
    const mocked = (await import("inngest")) as unknown as { __send: ReturnType<typeof vi.fn> };
    expect(mocked.__send).toHaveBeenCalledWith({
      id: "creative-work-generate:out-1:replay-abc",
      name: "creative-work.generate.v2",
      data: { workspaceId: "ws-1", workItemId: "work-1", outputId: "out-1", generationCorrelationId: "corr-1" },
    });
  });
});

describe("selection-effects recovery summary (ICE-03B)", () => {
  it("reads the interface projection and collects failed codes", () => {
    expect(
      summarizeRecoveryEffects({
        library: { status: "done" },
        valueEvent: { status: "pending", receiptId: "r1" },
        recipe: { status: "failed", code: "effect_dead", retryable: false },
      }),
    ).toEqual({
      library: "done",
      valueEvent: "pending",
      recipe: "failed",
      failedCodes: ["recipe:effect_dead"],
    });
  });

  it("treats missing and unknown states as not requested or pending", () => {
    expect(summarizeRecoveryEffects(undefined)).toEqual({
      library: "not_requested",
      valueEvent: "not_requested",
      recipe: "not_requested",
      failedCodes: [],
    });
    expect(
      summarizeRecoveryEffects({ library: { status: "bogus" } }),
    ).toMatchObject({ library: "pending" });
  });

  it("settles only when no kind is pending", () => {
    const settled = summarizeRecoveryEffects({
      library: { status: "done" },
      valueEvent: { status: "done" },
    });
    expect(recoveryEffectsSettled(settled)).toBe(true);
    expect(recoveryRequestedKinds(settled)).toEqual(["library", "valueEvent"]);
    const open = summarizeRecoveryEffects({ library: { status: "pending", receiptId: "r" } });
    expect(recoveryEffectsSettled(open)).toBe(false);
    expect(recoveryRequestedKinds(open)).toEqual(["library"]);
  });
});

describe("worker boot parity (ICE-02)", () => {
  const harnessSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "worker-journey-harness.ts"),
    "utf8",
  );

  it("boots the production worker entrypoint, not the bare worker module", () => {
    expect(harnessSource).toContain("src/server/jobs/image-worker-entry.ts");
    expect(harnessSource).not.toContain('"src/server/jobs/image-worker.ts"');
  });
});
