import "server-only";
import { materializeLayerEditorDraft } from "@/server/layer-editor/artifacts";
import { getCreativeWorkLayerEditorOutput, layerEditorFromOutput, publishCreativeWorkLayerEditorVersion } from "@/server/repositories/creative-work-layer-editor";
import { objectStorage } from "@/server/storage";
import { getLayerEditorAccess } from "@/server/layer-editor/quota";

function toPublicPublishedChild(output: { id: string; parentOutputId: string | null; status: string; isSelected: boolean; creativeLevel: string; targetFormat: string; versionNumber: number | null }) {
 return { id: output.id, parentOutputId: output.parentOutputId, status: output.status, isSelected: output.isSelected, creativeLevel: output.creativeLevel, targetFormat: output.targetFormat, versionNumber: output.versionNumber };
}

export async function publishCreativeWorkLayerEditor(input:{workspaceId:string;workItemId:string;outputId:string;userId:string;leaseId:string;expectedRevision:number;operationId:string}) {
 if (!(await getLayerEditorAccess(input.workspaceId, new Date())).enabled) return {ok:false as const,code:"layer_editor_not_available" as const};
 const parent=await getCreativeWorkLayerEditorOutput(input); const state=layerEditorFromOutput(parent); if(!parent||!state||state.revision!==input.expectedRevision||state.lease?.id!==input.leaseId||state.lease.userId!==input.userId||Date.parse(state.lease.expiresAt)<=Date.now()||state.regeneration)return {ok:false as const,code:"layer_editor_publish_conflict" as const};
 if ((await Promise.all(state.layers.map((layer) => objectStorage.head(layer.currentKey)))).some((artifact) => !artifact)) return {ok:false as const,code:"layer_editor_artifact_missing" as const};
 let draft: { pngKey: string; psdKey: string };
 try { draft=await materializeLayerEditorDraft({...input,revision:state.revision}); }
 catch { return {ok:false as const,code:"layer_editor_artifact_missing" as const}; }
 if (!await objectStorage.head(draft.pngKey) || !await objectStorage.head(draft.psdKey)) return {ok:false as const,code:"layer_editor_artifact_missing" as const};
 const prefix=`creative-work/${input.workItemId}/layer-editor/${input.outputId}/published/${input.operationId}`; const pngKey=`${prefix}/piece.png`,psdKey=`${prefix}/piece.psd`; await objectStorage.put(pngKey,await objectStorage.get(draft.pngKey),"image/png"); await objectStorage.put(psdKey,await objectStorage.get(draft.psdKey),"image/vnd.adobe.photoshop"); const now=new Date(); const childState={...state,revision:1,lease:null,regeneration:null,publishedPsdKey:psdKey,layers:state.layers.map(l=>({...l,source:{...l.source,order:l.order,name:l.name,visible:l.visible,x:l.x,y:l.y,width:l.width,height:l.height,key:l.currentKey},currentKind:"source" as const,restorableKey:null})),updatedAt:now.toISOString()}; const result=await publishCreativeWorkLayerEditorVersion({...input,parentOutputId:parent.id,outputKey:pngKey,psdKey,rebasedEditor:childState,now}); return result?{ok:true as const,replay:result.replay,output:toPublicPublishedChild(result.output)}:{ok:false as const,code:"layer_editor_publish_conflict" as const};
}
