import "server-only";
import { claimLayerEditorQuota, releaseLayerEditorQuota } from "@/server/layer-editor/quota";
import { getCreativeWorkLayerEditorOutput, layerEditorFromOutput, reserveLayerRegeneration, rollbackReservedLayerRegeneration } from "@/server/repositories/creative-work-layer-editor";
import { inngest } from "@/server/jobs/client";
import { heavyImageEventName } from "@/server/jobs/heavy-image-events";

export async function requestCreativeWorkLayerRegeneration(input: { workspaceId:string; workItemId:string; outputId:string; userId:string; leaseId:string; expectedRevision:number; operationId:string; layerId:string; instruction:string }) {
  const instruction=input.instruction.trim(); if(!instruction || instruction.length>2000)return {ok:false as const,code:"invalid_instruction" as const};
  const quota=await claimLayerEditorQuota({workspaceId:input.workspaceId,kind:"layer_regeneration_v1",operationId:input.operationId,userId:input.userId,workItemId:input.workItemId,outputId:input.outputId},new Date());
  if(!quota.ok)return {ok:false as const,code:quota.code};
  if (quota.replay) {
    const state = layerEditorFromOutput(await getCreativeWorkLayerEditorOutput(input));
    if (state?.regeneration?.id === input.operationId) return { ok: true as const, accepted: false, replay: true };
    return { ok: false as const, code: "layer_editor_revision_conflict" as const };
  }
  const reserved=await reserveLayerRegeneration({...input,instruction,usageKey:`layer-editor:${input.workspaceId}:regeneration:${input.operationId}`,now:new Date()});
  if(!reserved){ if(!quota.replay) await releaseLayerEditorQuota({workspaceId:input.workspaceId,kind:"layer_regeneration_v1",operationId:input.operationId},new Date()); return {ok:false as const,code:"layer_editor_revision_conflict" as const}; }
  try { await inngest.send({id:`creative-work-layer-regenerate:${input.outputId}:${input.operationId}`,name:heavyImageEventName("creative-work.layer-regenerate"),data:{workspaceId:input.workspaceId,workItemId:input.workItemId,outputId:input.outputId,operationId:input.operationId}}); }
  catch {
    const now = new Date();
    const rolledBack = await rollbackReservedLayerRegeneration({ ...input, now });
    if (rolledBack) {
      await releaseLayerEditorQuota({ workspaceId: input.workspaceId, kind: "layer_regeneration_v1", operationId: input.operationId }, now);
    }
    return { ok: false as const, code: "layer_regeneration_dispatch_failed" as const };
  }
  return {ok:true as const,accepted:!quota.replay,replay:quota.replay};
}
