import { z } from "zod";
import { requireLocalLearningAuthorization, type LocalLearningAuthorizationPort } from "@/server/brand-taste/local-learning-authorization";
import { sanitizeCalibrationNote } from "@/server/output-learning/output-decision-events";
import type { AccountScope, EquipeUnitOfWork } from "../data";
import { ROUND_REJECTION_CLASSIFIED_EVENT } from "./calibration-shared";
import { requestAdjustmentPayloadSchema } from "./envelope";
import { AGENT_WORK_REQUESTED_EVENT } from "./item-shared";
import { recomputeClientOutputLearnings } from "@/server/output-learning/service";
import {
  REJECTION_CLASSIFICATION_EVIDENCE_EVENT,
  REJECTION_FACTUAL_ALERT_EVENT,
  classificationEvidenceSchema as evidenceSchema,
  classificationSourceSchema as sourceSchema,
  currentClassificationIds,
  isFactuallyClassifiedAdjustment,
  isQualityActor,
  readRejectionClassificationEvidence,
} from "./rejection-classification-read";

export {
  REJECTION_CLASSIFICATION_EVIDENCE_EVENT,
  REJECTION_FACTUAL_ALERT_EVENT,
  isFactuallyClassifiedAdjustment,
  readRejectionClassificationEvidence,
} from "./rejection-classification-read";

type Deps = { uow: EquipeUnitOfWork; authorize?: LocalLearningAuthorizationPort };
export const adjustmentRequestRefSchema = z.object({
  kind: z.literal("adjustment"), adjustmentEventId: z.string().uuid(),
  category: requestAdjustmentPayloadSchema.shape.category, versionHash: z.string().min(1).max(120),
});

/** Classification is evidence by typed event, without inventing a Peça verdict or a taste rule. */
export async function consumeRejectionClassificationEvidence(deps: Deps, scope: AccountScope, sourceEventId: string) {
  const evidence = await deps.uow.run(async repos => {
    const source = await repos.events.get(scope, sourceEventId);
    if (!source || source.eventType !== ROUND_REJECTION_CLASSIFIED_EVENT || source.objectType !== "round" || !source.objectId || !isQualityActor(source)) return null;
    const parsed = sourceSchema.safeParse(source.payload);
    if (!parsed.success) return null;
    const account = await repos.accounts.get(scope.workspaceId, scope.accountId);
    if (!account) return null;
    await requireLocalLearningAuthorization({ workspaceId: scope.workspaceId, clientProfileId: account.clientProfileId }, deps.authorize);
    const item = await repos.items.get(scope, parsed.data.itemId, { forUpdate: true });
    const round = await repos.calibrationRounds.get(scope, source.objectId);
    if (!item || !round || item.frontId !== round.frontId) return null;
    if (parsed.data.adjustmentSourceEventId) {
      const request = await repos.events.get(scope, parsed.data.adjustmentSourceEventId);
      const ref = adjustmentRequestRefSchema.safeParse(request?.payload);
      if (!request || request.eventType !== AGENT_WORK_REQUESTED_EVENT || request.objectType !== "item" || request.objectId !== item.id ||
          !ref.success || ref.data.versionHash !== parsed.data.versionHash ||
          !await repos.itemVersions.getByHash(scope, item.id, ref.data.versionHash)) return null;
    }
    const eventType = parsed.data.to === "fact" ? REJECTION_FACTUAL_ALERT_EVENT : REJECTION_CLASSIFICATION_EVIDENCE_EVENT;
    const [existing] = await repos.events.list(scope, { eventType, objectType: "learning_evidence", objectId: source.id });
    if (existing) return existing;
    const evidence = sanitizeCalibrationNote(parsed.data.evidence);
    return repos.events.create(scope, {
      eventType, objectType: "learning_evidence", objectId: source.id,
      actorType: source.actorType, actorId: source.actorId, actorRole: source.actorRole, occurredAt: source.occurredAt,
      payload: { sourceEventId: source.id, clientProfileId: account.clientProfileId, itemId: item.id, roundId: round.id,
        from: parsed.data.from, category: parsed.data.to, evidence, loosened: parsed.data.loosened,
        evidenceSanitized: evidence !== parsed.data.evidence,
        adjustmentSourceEventId: parsed.data.adjustmentSourceEventId ?? null, versionHash: parsed.data.versionHash ?? null,
        classificationSequence: parsed.data.classificationSequence ?? null } satisfies z.infer<typeof evidenceSchema>,
    });
  });
  // Recompute after commit; a failed recompute must retry even when the evidence already exists.
  const parsed = evidenceSchema.safeParse(evidence?.payload);
  if (parsed.success && parsed.data.adjustmentSourceEventId) {
    await recomputeClientOutputLearnings({ workspaceId: scope.workspaceId, clientProfileId: parsed.data.clientProfileId });
  }
  return evidence;
}

export async function listRejectionClassificationEvidenceForBrand(deps: Deps, scope: { workspaceId: string; clientProfileId: string }) {
  await requireLocalLearningAuthorization(scope, deps.authorize);
  const accounts = (await deps.uow.repos.accounts.list(scope.workspaceId)).filter(account => account.clientProfileId === scope.clientProfileId);
  const evidence = [];
  for (const account of accounts) {
    const accountScope = { workspaceId: scope.workspaceId, accountId: account.id };
    const events = await deps.uow.repos.events.list(accountScope, { eventType: REJECTION_CLASSIFICATION_EVIDENCE_EVENT });
    const classifications = await deps.uow.repos.events.list(accountScope, { eventType: ROUND_REJECTION_CLASSIFIED_EVENT });
    // Only the classification still in force for its round and Item is evidence; a superseded one is history.
    const current = currentClassificationIds(classifications);
    for (const event of events) {
      const entry = readRejectionClassificationEvidence(event, scope.clientProfileId);
      if (entry && current.has(entry.sourceEventId) && !(entry.adjustmentSourceEventId && entry.versionHash &&
          isFactuallyClassifiedAdjustment(classifications, entry.adjustmentSourceEventId, entry.versionHash))) evidence.push(entry);
    }
  }
  return evidence;
}
