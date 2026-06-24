import { inngest } from "./client";
import { logger } from "@/lib/logger";
import { detectAndPersistCrossClientGlobalProposals } from "@/server/human-quality/learning/cross-client";
import { listFactualIssueAlerts } from "@/server/human-quality/learning/factual-alerts";
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

    const factualAlerts = await step.run("detect-factual-issue-alerts", async () => {
      const alerts = await listFactualIssueAlerts();
      logger.debug(
        `[learningProposalAggregatorJob] detected ${alerts.length} factual_issue alert slices`
      );
      return alerts.length;
    });

    logger.info(
      `[learningProposalAggregatorJob] generated ${clientResult.generated} client proposals, ${globalProposals.length} global proposals, ${factualAlerts} factual alerts`
    );

    return {
      generated: clientResult.generated,
      globalProposals: globalProposals.length,
      factualAlerts,
    };
  }
);
