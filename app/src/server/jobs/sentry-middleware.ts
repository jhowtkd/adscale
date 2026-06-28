import { Middleware } from "inngest";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";

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
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(arg.error, {
        tags: { component: "inngest", fn, final_attempt: arg.isFinalAttempt },
        extra: { runId: arg.ctx.runId, attempt: arg.ctx.attempt },
      });
    }
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
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(arg.error, {
        tags: {
          component: "inngest-step",
          fn,
          step: arg.stepInfo.options?.id ?? "unnamed",
        },
      });
    }
  }
}