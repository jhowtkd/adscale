import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Middleware } from "inngest";

const sentryMocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => sentryMocks);

import { observeImageCall } from "@/server/ai/image-call-observation";
import { LEGACY_IMAGE_POLICY } from "@/server/ai/image-render-policy";
import { SentryMiddleware } from "./sentry-middleware";

const flushSentry = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 25));

function runErrorArgs(error: unknown) {
  return {
    fn: { name: "trace-385-fn" },
    error,
    ctx: { runId: "run-trace-385", attempt: 0 },
    isFinalAttempt: true,
  } as unknown as Middleware.OnRunErrorArgs;
}

describe("capture property: AI wrapper observes, boundary logs (trace-385)", () => {
  beforeEach(() => {
    vi.stubEnv("SENTRY_DSN", "https://example@o1.ingest.sentry.io/1");
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    sentryMocks.captureException.mockClear();
    sentryMocks.captureMessage.mockClear();
  });

  it("the image-call observer never captures an incident on provider failure", async () => {
    const error = new Error("provider timeout");
    const call = vi.fn().mockRejectedValue(error);
    await expect(
      observeImageCall(
        LEGACY_IMAGE_POLICY,
        { key: "output-trace-385", operation: "generate", size: "1088x1088" },
        call
      )
    ).rejects.toBe(error);
    await flushSentry();
    expect(call).toHaveBeenCalledOnce();
    expect(console.info).toHaveBeenCalled();
    expect(sentryMocks.captureException).not.toHaveBeenCalled();
    expect(sentryMocks.captureMessage).not.toHaveBeenCalled();
  });

  it("the middleware boundary logs a run error as exactly one incident", async () => {
    // Inngest instantiates middleware with client context; onRunError uses no
    // instance state, so invoke it on the prototype directly.
    const middleware = Object.create(
      SentryMiddleware.prototype
    ) as SentryMiddleware;
    middleware.onRunError(runErrorArgs(new Error("trace-385-run-boom")));
    await flushSentry();
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(sentryMocks.captureException).toHaveBeenCalledTimes(1);
    expect(sentryMocks.captureMessage).not.toHaveBeenCalled();
  });

  it("generation behavior is unchanged when the logger is degraded", async () => {
    vi.mocked(console.info).mockImplementation(() => {
      throw new Error("console down");
    });
    const response = { data: [], usage: { output_tokens: 1 }, _request_id: "req-1" };
    const ok = vi.fn().mockResolvedValue(response);
    await expect(
      observeImageCall(
        LEGACY_IMAGE_POLICY,
        { key: "output-trace-385-ok", operation: "generate", size: "1088x1088" },
        ok
      )
    ).resolves.toMatchObject({ response });
    const failure = new Error("trace-385-still-throws");
    const bad = vi.fn().mockRejectedValue(failure);
    await expect(
      observeImageCall(
        LEGACY_IMAGE_POLICY,
        { key: "output-trace-385-bad", operation: "generate", size: "1088x1088" },
        bad
      )
    ).rejects.toBe(failure);
    expect(ok).toHaveBeenCalledOnce();
    expect(bad).toHaveBeenCalledOnce();
  });
});
