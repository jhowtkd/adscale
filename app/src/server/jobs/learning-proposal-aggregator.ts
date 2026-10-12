import { inngest } from "./client";
import { logger } from "@/lib/logger";
import { detectAndPersistCrossClientGlobalProposals } from "@/server/human-quality/learning/cross-client";
import { listFactualIssueAlerts } from "@/server/human-quality/learning/factual-alerts";
import { generateAndPersistClientLearningProposals } from "@/server/human-quality/learning/generate";
import { listCalibrationSignalsForClientProfile } from "@/server/repositories/calibration-signal";
import { extractRuleCandidatesFromSignals } from "@/server/brand-taste/rule-extraction";
import {
  requireLocalLearningAuthorization,
  type LocalLearningAuthorizationPort,
} from "@/server/brand-taste/local-learning-authorization";
import { generateAllLocalBrandTasteProposals } from "./local-brand-taste-proposals";

// The local taste stage is separate from the legacy corpus cron; scheduling belongs to B2a.
export async function extractLocalBrandTasteProposals(
  scope: { workspaceId: string; clientProfileId: string },
  authorize?: LocalLearningAuthorizationPort
) {
  await requireLocalLearningAuthorization(scope, authorize);
  const signals = await listCalibrationSignalsForClientProfile(scope);
  return extractRuleCandidatesFromSignals({ clientProfileId: scope.clientProfileId, signals });
}

export const learningProposalAggregatorJob = inngest.createFunction(
  {
    id: "learning-proposal-aggregator",
    triggers: [{ cron: "0 6 * * *" }],
    retries: 3,
    onFailure: async ({ error }) => {
      logger.error("[learningProposalAggregatorJob] failed after retries", { error });
    },
  },
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

    const localTaste = await step.run("extract-local-brand-taste", async () =>
      generateAllLocalBrandTasteProposals()
    );

    logger.info(
      `[learningProposalAggregatorJob] generated ${clientResult.generated} client proposals, ${globalProposals.length} global proposals, ${factualAlerts} factual alerts, ${localTaste.created} local taste candidates (${localTaste.denied} brands denied)`
    );

    return {
      generated: clientResult.generated,
      globalProposals: globalProposals.length,
      factualAlerts,
      localTaste,
    };
  }
);
