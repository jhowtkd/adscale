import type { BetaAnalyticsEvent, BetaSession } from "../db/schema";
import type { StudioRolloutVariant } from "@/lib/beta-analytics/studio-session";
import {
  BETA_RUNBOOK_STAGES,
  type BetaOperatorNotes,
  type BetaRunbookStage,
} from "../beta-sessions/types";
import { aggregateValueDelivered, type SelectedPieceRow, type ValueDeliveredSummary } from "../creative-work/value-delivered";

export interface MissionFunnelRow {
  missionKey: string;
  entered: number;
  completed: number;
  conversionRate: number | null;
}

export interface CockpitStageFunnelRow {
  stage: string;
  entered: number;
  completed: number;
  abandoned: number;
}

export interface CreditSurpriseRow {
  eventId: string;
  sessionId: string | null;
  operation: string;
  estimateCredits: number;
  actualCredits: number;
  delta: number;
  createdAt: string;
}

export interface CreditSurpriseByOperationRow {
  operation: string;
  surpriseCount: number;
  totalDelta: number;
  maxAbsDelta: number;
}

export interface SessionStageTimelineRow {
  sessionId: string;
  stage: string;
  completedAt: string;
  gapFromPreviousMs: number | null;
}

export interface ReadinessOverrideSignal {
  kind: "event" | "operator_note";
  sessionId: string;
  workspaceId: string;
  stage: string;
  blockingCount?: number;
  note?: string;
  tags?: string[];
  eventId?: string;
  action?: string;
  createdAt: string;
}

export interface RecipeFunnelRow {
  recipeId: string;
  viewedCount: number;
  selectedCount: number;
}

export interface GuidedBriefingAbandonRow {
  stepId: string;
  abandonCount: number;
}

export interface CreditSpendByStageRow {
  stage: string;
  totalCredits: number;
  spendCount: number;
}

export interface ShareLinkOpenRow {
  campaignId: string;
  openCount: number;
}

export interface ReadinessOverrideDimensionRow {
  dimensionId: string;
  overrideCount: number;
}

export interface PostPreviewStallRow {
  sessionId: string;
  campaignId: string | null;
  stallMs: number;
  outcome: "proceed" | "abandon";
}

export interface PostPreviewStallSummary {
  medianStallMs: number | null;
  stallRate: number | null;
  stallThenProceedRate: number | null;
  rows: PostPreviewStallRow[];
}

export interface DraftToShareTimingSummary {
  overallMedianMs: number | null;
  byAssistanceLevel: { assistanceLevel: string; medianMs: number; sessionCount: number }[];
}

export interface ShareEngagementByAssistanceRow {
  assistanceLevel: string;
  sessionsWithShareCreated: number;
  sessionsWithShareOpened: number;
  openRate: number | null;
}

export interface DerivationAutoRetryBucket {
  triggered: number;
  succeeded: number;
  unchanged: number;
  successRate: number | null;
}

export interface DerivationAutoRetryByGenerationModeRow extends DerivationAutoRetryBucket {
  generationMode: string;
}

export interface DerivationAutoRetryByFailureCodeRow extends DerivationAutoRetryBucket {
  reasonCode: string;
}

export interface DerivationAutoRetryFunnelSummary extends DerivationAutoRetryBucket {
  byGenerationMode: DerivationAutoRetryByGenerationModeRow[];
  byFailureCode: DerivationAutoRetryByFailureCodeRow[];
}

export type StudioFunnelArm = {
  variant: StudioRolloutVariant;
  eligibleSessions: number;
  confirmedGenerations: number;
  completionsWithin24h: number;
  completionRate: number | null;
  abandonmentsBeforeGeneration: number;
  abandonmentRate: number | null;
  goalSwitches: number;
  sourceRoleCorrections: number;
  successfulResumesWithin30m: number;
  refinementsStarted: number;
  debitedGenerations: number;
  compensatedGenerations: number;
  failedGenerations: number;
  failureRate: number | null;
  refundedGenerations: number;
  refundRate: number | null;
  medianEntryToBriefingMs: number | null;
  medianEntryToPlanMs: number | null;
  completionByInputMode: Array<{
    inputMode: "text" | "art" | "both" | "unknown";
    eligibleSessions: number;
    completionsWithin24h: number;
    completionRate: number | null;
  }>;
};

export type StudioUsageEvent = {
  workspaceId: string;
  amount: number | null;
  metadata: unknown;
  createdAt: Date;
};

export interface AnalyticsFunnelSummary {
  missionFunnel: MissionFunnelRow[];
  cockpitStageFunnel: CockpitStageFunnelRow[];
  recipeFunnel: RecipeFunnelRow[];
  guidedBriefingAbandonByStep: GuidedBriefingAbandonRow[];
  creditSpendByStage: CreditSpendByStageRow[];
  creditSurprises: CreditSurpriseRow[];
  creditSurprisesByOperation: CreditSurpriseByOperationRow[];
  sessionStageTimeline: SessionStageTimelineRow[];
  readinessOverrides: ReadinessOverrideSignal[];
  shareLinkOpens: ShareLinkOpenRow[];
  readinessOverrideByDimension: ReadinessOverrideDimensionRow[];
  postPreviewStall: PostPreviewStallSummary;
  draftToShareTiming: DraftToShareTimingSummary;
  shareEngagementByAssistance: ShareEngagementByAssistanceRow[];
  derivationAutoRetryFunnel: DerivationAutoRetryFunnelSummary;
  studioFunnel: StudioFunnelArm[];
  guestImports: GuestImportSummary;
  valueDelivered: ValueDeliveredSummary;
  totals: {
    events: number;
    sessions: number;
  };
}

const POST_PREVIEW_STALL_THRESHOLD_MS = 15 * 60 * 1000;
const STUDIO_SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;
const STUDIO_RESUME_WINDOW_MS = 30 * 60 * 1000;
const STUDIO_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STUDIO_INPUT_MODES = ["text", "art", "both", "unknown"] as const;
const CANONICAL_STAGE_EVENTS = new Set([
  "creative_work_started",
  "briefing_ready",
  "generation_confirmed",
  "output_ready",
  "creative_work_reviewed",
  "creative_work_approved",
  "creative_work_delivered",
  "creative_work_abandoned",
  "creative_work_failed",
]);

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function isPreviewStageComplete(event: BetaAnalyticsEvent): boolean {
  if (event.eventKey !== "cockpit_stage_completed") return false;
  const stage = propString(event, "stage") ?? propString(event, "missionKey");
  return stage === "preview";
}

function isBatchCreditSpend(event: BetaAnalyticsEvent): boolean {
  if (event.eventKey !== "credit_spend") return false;
  const op =
    propString(event, "operation_key") ??
    propString(event, "operation") ??
    propString(event, "stage");
  return op === "batch" || (op?.includes("batch") ?? false);
}

function propString(event: BetaAnalyticsEvent, key: string): string | null {
  const value = event.properties?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function propNumber(event: BetaAnalyticsEvent, key: string): number | null {
  const value = event.properties?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stageFromEvent(event: BetaAnalyticsEvent): string {
  return propString(event, "stage") ?? propString(event, "missionKey") ?? "unknown";
}

function missionKeyFromEvent(event: BetaAnalyticsEvent): string {
  return propString(event, "missionKey") ?? stageFromEvent(event);
}

function isFalsePositiveTag(tag: string): boolean {
  const normalized = tag.toLowerCase();
  return (
    normalized.includes("false positive") ||
    normalized.includes("blocking false positive")
  );
}

export function aggregateMissionFunnel(
  events: BetaAnalyticsEvent[]
): MissionFunnelRow[] {
  const entered = new Map<string, number>();
  const completed = new Map<string, number>();

  for (const event of events) {
    const key = missionKeyFromEvent(event);
    if (event.eventKey === "cockpit_stage_entered") {
      entered.set(key, (entered.get(key) ?? 0) + 1);
    }
    if (event.eventKey === "mission_completed") {
      completed.set(key, (completed.get(key) ?? 0) + 1);
    }
  }

  const keys = new Set([...entered.keys(), ...completed.keys()]);
  return [...keys]
    .sort()
    .map((missionKey) => {
      const enterCount = entered.get(missionKey) ?? 0;
      const completeCount = completed.get(missionKey) ?? 0;
      return {
        missionKey,
        entered: enterCount,
        completed: completeCount,
        conversionRate:
          enterCount > 0 ? Math.round((completeCount / enterCount) * 1000) / 1000 : null,
      };
    });
}

export function aggregateCockpitStageFunnel(
  events: BetaAnalyticsEvent[]
): CockpitStageFunnelRow[] {
  const entered = new Map<string, number>();
  const completed = new Map<string, number>();
  const abandoned = new Map<string, number>();

  for (const event of events) {
    const stage = stageFromEvent(event);
    if (event.eventKey === "cockpit_stage_entered") {
      entered.set(stage, (entered.get(stage) ?? 0) + 1);
    }
    if (event.eventKey === "cockpit_stage_completed") {
      completed.set(stage, (completed.get(stage) ?? 0) + 1);
    }
    if (event.eventKey === "cockpit_stage_abandoned") {
      abandoned.set(stage, (abandoned.get(stage) ?? 0) + 1);
    }
  }

  const stageOrder = BETA_RUNBOOK_STAGES as readonly string[];
  const keys = new Set([
    ...entered.keys(),
    ...completed.keys(),
    ...abandoned.keys(),
  ]);

  return [...keys]
    .sort((a, b) => {
      const ai = stageOrder.indexOf(a as BetaRunbookStage);
      const bi = stageOrder.indexOf(b as BetaRunbookStage);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    })
    .map((stage) => ({
      stage,
      entered: entered.get(stage) ?? 0,
      completed: completed.get(stage) ?? 0,
      abandoned: abandoned.get(stage) ?? 0,
    }));
}

export function aggregateCreditSurprises(
  events: BetaAnalyticsEvent[]
): CreditSurpriseRow[] {
  const rows: CreditSurpriseRow[] = [];

  for (const event of events) {
    if (event.eventKey !== "credit_spend") continue;

    const estimate = propNumber(event, "estimateCredits");
    const actual = propNumber(event, "actualCredits");
    if (estimate === null || actual === null) continue;
    const persistedDelta = propNumber(event, "creditDelta");
    const delta = persistedDelta ?? actual - estimate;
    if (delta === 0) continue;

    rows.push({
      eventId: event.id,
      sessionId: event.sessionId,
      operation:
        propString(event, "operation_key") ??
        propString(event, "operation") ??
        "unknown",
      estimateCredits: estimate,
      actualCredits: actual,
      delta,
      createdAt: event.createdAt.toISOString(),
    });
  }

  return rows.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function aggregateCreditSurprisesByOperation(
  events: BetaAnalyticsEvent[]
): CreditSurpriseByOperationRow[] {
  const stats = new Map<
    string,
    { surpriseCount: number; totalDelta: number; maxAbsDelta: number }
  >();

  for (const row of aggregateCreditSurprises(events)) {
    const current = stats.get(row.operation) ?? {
      surpriseCount: 0,
      totalDelta: 0,
      maxAbsDelta: 0,
    };
    current.surpriseCount += 1;
    current.totalDelta += row.delta;
    current.maxAbsDelta = Math.max(current.maxAbsDelta, Math.abs(row.delta));
    stats.set(row.operation, current);
  }

  return [...stats.entries()]
    .map(([operation, value]) => ({
      operation,
      ...value,
    }))
    .sort(
      (a, b) =>
        b.surpriseCount - a.surpriseCount ||
        Math.abs(b.totalDelta) - Math.abs(a.totalDelta)
    );
}

export function aggregateSessionStageTimeline(
  events: BetaAnalyticsEvent[]
): SessionStageTimelineRow[] {
  const bySession = new Map<string, Array<{ stage: string; at: Date }>>();

  for (const event of events) {
    if (event.eventKey !== "cockpit_stage_completed") continue;
    if (!event.sessionId) continue;
    const stage = stageFromEvent(event);
    const list = bySession.get(event.sessionId) ?? [];
    list.push({ stage, at: event.createdAt });
    bySession.set(event.sessionId, list);
  }

  const rows: SessionStageTimelineRow[] = [];
  for (const [sessionId, stages] of bySession) {
    stages.sort((a, b) => a.at.getTime() - b.at.getTime());
    for (let index = 0; index < stages.length; index += 1) {
      const current = stages[index]!;
      const previous = index > 0 ? stages[index - 1]! : null;
      rows.push({
        sessionId,
        stage: current.stage,
        completedAt: current.at.toISOString(),
        gapFromPreviousMs: previous
          ? current.at.getTime() - previous.at.getTime()
          : null,
      });
    }
  }

  return rows.sort(
    (a, b) =>
      new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime()
  );
}

const OVERRIDE_DEDUP_WINDOW_MS = 5 * 60 * 1000;

type AutoRetryBucketCounts = {
  triggered: number;
  succeeded: number;
  unchanged: number;
};

function finalizeAutoRetryBucket(
  counts: AutoRetryBucketCounts
): DerivationAutoRetryBucket {
  const { triggered, succeeded, unchanged } = counts;
  return {
    triggered,
    succeeded,
    unchanged,
    successRate: triggered > 0 ? succeeded / triggered : null,
  };
}

function bumpAutoRetryBucket(
  map: Map<string, AutoRetryBucketCounts>,
  key: string,
  outcome: "triggered" | "succeeded" | "unchanged"
) {
  const current = map.get(key) ?? { triggered: 0, succeeded: 0, unchanged: 0 };
  current[outcome] += 1;
  map.set(key, current);
}

export function aggregateDerivationAutoRetryFunnel(
  events: BetaAnalyticsEvent[]
): DerivationAutoRetryFunnelSummary {
  const outcomeByDerivation = new Map<string, "succeeded" | "unchanged">();

  for (const event of events) {
    if (!event.derivationId) continue;
    if (event.eventKey === "derivation_auto_retry_succeeded") {
      outcomeByDerivation.set(event.derivationId, "succeeded");
    }
    if (event.eventKey === "derivation_auto_retry_unchanged") {
      outcomeByDerivation.set(event.derivationId, "unchanged");
    }
  }

  const overall: AutoRetryBucketCounts = { triggered: 0, succeeded: 0, unchanged: 0 };
  const byGenerationMode = new Map<string, AutoRetryBucketCounts>();
  const byFailureCode = new Map<string, AutoRetryBucketCounts>();

  for (const event of events) {
    if (event.eventKey !== "derivation_auto_retry_triggered") continue;

    overall.triggered += 1;
    const generationMode = propString(event, "operation") ?? "unknown";
    const reasonCode = propString(event, "reasonCode") ?? "unknown";
    bumpAutoRetryBucket(byGenerationMode, generationMode, "triggered");
    bumpAutoRetryBucket(byFailureCode, reasonCode, "triggered");

    const outcome = event.derivationId
      ? outcomeByDerivation.get(event.derivationId)
      : undefined;
    if (outcome === "succeeded") {
      overall.succeeded += 1;
      bumpAutoRetryBucket(byGenerationMode, generationMode, "succeeded");
      bumpAutoRetryBucket(byFailureCode, reasonCode, "succeeded");
    } else if (outcome === "unchanged") {
      overall.unchanged += 1;
      bumpAutoRetryBucket(byGenerationMode, generationMode, "unchanged");
      bumpAutoRetryBucket(byFailureCode, reasonCode, "unchanged");
    }
  }

  return {
    ...finalizeAutoRetryBucket(overall),
    byGenerationMode: [...byGenerationMode.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([generationMode, counts]) => ({
        generationMode,
        ...finalizeAutoRetryBucket(counts),
      })),
    byFailureCode: [...byFailureCode.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([reasonCode, counts]) => ({
        reasonCode,
        ...finalizeAutoRetryBucket(counts),
      })),
  };
}

export function aggregateRecipeFunnel(
  events: BetaAnalyticsEvent[]
): RecipeFunnelRow[] {
  const viewed = new Map<string, number>();
  const selected = new Map<string, number>();

  for (const event of events) {
    const recipeId = propString(event, "recipeId");
    if (!recipeId) continue;
    if (event.eventKey === "recipe_tradeoff_viewed") {
      viewed.set(recipeId, (viewed.get(recipeId) ?? 0) + 1);
    }
    if (event.eventKey === "recipe_selected") {
      selected.set(recipeId, (selected.get(recipeId) ?? 0) + 1);
    }
  }

  const keys = new Set([...viewed.keys(), ...selected.keys()]);
  return [...keys]
    .sort()
    .map((recipeId) => ({
      recipeId,
      viewedCount: viewed.get(recipeId) ?? 0,
      selectedCount: selected.get(recipeId) ?? 0,
    }));
}

export function aggregateGuidedBriefingAbandonByStep(
  events: BetaAnalyticsEvent[]
): GuidedBriefingAbandonRow[] {
  const counts = new Map<string, number>();

  for (const event of events) {
    if (event.eventKey !== "cockpit_stage_abandoned") continue;
    if (propString(event, "missionKey") !== "guided_briefing") continue;
    const stepId = propString(event, "stepId") ?? "unknown";
    counts.set(stepId, (counts.get(stepId) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([stepId, abandonCount]) => ({ stepId, abandonCount }));
}

export function aggregateCreditSpendByStage(
  events: BetaAnalyticsEvent[]
): CreditSpendByStageRow[] {
  const totals = new Map<string, { totalCredits: number; spendCount: number }>();

  for (const event of events) {
    if (event.eventKey !== "credit_spend") continue;
    const stage =
      propString(event, "stage") ??
      propString(event, "operation_key") ??
      propString(event, "operation") ??
      "unknown";
    const credits = propNumber(event, "actualCredits") ?? 0;
    const current = totals.get(stage) ?? { totalCredits: 0, spendCount: 0 };
    current.totalCredits += credits;
    current.spendCount += 1;
    totals.set(stage, current);
  }

  const stageOrder = BETA_RUNBOOK_STAGES as readonly string[];
  return [...totals.entries()]
    .sort(([a], [b]) => {
      const ai = stageOrder.indexOf(a as BetaRunbookStage);
      const bi = stageOrder.indexOf(b as BetaRunbookStage);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    })
    .map(([stage, value]) => ({
      stage,
      totalCredits: value.totalCredits,
      spendCount: value.spendCount,
    }));
}

export function extractReadinessBlockedEvents(
  events: BetaAnalyticsEvent[]
): ReadinessOverrideSignal[] {
  return events
    .filter((event) => event.eventKey === "readiness_blocked")
    .map((event) => ({
      kind: "event" as const,
      sessionId: event.sessionId ?? "unknown",
      workspaceId: event.workspaceId,
      stage: stageFromEvent(event),
      blockingCount: propNumber(event, "blockingCount") ?? undefined,
      action: propString(event, "action") ?? undefined,
      eventId: event.id,
      createdAt: event.createdAt.toISOString(),
    }));
}

function dedupeReadinessOverrideSignals(
  signals: ReadinessOverrideSignal[]
): ReadinessOverrideSignal[] {
  const kept: ReadinessOverrideSignal[] = [];
  const eventOverrideKeys = new Set<string>();

  for (const signal of signals) {
    if (signal.kind === "event" && signal.action === "overridden") {
      const bucket = Math.floor(
        new Date(signal.createdAt).getTime() / OVERRIDE_DEDUP_WINDOW_MS
      );
      const key = `${signal.sessionId}:${signal.stage}:${bucket}`;
      if (eventOverrideKeys.has(key)) continue;
      eventOverrideKeys.add(key);
    }
    kept.push(signal);
  }

  const overrideTimesBySessionStage = new Map<string, number[]>();
  for (const signal of kept) {
    if (signal.kind !== "event" || signal.action !== "overridden") continue;
    const key = `${signal.sessionId}:${signal.stage}`;
    const times = overrideTimesBySessionStage.get(key) ?? [];
    times.push(new Date(signal.createdAt).getTime());
    overrideTimesBySessionStage.set(key, times);
  }

  const withoutDuplicateNotes = kept.filter((signal) => {
    if (signal.kind !== "operator_note") return true;
    const noteTime = new Date(signal.createdAt).getTime();
    const overrideTimes = overrideTimesBySessionStage.get(
      `${signal.sessionId}:${signal.stage}`
    );
    if (!overrideTimes) return true;
    return !overrideTimes.some(
      (overrideTime) => Math.abs(overrideTime - noteTime) <= OVERRIDE_DEDUP_WINDOW_MS
    );
  });

  return withoutDuplicateNotes.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function extractOperatorFalsePositiveNotes(
  sessions: BetaSession[]
): ReadinessOverrideSignal[] {
  const signals: ReadinessOverrideSignal[] = [];

  for (const session of sessions) {
    const notes = (session.operatorNotes ?? {}) as BetaOperatorNotes;
    for (const stage of BETA_RUNBOOK_STAGES) {
      const note = notes[stage];
      if (!note) continue;
      const tags = note.tags ?? [];
      if (!tags.some(isFalsePositiveTag)) continue;

      signals.push({
        kind: "operator_note",
        sessionId: session.id,
        workspaceId: session.workspaceId,
        stage,
        note: note.notes,
        tags,
        createdAt:
          note.completedAt ??
          session.startedAt.toISOString(),
      });
    }
  }

  return signals;
}

export function aggregateReadinessOverrides(
  events: BetaAnalyticsEvent[],
  sessions: BetaSession[] = []
): ReadinessOverrideSignal[] {
  const fromEvents = extractReadinessBlockedEvents(events);
  const fromNotes = extractOperatorFalsePositiveNotes(sessions);
  return dedupeReadinessOverrideSignals([...fromNotes, ...fromEvents]);
}

export interface GuestImportSummary {
  distinctWorks: number;
  events: number;
}

export function aggregateGuestImports(
  events: BetaAnalyticsEvent[]
): GuestImportSummary {
  const works = new Set<string>();
  let count = 0;

  for (const event of events) {
    if (event.eventKey !== "guest_draft_imported") continue;
    const workId = propString(event, "creativeWorkId");
    if (!workId) continue;
    count += 1;
    works.add(workId);
  }

  return { distinctWorks: works.size, events: count };
}

export function aggregateShareLinkOpens(
  events: BetaAnalyticsEvent[]
): ShareLinkOpenRow[] {
  const counts = new Map<string, number>();

  for (const event of events) {
    if (event.eventKey !== "share_link_opened") continue;
    const campaignId = event.campaignId ?? propString(event, "campaignId");
    if (!campaignId) continue;
    counts.set(campaignId, (counts.get(campaignId) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([campaignId, openCount]) => ({ campaignId, openCount }));
}

export function aggregateReadinessOverrideByDimension(
  events: BetaAnalyticsEvent[]
): ReadinessOverrideDimensionRow[] {
  const counts = new Map<string, number>();

  for (const event of events) {
    if (event.eventKey !== "readiness_blocked") continue;
    if (propString(event, "action") !== "overridden") continue;
    const raw = propString(event, "blockingDimensions");
    if (!raw) continue;
    for (const dimensionId of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
      counts.set(dimensionId, (counts.get(dimensionId) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dimensionId, overrideCount]) => ({ dimensionId, overrideCount }));
}

export function aggregatePostPreviewStalls(
  events: BetaAnalyticsEvent[]
): PostPreviewStallSummary {
  const bySession = new Map<string, BetaAnalyticsEvent[]>();
  for (const event of events) {
    if (!event.sessionId) continue;
    const list = bySession.get(event.sessionId) ?? [];
    list.push(event);
    bySession.set(event.sessionId, list);
  }

  const rows: PostPreviewStallRow[] = [];

  for (const [sessionId, sessionEvents] of bySession) {
    const previewComplete = sessionEvents
      .filter(isPreviewStageComplete)
      .map((e) => e.createdAt.getTime());
    if (previewComplete.length === 0) continue;

    const previewAt = Math.max(...previewComplete);
    const batchTimes = sessionEvents
      .filter(isBatchCreditSpend)
      .map((e) => e.createdAt.getTime());
    const batchAt = batchTimes.length > 0 ? Math.min(...batchTimes) : null;
    const lastEventAt = Math.max(
      ...sessionEvents.map((e) => e.createdAt.getTime())
    );

    const campaignId =
      sessionEvents.find((e) => e.campaignId)?.campaignId ?? null;

    if (batchAt !== null && batchAt > previewAt) {
      const stallMs = batchAt - previewAt;
      if (stallMs >= POST_PREVIEW_STALL_THRESHOLD_MS) {
        rows.push({
          sessionId,
          campaignId,
          stallMs,
          outcome: "proceed",
        });
      }
      continue;
    }

    const stallMs = lastEventAt - previewAt;
    if (stallMs >= POST_PREVIEW_STALL_THRESHOLD_MS) {
      rows.push({
        sessionId,
        campaignId,
        stallMs,
        outcome: "abandon",
      });
    }
  }

  const sessionsWithPreview = [...bySession.values()].filter((sessionEvents) =>
    sessionEvents.some(isPreviewStageComplete)
  ).length;

  const stallSessions = new Set(rows.map((r) => r.sessionId));
  const proceedStalls = rows.filter((r) => r.outcome === "proceed").length;

  return {
    medianStallMs: median(rows.map((r) => r.stallMs)),
    stallRate:
      sessionsWithPreview > 0
        ? stallSessions.size / sessionsWithPreview
        : null,
    stallThenProceedRate:
      rows.length > 0 ? proceedStalls / rows.length : null,
    rows: rows.sort((a, b) => b.stallMs - a.stallMs),
  };
}

export function aggregateDraftToShareTiming(
  events: BetaAnalyticsEvent[],
  sessions: BetaSession[] = []
): DraftToShareTimingSummary {
  const assistanceBySession = new Map(
    sessions.map((s) => [s.id, s.assistanceLevel ?? "hands_on"])
  );
  const bySession = new Map<string, BetaAnalyticsEvent[]>();
  for (const event of events) {
    if (!event.sessionId) continue;
    const list = bySession.get(event.sessionId) ?? [];
    list.push(event);
    bySession.set(event.sessionId, list);
  }

  const overall: number[] = [];
  const byLevel = new Map<string, number[]>();

  for (const [sessionId, sessionEvents] of bySession) {
    const draftStarts = sessionEvents
      .filter(
        (e) =>
          e.eventKey === "cockpit_stage_entered" &&
          (propString(e, "stage") === "guided_briefing" ||
            propString(e, "missionKey") === "guided_briefing")
      )
      .map((e) => e.createdAt.getTime());
    const shareCompletes = sessionEvents
      .filter(
        (e) =>
          e.eventKey === "mission_completed" &&
          propString(e, "missionKey") === "share"
      )
      .map((e) => e.createdAt.getTime());

    if (draftStarts.length === 0 || shareCompletes.length === 0) continue;

    const ms = Math.min(...shareCompletes) - Math.min(...draftStarts);
    if (ms < 0) continue;

    overall.push(ms);
    const level = assistanceBySession.get(sessionId) ?? "unknown";
    const bucket = byLevel.get(level) ?? [];
    bucket.push(ms);
    byLevel.set(level, bucket);
  }

  return {
    overallMedianMs: median(overall),
    byAssistanceLevel: [...byLevel.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([assistanceLevel, values]) => ({
        assistanceLevel,
        medianMs: median(values) ?? 0,
        sessionCount: values.length,
      })),
  };
}

export function aggregateShareEngagementByAssistance(
  events: BetaAnalyticsEvent[],
  sessions: BetaSession[] = []
): ShareEngagementByAssistanceRow[] {
  const shareCreatedBySession = new Map<string, Set<string>>();
  const shareOpenedCampaigns = new Set<string>();

  for (const event of events) {
    if (event.eventKey === "mission_completed" && event.sessionId) {
      if (propString(event, "missionKey") === "share") {
        const set = shareCreatedBySession.get(event.sessionId) ?? new Set();
        if (event.campaignId) set.add(event.campaignId);
        shareCreatedBySession.set(event.sessionId, set);
      }
    }
    if (event.eventKey === "share_link_opened" && event.campaignId) {
      shareOpenedCampaigns.add(event.campaignId);
    }
  }

  const byLevel = new Map<
    string,
    { created: number; opened: number }
  >();

  for (const session of sessions) {
    const created = shareCreatedBySession.get(session.id);
    if (!created || created.size === 0) continue;
    const level = session.assistanceLevel ?? "hands_on";
    const bucket = byLevel.get(level) ?? { created: 0, opened: 0 };
    bucket.created += 1;
    const opened = [...created].some((campaignId) =>
      shareOpenedCampaigns.has(campaignId)
    );
    if (opened) bucket.opened += 1;
    byLevel.set(level, bucket);
  }

  return [...byLevel.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([assistanceLevel, stats]) => ({
      assistanceLevel,
      sessionsWithShareCreated: stats.created,
      sessionsWithShareOpened: stats.opened,
      openRate:
        stats.created > 0 ? stats.opened / stats.created : null,
    }));
}

type StudioInputMode = (typeof STUDIO_INPUT_MODES)[number];

type StudioSessionEntry = {
  id: string;
  workspaceId: string;
  variant: StudioRolloutVariant;
  startedAt: number;
};

type StudioArmAccumulator = {
  variant: StudioRolloutVariant;
  eligibleSessions: number;
  confirmedGenerations: number;
  completionsWithin24h: number;
  abandonmentsBeforeGeneration: number;
  goalSwitches: number;
  sourceRoleCorrections: number;
  successfulResumesWithin30m: number;
  refinementsStarted: number;
  debitedGenerations: number;
  compensatedGenerations: number;
  failedGenerations: number;
  refundedGenerations: number;
  briefingTimes: number[];
  planTimes: number[];
  inputModes: Map<StudioInputMode, { eligibleSessions: number; completionsWithin24h: number }>;
};

function isStudioVariant(value: string | null): value is StudioRolloutVariant {
  return value === "control" || value === "progressive";
}

function isStudioInputMode(value: string | null): value is Exclude<StudioInputMode, "unknown"> {
  return value === "text" || value === "art" || value === "both";
}

function usageMetadata(metadata: unknown): Record<string, unknown> | null {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : null;
}

function studioWorkId(event: BetaAnalyticsEvent): string | null {
  return propString(event, "creativeWorkId");
}

function indexedStudioSessions(events: BetaAnalyticsEvent[], asOf?: Date) {
  const chronological = [...events].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime()
  );
  const entries = new Map<string, StudioSessionEntry>();
  const bySession = new Map<string, BetaAnalyticsEvent[]>();
  const byWork = new Map<string, BetaAnalyticsEvent[]>();

  for (const event of chronological) {
    const sessionId = propString(event, "studioSessionId");
    if (sessionId) {
      const key = `${event.workspaceId}:${sessionId}`;
      const bucket = bySession.get(key) ?? [];
      bucket.push(event);
      bySession.set(key, bucket);
      if (event.eventKey === "studio_entry_started") {
        const variant = propString(event, "rolloutVariant");
        if (STUDIO_UUID_PATTERN.test(sessionId) && isStudioVariant(variant) && !entries.has(key)) {
          entries.set(key, {
            id: sessionId,
            workspaceId: event.workspaceId,
            variant,
            startedAt: event.createdAt.getTime(),
          });
        }
      }
    }
    const workId = studioWorkId(event);
    if (workId) {
      const key = `${event.workspaceId}:${workId}`;
      const bucket = byWork.get(key) ?? [];
      bucket.push(event);
      byWork.set(key, bucket);
    }
  }

  const maturityCutoff = (asOf?.getTime() ?? Date.now()) - STUDIO_SESSION_WINDOW_MS;
  const sessions = [...entries.values()]
    .filter((entry) => entry.startedAt <= maturityCutoff)
    .map((entry) => {
      const windowEndsAt = entry.startedAt + STUDIO_SESSION_WINDOW_MS;
      const sessionEvents = (bySession.get(`${entry.workspaceId}:${entry.id}`) ?? [])
        .filter((event) => {
          const timestamp = event.createdAt.getTime();
          const variant = propString(event, "rolloutVariant");
          return timestamp >= entry.startedAt && timestamp <= windowEndsAt
            && (variant === null || variant === entry.variant);
        });
      const acceptedWorks = new Set(
        sessionEvents
          .filter((event) => event.eventKey === "generation_confirmed")
          .map(studioWorkId)
          .filter((workId): workId is string => Boolean(workId))
      );
      return { entry, windowEndsAt, sessionEvents, acceptedWorks };
    });
  return { sessions, byWork };
}

export type StudioUsageWindow = {
  workspaceId: string;
  creativeWorkId: string;
  startedAt: Date;
  endsAt: Date;
};

export function listStudioUsageWindows(events: BetaAnalyticsEvent[], asOf?: Date): StudioUsageWindow[] {
  return indexedStudioSessions(events, asOf).sessions.flatMap(({ entry, windowEndsAt, acceptedWorks }) =>
    [...acceptedWorks].map((creativeWorkId) => ({
      workspaceId: entry.workspaceId,
      creativeWorkId,
      startedAt: new Date(entry.startedAt),
      endsAt: new Date(windowEndsAt),
    }))
  );
}

function createStudioArm(variant: StudioRolloutVariant): StudioArmAccumulator {
  return {
    variant,
    eligibleSessions: 0,
    confirmedGenerations: 0,
    completionsWithin24h: 0,
    abandonmentsBeforeGeneration: 0,
    goalSwitches: 0,
    sourceRoleCorrections: 0,
    successfulResumesWithin30m: 0,
    refinementsStarted: 0,
    debitedGenerations: 0,
    compensatedGenerations: 0,
    failedGenerations: 0,
    refundedGenerations: 0,
    briefingTimes: [],
    planTimes: [],
    inputModes: new Map(
      STUDIO_INPUT_MODES.map((inputMode) => [
        inputMode,
        { eligibleSessions: 0, completionsWithin24h: 0 },
      ]),
    ),
  };
}

function toStudioFunnelArm(arm: StudioArmAccumulator): StudioFunnelArm {
  return {
    variant: arm.variant,
    eligibleSessions: arm.eligibleSessions,
    confirmedGenerations: arm.confirmedGenerations,
    completionsWithin24h: arm.completionsWithin24h,
    completionRate: arm.eligibleSessions > 0 ? arm.completionsWithin24h / arm.eligibleSessions : null,
    abandonmentsBeforeGeneration: arm.abandonmentsBeforeGeneration,
    abandonmentRate: arm.eligibleSessions > 0 ? arm.abandonmentsBeforeGeneration / arm.eligibleSessions : null,
    goalSwitches: arm.goalSwitches,
    sourceRoleCorrections: arm.sourceRoleCorrections,
    successfulResumesWithin30m: arm.successfulResumesWithin30m,
    refinementsStarted: arm.refinementsStarted,
    debitedGenerations: arm.debitedGenerations,
    compensatedGenerations: arm.compensatedGenerations,
    failedGenerations: arm.failedGenerations,
    failureRate: arm.confirmedGenerations > 0 ? arm.failedGenerations / arm.confirmedGenerations : null,
    refundedGenerations: arm.refundedGenerations,
    refundRate: arm.confirmedGenerations > 0 ? arm.refundedGenerations / arm.confirmedGenerations : null,
    medianEntryToBriefingMs: median(arm.briefingTimes),
    medianEntryToPlanMs: arm.variant === "progressive" ? median(arm.planTimes) : null,
    completionByInputMode: STUDIO_INPUT_MODES.map((inputMode) => {
      const bucket = arm.inputModes.get(inputMode)!;
      return {
        inputMode,
        eligibleSessions: bucket.eligibleSessions,
        completionsWithin24h: bucket.completionsWithin24h,
        completionRate: bucket.eligibleSessions > 0
          ? bucket.completionsWithin24h / bucket.eligibleSessions
          : null,
      };
    }),
  };
}

/** Pure, session-windowed report for the temporary Studio rollout. */
export function aggregateStudioFunnel(
  events: BetaAnalyticsEvent[],
  usageEvents: StudioUsageEvent[],
  asOf?: Date,
): StudioFunnelArm[] {
  const { sessions, byWork } = indexedStudioSessions(events, asOf);
  const usageByWork = new Map<string, StudioUsageEvent[]>();
  for (const event of usageEvents) {
    const workId = usageMetadata(event.metadata)?.creativeWorkId;
    if (typeof workId !== "string") continue;
    const key = `${event.workspaceId}:${workId}`;
    const bucket = usageByWork.get(key) ?? [];
    bucket.push(event);
    usageByWork.set(key, bucket);
  }

  const arms = new Map<StudioRolloutVariant, StudioArmAccumulator>([
    ["control", createStudioArm("control")],
    ["progressive", createStudioArm("progressive")],
  ]);
  for (const { entry: session, windowEndsAt, sessionEvents, acceptedWorks } of sessions) {
    const arm = arms.get(session.variant)!;
    const inWindow = (createdAt: Date) => {
      const timestamp = createdAt.getTime();
      return timestamp >= session.startedAt && timestamp <= windowEndsAt;
    };
    const workEvents = [...acceptedWorks].flatMap((workId) =>
      (byWork.get(`${session.workspaceId}:${workId}`) ?? []).filter((event) =>
        inWindow(event.createdAt)
      )
    );
    const completedWorks = new Set(
      workEvents
        .filter((event) => event.source === "server" && event.eventKey === "output_ready")
        .map(studioWorkId)
        .filter((workId): workId is string => Boolean(workId)),
    );
    const failedWorks = new Set(
      workEvents
        .filter((event) => event.source === "server" && event.eventKey === "creative_work_failed")
        .map(studioWorkId)
        .filter((workId): workId is string => Boolean(workId)),
    );

    arm.eligibleSessions += 1;
    arm.confirmedGenerations += acceptedWorks.size;
    if (acceptedWorks.size === 0) arm.abandonmentsBeforeGeneration += 1;
    if (completedWorks.size > 0) arm.completionsWithin24h += 1;
    arm.failedGenerations += failedWorks.size;

    const firstWorkStart = sessionEvents.find(
      (event) => event.eventKey === "creative_work_started" && studioWorkId(event),
    );
    const inputModeValue = firstWorkStart ? propString(firstWorkStart, "inputMode") : null;
    const inputMode: StudioInputMode = isStudioInputMode(inputModeValue) ? inputModeValue : "unknown";
    const inputBucket = arm.inputModes.get(inputMode)!;
    inputBucket.eligibleSessions += 1;
    if (completedWorks.size > 0) inputBucket.completionsWithin24h += 1;

    const firstBriefing = sessionEvents.find((event) => event.eventKey === "briefing_ready");
    if (firstBriefing) arm.briefingTimes.push(firstBriefing.createdAt.getTime() - session.startedAt);
    const firstPlan = sessionEvents.find((event) => event.eventKey === "studio_plan_shown");
    if (firstPlan) arm.planTimes.push(firstPlan.createdAt.getTime() - session.startedAt);

    let workStarted = false;
    let goalSelections = 0;
    for (const event of sessionEvents) {
      if (event.eventKey === "creative_work_started") workStarted = true;
      if (event.eventKey === "studio_goal_selected") {
        goalSelections += 1;
        if (workStarted && goalSelections >= 2) arm.goalSwitches += 1;
      }
      if (event.eventKey === "studio_source_role_selected") arm.sourceRoleCorrections += 1;
      if (event.eventKey === "studio_refinement_started") arm.refinementsStarted += 1;
    }

    for (const event of sessionEvents) {
      if (event.eventKey !== "creative_work_reopened") continue;
      const workId = studioWorkId(event);
      if (!workId) continue;
      const reopenedAt = event.createdAt.getTime();
      const nextCanonicalStage = (byWork.get(`${session.workspaceId}:${workId}`) ?? []).find((candidate) =>
        inWindow(candidate.createdAt)
        && CANONICAL_STAGE_EVENTS.has(candidate.eventKey)
        && candidate.createdAt.getTime() > reopenedAt,
      );
      if (nextCanonicalStage
        && nextCanonicalStage.createdAt.getTime() <= reopenedAt + STUDIO_RESUME_WINDOW_MS) {
        arm.successfulResumesWithin30m += 1;
      }
    }

    for (const workId of acceptedWorks) {
      const usageForWork = (usageByWork.get(`${session.workspaceId}:${workId}`) ?? [])
        .filter((event) => inWindow(event.createdAt));
      if (usageForWork.some((usageEvent) => (usageEvent.amount ?? 0) > 0)) {
        arm.debitedGenerations += 1;
      }
      const refunds = usageForWork.filter((usageEvent) => {
        const metadata = usageMetadata(usageEvent.metadata);
        return (usageEvent.amount ?? 0) < 0 && metadata?.refund === true;
      });
      if (refunds.length > 0) arm.refundedGenerations += 1;
      if (refunds.some((usageEvent) => usageMetadata(usageEvent.metadata)?.description === "creative_work_dispatch_refund")) {
        arm.compensatedGenerations += 1;
      }
    }
  }

  return (["control", "progressive"] as const).map((variant) =>
    toStudioFunnelArm(arms.get(variant)!),
  );
}

export function buildAnalyticsFunnelSummary(
  events: BetaAnalyticsEvent[],
  sessions: BetaSession[] = [],
  usageEvents: StudioUsageEvent[] = [],
  asOf?: Date,
  options?: { selectedFromDatabase?: SelectedPieceRow[] },
): AnalyticsFunnelSummary {
  const sessionIds = new Set<string>();
  const byKey = new Map<string, Array<{ position: number; event: BetaAnalyticsEvent }>>();
  events.forEach((event, position) => {
    if (event.sessionId) sessionIds.add(event.sessionId);
    const bucket = byKey.get(event.eventKey) ?? [];
    bucket.push({ position, event });
    byKey.set(event.eventKey, bucket);
  });
  const forKeys = (...keys: string[]) => keys
    .flatMap((key) => byKey.get(key) ?? [])
    .sort((a, b) => a.position - b.position)
    .map(({ event }) => event);
  const creditEvents = forKeys("credit_spend");

  return {
    missionFunnel: aggregateMissionFunnel(forKeys("cockpit_stage_entered", "mission_completed")),
    cockpitStageFunnel: aggregateCockpitStageFunnel(forKeys("cockpit_stage_entered", "cockpit_stage_completed", "cockpit_stage_abandoned")),
    recipeFunnel: aggregateRecipeFunnel(forKeys("recipe_tradeoff_viewed", "recipe_selected")),
    guidedBriefingAbandonByStep: aggregateGuidedBriefingAbandonByStep(forKeys("cockpit_stage_abandoned")),
    creditSpendByStage: aggregateCreditSpendByStage(creditEvents),
    creditSurprises: aggregateCreditSurprises(creditEvents),
    creditSurprisesByOperation: aggregateCreditSurprisesByOperation(creditEvents),
    sessionStageTimeline: aggregateSessionStageTimeline(forKeys("cockpit_stage_completed")),
    readinessOverrides: aggregateReadinessOverrides(forKeys("readiness_blocked"), sessions),
    shareLinkOpens: aggregateShareLinkOpens(forKeys("share_link_opened")),
    readinessOverrideByDimension: aggregateReadinessOverrideByDimension(forKeys("readiness_blocked")),
    postPreviewStall: aggregatePostPreviewStalls(events),
    draftToShareTiming: aggregateDraftToShareTiming(forKeys("cockpit_stage_entered", "mission_completed"), sessions),
    shareEngagementByAssistance: aggregateShareEngagementByAssistance(
      forKeys("mission_completed", "share_link_opened"),
      sessions
    ),
    derivationAutoRetryFunnel: aggregateDerivationAutoRetryFunnel(forKeys("derivation_auto_retry_triggered", "derivation_auto_retry_succeeded", "derivation_auto_retry_unchanged")),
    studioFunnel: aggregateStudioFunnel(events, usageEvents, asOf),
    guestImports: aggregateGuestImports(forKeys("guest_draft_imported")),
    valueDelivered: aggregateValueDelivered(forKeys("creative_work_approved", "creative_work_delivered"), options?.selectedFromDatabase),
    totals: {
      events: events.length,
      sessions: sessionIds.size,
    },
  };
}

export function eventsToCsvRows(events: BetaAnalyticsEvent[]): string {
  const header =
    "id,workspace_id,session_id,event_key,source,stage,mission_key,created_at,properties_json";
  const lines = events.map((event) => {
    const stage = propString(event, "stage") ?? "";
    const missionKey = propString(event, "missionKey") ?? "";
    const props = JSON.stringify(event.properties ?? {}).replace(/"/g, '""');
    return [
      event.id,
      event.workspaceId,
      event.sessionId ?? "",
      event.eventKey,
      event.source,
      stage,
      missionKey,
      event.createdAt.toISOString(),
      `"${props}"`,
    ].join(",");
  });
  return [header, ...lines].join("\n");
}
