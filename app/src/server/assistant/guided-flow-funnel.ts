import type { AssistantGuidedFlowEvent } from "@/server/db/schema";
import {
  GUIDED_FLOW_ACTION_EVENT_KEYS,
  GUIDED_FLOW_CORE_EVENT_KEYS,
} from "@/server/assistant/guided-flow-telemetry";

export const GUIDED_FLOW_OPERATIONAL_MIN_SAMPLE = 5;

const PATH_ORDER: Record<string, string[]> = {
  existing_creative: ["select_creative", "review_diagnosis", "confirm_improvement"],
  from_zero: ["collect_brief", "select_references", "confirm_plan"],
};

const TRACKED_PATHS = ["existing_creative", "from_zero"] as const;

export interface GuidedPathFunnelRow {
  path: (typeof TRACKED_PATHS)[number];
  starts: number;
  completions: number;
  abandonments: number;
  failures: number;
  blocked: number;
}

export interface GuidedStepDropoffRow {
  path: string;
  step: string;
  views: number;
  dropoffs: number;
}

export interface GuidedBlockerCategoryRow {
  path: string;
  blockerCategory: string;
  count: number;
}

export interface GuidedFlowInvestigationRow {
  threadId: string;
  workspaceId: string;
  clientProfileId: string;
  path: string;
  lastStep: string;
  lastEventKey: string;
  occurredAt: string;
}

export interface GuidedFlowFunnelSummary {
  implementationCoverage: {
    telemetryEnabled: boolean;
    pathsCovered: string[];
    eventKeysObserved: string[];
    actionEventsObserved: string[];
  };
  operationalEvidence: {
    sampleSufficient: boolean;
    minSampleThreshold: number;
    observedStarts: number;
    note: string;
  };
  pathFunnel: GuidedPathFunnelRow[];
  stepDropoff: GuidedStepDropoffRow[];
  topBlockers: GuidedBlockerCategoryRow[];
  investigationLinks: GuidedFlowInvestigationRow[];
  totals: { events: number };
}

function uniqueThreadsByPathEvent(
  events: AssistantGuidedFlowEvent[],
  eventKey: string
): Map<string, Set<string>> {
  const threads = new Map<string, Set<string>>();
  for (const event of events) {
    if (event.eventKey !== eventKey) continue;
    if (!TRACKED_PATHS.includes(event.path as (typeof TRACKED_PATHS)[number])) {
      continue;
    }
    const set = threads.get(event.path) ?? new Set<string>();
    set.add(event.threadId);
    threads.set(event.path, set);
  }
  return threads;
}

function aggregateStepDropoff(
  events: AssistantGuidedFlowEvent[]
): GuidedStepDropoffRow[] {
  const views = new Map<string, number>();

  for (const event of events) {
    if (event.eventKey !== "guided_step_viewed") continue;
    const key = `${event.path}::${event.step}`;
    views.set(key, (views.get(key) ?? 0) + 1);
  }

  const rows: GuidedStepDropoffRow[] = [];

  for (const path of TRACKED_PATHS) {
    const steps = PATH_ORDER[path] ?? [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const currentViews = views.get(`${path}::${step}`) ?? 0;
      const nextStep = steps[i + 1];
      const nextViews = nextStep ? (views.get(`${path}::${nextStep}`) ?? 0) : 0;
      const dropoffs = nextStep ? Math.max(0, currentViews - nextViews) : 0;
      rows.push({ path, step, views: currentViews, dropoffs });
    }
  }

  return rows;
}

function aggregateTopBlockers(
  events: AssistantGuidedFlowEvent[]
): GuidedBlockerCategoryRow[] {
  const counts = new Map<string, number>();

  for (const event of events) {
    if (event.eventKey !== "guided_action_blocked" || !event.blockerCategory) {
      continue;
    }
    const key = `${event.path}::${event.blockerCategory}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([key, count]) => {
      const [path, blockerCategory] = key.split("::");
      return { path, blockerCategory, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function buildInvestigationLinks(
  events: AssistantGuidedFlowEvent[]
): GuidedFlowInvestigationRow[] {
  const latestByThread = new Map<string, AssistantGuidedFlowEvent>();

  for (const event of events) {
    const existing = latestByThread.get(event.threadId);
    if (!existing || event.occurredAt > existing.occurredAt) {
      latestByThread.set(event.threadId, event);
    }
  }

  return [...latestByThread.values()]
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .slice(0, 25)
    .map((event) => ({
      threadId: event.threadId,
      workspaceId: event.workspaceId,
      clientProfileId: event.clientProfileId,
      path: event.path,
      lastStep: event.step,
      lastEventKey: event.eventKey,
      occurredAt: event.occurredAt.toISOString(),
    }));
}

export function buildGuidedFlowFunnelSummary(
  events: AssistantGuidedFlowEvent[]
): GuidedFlowFunnelSummary {
  const startsByPath = uniqueThreadsByPathEvent(events, "guided_flow_started");
  const completionsByPath = uniqueThreadsByPathEvent(events, "guided_flow_completed");
  const abandonmentsByPath = uniqueThreadsByPathEvent(events, "guided_flow_abandoned");
  const failuresByPath = uniqueThreadsByPathEvent(events, "guided_action_failed");
  const blockedByPath = uniqueThreadsByPathEvent(events, "guided_action_blocked");

  const pathFunnel: GuidedPathFunnelRow[] = TRACKED_PATHS.map((path) => {
    const starts = startsByPath.get(path)?.size ?? 0;
    const completions = completionsByPath.get(path)?.size ?? 0;
    const explicitAbandonments = abandonmentsByPath.get(path)?.size ?? 0;
    return {
      path,
      starts,
      completions,
      abandonments: explicitAbandonments,
      failures: failuresByPath.get(path)?.size ?? 0,
      blocked: blockedByPath.get(path)?.size ?? 0,
    };
  });

  const observedStarts = pathFunnel.reduce((sum, row) => sum + row.starts, 0);
  const eventKeysObserved = [...new Set(events.map((event) => event.eventKey))].sort();
  const pathsWithStarts = TRACKED_PATHS.filter(
    (path) => (startsByPath.get(path)?.size ?? 0) > 0
  );
  const actionEventsObserved = GUIDED_FLOW_ACTION_EVENT_KEYS.filter((eventKey) =>
    eventKeysObserved.includes(eventKey)
  );

  return {
    implementationCoverage: {
      telemetryEnabled:
        GUIDED_FLOW_CORE_EVENT_KEYS.every((eventKey) =>
          eventKeysObserved.includes(eventKey)
        ) && pathsWithStarts.length === TRACKED_PATHS.length,
      pathsCovered: pathsWithStarts,
      eventKeysObserved,
      actionEventsObserved,
    },
    operationalEvidence: {
      sampleSufficient: observedStarts >= GUIDED_FLOW_OPERATIONAL_MIN_SAMPLE,
      minSampleThreshold: GUIDED_FLOW_OPERATIONAL_MIN_SAMPLE,
      observedStarts,
      note: observedStarts >= GUIDED_FLOW_OPERATIONAL_MIN_SAMPLE
        ? "Operational sample meets minimum threshold for funnel interpretation."
        : "Insufficient operational sample — funnel counts reflect implementation coverage only.",
    },
    pathFunnel,
    stepDropoff: aggregateStepDropoff(events),
    topBlockers: aggregateTopBlockers(events),
    investigationLinks: buildInvestigationLinks(events),
    totals: { events: events.length },
  };
}
