import { equipeHandoffReadJob } from "@/server/equipe/jobs/handoff-read";
import { equipeDiagnosisJob } from "@/server/equipe/jobs/diagnosis";
import { serve } from "inngest/next";
import { inngest } from "@/server/jobs/client";
import { equipeAgentWorkJob } from "@/server/equipe/agents/agent-work";
import { equipeAgentWorkOutboxJob } from "@/server/equipe/jobs/agent-work-outbox";
import { equipeDispatchJob } from "@/server/equipe/jobs/dispatch";
import { equipeReconcileJob } from "@/server/equipe/jobs/reconcile";
import { equipeRemindersJob } from "@/server/equipe/jobs/reminders";
import { equipeDeadlinesJob } from "@/server/equipe/jobs/deadlines";
import { equipeMonitorJob } from "@/server/equipe/jobs/monitor";
import { equipeSignalsJob } from "@/server/equipe/jobs/signals";
import { equipeNotificationsJob } from "@/server/equipe/jobs/notifications";
import { derivationJob } from "@/server/jobs/derivation";
import { trialNotificationJob } from "@/server/jobs/trial-notifications";
import { workspaceAssetAnalyzeJob } from "@/server/jobs/workspace-asset";
import { brandMemoryIngestJob } from "@/server/jobs/brand-memory";
import { learningProposalAggregatorJob } from "@/server/jobs/learning-proposal-aggregator";
import { brandTrainingAnalyzeJob } from "@/server/jobs/brand-training";
import { creativeWorkOutputJob } from "@/server/jobs/creative-work";
import { creativeWorkCarouselSlideJob } from "@/server/jobs/creative-work-carousel";
import { creativeWorkSourceAnalyzeJob } from "@/server/jobs/creative-work-source";
import { creativeWorkLayerizationJob } from "@/server/jobs/creative-work-layerization";
import { creativeWorkLayerRegenerationJob } from "@/server/jobs/creative-work-layer-regeneration";
import { metaAdsSyncJob } from "@/server/jobs/meta-ads-sync";
import { selectionEffectsProcessorJob } from "@/server/jobs/selection-effects-processor";

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
    creativeWorkOutputJob,
    creativeWorkCarouselSlideJob,
    creativeWorkSourceAnalyzeJob,
    creativeWorkLayerizationJob,
    creativeWorkLayerRegenerationJob,
    metaAdsSyncJob,
    selectionEffectsProcessorJob,
    equipeAgentWorkJob,
    equipeAgentWorkOutboxJob,
    equipeHandoffReadJob,
    equipeDiagnosisJob,
    equipeDispatchJob,
    equipeReconcileJob,
    equipeRemindersJob,
    equipeDeadlinesJob,
    equipeMonitorJob,
    equipeSignalsJob,
    equipeNotificationsJob,
  ],
});
