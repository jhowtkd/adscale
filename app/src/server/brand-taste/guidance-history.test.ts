import { describe, expect, it } from "vitest";
import { resolveGuidanceHistoryReference, mapGuidanceHistoryRevision } from "./guidance-history";
describe("guidance history references", () => {
 it("never reassigns a legacy reference to a numeric revision or substitutes another hash", () => {
  const history = [{ ruleId: "r", revisionNumber: 1, contentHash: "old", text: "  Texto exato 😀  " },
    { ruleId: "r", revisionNumber: 2, contentHash: "new", text: "Novo" }];
  const legacy = { ruleId: "r", revision: "legacy" as const, contentHash: "old" };
  expect(resolveGuidanceHistoryReference(history, legacy)).toEqual({ reference: legacy, text: "  Texto exato 😀  " });
  expect(resolveGuidanceHistoryReference(history, { ...legacy, contentHash: "missing" })).toBeNull();
  expect(resolveGuidanceHistoryReference(history, { ...legacy, revision: 2 })).toBeNull();
  expect(resolveGuidanceHistoryReference(history, { ruleId: "r", revision: 2, contentHash: "new" })).toEqual({
    reference: { ruleId: "r", revision: 2, contentHash: "new" }, text: "Novo",
  });
 });
 it("preserves literal text, confirmed metadata and typed support without inventing erased authors or signal types", () => {
  const text="  Texto literal 😀  ";
  const metadata={category:"voice",nature:"text",roles:["copy"],generationModes:["single"],formats:["4:5"],contentHash:"a".repeat(64)};
  const row=mapGuidanceHistoryRevision({id:"h",ruleId:"r",workspaceId:"w",clientProfileId:"b",revisionNumber:1,origin:"legacy",contentHash:"a".repeat(64),recordedAt:new Date("2026-10-13T00:00:00Z"),
   snapshot:{status:"deprecated",supported_slice_key:"reason|single|4:5",rationale:text,category:"gestalt",confirmed_metadata:metadata,approved_by:null,created_at:"2026-10-01T00:00:00",approved_at:null,metadata_confirmed_by:"known",metadata_confirmed_at:"2026-10-02T00:00:00",supporting_evidence_refs:[{kind:"feedback_artifact",id:"artifact"}],supporting_signal_ids:["ambiguous-old"],caveats:["Amostra limitada"]}});
  expect(row).toMatchObject({text,supportedSliceKey:"reason|single|4:5",confirmedMetadata:metadata,approvedBy:null,createdBy:null,decisionBy:null,metadataConfirmedBy:"known",
   supportingEvidenceRefs:[{kind:"feedback_artifact",id:"artifact"}],legacySupportingIds:["ambiguous-old"],caveats:["Amostra limitada"]});
 });
});
