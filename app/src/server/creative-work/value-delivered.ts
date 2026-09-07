import type { BetaAnalyticsEvent } from "@/server/db/schema";
import {
  canonicalCreativeWorkOrigin,
  type CanonicalCreativeWorkOrigin,
} from "./funnel-events";

export type SelectedPieceRow = {
  workspaceId: string;
  outputId: string;
  outputKey: string;
};

export type ValueDeliveredSlice = {
  selectedPieces: number;
  deliveredPieces: number;
};

export type ValueDeliveredOriginRow = ValueDeliveredSlice & {
  origin: CanonicalCreativeWorkOrigin;
};

export type ValueDeliveredProtocolRow = ValueDeliveredSlice & {
  protocol: string;
};

export type ValueDeliveredReconcile = {
  selectedFromDatabase: number;
  selectedFromEvents: number;
  missingFromEvents: number;
  orphanedFromEvents: number;
};

export type ValueDeliveredWeek = ValueDeliveredSlice & {
  workspaceId: string;
  weekStart: string;
  byOrigin: ValueDeliveredOriginRow[];
  byProtocol: ValueDeliveredProtocolRow[];
};

export type ValueDeliveredSummary = ValueDeliveredSlice & {
  weeks: ValueDeliveredWeek[];
  byOrigin: ValueDeliveredOriginRow[];
  byProtocol: ValueDeliveredProtocolRow[];
  reconcile: ValueDeliveredReconcile | null;
};

type PieceRef = {
  workspaceId: string;
  weekStart: string;
  origin: CanonicalCreativeWorkOrigin;
  protocol: string;
  creativeWorkId: string | null;
  outputId: string | null;
  outputKey: string | null;
  identity: string;
};

function propString(event: BetaAnalyticsEvent, key: string): string | null {
  const value = event.properties?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Monday UTC date `YYYY-MM-DD` for weekly buckets. */
export function utcWeekStart(date: Date): string {
  const day = date.getUTCDay() || 7;
  const monday = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - (day - 1),
  ));
  return monday.toISOString().slice(0, 10);
}

export function pieceVersionIdentity(input: {
  outputId?: string | null;
  outputKey?: string | null;
  creativeWorkId?: string | null;
}): string | null {
  if (input.outputId) return `out:${input.outputId}:${input.outputKey ?? ""}`;
  if (input.creativeWorkId) return `work:${input.creativeWorkId}`;
  return null;
}

function refsFromEvents(
  events: BetaAnalyticsEvent[],
  eventKey: "creative_work_approved" | "creative_work_delivered",
): PieceRef[] {
  const refs: PieceRef[] = [];
  for (const event of events) {
    if (event.eventKey !== eventKey) continue;
    const creativeWorkId = propString(event, "creativeWorkId");
    const outputId = propString(event, "outputId");
    const outputKey = propString(event, "outputKey");
    const identity = pieceVersionIdentity({ outputId, outputKey, creativeWorkId });
    if (!identity) continue;
    refs.push({
      workspaceId: event.workspaceId,
      weekStart: utcWeekStart(event.createdAt),
      origin: canonicalCreativeWorkOrigin(propString(event, "origin")),
      protocol: propString(event, "protocol") ?? "unknown",
      creativeWorkId,
      outputId,
      outputKey,
      identity,
    });
  }
  return collapseWorkLevelWhenOutputExists(refs);
}

function collapseWorkLevelWhenOutputExists(refs: PieceRef[]): PieceRef[] {
  const outputLevelWorks = new Set(
    refs
      .filter((ref) => ref.outputId && ref.creativeWorkId)
      .map((ref) => `${ref.workspaceId}:${ref.creativeWorkId}`),
  );
  return refs.filter((ref) => {
    if (ref.outputId || !ref.creativeWorkId) return true;
    return !outputLevelWorks.has(`${ref.workspaceId}:${ref.creativeWorkId}`);
  });
}

function uniqueIdentities(refs: PieceRef[]): Set<string> {
  return new Set(refs.map((ref) => `${ref.workspaceId}:${ref.weekStart}:${ref.identity}`));
}

function countUnique(refs: PieceRef[]): number {
  return uniqueIdentities(refs).size;
}

function groupByOrigin(refs: PieceRef[]): ValueDeliveredOriginRow[] {
  const origins: CanonicalCreativeWorkOrigin[] = ["campaign", "assistant", "studio"];
  return origins
    .map((origin) => ({
      origin,
      selectedPieces: countUnique(refs.filter((ref) => ref.origin === origin)),
      deliveredPieces: 0,
    }))
    .filter((row) => row.selectedPieces > 0);
}

function groupByProtocol(refs: PieceRef[]): ValueDeliveredProtocolRow[] {
  const protocols = [...new Set(refs.map((ref) => ref.protocol))].sort();
  return protocols
    .map((protocol) => ({
      protocol,
      selectedPieces: countUnique(refs.filter((ref) => ref.protocol === protocol)),
      deliveredPieces: 0,
    }))
    .filter((row) => row.selectedPieces > 0);
}

function mergeSlices<T extends ValueDeliveredOriginRow | ValueDeliveredProtocolRow>(
  selected: T[],
  delivered: T[],
  key: T extends ValueDeliveredOriginRow ? "origin" : "protocol",
): T[] {
  const keys = new Set([
    ...selected.map((row) => String(row[key as keyof T])),
    ...delivered.map((row) => String(row[key as keyof T])),
  ]);
  return [...keys]
    .sort()
    .map((value) => {
      const selectedRow = selected.find((row) => String(row[key as keyof T]) === value);
      const deliveredRow = delivered.find((row) => String(row[key as keyof T]) === value);
      return {
        [key]: value,
        selectedPieces: selectedRow?.selectedPieces ?? 0,
        deliveredPieces: deliveredRow?.selectedPieces ?? 0,
      } as T;
    });
}

function reconcileSelected(
  selectedRefs: PieceRef[],
  selectedFromDatabase?: SelectedPieceRow[],
): ValueDeliveredReconcile | null {
  if (!selectedFromDatabase) return null;
  const eventKeys = new Set(
    selectedRefs
      .filter((ref) => ref.outputId)
      .map((ref) => `${ref.workspaceId}:${ref.outputId}:${ref.outputKey ?? ""}`),
  );
  const dbKeys = new Set(
    selectedFromDatabase.map((row) => `${row.workspaceId}:${row.outputId}:${row.outputKey}`),
  );
  let missingFromEvents = 0;
  let orphanedFromEvents = 0;
  for (const key of dbKeys) if (!eventKeys.has(key)) missingFromEvents += 1;
  for (const key of eventKeys) if (!dbKeys.has(key)) orphanedFromEvents += 1;
  return {
    selectedFromDatabase: dbKeys.size,
    selectedFromEvents: eventKeys.size,
    missingFromEvents,
    orphanedFromEvents,
  };
}

export function aggregateValueDelivered(
  events: BetaAnalyticsEvent[],
  selectedFromDatabase?: SelectedPieceRow[],
): ValueDeliveredSummary {
  const selectedRefs = refsFromEvents(events, "creative_work_approved");
  const deliveredRefs = refsFromEvents(events, "creative_work_delivered");

  const weekKeys = new Map<string, { workspaceId: string; weekStart: string }>();
  for (const ref of [...selectedRefs, ...deliveredRefs]) {
    weekKeys.set(`${ref.workspaceId}:${ref.weekStart}`, {
      workspaceId: ref.workspaceId,
      weekStart: ref.weekStart,
    });
  }

  const weeks: ValueDeliveredWeek[] = [...weekKeys.values()]
    .sort((left, right) => left.workspaceId.localeCompare(right.workspaceId) || left.weekStart.localeCompare(right.weekStart))
    .map(({ workspaceId, weekStart }) => {
      const weekSelected = selectedRefs.filter((ref) => ref.workspaceId === workspaceId && ref.weekStart === weekStart);
      const weekDelivered = deliveredRefs.filter((ref) => ref.workspaceId === workspaceId && ref.weekStart === weekStart);
      return {
        workspaceId,
        weekStart,
        selectedPieces: countUnique(weekSelected),
        deliveredPieces: countUnique(weekDelivered),
        byOrigin: mergeSlices(
          groupByOrigin(weekSelected),
          groupByOrigin(weekDelivered),
          "origin",
        ),
        byProtocol: mergeSlices(
          groupByProtocol(weekSelected),
          groupByProtocol(weekDelivered),
          "protocol",
        ),
      };
    });

  return {
    selectedPieces: countUnique(selectedRefs),
    deliveredPieces: countUnique(deliveredRefs),
    weeks,
    byOrigin: mergeSlices(
      groupByOrigin(selectedRefs),
      groupByOrigin(deliveredRefs),
      "origin",
    ),
    byProtocol: mergeSlices(
      groupByProtocol(selectedRefs),
      groupByProtocol(deliveredRefs),
      "protocol",
    ),
    reconcile: reconcileSelected(selectedRefs, selectedFromDatabase),
  };
}

export const EMPTY_VALUE_DELIVERED: ValueDeliveredSummary = {
  selectedPieces: 0,
  deliveredPieces: 0,
  weeks: [],
  byOrigin: [],
  byProtocol: [],
  reconcile: null,
};
