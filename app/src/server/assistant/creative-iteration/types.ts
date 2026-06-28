import type { ArtifactProposalPayload } from "@/lib/assistant/artifact-version";
import { creativeVersionSnapshotSchema } from "@/lib/assistant/artifact-version";
import type { z } from "zod";

export type CreativeVersionSnapshot = z.infer<typeof creativeVersionSnapshotSchema>;

export interface CreativeRevisionSource {
  lineageId: string;
  sourceVersionId: string;
  sourceVersionNumber: number;
  sourceSnapshot: CreativeVersionSnapshot;
  planVersionId: string;
  planVersionLabel: string;
  approvedVersionId: string | null;
  approvedVersionNumber: number | null;
  workingDiffersFromApproved: boolean;
  sourceVersionLabel: string;
  approvedVersionLabel: string | null;
}

export type CreativeRevisionClarifyResult = {
  kind: "clarify";
  question: string;
};

export type CreativeRevisionAskTargetResult = {
  kind: "ask_target";
  question: string;
};

export type CreativeRevisionRedirectResult = {
  kind: "redirect";
  message: string;
};

export type CreativeRevisionProposalResult = {
  kind: "proposal";
  proposalId: string;
  lineageId: string;
  sourceVersionId: string;
  sourceVersionNumber: number;
  planVersionId: string;
  planVersionLabel: string;
  lineageHeadRevision: number;
  payloadDigest: string;
  sourceVersionLabel: string;
  approvedVersionLabel: string | null;
  workingDiffersFromApproved: boolean;
  summary: string;
  intendedChanges: string[];
  format: string | null;
  referenceIds: string[];
  creditImpact: number;
  writes: string[];
  payload: Extract<ArtifactProposalPayload, { type: "creative_revision" }>;
};

export type CreativeRevisionResult =
  | CreativeRevisionClarifyResult
  | CreativeRevisionAskTargetResult
  | CreativeRevisionRedirectResult
  | CreativeRevisionProposalResult;

export type CreativeRevisionSourceResult =
  | { kind: "resolved"; source: CreativeRevisionSource }
  | CreativeRevisionAskTargetResult;

export type CreativeRevisionModelOutput = {
  intendedChanges: string[];
  format: string | null;
  summary: string;
};

export type GenerateCreativeRevisionProposal = (
  source: CreativeVersionSnapshot,
  feedback: string
) => Promise<CreativeRevisionModelOutput>;
