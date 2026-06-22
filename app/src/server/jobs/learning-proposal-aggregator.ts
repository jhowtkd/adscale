import { inngest } from "./client";
import { logger } from "@/lib/logger";
import { detectAndPersistCrossClientGlobalProposals } from "@/server/human-quality/learning/cross-client";
import { generateAndPersistClientLearningProposals } from "@/server/human-quality/learning/generate";

export const learningProposalAggregatorJob = inngest.createFunction(
  { id: "learning-proposal-aggregator", triggers: [{ cron: "0 6 * * *" }] },
  async ({ step }) => {
    const clientResult = await step.run("generate-client-proposals", async () => {
      const result = await generateAndPersistClientLearningProposals();
      return { generated: result.generated };
    });

    const globalProposals = await step.run("detect-cross-client-proposals", async () =>
      detectAndPersistCrossClientGlobalProposals()
    );

    logger.info(
      `[learningProposalAggregatorJob] generated ${clientResult.generated} client proposals, ${globalProposals.length} global proposals`
    );

    return {
      generated: clientResult.generated,
      globalProposals: globalProposals.length,
    };
  }
);
