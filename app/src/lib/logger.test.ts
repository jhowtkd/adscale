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
    expect(sentryMocks.captureException).toHaveBeenCalledWith(
      nested,
      expect.objectContaining({
        extra: expect.objectContaining({ workItemId: "work-2" }),
      })
    );
    expect(sentryMocks.captureMessage).not.toHaveBeenCalled();
  });

  it("captures a top-level Error without a duplicate message (no-duplicate rule)", async () => {
    const error = new Error("top-level boom");
    logger.error("operation failed", error);
    await flushSentry();
    expect(sentryMocks.captureException).toHaveBeenCalledTimes(1);
    expect(sentryMocks.captureMessage).not.toHaveBeenCalled();
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

  it("never throws when the console itself fails", () => {
    vi.mocked(console.info).mockImplementationOnce(() => {
      throw new Error("console down");
    });
    expect(() => logger.info({ event: "trace_385_console_down" })).not.toThrow();
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
