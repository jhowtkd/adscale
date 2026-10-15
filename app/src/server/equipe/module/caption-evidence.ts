import { z } from "zod";
import { requireLocalLearningAuthorization, type LocalLearningAuthorizationPort } from "@/server/brand-taste/local-learning-authorization";
import { equipePersonRoleSchema, equipeStaffRoleSchema, type AccountScope, type EquipeEvent, type EquipeRepositories, type EquipeUnitOfWork } from "../data";
import { CAPTION_EDITED_EVENT } from "./item-shared";

export const CAPTION_EVIDENCE_EVENT = "learning.caption_edit_recorded";
export const CAPTION_EVIDENCE_TASK_EVENT = "equipe.caption.evidence";
type Deps = { uow: EquipeUnitOfWork; authorize?: LocalLearningAuthorizationPort };
const versionsSchema = z.object({ previousVersionHash: z.string().min(1).max(120), versionHash: z.string().min(1).max(120) });
const evidenceSchema = versionsSchema.extend({ sourceEventId: z.string().uuid(), clientProfileId: z.string().uuid(), itemId: z.string().uuid() });

function hasConfirmedActor(event: EquipeEvent): event is EquipeEvent & { actorType: "client_person" | "staff" | "agent"; actorId: string; actorRole: string } {
  return Boolean(event.actorId?.trim()) && (event.actorType === "client_person"
    ? equipePersonRoleSchema.safeParse(event.actorRole).success
    : event.actorType === "staff" ? equipeStaffRoleSchema.safeParse(event.actorRole).success
    : event.actorType === "agent" && event.actorRole === "agent");
}

async function resolveVersions(repos: EquipeRepositories, scope: AccountScope, itemId: string, hashes: z.infer<typeof versionsSchema>) {
  const before = await repos.itemVersions.getByHash(scope, itemId, hashes.previousVersionHash);
  const after = await repos.itemVersions.getByHash(scope, itemId, hashes.versionHash);
  return before && after ? { before, after } : null;
}

/** Immutable references only: replay never reconstructs an edit from the current Item. */
export async function consumeCaptionEvidence(deps: Deps, scope: AccountScope, sourceEventId: string) {
  return deps.uow.run(async repos => {
    const source = await repos.events.get(scope, sourceEventId);
    if (!source || source.objectType !== "item" || !source.objectId || !hasConfirmedActor(source)) return null;
    if (source.eventType !== (source.actorType === "agent" ? "item.version_submitted" : CAPTION_EDITED_EVENT)) return null;
    const hashes = versionsSchema.safeParse(source.payload);
    if (!hashes.success) return null;
    const account = await repos.accounts.get(scope.workspaceId, scope.accountId);
    if (!account) return null;
    await requireLocalLearningAuthorization({ workspaceId: scope.workspaceId, clientProfileId: account.clientProfileId }, deps.authorize);
    if (!await repos.items.get(scope, source.objectId, { forUpdate: true })) return null;
    const [existing] = await repos.events.list(scope, { eventType: CAPTION_EVIDENCE_EVENT, objectType: "learning_evidence", objectId: source.id });
    if (existing) return existing;
    const versions = await resolveVersions(repos, scope, source.objectId, hashes.data);
    if (!versions || versions.before.caption === versions.after.caption ||
      versions.after.authorRole !== source.actorType || versions.after.authorId !== source.actorId) return null;
    return repos.events.create(scope, {
      eventType: CAPTION_EVIDENCE_EVENT, objectType: "learning_evidence", objectId: source.id,
      actorType: source.actorType, actorId: source.actorId, actorRole: source.actorRole, occurredAt: source.occurredAt,
      payload: { sourceEventId: source.id, clientProfileId: account.clientProfileId, itemId: source.objectId, ...hashes.data } satisfies z.infer<typeof evidenceSchema>,
    });
  });
}

export async function listCaptionEvidenceForBrand(deps: Deps, scope: { workspaceId: string; clientProfileId: string }) {
  await requireLocalLearningAuthorization(scope, deps.authorize);
  const accounts = (await deps.uow.repos.accounts.list(scope.workspaceId)).filter(a => a.clientProfileId === scope.clientProfileId);
  const evidence = [];
  for (const account of accounts) {
    const accountScope = { workspaceId: scope.workspaceId, accountId: account.id };
    const events = await deps.uow.repos.events.list(accountScope, { eventType: CAPTION_EVIDENCE_EVENT });
    for (const event of events) {
      const payload = evidenceSchema.safeParse(event.payload);
      if (!payload.success || payload.data.clientProfileId !== scope.clientProfileId || !hasConfirmedActor(event)) continue;
      const versions = await resolveVersions(deps.uow.repos, accountScope, payload.data.itemId, payload.data);
      if (!versions) continue;
      evidence.push({ ...payload.data, ...versions, id: event.id, occurredAt: event.occurredAt,
        authorType: event.actorType === "agent" ? "agent" as const : "equipe_actor" as const,
        actorType: event.actorType, actorId: event.actorId, actorRole: event.actorRole });
    }
  }
  return evidence;
}
