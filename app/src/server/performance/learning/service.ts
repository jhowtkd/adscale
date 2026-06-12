import { getCampaignById } from "../../repositories/campaign";
import { getClientProfile } from "../../repositories/client-reference";
import {
  listComparisonEvidenceInputsForClient,
  listLearningsByClientProfile,
  syncLearningsForClient,
} from "../../repositories/client-learning";
import {
  projectPerformanceLearnings,
} from "../../memory/performance-learning-projection";
import { searchPerformanceLearnings } from "../../memory/performance-learning-retrieval";
import { aggregateLearningsFromComparisons } from "./aggregate";

export class LearningDomainError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number
  ) {
    super(code);
    this.name = "LearningDomainError";
  }
}

export async function recomputeClientLearnings(input: {
  workspaceId: string;
  clientProfileId: string;
}) {
  const profile = await getClientProfile(input.workspaceId, input.clientProfileId);
  if (!profile) {
    throw new LearningDomainError("clientProfileNotFound", 404);
  }

  const evidenceInputs = await listComparisonEvidenceInputsForClient(
    input.clientProfileId,
    input.workspaceId
  );

  const drafts = aggregateLearningsFromComparisons(evidenceInputs);
  const { upserted, removed } = await syncLearningsForClient({
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    drafts,
  });

  await projectPerformanceLearnings([...upserted, ...removed]);

  return {
    upsertedCount: upserted.length,
    removedCount: removed.length,
    learnings: upserted,
  };
}

export async function recomputeLearningsForCampaign(input: {
  workspaceId: string;
  campaignId: string;
}) {
  const campaign = await getCampaignById(input.campaignId, input.workspaceId);
  if (!campaign) {
    throw new LearningDomainError("learningCampaignNotFound", 404);
  }
  if (!campaign.clientProfileId) {
    return { upsertedCount: 0, removedCount: 0, learnings: [] };
  }

  return recomputeClientLearnings({
    workspaceId: input.workspaceId,
    clientProfileId: campaign.clientProfileId,
  });
}

export async function listClientLearnings(input: {
  workspaceId: string;
  clientProfileId: string;
}) {
  const profile = await getClientProfile(input.workspaceId, input.clientProfileId);
  if (!profile) {
    throw new LearningDomainError("clientProfileNotFound", 404);
  }

  return listLearningsByClientProfile(input.clientProfileId, input.workspaceId);
}

export async function searchClientLearnings(input: {
  workspaceId: string;
  clientProfileId: string;
  query?: string;
  campaignObjective?: string | null;
  platform?: string | null;
  limit?: number;
}) {
  const profile = await getClientProfile(input.workspaceId, input.clientProfileId);
  if (!profile) {
    throw new LearningDomainError("clientProfileNotFound", 404);
  }

  return searchPerformanceLearnings(input);
}

export async function listCampaignLearnings(input: {
  workspaceId: string;
  campaignId: string;
  query?: string;
  platform?: string | null;
}) {
  const campaign = await getCampaignById(input.campaignId, input.workspaceId);
  if (!campaign) {
    throw new LearningDomainError("learningCampaignNotFound", 404);
  }
  if (!campaign.clientProfileId) {
    return { source: "postgres" as const, learnings: [], clientProfileId: null };
  }

  const result = await searchPerformanceLearnings({
    workspaceId: input.workspaceId,
    clientProfileId: campaign.clientProfileId,
    query: input.query,
    campaignObjective: campaign.objective,
    platform: input.platform,
  });

  return {
    ...result,
    clientProfileId: campaign.clientProfileId,
  };
}
