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

export interface ReadinessOverrideSignal {
  kind: "event" | "operator_note";
  sessionId: string;
  workspaceId: string;
  stage: string;
  blockingCount?: number;
  note?: string;
  tags?: string[];
  eventId?: string;
  createdAt: string;
}

export interface AnalyticsFunnelSummary {
  missionFunnel: MissionFunnelRow[];
  cockpitStageFunnel: CockpitStageFunnelRow[];
  creditSurprises: CreditSurpriseRow[];
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
    if (estimate === actual) continue;

    rows.push({
      eventId: event.id,
      sessionId: event.sessionId,
      operation: propString(event, "operation") ?? "unknown",
      estimateCredits: estimate,
      actualCredits: actual,
      delta: actual - estimate,
      createdAt: event.createdAt.toISOString(),
    });
  }

  return rows.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
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
      eventId: event.id,
      createdAt: event.createdAt.toISOString(),
    }));
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
  return [...fromNotes, ...fromEvents].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
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
    creditSurprises: aggregateCreditSurprises(events),
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
