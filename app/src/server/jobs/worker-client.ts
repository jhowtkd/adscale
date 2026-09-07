import { Inngest } from "inngest";
import { env } from "../validation/env";
import { inngestLocalDispatchOptions } from "./inngest-runtime";
import { SentryMiddleware } from "./sentry-middleware";

/**
 * Dedicated Inngest app for the image background worker.
 * Must not share the web app id so Connect and HTTP serve stay isolated.
 */
if (process.env.NODE_ENV === "production" && process.env.INNGEST_DEV) {
  throw new Error(
    "INNGEST_DEV must not be set in production — it disables Inngest signature verification."
  );
}

export const imageWorkerInngest = new Inngest({
  id: "adscale-image-worker",
  eventKey: env.INNGEST_EVENT_KEY,
  ...inngestLocalDispatchOptions(),
  middleware: [SentryMiddleware],
});
