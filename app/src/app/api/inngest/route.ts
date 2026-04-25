import { serve } from "inngest/next";
import { inngest } from "@/server/jobs/client";
import { derivationJob } from "@/server/jobs/derivation";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [derivationJob],
});
