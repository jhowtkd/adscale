import { Middleware } from "inngest";
import { captureExceptionOnce, logger } from "@/lib/logger";

function fnName(fn: Middleware.OnRunErrorArgs["fn"]): string {
  try {
    return fn.name ?? fn.id() ?? "unknown";
  } catch {
    return "unknown";
  }
}

export class SentryMiddleware extends Middleware.BaseMiddleware {
  readonly id = "adscale-sentry";

  onRunError(arg: Middleware.OnRunErrorArgs): void {
    const fn = fnName(arg.fn);
    // Single capture (trace-385): the explicit capture marks the exception so
    // the logger.error below stays console-only instead of opening a second
    // incident for the same run error. Tags preserved for Sentry grouping.
    captureExceptionOnce(
      arg.error,
      { runId: arg.ctx.runId, attempt: arg.ctx.attempt },
      { component: "inngest", fn, final_attempt: arg.isFinalAttempt }
    );
    logger.error("[inngest] run failed", {
      fn,
      runId: arg.ctx.runId,
      error: arg.error,
      finalAttempt: arg.isFinalAttempt,
    });
  }

  onStepError(arg: Middleware.OnStepErrorArgs): void {
    if (!arg.isFinalAttempt) return;
    const fn = fnName(arg.fn);
    captureExceptionOnce(
      arg.error,
      undefined,
      {
        component: "inngest-step",
        fn,
        step: arg.stepInfo.options?.id ?? "unnamed",
      }
    );
  }
}
