import { z } from "zod";
import { requireLocalLearningAuthorization, type LocalLearningAuthorizationPort } from "@/server/brand-taste/local-learning-authorization";
import { sanitizeCalibrationNote } from "@/server/output-learning/output-decision-events";
import type { AccountScope, EquipeEvent, EquipeUnitOfWork } from "../data";
import { ROUND_REJECTION_CLASSIFIED_EVENT } from "./calibration-shared";
import { classifyRejectionPayloadSchema, requestAdjustmentPayloadSchema } from "./envelope";
import { AGENT_WORK_REQUESTED_EVENT } from "./item-shared";
import { recomputeClientOutputLearnings } from "@/server/output-learning/service";

export const REJECTION_CLASSIFICATION_EVIDENCE_EVENT = "learning.rejection_classification_recorded";
export const REJECTION_FACTUAL_ALERT_EVENT = "learning.rejection_factual_alert";
type Deps = { uow: EquipeUnitOfWork; authorize?: LocalLearningAuthorizationPort };
export const adjustmentRequestRefSchema = z.object({
  kind: z.literal("adjustment"), adjustmentEventId: z.string().uuid(),
  category: requestAdjustmentPayloadSchema.shape.category, versionHash: z.string().min(1).max(120),
});
const adjustmentRef = {
  adjustmentSourceEventId: z.string().uuid().nullable().optional(), versionHash: z.string().min(1).max(120).nullable().optional(),
  classificationSequence: z.number().int().positive().nullable().optional(),
};
const sourceSchema = z.object({
  itemId: z.string().uuid(), from: requestAdjustmentPayloadSchema.shape.category,
  to: classifyRejectionPayloadSchema.shape.category, evidence: z.string().max(4000).nullable(), loosened: z.boolean(),
  ...adjustmentRef,
});
const evidenceSchema = z.object({
  sourceEventId: z.string().uuid(), clientProfileId: z.string().uuid(), itemId: z.string().uuid(), roundId: z.string().uuid(),
  from: requestAdjustmentPayloadSchema.shape.category, category: classifyRejectionPayloadSchema.shape.category,
  evidence: z.string().max(1000).nullable(), evidenceSanitized: z.boolean(), loosened: z.boolean(),
  ...adjustmentRef,
});

function isQualityActor(event: EquipeEvent): event is EquipeEvent & { actorType: "staff"; actorId: string; actorRole: "quality" } {
  return event.actorType === "staff" && event.actorRole === "quality" && Boolean(event.actorId?.trim());
}

export function isFactuallyClassifiedAdjustment(events: EquipeEvent[], sourceEventId: string, versionHash: string): boolean {
  let latest: z.infer<typeof sourceSchema> | null = null;
  for (const event of events) {
    if (event.eventType !== ROUND_REJECTION_CLASSIFIED_EVENT || event.objectType !== "round" || !isQualityActor(event)) continue;
    const parsed = sourceSchema.safeParse(event.payload);
    if (parsed.success && parsed.data.adjustmentSourceEventId === sourceEventId && parsed.data.versionHash === versionHash &&
        parsed.data.classificationSequence && parsed.data.classificationSequence > (latest?.classificationSequence ?? 0)) latest = parsed.data;
  }
  return latest?.to === "fact";
}

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

export function readRejectionClassificationEvidence(event: EquipeEvent, clientProfileId: string) {
  const parsed = evidenceSchema.safeParse(event.payload);
  if (!parsed.success || parsed.data.clientProfileId !== clientProfileId || !isQualityActor(event) ||
      event.objectType !== "learning_evidence" || event.objectId !== parsed.data.sourceEventId ||
      event.eventType !== (parsed.data.category === "fact" ? REJECTION_FACTUAL_ALERT_EVENT : REJECTION_CLASSIFICATION_EVIDENCE_EVENT)) return null;
  return { ...parsed.data, id: event.id, occurredAt: event.occurredAt,
    authorType: "equipe_actor" as const, actorType: event.actorType, actorId: event.actorId, actorRole: event.actorRole };
}

export async function listRejectionClassificationEvidenceForBrand(deps: Deps, scope: { workspaceId: string; clientProfileId: string }) {
  await requireLocalLearningAuthorization(scope, deps.authorize);
  const accounts = (await deps.uow.repos.accounts.list(scope.workspaceId)).filter(account => account.clientProfileId === scope.clientProfileId);
  const evidence = [];
  for (const account of accounts) {
    const accountScope = { workspaceId: scope.workspaceId, accountId: account.id };
    const events = await deps.uow.repos.events.list(accountScope, { eventType: REJECTION_CLASSIFICATION_EVIDENCE_EVENT });
    const classifications = await deps.uow.repos.events.list(accountScope, { eventType: ROUND_REJECTION_CLASSIFIED_EVENT });
    for (const event of events) {
      const entry = readRejectionClassificationEvidence(event, scope.clientProfileId);
      if (entry && !(entry.adjustmentSourceEventId && entry.versionHash &&
          isFactuallyClassifiedAdjustment(classifications, entry.adjustmentSourceEventId, entry.versionHash))) evidence.push(entry);
    }
  }
  return evidence;
}
