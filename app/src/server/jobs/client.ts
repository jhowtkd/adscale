import { Inngest } from "inngest";
import { env } from "../validation/env";

export const inngest = new Inngest({
  id: "adscale",
  eventKey: env.INNGEST_EVENT_KEY,
});
