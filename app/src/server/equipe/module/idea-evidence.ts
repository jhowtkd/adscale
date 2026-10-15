import { z } from "zod";
import { requireLocalLearningAuthorization, type LocalLearningAuthorizationPort } from "@/server/brand-taste/local-learning-authorization";
import { sanitizeCalibrationNote } from "@/server/output-learning/output-decision-events";
import type { AccountScope, EquipeEvent, EquipeUnitOfWork } from "../data";

export const IDEA_REJECTION_EVIDENCE_EVENT = "learning.idea_rejection_recorded";
export const IDEA_REJECTION_EVIDENCE_TASK_EVENT = "equipe.idea_rejection.evidence";
type Deps = { uow: EquipeUnitOfWork; authorize?: LocalLearningAuthorizationPort };
const rejectionSchema = z.object({
  decision: z.literal("reject"), kind: z.literal("content"),
  reason: z.string().max(2000).nullable(), versionHash: z.string().regex(/^[0-9a-f]{64}$/),
});
const evidenceSchema = rejectionSchema.omit({ decision: true, kind: true }).extend({
  sourceEventId: z.string().uuid(), clientProfileId: z.string().uuid(), ideaId: z.string().uuid(),
  evidenceSanitized: z.boolean(),
});

function hasDecisionActor(event: EquipeEvent): event is EquipeEvent & { actorType: "client_person"; actorId: string; actorRole: string } {
  return event.actorType === "client_person" && Boolean(event.actorId?.trim())
    && (event.actorRole === "approver" || event.actorRole === "substitute");
}

/** The committed event is the authority; never reconstruct an old decision from the live idea. */
export async function consumeIdeaRejectionEvidence(deps: Deps, scope: AccountScope, sourceEventId: string) {
  return deps.uow.run(async repos => {
    const source = await repos.events.get(scope, sourceEventId);
    if (!source || source.eventType !== "idea.decided" || source.objectType !== "idea" || !source.objectId || !hasDecisionActor(source)) return null;
    const rejection = rejectionSchema.safeParse(source.payload);
    if (!rejection.success) return null;
    const account = await repos.accounts.get(scope.workspaceId, scope.accountId);
    if (!account) return null;
    await requireLocalLearningAuthorization({ workspaceId: scope.workspaceId, clientProfileId: account.clientProfileId }, deps.authorize);
    // Lock the source event to serialize concurrent redelivery, without reading mutable content.
    await repos.events.get(scope, source.id, { forUpdate: true });
    const [existing] = await repos.events.list(scope, { eventType: IDEA_REJECTION_EVIDENCE_EVENT, objectType: "learning_evidence", objectId: source.id });
    if (existing) return existing;
    const reason = sanitizeCalibrationNote(rejection.data.reason);
    return repos.events.create(scope, {
      eventType: IDEA_REJECTION_EVIDENCE_EVENT, objectType: "learning_evidence", objectId: source.id,
      actorType: source.actorType, actorId: source.actorId, actorRole: source.actorRole, occurredAt: source.occurredAt,
      payload: { sourceEventId: source.id, clientProfileId: account.clientProfileId, ideaId: source.objectId,
        versionHash: rejection.data.versionHash, reason, evidenceSanitized: reason !== rejection.data.reason } satisfies z.infer<typeof evidenceSchema>,
    });
  });
}

export async function listIdeaRejectionEvidenceForBrand(deps: Deps, scope: { workspaceId: string; clientProfileId: string }) {
  await requireLocalLearningAuthorization(scope, deps.authorize);
  const accounts = (await deps.uow.repos.accounts.list(scope.workspaceId)).filter(account => account.clientProfileId === scope.clientProfileId);
  const evidence = [];
  for (const account of accounts) {
    const events = await deps.uow.repos.events.list({ workspaceId: scope.workspaceId, accountId: account.id }, { eventType: IDEA_REJECTION_EVIDENCE_EVENT });
    for (const event of events) {
      const payload = evidenceSchema.safeParse(event.payload);
      if (!payload.success || payload.data.clientProfileId !== scope.clientProfileId || !hasDecisionActor(event)) continue;
      evidence.push({ ...payload.data, id: event.id, occurredAt: event.occurredAt,
        actorType: event.actorType, actorId: event.actorId, actorRole: event.actorRole,
        evidenceRef: { kind: "equipe_event" as const, id: event.id } });
    }
  }
  return evidence;
}
