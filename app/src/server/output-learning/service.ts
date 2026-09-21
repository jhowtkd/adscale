import { getCampaignById } from "../repositories/campaign";
import { getClientProfile } from "../repositories/client-reference";
import {
  listOutputLearningsByClientProfile,
  syncOutputLearningsForClient,
} from "../repositories/client-output-learning";
import { listOutputDecisionEventsForClient } from "../repositories/output-decision-event";
import { projectOutputLearnings } from "../memory/output-learning-projection";
import { aggregateOutputLearningsFromEvents } from "./aggregate";

export class OutputLearningDomainError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number
  ) {
    super(code);
    this.name = "OutputLearningDomainError";
  }
}

type RecomputeInput = { workspaceId: string; clientProfileId: string };
type RecomputeResult = Awaited<ReturnType<typeof runClientOutputLearningRecompute>>;

const inFlightRecomputes = new Map<string, Promise<RecomputeResult>>();
const queuedRecomputes = new Map<string, Promise<RecomputeResult>>();

function recomputeKey(input: RecomputeInput) {
  return `${input.workspaceId}::${input.clientProfileId}`;
}

/**
 * Coalesces per-client recomputes: at most one full pass runs at a time per
 * client, and any calls arriving while a pass is in flight share a single
 * follow-up pass. Every caller resolves with a pass that started after its
 * call, so the returned learnings always reflect the caller's event.
 */
export function recomputeClientOutputLearnings(
  input: RecomputeInput
): Promise<RecomputeResult> {
  const key = recomputeKey(input);
  const running = inFlightRecomputes.get(key);

  if (!running) {
    const current = runClientOutputLearningRecompute(input).finally(() => {
      if (inFlightRecomputes.get(key) === current) {
        inFlightRecomputes.delete(key);
      }
    });
    inFlightRecomputes.set(key, current);
    return current;
  }

  const queued = queuedRecomputes.get(key);
  if (queued) return queued;

  const next = running
    .catch(() => undefined)
    .then(() => {
      queuedRecomputes.delete(key);
      return recomputeClientOutputLearnings(input);
    });
  queuedRecomputes.set(key, next);
  return next;
}

async function runClientOutputLearningRecompute(input: RecomputeInput) {
  const profile = await getClientProfile(input.workspaceId, input.clientProfileId);
  if (!profile) {
    throw new OutputLearningDomainError("clientProfileNotFound", 404);
  }

  const events = await listOutputDecisionEventsForClient(
    input.clientProfileId,
    input.workspaceId
  );

  const drafts = aggregateOutputLearningsFromEvents(events);
  const { upserted, removed } = await syncOutputLearningsForClient({
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    drafts,
  });

  await projectOutputLearnings([...upserted, ...removed]);

  return {
    upsertedCount: upserted.length,
    removedCount: removed.length,
    learnings: upserted,
  };
}

export async function recomputeOutputLearningsForCampaign(input: {
  workspaceId: string;
  campaignId: string;
}) {
  const campaign = await getCampaignById(input.campaignId, input.workspaceId);
  if (!campaign) {
    throw new OutputLearningDomainError("outputLearningCampaignNotFound", 404);
  }
  if (!campaign.clientProfileId) {
    return { upsertedCount: 0, removedCount: 0, learnings: [] };
  }

  return recomputeClientOutputLearnings({
    workspaceId: input.workspaceId,
    clientProfileId: campaign.clientProfileId,
  });
}

export async function listClientOutputLearnings(input: {
  workspaceId: string;
  clientProfileId: string;
}) {
  const profile = await getClientProfile(input.workspaceId, input.clientProfileId);
  if (!profile) {
    throw new OutputLearningDomainError("clientProfileNotFound", 404);
  }

  return listOutputLearningsByClientProfile(
    input.clientProfileId,
    input.workspaceId
  );
}
