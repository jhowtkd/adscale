import { describe, expect, it } from "vitest";
import type { PublicLayerEditorDocumentV1 } from "@/server/layer-editor/contracts";
import { applyLayerEditorCommand, createLayerEditorSession, redoLayerEditor, undoLayerEditor } from "./state";
const doc: PublicLayerEditorDocumentV1={schemaVersion:1,revision:1,canvas:{width:100,height:100},lease:{mode:"edit",leaseId:"x",heldByName:null,expiresAt:null},regeneration:null,updatedAt:"2026-01-01T00:00:00.000Z",layers:[0,1].map(order=>({id:`00000000-0000-4000-8000-00000000000${order+1}`,order,name:`L${order}`,visible:true,x:0,y:0,width:50,height:50,currentKind:"regenerated",imageUrl:"current",source:{order,name:`S${order}`,visible:true,x:1,y:2,width:20,height:20,imageUrl:"source"}}))};
describe("layer editor state",()=>{
 it("clamps transforms and keeps reorders contiguous",()=>{let s=createLayerEditorSession(doc);s=applyLayerEditorCommand(s,{type:"transform",id:doc.layers[0].id,x:99,y:99,width:50,height:50});expect(s.present.layers[0]).toMatchObject({x:50,y:50});s=applyLayerEditorCommand(s,{type:"reorder",id:doc.layers[1].id,order:0});expect([...s.present.layers.map(x=>x.order)].sort()).toEqual([0,1]);});
 it("restores source and supports undo redo",()=>{let s=createLayerEditorSession(doc);s=applyLayerEditorCommand(s,{type:"restore",id:doc.layers[0].id});expect(s.present.layers[0]).toMatchObject({name:"S0",currentKind:"source",imageUrl:"source"});expect(undoLayerEditor(s).present.layers[0].currentKind).toBe("regenerated");expect(redoLayerEditor(undoLayerEditor(s)).present.layers[0].currentKind).toBe("source");});
 it("limits history to fifty",()=>{let s=createLayerEditorSession(doc);for(let i=0;i<51;i++)s=applyLayerEditorCommand(s,{type:"rename",id:doc.layers[0].id,name:`N${i}`});expect(s.past).toHaveLength(50);});
});
