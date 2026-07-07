import { serve } from "inngest/next";
import { inngest } from "@/server/jobs/client";
import { derivationJob } from "@/server/jobs/derivation";
import { trialNotificationJob } from "@/server/jobs/trial-notifications";
import { workspaceAssetAnalyzeJob } from "@/server/jobs/workspace-asset";
import { brandMemoryIngestJob } from "@/server/jobs/brand-memory";
import { learningProposalAggregatorJob } from "@/server/jobs/learning-proposal-aggregator";
import { brandTrainingAnalyzeJob } from "@/server/jobs/brand-training";

/**
 * Security: refuse to run in "dev" mode (which disables signature
 * verification) when in production. If INNGEST_DEV is set and NODE_ENV is
 * production, the Inngest SDK would silently skip signature checks on every
 * incoming event — letting anyone POST fake jobs. Explicitly passing
 * signingKey forces verification regardless of mode.
 */
if (process.env.NODE_ENV === "production" && process.env.INNGEST_DEV) {
  throw new Error(
    "INNGEST_DEV must not be set in production — it disables Inngest signature verification."
  );
}

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    derivationJob,
    trialNotificationJob,
    workspaceAssetAnalyzeJob,
    brandMemoryIngestJob,
    learningProposalAggregatorJob,
    brandTrainingAnalyzeJob,
  ],
});
