import { describe, expect, it } from "vitest";
import {
  buildJourneyEvidence,
  classifyExecutor,
  countJourneyProviderCalls,
  parseHarnessArgs,
  resolveHarnessConfig,
  summarizeJourneyOutputs,
} from "./worker-journey-harness";

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
    expect(() => parseHarnessArgs(["--scenario", "replay"])).toThrow(/scenario/);
    expect(() => parseHarnessArgs(["--scenario", "success", "--nope"])).toThrow(/unknown flag/);
    expect(() => parseHarnessArgs(["--scenario", "success", "--web-port", "abc"])).toThrow(
      /web-port/,
    );
    expect(() => parseHarnessArgs([])).toThrow(/scenario/);
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
    ).toEqual({ allCompletedWithBytes: true, unexecuted: false, anyCompleted: true });
  });

  it("recognizes unexecuted outputs", () => {
    expect(
      summarizeJourneyOutputs([
        { id: "a", status: "queued", hasOutput: false, imageCallCount: 0 },
        { id: "b", status: "processing", hasOutput: false, imageCallCount: 0 },
      ]),
    ).toEqual({ allCompletedWithBytes: false, unexecuted: true, anyCompleted: false });
  });

  it("marks partial or failed states as neither completed nor unexecuted", () => {
    expect(
      summarizeJourneyOutputs([
        { id: "a", status: "completed", hasOutput: true, imageCallCount: 1 },
        { id: "b", status: "failed", hasOutput: false, imageCallCount: 0 },
      ]),
    ).toEqual({ allCompletedWithBytes: false, unexecuted: false, anyCompleted: true });
    expect(summarizeJourneyOutputs([])).toEqual({
      allCompletedWithBytes: false,
      unexecuted: false,
      anyCompleted: false,
    });
  });
});

describe("evidence building", () => {
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
      outputsSummary: { allCompletedWithBytes: true, unexecuted: false, anyCompleted: true },
    });
    expect(evidence).toMatchObject({
      schemaVersion: 1,
      syntheticOrigin: true,
      workerTarget: "worker",
      resultObserved: "completed",
      duplicateCharges: null,
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
      outputsSummary: { allCompletedWithBytes: false, unexecuted: true, anyCompleted: false },
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
      outputsSummary: { allCompletedWithBytes: false, unexecuted: false, anyCompleted: true },
    });
    expect(evidence.resultObserved).toBe("unknown");
  });
});
