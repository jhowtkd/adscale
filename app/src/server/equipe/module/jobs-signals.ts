// Pending agent signals (#549): the read side of `ingest_agent_signal`.
// The signals job lists these per account and ingests each through the
// command; the discovery lives here, in the module, so the job stays a
// thin loop. A signal is pending while no escalation/exception opening
// references it as its source event.

import type {
  AccountScope,
  EquipeEvent,
  EquipeRepositories,
} from "../data";
import { ESCALATION_REQUESTED_EVENT } from "./item-shared";
import { ESCALATION_OPENED_EVENT } from "./escalations-shared";
import { SUPPORT_EXCEPTION_OPENED_EVENT } from "./exceptions";

export const TURN_FAILED_SIGNAL = "agent.turn_failed";
export const BUDGET_EXCEEDED_SIGNAL = "agent.budget_exceeded";

export const INGESTIBLE_SIGNAL_TYPES = [
  TURN_FAILED_SIGNAL,
  BUDGET_EXCEEDED_SIGNAL,
  ESCALATION_REQUESTED_EVENT,
] as const;

const INGEST_MARKER_TYPES = [ESCALATION_OPENED_EVENT, SUPPORT_EXCEPTION_OPENED_EVENT] as const;

function sourceEventIdOf(event: EquipeEvent): string | null {
  const payload = event.payload as { sourceEventId?: unknown } | null;
  return typeof payload?.sourceEventId === "string" ? payload.sourceEventId : null;
}

/**
 * Signal events with no ingest record yet, oldest first. Plain read, no
 * transaction — the ingest command re-checks inside its own transaction,
 * so a concurrent ingest only turns the later call into a duplicate.
 */
export async function pendingSignalEvents(
  repos: EquipeRepositories,
  scope: AccountScope,
): Promise<EquipeEvent[]> {
  // Sequential on purpose: repos may share one transaction client, where
  // parallel queries warn today and break in pg@9 (#574).
  const signals: EquipeEvent[] = [];
  for (const eventType of INGESTIBLE_SIGNAL_TYPES) {
    signals.push(...(await repos.events.list(scope, { eventType })));
  }
  const markers: EquipeEvent[] = [];
  for (const eventType of INGEST_MARKER_TYPES) {
    markers.push(...(await repos.events.list(scope, { eventType })));
  }
  const ingested = new Set<string>();
  for (const marker of markers) {
    const source = sourceEventIdOf(marker);
    if (source) ingested.add(source);
  }
  return signals
    .filter((signal) => !ingested.has(signal.id))
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}
