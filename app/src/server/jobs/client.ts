import { Inngest } from "inngest";
import { env } from "../validation/env";
import { inngestLocalDispatchOptions } from "./inngest-runtime";
import { SentryMiddleware } from "./sentry-middleware";

/**
 * Security: the Inngest SDK auto-enables dev mode (disabling signature
 * verification on the server handler) whenever INNGEST_DEV is set. Refuse to
 * construct the client if that flag leaked into a production deploy.
 */
if (process.env.NODE_ENV === "production" && process.env.INNGEST_DEV) {
  throw new Error(
    "INNGEST_DEV must not be set in production — it disables Inngest signature verification."
  );
}

export const inngest = new Inngest({
  id: "adscale",
  eventKey: env.INNGEST_EVENT_KEY,
  ...inngestLocalDispatchOptions(),
  middleware: [SentryMiddleware],
});