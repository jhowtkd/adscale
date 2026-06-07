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
  totals: {
    events: number;
    sessions: number;
  };
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

  const withoutDuplicateNotes = kept.filter((signal) => {
    if (signal.kind !== "operator_note") return true;
    const noteTime = new Date(signal.createdAt).getTime();
    const hasMatchingOverride = kept.some((other) => {
      if (other.kind !== "event" || other.action !== "overridden") return false;
      if (other.sessionId !== signal.sessionId || other.stage !== signal.stage) {
        return false;
      }
      const delta = Math.abs(new Date(other.createdAt).getTime() - noteTime);
      return delta <= OVERRIDE_DEDUP_WINDOW_MS;
    });
    return !hasMatchingOverride;
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
