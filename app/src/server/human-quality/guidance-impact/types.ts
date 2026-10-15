import type { GuidanceRole, LearnedGuidanceRef } from "../../brand-taste/learned-guidance";
import type { OutputDecisionSnapshot } from "../../output-learning/output-decision-events";

export type GuidanceImpactSituation = "applied" | "control" | "omitted" | "unknown";
export interface GuidanceImpactScope {
  workspaceId: string;
  clientProfileId: string;
  generationMode: string | null;
  format: string | null;
  contextId: string;
  contextKind: "creative_work" | "legacy_campaign";
}
export interface GuidanceImpactGeneration extends GuidanceImpactScope {
  id: string;
  applications: unknown;
  humanVisualScore?: number;
  factualPass?: boolean;
}
export interface GuidanceImpactDecision {
  id: string;
  generationId: string;
  authorType: string;
  action: string;
  snapshot: OutputDecisionSnapshot;
}
export interface ImpactRate { numerator: number; denominator: number; value: number | null }
export interface GuidanceImpactGroup extends GuidanceImpactScope {
  role: GuidanceRole | null;
  situation: GuidanceImpactSituation;
  setHash: string | null;
  appliedRefs: LearnedGuidanceRef[];
  fixedPromptVersion: string;
  generationCount: number;
  humanApproval: ImpactRate;
  rejection: ImpactRate;
  adjustment: ImpactRate;
  humanVisualScore: { value: number | null; denominator: number };
  factualPass: ImpactRate;
}
export interface GuidanceImpactReport {
  schemaVersion: 1;
  mechanism: "guidance_revisions";
  capturedAt: string;
  decisionDenominator: "explicit_human_decision_events";
  groups: GuidanceImpactGroup[];
}
