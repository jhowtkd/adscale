import { z } from "zod";
import { db } from "@/server/db";
import { inngest } from "@/server/jobs/client";
import type { LocalLearningAuthorizationPort } from "@/server/brand-taste/local-learning-authorization";
import type { EquipeUnitOfWork } from "../data";
import { createPostgresEquipeUnitOfWork } from "../data/postgres";
import { IDEA_REJECTION_EVIDENCE_TASK_EVENT, consumeIdeaRejectionEvidence } from "../module/idea-evidence";
import type { JobStep } from "./shared";

const uuid = z.string().uuid();
const eventSchema = z.object({ workspaceId: uuid, accountId: uuid, sourceEventId: uuid, taskIntentId: uuid });

export function createIdeaRejectionEvidenceHandler(deps: { uow: EquipeUnitOfWork; authorize?: LocalLearningAuthorizationPort }) {
  return async ({ event, step }: { event: { data: unknown }; step: JobStep }) => {
    const { workspaceId, accountId, sourceEventId, taskIntentId } = eventSchema.parse(event.data);
    const scope = { workspaceId, accountId };
    return step.run("consume-idea-rejection-evidence", async () => {
      const intent = await deps.uow.repos.taskOutbox.get(scope, taskIntentId);
      if (!intent || intent.eventName !== IDEA_REJECTION_EVIDENCE_TASK_EVENT || intent.data.sourceEventId !== sourceEventId) {
        return { recorded: false, evidenceId: null };
      }
      const evidence = await consumeIdeaRejectionEvidence(deps, scope, sourceEventId);
      return { recorded: Boolean(evidence), evidenceId: evidence?.id ?? null };
    });
  };
}

export const equipeIdeaRejectionEvidenceJob = inngest.createFunction({
  id: "equipe-idea-rejection-evidence", triggers: [{ event: IDEA_REJECTION_EVIDENCE_TASK_EVENT }],
  concurrency: [{ limit: 1, key: "event.data.accountId" }],
}, createIdeaRejectionEvidenceHandler({ uow: createPostgresEquipeUnitOfWork(db) }));
