import { z } from "zod";
import { requireLocalLearningAuthorization, type LocalLearningAuthorizationPort } from "@/server/brand-taste/local-learning-authorization";
import { sanitizeCalibrationNote } from "@/server/output-learning/output-decision-events";
import type { AccountScope, EquipeEvent, EquipeUnitOfWork } from "../data";
import { ROUND_REJECTION_CLASSIFIED_EVENT } from "./calibration-shared";
import { classifyRejectionPayloadSchema, requestAdjustmentPayloadSchema } from "./envelope";

export const REJECTION_CLASSIFICATION_EVIDENCE_EVENT = "learning.rejection_classification_recorded";
export const REJECTION_FACTUAL_ALERT_EVENT = "learning.rejection_factual_alert";
type Deps = { uow: EquipeUnitOfWork; authorize?: LocalLearningAuthorizationPort };
const sourceSchema = z.object({
  itemId: z.string().uuid(), from: requestAdjustmentPayloadSchema.shape.category,
  to: classifyRejectionPayloadSchema.shape.category, evidence: z.string().max(4000).nullable(), loosened: z.boolean(),
});
const evidenceSchema = z.object({
  sourceEventId: z.string().uuid(), clientProfileId: z.string().uuid(), itemId: z.string().uuid(), roundId: z.string().uuid(),
  from: requestAdjustmentPayloadSchema.shape.category, category: classifyRejectionPayloadSchema.shape.category,
  evidence: z.string().max(1000).nullable(), evidenceSanitized: z.boolean(), loosened: z.boolean(),
});

function isQualityActor(event: EquipeEvent): event is EquipeEvent & { actorType: "staff"; actorId: string; actorRole: "quality" } {
  return event.actorType === "staff" && event.actorRole === "quality" && Boolean(event.actorId?.trim());
}

/** Classification is evidence by typed event, without inventing a Peça verdict or a taste rule. */
export async function consumeRejectionClassificationEvidence(deps: Deps, scope: AccountScope, sourceEventId: string) {
  return deps.uow.run(async repos => {
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
    const eventType = parsed.data.to === "fact" ? REJECTION_FACTUAL_ALERT_EVENT : REJECTION_CLASSIFICATION_EVIDENCE_EVENT;
    const [existing] = await repos.events.list(scope, { eventType, objectType: "learning_evidence", objectId: source.id });
    if (existing) return existing;
    const evidence = sanitizeCalibrationNote(parsed.data.evidence);
    return repos.events.create(scope, {
      eventType, objectType: "learning_evidence", objectId: source.id,
      actorType: source.actorType, actorId: source.actorId, actorRole: source.actorRole, occurredAt: source.occurredAt,
      payload: { sourceEventId: source.id, clientProfileId: account.clientProfileId, itemId: item.id, roundId: round.id,
        from: parsed.data.from, category: parsed.data.to, evidence, loosened: parsed.data.loosened,
        evidenceSanitized: evidence !== parsed.data.evidence } satisfies z.infer<typeof evidenceSchema>,
    });
  });
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
    const events = await deps.uow.repos.events.list({ workspaceId: scope.workspaceId, accountId: account.id }, { eventType: REJECTION_CLASSIFICATION_EVIDENCE_EVENT });
    for (const event of events) {
      const entry = readRejectionClassificationEvidence(event, scope.clientProfileId);
      if (entry) evidence.push(entry);
    }
  }
  return evidence;
}
