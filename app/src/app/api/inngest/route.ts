import { serve } from "inngest/next";
import { inngest } from "@/server/jobs/client";
import { derivationJob } from "@/server/jobs/derivation";
import { trialNotificationJob } from "@/server/jobs/trial-notifications";
import { workspaceAssetAnalyzeJob } from "@/server/jobs/workspace-asset";
import { brandMemoryIngestJob } from "@/server/jobs/brand-memory";
import { learningProposalAggregatorJob } from "@/server/jobs/learning-proposal-aggregator";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    derivationJob,
    trialNotificationJob,
    workspaceAssetAnalyzeJob,
    brandMemoryIngestJob,
    learningProposalAggregatorJob,
  ],
});
