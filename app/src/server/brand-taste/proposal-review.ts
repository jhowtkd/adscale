import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalJsonStringify } from "../creative-work/canonical-json";
import { confirmedGuidanceMetadataSchema, type ConfirmedGuidanceMetadata } from "./guidance-metadata";

export type LearningProposalKind = "corpus_quality" | "rule";
export type GuidanceProposalDraft = {
  revision: number;
  originalText: string;
  editedText: string;
  editedBy: string;
  editedByName: string;
  editedAt: string;
  metadata: ConfirmedGuidanceMetadata;
};
export const proposalMetadataInputSchema = confirmedGuidanceMetadataSchema.omit({ contentHash: true });
/** Opens the rationale of a categorized-correction candidate: a pointer to its evidence, not an instruction. */
export const CORRECTION_CANDIDATE_RATIONALE_PREFIX = "Correções humanas categorizadas";
export const expectedProposalRevisionSchema = z.string().regex(/^[0-9a-f]{64}$/);

/** Covers the full authoritative review state, including edits by other commands. */
export function learningProposalRevision(kind: LearningProposalKind, row: object): string {
  return createHash("sha256").update(canonicalJsonStringify({ kind, row: JSON.parse(JSON.stringify(row)) }), "utf8").digest("hex");
}
export function withLearningProposalRevision<T extends object>(kind: LearningProposalKind, row: T): T & { expectedRevision: string } {
  return { ...row, expectedRevision: learningProposalRevision(kind, row) };
}
