import "server-only";

import { randomUUID } from "node:crypto";

import { LAYER_EDITOR_SIGNED_URL_TTL_SECONDS, layerEditorStateFromDatabase, type LayerEditorAccessV1, type LayerEditorMutableSnapshotV1, type LayerEditorStateV1, type PublicLayerEditorDocumentV1 } from "@/server/layer-editor/contracts";
import { getLayerEditorAccess, releaseLayerEditorQuota, withLayerEditorOperationLock } from "@/server/layer-editor/quota";
import {
  acquireCreativeWorkLayerEditorLease,
  acceptLayerRegenerationCandidate,
  discardLayerRegenerationCandidate,
  getCreativeWorkLayerEditorLeaseHolderName,
  getCreativeWorkLayerEditorOutput,
  heartbeatCreativeWorkLayerEditorLease,
  initializeCreativeWorkLayerEditor,
  layerizationFromOutput,
  releaseCreativeWorkLayerEditorLease,
  recoverStaleLayerRegeneration,
  recoverStaleReservedLayerRegeneration,
  saveCreativeWorkLayerEditorSnapshot,
  seedLayerEditorState,
  type LayerEditorMutationScope,
  type LayerEditorScope,
} from "@/server/repositories/creative-work-layer-editor";
import { objectStorage } from "@/server/storage";

export type OpenLayerEditorInput = LayerEditorScope & { userId: string; userName: string | null; mode: "inspect" | "edit" };
export type LayerEditorCommandResult =
  | { ok: true; document: PublicLayerEditorDocumentV1; access: LayerEditorAccessV1 }
  | { ok: false; status: 403 | 404 | 409; code: "layer_editor_not_available" | "layer_editor_locked" | "layer_editor_revision_conflict"; document?: PublicLayerEditorDocumentV1 };

async function project(state: LayerEditorStateV1, input: { workspaceId: string; userId: string; userName: string | null }, requestedMode: "edit" | "inspect" | "read"): Promise<PublicLayerEditorDocumentV1> {
  const [layers, candidateUrl] = await Promise.all([
    Promise.all(state.layers.map(async (layer) => ({
      id: layer.id,
      source: { order: layer.source.order, name: layer.source.name, visible: layer.source.visible, x: layer.source.x, y: layer.source.y, width: layer.source.width, height: layer.source.height, imageUrl: await objectStorage.signedDownloadUrl(layer.source.key, LAYER_EDITOR_SIGNED_URL_TTL_SECONDS) },
      order: layer.order, name: layer.name, visible: layer.visible, x: layer.x, y: layer.y, width: layer.width, height: layer.height, currentKind: layer.currentKind,
      imageUrl: await objectStorage.signedDownloadUrl(layer.currentKey, LAYER_EDITOR_SIGNED_URL_TTL_SECONDS),
    }))),
    state.regeneration?.candidateKey ? objectStorage.signedDownloadUrl(state.regeneration.candidateKey, LAYER_EDITOR_SIGNED_URL_TTL_SECONDS) : Promise.resolve(null),
  ]);
  const ownsLease = requestedMode === "edit" && state.lease?.userId === input.userId && Date.parse(state.lease.expiresAt) > Date.now();
  const heldByName = state.lease && state.lease.userId !== input.userId
    ? await getCreativeWorkLayerEditorLeaseHolderName(input.workspaceId, state.lease.userId)
    : null;
  return {
    schemaVersion: 1, revision: state.revision, canvas: state.canvas, layers,
    lease: { mode: ownsLease ? "edit" : "read", leaseId: ownsLease ? state.lease?.id ?? null : null, heldByName, expiresAt: state.lease?.expiresAt ?? null },
    regeneration: state.regeneration ? { id: state.regeneration.id, status: state.regeneration.status, layerId: state.regeneration.layerId, instruction: state.regeneration.instruction, candidateUrl, failureCode: state.regeneration.failureCode } : null,
    updatedAt: state.updatedAt,
  };
}

async function accessOrUnavailable(workspaceId: string): Promise<LayerEditorAccessV1 | null> {
  const access = await getLayerEditorAccess(workspaceId, new Date());
  return access.enabled ? access : null;
}

/** Keep the terminal transition and quota compensation indivisible. */
export async function recoverCreativeWorkLayerEditorStaleRegeneration(input: LayerEditorScope & { now: Date }) {
  const state = layerEditorStateFromDatabase((await getCreativeWorkLayerEditorOutput(input))?.layerEditor);
  const regeneration = state?.regeneration;
  if (regeneration?.status !== "reserved") return recoverStaleLayerRegeneration(input);
  return withLayerEditorOperationLock({ workspaceId: input.workspaceId, kind: "layer_regeneration_v1", operationId: regeneration.id }, async (executor) => {
    const recovered = await recoverStaleReservedLayerRegeneration({ ...input, operationId: regeneration.id }, executor);
    if (!recovered) return null;
    await releaseLayerEditorQuota({ workspaceId: input.workspaceId, kind: "layer_regeneration_v1", operationId: regeneration.id }, input.now, executor);
    return recovered;
  });
}

export async function openCreativeWorkLayerEditor(input: OpenLayerEditorInput): Promise<LayerEditorCommandResult> {
  const access = await accessOrUnavailable(input.workspaceId);
  if (!access) return { ok: false, status: 403, code: "layer_editor_not_available" };
  let output = await getCreativeWorkLayerEditorOutput(input);
  if (!output) return { ok: false, status: 404, code: "layer_editor_not_available" };
  if (input.mode === "edit" && (output.status !== "completed" || !output.isSelected)) return { ok: false, status: 409, code: "layer_editor_not_available" };
  let state = layerEditorStateFromDatabase(output.layerEditor);
  if (!state) {
    const source = layerizationFromOutput(output);
    if (!source) return { ok: false, status: 409, code: "layer_editor_not_available" };
    const now = new Date();
    const lease = input.mode === "edit" ? { id: randomUUID(), userId: input.userId, acquiredAt: now.toISOString(), expiresAt: new Date(now.getTime() + 90_000).toISOString() } : null;
    const seeded = seedLayerEditorState(source, lease, now);
    output = await initializeCreativeWorkLayerEditor({ ...input, state: seeded }) ?? await getCreativeWorkLayerEditorOutput(input);
    state = layerEditorStateFromDatabase(output?.layerEditor);
  }
  if (!state) return { ok: false, status: 409, code: "layer_editor_not_available" };
  const recovered = await recoverCreativeWorkLayerEditorStaleRegeneration({ workspaceId: input.workspaceId, workItemId: input.workItemId, outputId: input.outputId, now: new Date() });
  state = layerEditorStateFromDatabase(recovered?.layerEditor) ?? state;
  const hasLiveCallerLease = state.lease?.userId === input.userId && Date.parse(state.lease.expiresAt) > Date.now();
  if (input.mode === "edit" && !hasLiveCallerLease) {
    const leased = await acquireCreativeWorkLayerEditorLease({ ...input, leaseId: randomUUID(), now: new Date() });
    const leasedState = layerEditorStateFromDatabase(leased?.layerEditor);
    if (!leasedState || leasedState.lease?.userId !== input.userId) return { ok: false, status: 409, code: "layer_editor_locked", document: await project(state, input, "read") };
    state = leasedState;
  }
  return { ok: true, document: await project(state, input, input.mode), access };
}

export async function heartbeatCreativeWorkLayerEditor(input: LayerEditorScope & { userId: string; userName: string | null; leaseId: string }): Promise<LayerEditorCommandResult> {
  const access = await accessOrUnavailable(input.workspaceId);
  if (!access) return { ok: false, status: 403, code: "layer_editor_not_available" };
  const row = await heartbeatCreativeWorkLayerEditorLease({ ...input, now: new Date() });
  const state = layerEditorStateFromDatabase(row?.layerEditor) ?? layerEditorStateFromDatabase((await getCreativeWorkLayerEditorOutput(input))?.layerEditor);
  if (!state) return { ok: false, status: 404, code: "layer_editor_not_available" };
  if (!row) return { ok: false, status: 409, code: "layer_editor_revision_conflict", document: await project(state, input, "read") };
  return { ok: true, document: await project(state, input, "edit"), access };
}

export async function saveCreativeWorkLayerEditor(input: LayerEditorMutationScope & { userName: string | null; snapshot: LayerEditorMutableSnapshotV1 }): Promise<LayerEditorCommandResult> {
  const access = await accessOrUnavailable(input.workspaceId);
  if (!access) return { ok: false, status: 403, code: "layer_editor_not_available" };
  const row = await saveCreativeWorkLayerEditorSnapshot({ ...input, now: new Date() });
  const state = layerEditorStateFromDatabase(row?.layerEditor) ?? layerEditorStateFromDatabase((await getCreativeWorkLayerEditorOutput(input))?.layerEditor);
  if (!state) return { ok: false, status: 404, code: "layer_editor_not_available" };
  if (!row) return { ok: false, status: 409, code: "layer_editor_revision_conflict", document: await project(state, input, "read") };
  return { ok: true, document: await project(state, input, "edit"), access };
}

export async function releaseCreativeWorkLayerEditor(input: LayerEditorScope & { userId: string; leaseId: string }): Promise<{ ok: true }> {
  await releaseCreativeWorkLayerEditorLease(input);
  return { ok: true };
}

export type LayerRegenerationCandidateCommandResult =
  | { ok: true }
  | { ok: false; code: "layer_editor_not_available" | "layer_editor_revision_conflict" };

type CandidateCommandInput = LayerEditorMutationScope & { operationId: string };

/**
 * Promotes the ready candidate behind the application boundary. The immutable
 * object belongs to this request only: a losing CAS can delete just its own
 * key and can never delete the winner's object.
 */
export async function acceptCreativeWorkLayerRegenerationCandidate(input: CandidateCommandInput): Promise<LayerRegenerationCandidateCommandResult> {
  if (!(await accessOrUnavailable(input.workspaceId))) return { ok: false, code: "layer_editor_not_available" };
  const state = layerEditorStateFromDatabase((await getCreativeWorkLayerEditorOutput(input))?.layerEditor);
  const candidate = state?.regeneration;
  if (!candidate || candidate.id !== input.operationId || candidate.status !== "ready" || !candidate.candidateKey) {
    return { ok: false, code: "layer_editor_revision_conflict" };
  }
  const key = `creative-work/${input.workItemId}/layer-editor/${input.outputId}/layers/${candidate.layerId}/revisions/${input.expectedRevision + 1}/${randomUUID()}.png`;
  try {
    await objectStorage.put(key, await objectStorage.get(candidate.candidateKey), "image/png");
  } catch {
    return { ok: false, code: "layer_editor_revision_conflict" };
  }
  const updated = await acceptLayerRegenerationCandidate({ ...input, immutableKey: key, now: new Date() });
  if (!updated) {
    void objectStorage.delete(key).catch(() => undefined);
    return { ok: false, code: "layer_editor_revision_conflict" };
  }
  void objectStorage.delete(candidate.candidateKey).catch(() => undefined);
  return { ok: true };
}

export async function discardCreativeWorkLayerRegenerationCandidate(input: CandidateCommandInput): Promise<LayerRegenerationCandidateCommandResult> {
  if (!(await accessOrUnavailable(input.workspaceId))) return { ok: false, code: "layer_editor_not_available" };
  const state = layerEditorStateFromDatabase((await getCreativeWorkLayerEditorOutput(input))?.layerEditor);
  const candidate = state?.regeneration;
  if (!candidate || candidate.id !== input.operationId || candidate.status !== "ready" || !candidate.candidateKey) return { ok: false, code: "layer_editor_revision_conflict" };
  const updated = await discardLayerRegenerationCandidate({ ...input, now: new Date() });
  if (!updated) return { ok: false, code: "layer_editor_revision_conflict" };
  if (candidate.candidateKey) void objectStorage.delete(candidate.candidateKey).catch(() => undefined);
  return { ok: true };
}
