import type { CreativeWorkOutput } from "../db/schema";
import {
  parsePersistedOutputReviewDraft,
  parsePersistedOutputRevisionContext,
} from "./output-review";

/**
 * Public output DTO shared by the detail GET and the reviewed_revision POST.
 * Only schema-validated review data crosses the boundary: historic null stays
 * null, invalid or extra-keyed JSON is rejected as null, and storage/internal
 * keys (outputKey, operationKey, layer internals) never leave the server.
 */
export function projectPublicCreativeWorkOutput(output: CreativeWorkOutput) {
  return {
    id: output.id,
    workItemId: output.workItemId,
    creativeLevel: output.creativeLevel,
    targetFormat: output.targetFormat,
    versionNumber: output.versionNumber,
    parentOutputId: output.parentOutputId,
    revisionInstruction: output.revisionInstruction,
    revisionAssetId: output.revisionAssetId,
    reviewDraft: parsePersistedOutputReviewDraft(output.reviewDraft),
    revisionContext: parsePersistedOutputRevisionContext(output.revisionContext),
    retryCount: output.retryCount,
    imageCallCount: output.imageCallCount,
    status: output.status,
    hasOutput: Boolean(output.outputKey),
    failureCode: output.failureCode,
    quality: output.quality,
    isSelected: output.isSelected,
    directionId: output.directionId,
    directionSnapshot: output.directionSnapshot,
    createdAt: output.createdAt,
    updatedAt: output.updatedAt,
  };
}

export type PublicCreativeWorkOutput = ReturnType<
  typeof projectPublicCreativeWorkOutput
>;
