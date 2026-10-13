import type { CreativeWorkOutput } from "../db/schema";
import { getCreativeWorkSelectionPolicy } from "@/lib/creative-work-selection-policy";
import { canonicalJsonStringify } from "./canonical-json";

/** Frozen roots share a generation; revision sisters must share their base and request context.
 * Creative level and direction are alternatives, so neither narrows the group.
 * This is a considered set, never evidence that the operator viewed each Peça.
 */
export function eligibleSelectionAlternatives(
  chosen: CreativeWorkOutput,
  outputs: readonly CreativeWorkOutput[],
): CreativeWorkOutput[] {
  return outputs.filter((other) =>
    other.id !== chosen.id && other.workspaceId === chosen.workspaceId && other.workItemId === chosen.workItemId &&
    other.targetFormat === chosen.targetFormat && other.parentOutputId === chosen.parentOutputId &&
    (chosen.parentOutputId !== null
      ? canonicalJsonStringify([other.revisionContext, other.revisionInstruction, other.revisionAssetId]) ===
        canonicalJsonStringify([chosen.revisionContext, chosen.revisionInstruction, chosen.revisionAssetId])
      : other.generationCorrelationId === chosen.generationCorrelationId) &&
    other.status === "completed" && Boolean(other.outputKey) &&
    getCreativeWorkSelectionPolicy(other.quality, other.id).selectable,
  ).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
