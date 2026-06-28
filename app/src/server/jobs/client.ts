import { Inngest } from "inngest";
import { env } from "../validation/env";
import { SentryMiddleware } from "./sentry-middleware";

export const inngest = new Inngest({
  id: "adscale",
  eventKey: env.INNGEST_EVENT_KEY,
  middleware: [SentryMiddleware],
});