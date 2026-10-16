import { expect, it, vi } from "vitest";

const { serve, ideaRejectionJob, semanticReviewJob } = vi.hoisted(() => ({
  serve: vi.fn(() => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() })),
  ideaRejectionJob: { id: "equipe-idea-rejection-evidence" },
  semanticReviewJob: { id: "semantic-review-observer" },
}));
vi.mock("inngest/next", () => ({ serve }));
vi.mock("@/server/jobs/client", () => ({ inngest: {} }));
vi.mock("@/server/equipe/jobs/idea-evidence", () => ({ equipeIdeaRejectionEvidenceJob: ideaRejectionJob }));
vi.mock("@/server/equipe/jobs/handoff-read", () => ({ equipeHandoffInstagramCostJob: {}, equipeHandoffReadJob: {} }));
vi.mock("@/server/equipe/jobs/diagnosis", () => ({ equipeDiagnosisJob: {} }));
vi.mock("@/server/equipe/agents/agent-work", () => ({ equipeAgentWorkJob: {} }));
vi.mock("@/server/equipe/jobs/agent-work-outbox", () => ({ equipeAgentWorkOutboxJob: {} }));
vi.mock("@/server/equipe/jobs/adjustment-evidence", () => ({ equipeAdjustmentEvidenceJob: {} }));
vi.mock("@/server/equipe/jobs/dispatch", () => ({ equipeDispatchJob: {} }));
vi.mock("@/server/equipe/jobs/reconcile", () => ({ equipeReconcileJob: {} }));
vi.mock("@/server/equipe/jobs/reminders", () => ({ equipeRemindersJob: {} }));
vi.mock("@/server/equipe/jobs/deadlines", () => ({ equipeDeadlinesJob: {} }));
vi.mock("@/server/equipe/jobs/monitor", () => ({ equipeMonitorJob: {} }));
vi.mock("@/server/equipe/jobs/signals", () => ({ equipeSignalsJob: {} }));
vi.mock("@/server/equipe/jobs/notifications", () => ({ equipeNotificationsJob: {} }));
vi.mock("@/server/jobs/derivation", () => ({ derivationJob: {} }));
vi.mock("@/server/jobs/trial-notifications", () => ({ trialNotificationJob: {} }));
vi.mock("@/server/jobs/workspace-asset", () => ({ workspaceAssetAnalyzeJob: {} }));
vi.mock("@/server/jobs/brand-memory", () => ({ brandMemoryIngestJob: {} }));
vi.mock("@/server/jobs/learning-proposal-aggregator", () => ({ learningProposalAggregatorJob: {} }));
vi.mock("@/server/jobs/brand-training", () => ({ brandTrainingAnalyzeJob: {} }));
vi.mock("@/server/jobs/creative-work", () => ({ creativeWorkOutputJob: {} }));
vi.mock("@/server/jobs/creative-work-carousel", () => ({ creativeWorkCarouselSlideJob: {} }));
vi.mock("@/server/jobs/creative-work-source", () => ({ creativeWorkSourceAnalyzeJob: {} }));
vi.mock("@/server/jobs/creative-work-layerization", () => ({ creativeWorkLayerizationJob: {} }));
vi.mock("@/server/jobs/creative-work-layer-regeneration", () => ({ creativeWorkLayerRegenerationJob: {} }));
vi.mock("@/server/jobs/meta-ads-sync", () => ({ metaAdsSyncJob: {} }));
vi.mock("@/server/jobs/selection-effects-processor", () => ({ selectionEffectsProcessorJob: {} }));
vi.mock("@/server/jobs/semantic-review", () => ({ semanticReviewObserverJob: semanticReviewJob }));

it("registers the content idea rejection consumer with the served Inngest endpoint", async () => {
  await import("./route");
  expect(serve).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    functions: expect.arrayContaining([ideaRejectionJob]),
  }));
});

it("serves the Jev semantic review observer exactly once on the existing Inngest endpoint", async () => {
  await import("./route");
  const [options] = serve.mock.calls.at(-1) as unknown as [{ functions: unknown[] }];
  expect(options.functions.filter((fn) => fn === semanticReviewJob)).toHaveLength(1);
});
