// Client-side shapes of the /api/equipe/staff/* views (#554).
//
// Same fields as the module views; dates arrive as ISO strings over JSON.

export type StaffRole = "support" | "quality" | "operations";

export type AccountScope = {
  workspaceId: string;
  accountId: string;
};

export type EquipeExceptionView = {
  id: string;
  workspaceId: string;
  accountId: string;
  trigger: string;
  reason: string | null;
  attempts: number;
  dueAt: string | null;
  ownerRole: string;
  assigneeId: string | null;
  status: string;
  resolvedAt: string | null;
  createdAt: string;
};

export type QueuedExceptionView = {
  exception: EquipeExceptionView;
  slaBreached: boolean;
};

export type ExceptionsQueueView = {
  workspaceId: string;
  accountId: string;
  brandName: string | null;
  workspaceName: string | null;
  open: QueuedExceptionView[];
};

export type EquipeEscalationView = {
  id: string;
  workspaceId: string;
  accountId: string;
  frontId: string | null;
  itemId: string | null;
  kind: string;
  severity: string;
  ownerRole: string;
  coOwnerRole: string | null;
  parts: unknown;
  dueAt: string | null;
  status: string;
  cause: string | null;
  lessonCandidate: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

export type EquipePauseView = {
  id: string;
  workspaceId: string;
  accountId: string;
  frontId: string | null;
  level: string;
  scope: string;
  origin: string;
  resumableBy: string;
  status: string;
  reason: string | null;
  liftedAt: string | null;
  createdAt: string;
};

export type EquipeEventView = {
  id: string;
  workspaceId: string;
  accountId: string;
  actorType: string;
  actorId: string | null;
  actorRole: string | null;
  eventType: string;
  objectType: string | null;
  objectId: string | null;
  payload: unknown;
  occurredAt: string;
};

export type CrossAccountEntryView = {
  scope: AccountScope;
  brandName: string | null;
  workspaceName: string | null;
  escalations: EquipeEscalationView[];
  exceptions: EquipeExceptionView[];
  pauses: EquipePauseView[];
};

export type CrossAccountPipelineView = {
  entries: CrossAccountEntryView[];
};

export type QualityPipelineEntryView = {
  workspaceId: string;
  accountId: string;
  brandName: string | null;
  workspaceName: string | null;
  frontId: string;
  frontKey: string | null;
  roundId: string;
  sequence: number;
  weekKey: string;
  status: string;
  openedAt: string;
  closedAt: string | null;
  outcome: string | null;
};

export type QualityPipelineView = {
  staffId: string;
  open: QualityPipelineEntryView[];
  recentlyClosed: QualityPipelineEntryView[];
};

export type EquipeFrontView = {
  id: string;
  key: string;
  status: string;
  calibrationSequence: number;
  roundsUsed: number;
  releasedAt: string | null;
  calibrationStartedAt: string | null;
};

export type EquipeBatchView = {
  id: string;
  frontId: string | null;
  title: string;
  status: string;
  approveByAt: string | null;
  deliveredAt: string | null;
};

export type EquipeItemView = {
  id: string;
  frontId: string;
  batchId: string | null;
  status: string;
  scheduledFor: string | null;
  deadlineAt: string | null;
  destination: string | null;
  currentVersionHash: string | null;
  createdAt: string;
};

export type EquipeItemVersionView = {
  id: string;
  itemId: string;
  versionHash: string;
  creativeWorkOutputId: string | null;
  caption: string;
  scheduledFor: string | null;
  destination: string | null;
  authorRole: string;
  authorId: string | null;
  reviewerFindings: unknown;
  createdAt: string;
};

export type RubricView = {
  facts: number;
  brand: number;
  usefulness: number;
  execution: number;
};

export type EquipeCalibrationScoreView = {
  id: string;
  roundId: string;
  itemId: string;
  versionHash: string;
  rubric: unknown;
  verdict: string;
  feedback: string | null;
  relaxed: boolean;
  evidence: unknown;
  scoredBy: string | null;
  createdAt: string;
};

export type EquipeCalibrationRoundView = {
  id: string;
  frontId: string;
  batchId: string;
  weekKey: string;
  sequence: number;
  status: string;
  closedAt: string | null;
  decision: unknown;
  createdAt: string;
};

export type RoundItemQualityView = {
  returned: { versionHash: string; note: string } | null;
  corrected: { versionHash: string } | null;
  released: { versionHash: string; corrected: boolean } | null;
  critical: { reason: string } | null;
  withdrawn: { reason: string | null } | null;
  classification: {
    from: string;
    to: string;
    evidence: string | null;
    loosened: boolean;
  } | null;
};

export type ClientDecisionView = {
  verdict: string;
  clientCategory: string | null;
  effectiveCategory: string | null;
};

export type RoundDetailItemView = {
  item: EquipeItemView;
  versions: EquipeItemVersionView[];
  evaluatedAttempt: EquipeItemVersionView | null;
  score: EquipeCalibrationScoreView | null;
  quality: RoundItemQualityView;
  client: ClientDecisionView;
};

export type RoundDetailView = {
  workspaceId: string;
  accountId: string;
  brandName: string | null;
  workspaceName: string | null;
  round: EquipeCalibrationRoundView;
  front: EquipeFrontView | null;
  batch: EquipeBatchView | null;
  items: RoundDetailItemView[];
  summary: unknown;
};

export type IsolatedConnectionView = {
  id: string;
  provider: string;
  accountId: string;
  status: string;
};

export type EscalationDetailView = {
  workspaceId: string;
  accountId: string;
  brandName: string | null;
  workspaceName: string | null;
  escalation: EquipeEscalationView;
  parts: Array<{ kind: string; resolved: boolean }>;
  item: EquipeItemView | null;
  events: EquipeEventView[];
  pauses: EquipePauseView[];
  exception: EquipeExceptionView | null;
  isolatedConnections: IsolatedConnectionView[];
};
