export type ProgressionLevelKey =
  | "aprendiz"
  | "analista_criativo"
  | "estrategista_ads"
  | "cientista_ads";

export type ProgressionEvidenceKey =
  | "campaign_created"
  | "base_creative_uploaded"
  | "readiness_ran"
  | "derivation_generated"
  | "creative_approved"
  | "creative_exported"
  | "share_created";

export interface ProgressionCompletedEvidence {
  key: ProgressionEvidenceKey;
  label: string;
  completedAt: string;
  evidenceId?: string;
  evidenceType?: string;
}

export interface ProgressionNextAction {
  key: ProgressionEvidenceKey;
  label: string;
  description: string;
  href: string;
  blocked: boolean;
  blockedReason?: string;
}

export interface WorkspaceProgressionResponse {
  level: {
    key: ProgressionLevelKey;
    label: string;
    shortLabel: string;
    description: string;
  };
  progressPercent: number;
  completed: ProgressionCompletedEvidence[];
  nextAction: ProgressionNextAction;
  lastCalculatedAt: string;
}
