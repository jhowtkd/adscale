import { type Inngest } from "inngest";
import OpenAI from "openai";
import { inngest } from "./client";
import { layerEditorFromOutput, markLayerRegenerationProcessing, completeLayerRegenerationCandidate, failLayerRegeneration } from "@/server/repositories/creative-work-layer-editor";
import { objectStorage } from "@/server/storage";
import { OpenAILayerRegenerationProvider, normalizeLayerCandidate, type LayerRegenerationProvider } from "@/server/layer-editor/openai-provider";
import { renderLayerEditorPng } from "@/server/layer-editor/artifacts";

function isAmbiguousProviderFailure(error: unknown) {
  if (error instanceof OpenAI.APIConnectionError || error instanceof OpenAI.APIConnectionTimeoutError) return true;
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError" || /(?:timeout|timed?\s*out|aborted?)/i.test(error.message));
}

export async function runCreativeWorkLayerRegeneration(input:{workspaceId:string;workItemId:string;outputId:string;operationId:string}, provider:LayerRegenerationProvider=new OpenAILayerRegenerationProvider()) {
 const now=new Date(); const claimed=await markLayerRegenerationProcessing({...input,now}); const state=layerEditorFromOutput(claimed); const regen=state?.regeneration; if(!state||!regen||regen.id!==input.operationId)return {status:"skipped" as const}; const layer=state.layers.find((x)=>x.id===regen.layerId); if(!layer)return {status:"skipped" as const};
 let result: { buffer: Buffer; requestId: string | null };
 try {
   result=await provider.regenerate({instruction:regen.instruction,selectedLayer:await objectStorage.get(layer.currentKey),composite:await renderLayerEditorPng({canvas:state.canvas,layers:state.layers,load:(key)=>objectStorage.get(key)}),bounds:{width:layer.source.width,height:layer.source.height}});
 } catch (error) {
   const unknown = isAmbiguousProviderFailure(error);
   await failLayerRegeneration({...input,status:unknown ? "submission_unknown" : "failed",failureCode:unknown ? "layer_regeneration_submission_unknown" : "layer_regeneration_provider_failed",now:new Date()});
   return {status:"failed" as const};
 }
 let candidate: Buffer;
 try {
   candidate=await normalizeLayerCandidate(result.buffer,{width:layer.source.width,height:layer.source.height});
 } catch {
   await failLayerRegeneration({...input,status:"failed",failureCode:"layer_regeneration_invalid_asset",now:new Date()});
   return {status:"failed" as const};
 }
 const key=`layer-editor-candidates/${input.workspaceId}/${input.workItemId}/${input.outputId}/${input.operationId}.png`;
 try {
   await objectStorage.put(key,candidate,"image/png");
 } catch {
   await failLayerRegeneration({...input,status:"failed",failureCode:"layer_regeneration_storage_failed",now:new Date()});
   return {status:"failed" as const};
 }
 const completed = await completeLayerRegenerationCandidate({...input,candidateKey:key,providerRequestId:result.requestId,now:new Date()});
 if (!completed) {
   void Promise.resolve(objectStorage.delete(key)).catch(() => undefined);
   return {status:"skipped" as const};
 }
 return {status:"ready" as const};
}
const config={id:"regenerate-creative-work-layer",retries:0 as const};
export const creativeWorkLayerRegenerationJob=inngest.createFunction({...config,triggers:[{event:"creative-work.layer-regenerate"}]},async({event})=>runCreativeWorkLayerRegeneration(event.data as {workspaceId:string;workItemId:string;outputId:string;operationId:string}));
export const createCreativeWorkLayerRegenerationJobV2=(client:Inngest)=>client.createFunction({...config,id:"regenerate-creative-work-layer-v2",triggers:[{event:"creative-work.layer-regenerate.v2"}]},async({event})=>runCreativeWorkLayerRegeneration(event.data as {workspaceId:string;workItemId:string;outputId:string;operationId:string}));
