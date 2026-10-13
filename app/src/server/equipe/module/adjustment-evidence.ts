import { z } from "zod";
import { requireLocalLearningAuthorization, type LocalLearningAuthorizationPort } from "@/server/brand-taste/local-learning-authorization";
import { recordLocalLearningDecisionEvidence } from "@/server/output-learning/output-decision-recorder";
import { sanitizeCalibrationNote } from "@/server/output-learning/output-decision-events";
import { equipePersonRoleSchema, equipeStaffRoleSchema, type AccountScope, type EquipeEvent, type EquipeUnitOfWork } from "../data";
import { requestAdjustmentPayloadSchema } from "./envelope";
import { AGENT_WORK_REQUESTED_EVENT } from "./item-shared";
import { isFactuallyClassifiedAdjustment } from "./rejection-classification-evidence";
import { ROUND_REJECTION_CLASSIFIED_EVENT } from "./calibration-shared";

export const ADJUSTMENT_EVIDENCE_EVENT = "learning.item_adjustment_recorded";
export const ADJUSTMENT_EVIDENCE_TASK_EVENT = "equipe.adjustment.evidence";
type Deps = { uow: EquipeUnitOfWork; authorize?: LocalLearningAuthorizationPort };
const requestSchema = z.object({
  kind: z.literal("adjustment"), category: requestAdjustmentPayloadSchema.shape.category,
  note: z.string().max(2000).nullable().optional(), versionHash: z.string().min(1).max(120),
});
const evidenceSchema = z.object({
  sourceEventId: z.string().uuid(), clientProfileId: z.string().uuid(), itemId: z.string().uuid(),
  category: requestAdjustmentPayloadSchema.shape.category, note: z.string().max(1000).nullable(),
  versionHash: z.string().min(1).max(120), evidenceSanitized: z.boolean(),
  creativeWorkOutputId: z.string().uuid().nullable(), outputDecisionEventId: z.string().uuid().nullable(),
});

function hasConfirmedActor(event: EquipeEvent): event is EquipeEvent & { actorType: "client_person" | "staff"; actorId: string; actorRole: string } {
  return Boolean(event.actorId?.trim()) && (event.actorType === "client_person"
    ? equipePersonRoleSchema.safeParse(event.actorRole).success
    : event.actorType === "staff" && equipeStaffRoleSchema.safeParse(event.actorRole).success);
}

/** Consume committed requests only; the Item lock serializes replay and concurrent delivery. */
export async function consumeAdjustmentEvidence(deps: Deps, scope: AccountScope, sourceEventId: string) {
  return deps.uow.run(async (repos) => {
    const source = await repos.events.get(scope, sourceEventId);
    if (!source || source.eventType !== AGENT_WORK_REQUESTED_EVENT || source.objectType !== "item" || !source.objectId) return null;
    const request = requestSchema.safeParse(source.payload);
    // Old requests keep their limitation: never join actors or versions by nearby dates.
    if (!request.success || !hasConfirmedActor(source)) return null;
    const account = await repos.accounts.get(scope.workspaceId, scope.accountId);
    if (!account) return null;
    await requireLocalLearningAuthorization({ workspaceId: scope.workspaceId, clientProfileId: account.clientProfileId }, deps.authorize);
    // Lock the Item, not the event: the recorder's separate connection needs FK key-share on the event.
    if (!await repos.items.get(scope, source.objectId, { forUpdate: true })) return null;
    const [existing] = await repos.events.list(scope, { eventType: ADJUSTMENT_EVIDENCE_EVENT, objectType: "learning_evidence", objectId: source.id });
    if (existing) return existing;
    const version = await repos.itemVersions.getByHash(scope, source.objectId, request.data.versionHash);
    if (!version) return null;
    const note = sanitizeCalibrationNote(request.data.note);
    const evidenceSanitized = note !== (request.data.note ?? null);
    let outputDecisionEventId: string | null = null;
    if (version.creativeWorkOutputId) {
      // The canonical recorder checks Peça/workspace/brand and the original typed event's actor.
      const projection = await recordLocalLearningDecisionEvidence({
        workspaceId: scope.workspaceId, clientProfileId: account.clientProfileId,
        creativeWorkOutputId: version.creativeWorkOutputId, userId: null,
        authorType: "equipe_actor", actorId: source.actorId, actorRole: source.actorRole, equipeEventId: source.id,
        action: "regenerated", source: "equipe", occurredAt: source.occurredAt,
        idempotencyKey: `equipe-adjustment:${source.id}`,
        snapshotExtras: { reason: { code: request.data.category }, notes: note, evidenceSanitized,
          itemId: source.objectId, itemVersionHash: request.data.versionHash, operationId: source.id },
      }, deps.authorize);
      outputDecisionEventId = projection.id;
    }
    // This typed reference is also usable without a Peça; no fictitious output or user is needed.
    return repos.events.create(scope, {
      eventType: ADJUSTMENT_EVIDENCE_EVENT, objectType: "learning_evidence", objectId: source.id,
      actorType: source.actorType, actorId: source.actorId, actorRole: source.actorRole, occurredAt: source.occurredAt,
      payload: { sourceEventId: source.id, clientProfileId: account.clientProfileId, itemId: source.objectId,
        category: request.data.category, note, versionHash: request.data.versionHash, evidenceSanitized,
        creativeWorkOutputId: version.creativeWorkOutputId, outputDecisionEventId } satisfies z.infer<typeof evidenceSchema>,
    });
  });
}

export async function listAdjustmentEvidenceForBrand(deps: Deps, scope: { workspaceId: string; clientProfileId: string }) {
  await requireLocalLearningAuthorization(scope, deps.authorize);
  const accounts = (await deps.uow.repos.accounts.list(scope.workspaceId)).filter(account => account.clientProfileId === scope.clientProfileId);
  const evidence = [];
  for (const account of accounts) {
    const accountScope = { workspaceId: scope.workspaceId, accountId: account.id };
    const events = await deps.uow.repos.events.list(accountScope, { eventType: ADJUSTMENT_EVIDENCE_EVENT });
    const classifications = await deps.uow.repos.events.list(accountScope, { eventType: ROUND_REJECTION_CLASSIFIED_EVENT });
    for (const event of events) {
      const payload = evidenceSchema.safeParse(event.payload);
      if (!payload.success || payload.data.clientProfileId !== scope.clientProfileId || !hasConfirmedActor(event)) continue;
      if (isFactuallyClassifiedAdjustment(classifications, payload.data.sourceEventId, payload.data.versionHash)) continue;
      evidence.push({ ...payload.data, id: event.id, occurredAt: event.occurredAt,
        authorType: "equipe_actor" as const, actorType: event.actorType, actorId: event.actorId, actorRole: event.actorRole });
    }
  }
  return evidence;
}
