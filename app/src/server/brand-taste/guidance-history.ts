import type { CalibrationRuleRevision } from "../db/schema";
import { confirmedGuidanceMetadataSchema } from "./guidance-metadata";
import { PROPOSAL_EVIDENCE_KINDS, type ProposalEvidenceRef } from "./proposal-evidence-types";
import type { LearnedGuidanceRef } from "./learned-guidance";

const stringOf = (value: unknown): string | null => typeof value === "string" ? value : null;

export function mapGuidanceHistoryRevision(row: CalibrationRuleRevision) {
  const snapshot = row.snapshot;
  const metadata = confirmedGuidanceMetadataSchema.safeParse(snapshot.confirmed_metadata);
  const support = Array.isArray(snapshot.support_refs) ? snapshot.support_refs : snapshot.supporting_evidence_refs;
  const supportingEvidenceRefs: ProposalEvidenceRef[] = Array.isArray(support)
    ? support.filter((ref): ref is ProposalEvidenceRef =>
      !!ref && typeof ref === "object" && typeof ref.id === "string" && PROPOSAL_EVIDENCE_KINDS.includes(ref.kind)) : [];
  return {
    id: row.id, ruleId: row.ruleId, revisionNumber: row.revisionNumber, origin: row.origin,
    contentHash: row.contentHash, text: stringOf(snapshot.rationale) ?? "",
    category: stringOf(snapshot.category), status: stringOf(snapshot.status),
    supportedSliceKey: stringOf(snapshot.supported_slice_key),
    confirmedMetadata: metadata.success ? metadata.data : null,
    createdAt: stringOf(snapshot.created_at), createdBy: stringOf(snapshot.created_by),
    approvedBy: stringOf(snapshot.approved_by), approvedAt: stringOf(snapshot.approved_at),
    metadataConfirmedBy: stringOf(snapshot.metadata_confirmed_by), metadataConfirmedAt: stringOf(snapshot.metadata_confirmed_at),
    // These columns are supplied by the rejection/deprecation command when available.
    // A previous approver is never inferred as the author of a later decision.
    decisionBy: snapshot.status === "rejected" ? stringOf(snapshot.rejected_by)
      : snapshot.status === "deprecated" ? stringOf(snapshot.deprecated_by)
        : snapshot.status === "approved" ? stringOf(snapshot.approved_by) : null,
    recordedAt: row.recordedAt.toISOString(),
    supportingEvidenceRefs,
    legacySupportingIds: Array.isArray(snapshot.supporting_signal_ids) ? snapshot.supporting_signal_ids.filter((id): id is string => typeof id === "string" && !supportingEvidenceRefs.some(ref => ref.id === id)) : [],
    caveats: Array.isArray(snapshot.caveats) ? snapshot.caveats.filter((value): value is string => typeof value === "string") : [],
  };
}
export type GuidanceHistoryRevision = ReturnType<typeof mapGuidanceHistoryRevision>;

/** Resolve the exact bytes, without inventing a numeric identity for a legacy ref. */
export function resolveGuidanceHistoryReference(
  history: readonly Pick<GuidanceHistoryRevision, "ruleId" | "revisionNumber" | "contentHash" | "text">[],
  reference: LearnedGuidanceRef,
): { reference: LearnedGuidanceRef; text: string } | null {
  const row = history.find(row => row.ruleId === reference.ruleId && row.contentHash === reference.contentHash
    && (reference.revision === "legacy" || row.revisionNumber === reference.revision));
  return row ? { reference: { ...reference }, text: row.text } : null;
}
