import type { AssistantArtifactIterationEvent } from "@/server/db/schema";
import {
  ARTIFACT_ITERATION_CORE_EVENT_KEYS,
  ARTIFACT_ITERATION_GENERATION_EVENT_KEYS,
  ARTIFACT_ITERATION_PROMOTION_EVENT_KEYS,
} from "@/server/assistant/artifact-iteration-telemetry";

export const ARTIFACT_ITERATION_OPERATIONAL_MIN_SAMPLE = 5;

const TRACKED_PATHS = [
  "plan_iteration",
  "creative_iteration",
  "compare_approve",
] as const;

const PATH_ORDER: Record<string, string[]> = {
  plan_iteration: ["propose", "confirm", "generate"],
  creative_iteration: ["propose", "confirm", "generate"],
  compare_approve: ["compare", "acknowledge", "promote"],
};

const PATH_START_EVENT: Record<(typeof TRACKED_PATHS)[number], string> = {
  plan_iteration: "proposal_created",
  creative_iteration: "proposal_created",
  compare_approve: "comparison_opened",
};

const PATH_COMPLETION_EVENT: Record<(typeof TRACKED_PATHS)[number], string> = {
  plan_iteration: "generation_succeeded",
  creative_iteration: "generation_succeeded",
  compare_approve: "promotion_succeeded",
};

const STEP_PROGRESS_EVENT: Record<string, Record<string, string>> = {
  plan_iteration: {
    propose: "proposal_created",
    confirm: "proposal_confirmed",
    generate: "generation_succeeded",
  },
  creative_iteration: {
    propose: "proposal_created",
    confirm: "proposal_confirmed",
    generate: "generation_succeeded",
  },
  compare_approve: {
    compare: "comparison_opened",
    acknowledge: "comparison_acknowledged",
    promote: "promotion_succeeded",
  },
};

export interface ArtifactIterationPathFunnelRow {
  path: (typeof TRACKED_PATHS)[number];
  starts: number;
  completions: number;
  stale: number;
  failures: number;
  conflicts: number;
}

export interface ArtifactIterationStepDropoffRow {
  path: string;
  step: string;
  views: number;
  dropoffs: number;
}

export interface ArtifactIterationReasonCodeRow {
  path: string;
  reasonCode: string;
  count: number;
}

export interface ArtifactIterationInvestigationRow {
  threadId: string;
  workspaceId: string;
  clientProfileId: string;
  path: string;
  lastStep: string;
  lastEventKey: string;
  occurredAt: string;
}

export interface ArtifactIterationFunnelSummary {
  implementationCoverage: {
    telemetryEnabled: boolean;
    pathsCovered: string[];
    eventKeysObserved: string[];
    generationEventsObserved: string[];
    promotionEventsObserved: string[];
  };
  operationalEvidence: {
    sampleSufficient: boolean;
    minSampleThreshold: number;
    observedStarts: number;
    note: string;
  };
  pathFunnel: ArtifactIterationPathFunnelRow[];
  stepDropoff: ArtifactIterationStepDropoffRow[];
  topReasonCodes: ArtifactIterationReasonCodeRow[];
  investigationLinks: ArtifactIterationInvestigationRow[];
  totals: { events: number };
}

function uniqueThreadsByPathEvent(
  events: AssistantArtifactIterationEvent[],
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
  events: AssistantArtifactIterationEvent[]
): ArtifactIterationStepDropoffRow[] {
  const views = new Map<string, number>();

  for (const path of TRACKED_PATHS) {
    const stepEvents = STEP_PROGRESS_EVENT[path] ?? {};
    for (const [step, eventKey] of Object.entries(stepEvents)) {
      const count = events.filter(
        (event) => event.path === path && event.eventKey === eventKey
      ).length;
      views.set(`${path}::${step}`, count);
    }
  }

  const rows: ArtifactIterationStepDropoffRow[] = [];

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

function aggregateTopReasonCodes(
  events: AssistantArtifactIterationEvent[]
): ArtifactIterationReasonCodeRow[] {
  const counts = new Map<string, number>();

  for (const event of events) {
    if (!event.reasonCode) continue;
    const key = `${event.path}::${event.reasonCode}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([key, count]) => {
      const [path, reasonCode] = key.split("::");
      return { path, reasonCode, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function buildInvestigationLinks(
  events: AssistantArtifactIterationEvent[]
): ArtifactIterationInvestigationRow[] {
  const latestByThread = new Map<string, AssistantArtifactIterationEvent>();

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

export function buildArtifactIterationFunnelSummary(
  events: AssistantArtifactIterationEvent[]
): ArtifactIterationFunnelSummary {
  const staleByPath = uniqueThreadsByPathEvent(events, "proposal_staled");
  const failuresByPath = uniqueThreadsByPathEvent(events, "generation_failed");
  const conflictsByPath = uniqueThreadsByPathEvent(events, "promotion_conflict");

  const pathFunnel: ArtifactIterationPathFunnelRow[] = TRACKED_PATHS.map((path) => {
    const startEvent = PATH_START_EVENT[path];
    const completionEvent = PATH_COMPLETION_EVENT[path];
    const starts = uniqueThreadsByPathEvent(events, startEvent).get(path)?.size ?? 0;
    const completions =
      uniqueThreadsByPathEvent(events, completionEvent).get(path)?.size ?? 0;

    return {
      path,
      starts,
      completions,
      stale: staleByPath.get(path)?.size ?? 0,
      failures: failuresByPath.get(path)?.size ?? 0,
      conflicts: conflictsByPath.get(path)?.size ?? 0,
    };
  });

  const observedStarts = pathFunnel.reduce((sum, row) => sum + row.starts, 0);
  const eventKeysObserved = [...new Set(events.map((event) => event.eventKey))].sort();
  const pathsWithStarts = TRACKED_PATHS.filter(
    (path) => (uniqueThreadsByPathEvent(events, PATH_START_EVENT[path]).get(path)?.size ?? 0) > 0
  );
  const generationEventsObserved = ARTIFACT_ITERATION_GENERATION_EVENT_KEYS.filter(
    (eventKey) => eventKeysObserved.includes(eventKey)
  );
  const promotionEventsObserved = ARTIFACT_ITERATION_PROMOTION_EVENT_KEYS.filter(
    (eventKey) => eventKeysObserved.includes(eventKey)
  );

  return {
    implementationCoverage: {
      telemetryEnabled:
        ARTIFACT_ITERATION_CORE_EVENT_KEYS.every((eventKey) =>
          eventKeysObserved.includes(eventKey)
        ) && pathsWithStarts.length === TRACKED_PATHS.length,
      pathsCovered: pathsWithStarts,
      eventKeysObserved,
      generationEventsObserved,
      promotionEventsObserved,
    },
    operationalEvidence: {
      sampleSufficient: observedStarts >= ARTIFACT_ITERATION_OPERATIONAL_MIN_SAMPLE,
      minSampleThreshold: ARTIFACT_ITERATION_OPERATIONAL_MIN_SAMPLE,
      observedStarts,
      note:
        observedStarts >= ARTIFACT_ITERATION_OPERATIONAL_MIN_SAMPLE
          ? "Operational sample meets minimum threshold for funnel interpretation."
          : "Insufficient operational sample — funnel counts reflect implementation coverage only.",
    },
    pathFunnel,
    stepDropoff: aggregateStepDropoff(events),
    topReasonCodes: aggregateTopReasonCodes(events),
    investigationLinks: buildInvestigationLinks(events),
    totals: { events: events.length },
  };
}
