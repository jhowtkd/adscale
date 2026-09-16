// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentryMocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => sentryMocks);

import { logger } from "@/lib/logger";

const flushSentry = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 25));

beforeEach(() => {
  vi.stubEnv("SENTRY_DSN", "https://example@o1.ingest.sentry.io/1");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "debug").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  sentryMocks.captureException.mockClear();
  sentryMocks.captureMessage.mockClear();
});

describe("logger hardening (trace-385)", () => {
  it("runs without a browser global so server forwarding is testable", () => {
    expect(typeof window).toBe("undefined");
  });

  it("forwards structured-object warn with safe context preserved", async () => {
    logger.warn({
      event: "creative_work_output_terminal",
      workItemId: "work-1",
      outcome: "lease_lost",
    });
    await flushSentry();
    expect(sentryMocks.captureMessage).toHaveBeenCalledTimes(1);
    const [message, context] = sentryMocks.captureMessage.mock.calls[0] as [
      string,
      { level: string; extra: Record<string, unknown> },
    ];
    expect(context.level).toBe("warning");
    expect(message).toContain("creative_work_output_terminal");
    const options = { extra: context.extra };
    expect(options.extra).toMatchObject({
      workItemId: "work-1",
      outcome: "lease_lost",
    });
  });

  it("forwards structured-object error and captures its nested Error once", async () => {
    const nested = new Error("provider blew up");
    logger.error({
      event: "creative_work_output_terminal",
      workItemId: "work-2",
      outcome: "failed",
      error: nested,
    });
    await flushSentry();
    expect(sentryMocks.captureException).toHaveBeenCalledTimes(1);
    const [captured, nestedOptions] = sentryMocks.captureException.mock
      .calls[0] as [unknown, { extra: Record<string, unknown> }];
    // Sentry receives a redacted clone, not the caller's object.
    expect(captured).toBeInstanceOf(Error);
    expect(captured).not.toBe(nested);
    expect((captured as Error).message).toBe("provider blew up");
    expect(nestedOptions.extra).toMatchObject({ workItemId: "work-2" });
    expect(sentryMocks.captureMessage).not.toHaveBeenCalled();
  });

  it("captures a top-level Error without a duplicate message (no-duplicate rule)", async () => {
    const error = new Error("top-level boom");
    logger.error("operation failed for Bearer trace-385-raw", error);
    await flushSentry();
    expect(sentryMocks.captureException).toHaveBeenCalledTimes(1);
    expect(sentryMocks.captureMessage).not.toHaveBeenCalled();
    const options = sentryMocks.captureException.mock.calls[0][1] as {
      extra: Record<string, unknown>;
    };
    expect(options.extra.logMessage).toBe(
      "operation failed for Bearer [REDACTED]"
    );
  });

  it("attaches the namespace to console output and Sentry context", async () => {
    const namespaced = logger.child("trace-385-ns");
    namespaced.warn({ event: "trace_385_ns_event", attempt: 1 });
    await flushSentry();
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(String(console.warn.mock.calls[0]?.[0])).toContain("trace-385-ns");
    expect(sentryMocks.captureMessage).toHaveBeenCalledTimes(1);
    const options = sentryMocks.captureMessage.mock.calls[0][1] as {
      level: string;
      extra: Record<string, unknown>;
    };
    expect(options.extra).toMatchObject({ namespace: "trace-385-ns" });
  });

  it("respects LOG_LEVEL for console output and forwarding", async () => {
    vi.resetModules();
    vi.stubEnv("LOG_LEVEL", "error");
    vi.stubEnv("SENTRY_DSN", "https://example@o1.ingest.sentry.io/1");
    const fresh = await import("@/lib/logger");
    fresh.logger.warn({ event: "trace_385_suppressed" });
    await flushSentry();
    expect(console.warn).not.toHaveBeenCalled();
    expect(sentryMocks.captureMessage).not.toHaveBeenCalled();
    fresh.logger.error("trace-385-passes");
    await flushSentry();
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(sentryMocks.captureMessage).toHaveBeenCalledTimes(1);
  });

  it("deduplicates the same exception within one pass", async () => {
    const error = new Error("trace-385-same-object");
    logger.error("first sighting", error);
    logger.error("second sighting", { error });
    await flushSentry();
    expect(sentryMocks.captureException).toHaveBeenCalledTimes(1);
    expect(sentryMocks.captureMessage).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledTimes(2);
  });

  it("keeps distinct attempts distinct even with identical messages", async () => {
    logger.error("trace-385-attempt", new Error("same text"));
    logger.error("trace-385-attempt", new Error("same text"));
    await flushSentry();
    expect(sentryMocks.captureException).toHaveBeenCalledTimes(2);
  });

  it("never turns a capture-plus-log pair into two incidents", async () => {
    // Same module instance for both calls (an earlier test resets modules).
    const sameModule = await import("@/lib/logger");
    const error = new Error("trace-385-run-error");
    sameModule.captureExceptionOnce(error, { runId: "run-1", fn: "test-fn" });
    sameModule.logger.error("[inngest] run failed", {
      fn: "test-fn",
      runId: "run-1",
      error,
      finalAttempt: true,
    });
    await flushSentry();
    expect(sentryMocks.captureException).toHaveBeenCalledTimes(1);
    expect(sentryMocks.captureMessage).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("throttles repeated recoverable rate-limit warns but not distinct alerts", async () => {
    for (let i = 0; i < 5; i++) {
      logger.warn(`Rate limit trace-385-throttle hit for workspace ${"ws-stable"}`);
    }
    logger.warn("trace-385-distinct-alert");
    await flushSentry();
    expect(sentryMocks.captureMessage).toHaveBeenCalledTimes(4);
    expect(console.warn).toHaveBeenCalledTimes(6);
  });

  it("redacts secrets before they reach Sentry or the console", async () => {
    logger.warn({
      event: "trace_385_secret_probe",
      apiKey: "sk-live-should-not-leak",
      inputTokens: 7,
    });
    await flushSentry();
    expect(sentryMocks.captureMessage).toHaveBeenCalledTimes(1);
    const options = sentryMocks.captureMessage.mock.calls[0][1] as {
      level: string;
      extra: Record<string, unknown>;
    };
    expect(options.extra).toMatchObject({
      apiKey: "[REDACTED]",
      inputTokens: 7,
    });
    expect(JSON.stringify(console.warn.mock.calls)).not.toContain(
      "sk-live-should-not-leak"
    );
  });

  it("survives circular payloads and unserializable values without throwing", () => {
    const circular: Record<string, unknown> = { event: "trace_385_circular" };
    circular.self = circular;
    expect(() => logger.info(circular)).not.toThrow();
    expect(() => logger.warn({ event: "trace_385_bigint", value: 10n })).not.toThrow();
    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("propagates console sink failures so caller guards keep working", () => {
    // Existing contract (pinned by job-telemetry's sink-failure test): the
    // sink throwing reaches the caller's try/catch, which emits its fallback.
    vi.mocked(console.info).mockImplementationOnce(() => {
      throw new Error("console down");
    });
    expect(() => logger.info({ event: "trace_385_console_down" })).toThrow(
      "console down"
    );
  });

  it("degrades logger-internal failures to rate-limited emergency output", () => {
    const evil = Object.defineProperty({}, "boom", {
      enumerable: true,
      get() {
        throw new Error("getter exploded");
      },
    });
    expect(() => logger.info(evil)).not.toThrow();
    expect(console.info).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "[logger] internal failure; original payload dropped"
    );
  });

  it("never throws when the Sentry SDK fails", async () => {
    sentryMocks.captureException.mockImplementationOnce(() => {
      throw new Error("sdk down");
    });
    expect(() => logger.error(new Error("trace-385-sdk-down"))).not.toThrow();
    await flushSentry();
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("does not attach cross-context data between loggers", async () => {
    const childA = logger.child("trace-385-child-a");
    childA.warn({ event: "trace_385_ctx_a", secretA: "aaa", apiKey: "key-a" });
    logger.warn({ event: "trace_385_ctx_root" });
    await flushSentry();
    expect(sentryMocks.captureMessage).toHaveBeenCalledTimes(2);
    const second = sentryMocks.captureMessage.mock.calls[1][1] as {
      level: string;
      extra: Record<string, unknown>;
    };
    expect(second.extra).not.toHaveProperty("secretA");
    expect(second.extra).not.toHaveProperty("apiKey");
    expect(second.extra).not.toHaveProperty("namespace");
  });

  it("redacts secret-bearing headlines before they reach Sentry", async () => {
    logger.warn(
      "trace-385-headline Bearer abcDEF123456 api_key=sk-live-secret-1"
    );
    logger.warn(
      "https://cdn.example.com/a.png?workspaceId=ws-1&signature=sig-secret-2&token=tok-secret-3"
    );
    await flushSentry();
    expect(sentryMocks.captureMessage).toHaveBeenCalledTimes(2);
    const [mixed] = sentryMocks.captureMessage.mock.calls[0] as [string];
    expect(mixed).toContain("trace-385-headline");
    expect(mixed).toContain("Bearer [REDACTED]");
    expect(mixed).toContain("api_key=[REDACTED]");
    expect(mixed).not.toContain("abcDEF123456");
    expect(mixed).not.toContain("sk-live-secret-1");
    const [signed] = sentryMocks.captureMessage.mock.calls[1] as [string];
    expect(signed).toContain("workspaceId=ws-1");
    expect(signed).toContain("cdn.example.com/a.png");
    expect(signed).not.toContain("sig-secret-2");
    expect(signed).not.toContain("tok-secret-3");
  });

  it("captures a redacted Error clone while deduping by original identity", async () => {
    const cause = new Error("connect with password=hunter2-cause");
    const error = new Error("call failed with token=tok-secret-msg", { cause });
    logger.error("trace-385-first", error);
    logger.error("trace-385-second", { error });
    await flushSentry();
    // Same original object: still exactly one incident.
    expect(sentryMocks.captureException).toHaveBeenCalledTimes(1);
    expect(sentryMocks.captureMessage).not.toHaveBeenCalled();
    const [captured] = sentryMocks.captureException.mock.calls[0] as [
      Error,
    ];
    expect(captured).toBeInstanceOf(Error);
    expect(captured).not.toBe(error);
    expect(captured.message).not.toContain("tok-secret-msg");
    expect(captured.message).toContain("[REDACTED]");
    expect(String((captured.cause as Error)?.message ?? "")).not.toContain(
      "hunter2-cause"
    );
    // The caller's Error instance is untouched.
    expect(error.message).toBe("call failed with token=tok-secret-msg");
    expect((cause as Error).message).toBe("connect with password=hunter2-cause");
  });

  it("redacts secrets captured via captureExceptionOnce", async () => {
    const sameModule = await import("@/lib/logger");
    const error = new Error("run failed with api_key=sk-once-secret", {
      cause: new Error("inner secret=inner-secret-3"),
    });
    sameModule.captureExceptionOnce(error, { runId: "run-redact" });
    sameModule.captureExceptionOnce(error, { runId: "run-redact" });
    await flushSentry();
    expect(sentryMocks.captureException).toHaveBeenCalledTimes(1);
    const [captured, options] = sentryMocks.captureException.mock
      .calls[0] as [Error, { extra: Record<string, unknown> }];
    expect(captured).toBeInstanceOf(Error);
    expect(captured).not.toBe(error);
    expect(captured.message).not.toContain("sk-once-secret");
    expect(String((captured.cause as Error)?.message ?? "")).not.toContain(
      "inner-secret-3"
    );
    expect(options.extra).toMatchObject({ runId: "run-redact" });
    expect(error.message).toBe("run failed with api_key=sk-once-secret");
  });

  it("keeps warn+Error at warning severity without opening an error incident", async () => {
    logger.warn("trace-385-recoverable", new Error("provider timeout"));
    await flushSentry();
    expect(sentryMocks.captureException).toHaveBeenCalledTimes(1);
    expect(sentryMocks.captureMessage).not.toHaveBeenCalled();
    const [captured, options] = sentryMocks.captureException.mock
      .calls[0] as [unknown, { level?: string; extra: Record<string, unknown> }];
    expect(captured).toBeInstanceOf(Error);
    expect(options.level).toBe("warning");
    expect(options.extra.logMessage).toBe("trace-385-recoverable");
  });

  it("keeps error+Error capture shape unchanged (default error severity)", async () => {
    logger.error("trace-385-fatal", new Error("disk gone"));
    await flushSentry();
    expect(sentryMocks.captureException).toHaveBeenCalledTimes(1);
    const [, options] = sentryMocks.captureException.mock.calls[0] as [
      unknown,
      { level?: string; extra: Record<string, unknown> },
    ];
    expect(options).not.toHaveProperty("level");
    expect(options.extra.logMessage).toBe("trace-385-fatal");
  });

  it("keeps the [api-error] single-capture exemption", async () => {
    logger.error("[api-error]", {
      errorId: "err-1",
      context: "test",
      error: { message: "x" },
    });
    await flushSentry();
    expect(sentryMocks.captureException).not.toHaveBeenCalled();
    expect(sentryMocks.captureMessage).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});
