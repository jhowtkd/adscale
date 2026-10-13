import { z } from "zod";
import { db } from "@/server/db";
import { inngest } from "@/server/jobs/client";
import type { LocalLearningAuthorizationPort } from "@/server/brand-taste/local-learning-authorization";
import type { EquipeUnitOfWork } from "../data";
import { createPostgresEquipeUnitOfWork } from "../data/postgres";
import { ADJUSTMENT_EVIDENCE_TASK_EVENT, consumeAdjustmentEvidence } from "../module/adjustment-evidence";
import { consumeRejectionClassificationEvidence } from "../module/rejection-classification-evidence";
import { ROUND_REJECTION_CLASSIFIED_EVENT } from "../module/calibration-shared";
import type { JobStep } from "./shared";

const uuid = z.string().uuid();
const eventSchema = z.object({ workspaceId: uuid, accountId: uuid, sourceEventId: uuid, taskIntentId: uuid });

export function createAdjustmentEvidenceHandler(deps: { uow: EquipeUnitOfWork; authorize?: LocalLearningAuthorizationPort }) {
  return async ({ event, step }: { event: { data: unknown }; step: JobStep }) => {
    const { workspaceId, accountId, sourceEventId, taskIntentId } = eventSchema.parse(event.data);
    const scope = { workspaceId, accountId };
    return step.run("consume-adjustment-evidence", async () => {
      const intent = await deps.uow.repos.taskOutbox.get(scope, taskIntentId);
      if (!intent || intent.eventName !== ADJUSTMENT_EVIDENCE_TASK_EVENT || intent.data.sourceEventId !== sourceEventId) {
        return { recorded: false, evidenceId: null };
      }
      const source = await deps.uow.repos.events.get(scope, sourceEventId);
      const evidence = source?.eventType === ROUND_REJECTION_CLASSIFIED_EVENT
        ? await consumeRejectionClassificationEvidence(deps, scope, sourceEventId)
        : await consumeAdjustmentEvidence(deps, scope, sourceEventId);
      return { recorded: Boolean(evidence), evidenceId: evidence?.id ?? null };
    });
  };
}

export const equipeAdjustmentEvidenceJob = inngest.createFunction({
  id: "equipe-adjustment-evidence", triggers: [{ event: ADJUSTMENT_EVIDENCE_TASK_EVENT }],
  concurrency: [{ limit: 1, key: "event.data.accountId" }],
}, createAdjustmentEvidenceHandler({ uow: createPostgresEquipeUnitOfWork(db) }));
