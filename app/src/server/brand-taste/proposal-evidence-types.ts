import type { GenerationIdentity } from "../output-learning/generation-identity";
export const PROPOSAL_EVIDENCE_KINDS = [
  "corpus_item", "corpus_evaluation", "feedback_artifact", "calibration_signal",
  "output_decision", "equipe_event", "equipe_item_version",
] as const;

/** Durable identifiers only: no preview URLs, prompts or model responses. */
export interface ProposalEvidenceRef {
  kind: (typeof PROPOSAL_EVIDENCE_KINDS)[number];
  id: string;
}

export interface ResolvedProposalEvidence {
  kind: ProposalEvidenceRef["kind"] | "legacy";
  id: string;
  availability: "available" | "unavailable" | "removed";
  label: string;
  summary: string | null;
  sourceLabel?: string;
  strength?: string;
  occurredAt?: string;
  pieceHref: string | null;
  generationIdentity?: GenerationIdentity;
}

export interface ProposalEvidenceReport {
  id: string;
  kind: "rule" | "corpus_quality";
  support: ResolvedProposalEvidence[];
  caveats: string[];
  counts: {
    independentPieces: number;
    independentDecisions: number;
    unavailableReferences: number;
    ungroupedReferences: number;
  };
}
