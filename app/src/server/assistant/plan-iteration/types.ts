import type { ArtifactProposalPayload } from "@/lib/assistant/artifact-version";
import type { PlanVersionSnapshot } from "@/lib/assistant/artifact-version";

export interface PlanRevisionSource {
  lineageId: string;
  sourceVersionId: string;
  sourceVersionNumber: number;
  sourceSnapshot: PlanVersionSnapshot;
  approvedVersionId: string | null;
  approvedVersionNumber: number | null;
  workingDiffersFromApproved: boolean;
  sourceVersionLabel: string;
  approvedVersionLabel: string | null;
}

export type PlanRevisionClarifyResult = {
  kind: "clarify";
  question: string;
};

export type PlanRevisionAskTargetResult = {
  kind: "ask_target";
  question: string;
};

export type PlanRevisionRedirectResult = {
  kind: "redirect";
  message: string;
};

export type PlanRevisionProposalResult = {
  kind: "proposal";
  proposalId: string;
  lineageId: string;
  sourceVersionId: string;
  sourceVersionNumber: number;
  lineageHeadRevision: number;
  payloadDigest: string;
  sourceVersionLabel: string;
  approvedVersionLabel: string | null;
  workingDiffersFromApproved: boolean;
  summary: string;
  changes: { field: string; description: string }[];
  writes: string[];
  payload: Extract<ArtifactProposalPayload, { type: "plan_revision" }>;
};

export type PlanRevisionResult =
  | PlanRevisionClarifyResult
  | PlanRevisionAskTargetResult
  | PlanRevisionRedirectResult
  | PlanRevisionProposalResult;

export type PlanRevisionSourceResult =
  | { kind: "resolved"; source: PlanRevisionSource }
  | PlanRevisionAskTargetResult;
