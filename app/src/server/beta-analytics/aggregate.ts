import type { BetaAnalyticsEvent, BetaSession } from "../db/schema";
import {
  BETA_RUNBOOK_STAGES,
  type BetaOperatorNotes,
  type BetaRunbookStage,
} from "../beta-sessions/types";

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
  totals: {
    events: number;
    sessions: number;
  };
}

const POST_PREVIEW_STALL_THRESHOLD_MS = 15 * 60 * 1000;

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

export function buildAnalyticsFunnelSummary(
  events: BetaAnalyticsEvent[],
  sessions: BetaSession[] = []
): AnalyticsFunnelSummary {
  const sessionIds = new Set(
    events.map((e) => e.sessionId).filter((id): id is string => Boolean(id))
  );

  return {
    missionFunnel: aggregateMissionFunnel(events),
    cockpitStageFunnel: aggregateCockpitStageFunnel(events),
    recipeFunnel: aggregateRecipeFunnel(events),
    guidedBriefingAbandonByStep: aggregateGuidedBriefingAbandonByStep(events),
    creditSpendByStage: aggregateCreditSpendByStage(events),
    creditSurprises: aggregateCreditSurprises(events),
    creditSurprisesByOperation: aggregateCreditSurprisesByOperation(events),
    sessionStageTimeline: aggregateSessionStageTimeline(events),
    readinessOverrides: aggregateReadinessOverrides(events, sessions),
    shareLinkOpens: aggregateShareLinkOpens(events),
    readinessOverrideByDimension: aggregateReadinessOverrideByDimension(events),
    postPreviewStall: aggregatePostPreviewStalls(events),
    draftToShareTiming: aggregateDraftToShareTiming(events, sessions),
    shareEngagementByAssistance: aggregateShareEngagementByAssistance(
      events,
      sessions
    ),
    derivationAutoRetryFunnel: aggregateDerivationAutoRetryFunnel(events),
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
