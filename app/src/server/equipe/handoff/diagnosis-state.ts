// Where a free diagnosis stands, read from what the account persisted: the diagnose runs of a reading,
// their final failures and whether the brand reading can still move. The reserve and the plan-card gate
// (agents/free-budget.ts) follow it, so it never writes and takes no clock.

import type { AccountScope, EquipeRepositories } from "../data";
import type { HandoffState } from "../domain/handoff";
import { HANDOFF_DIAGNOSE_EVENT } from "./contract";
import { DIAGNOSIS_FAILED_EVENT, DIAGNOSIS_READ_LIMIT } from "./diagnosis-contract";

type Payload = Record<string, unknown>;
const payloadOf = (event: { payload: unknown }) => (event.payload ?? {}) as Payload;

/** Diagnose intents requested for one reading, oldest first. */
export async function diagnoseIntents(repos: EquipeRepositories, scope: AccountScope, readingId: string) {
  return (await repos.events.list(scope, { eventType: "task.requested" }))
    .filter(event => {
      const requested = payloadOf(event) as { eventName?: string; data?: { readingId?: string } };
      return requested.eventName === HANDOFF_DIAGNOSE_EVENT && requested.data?.readingId === readingId;
    })
    // Stable sort: events of the same instant keep the repository's insertion order.
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}

/** Events of one type that belong to one task intent. */
export async function eventsFor(repos: EquipeRepositories, scope: AccountScope, eventType: string, taskIntentId: string) {
  return (await repos.events.list(scope, { eventType })).filter(event => payloadOf(event).taskIntentId === taskIntentId);
}

/** The brand steps cannot move on: no reading is running and none is left to start. */
export function isReadingStuck(handoff: Pick<HandoffState, "step" | "readsUsed" | "reading">) {
  return (handoff.step === "reading" || handoff.step === "source") && handoff.readsUsed >= DIAGNOSIS_READ_LIMIT
    && !Object.values(handoff.reading).some(run => run?.status === "pending" || run?.status === "running");
}

/** The latest diagnose run of the reading failed and no retry is left for it. */
export async function diagnosisFailedForGood(repos: EquipeRepositories, scope: AccountScope, readingId: string) {
  const latest = (await diagnoseIntents(repos, scope, readingId)).at(-1);
  if (!latest) return false;
  const failure = (await eventsFor(repos, scope, DIAGNOSIS_FAILED_EVENT, latest.id))[0];
  return failure !== undefined && !payloadOf(failure).retryable;
}

/**
 * Whether the replacement of a diagnosis the person sent back (`diagnosis.reopened`) can still end in a new
 * diagnosis. It cannot when the reading ran out of attempts without moving on, or when the replacement diagnosis
 * failed for good: nothing will ever record it, so the earlier diagnosis has to count again.
 */
export async function replacementCanStillSucceed(repos: EquipeRepositories, scope: AccountScope) {
  const [handoff] = await repos.handoffs.list(scope);
  if (!handoff) return false;
  if (handoff.step !== "done") return !isReadingStuck(handoff);
  return handoff.readingId ? !(await diagnosisFailedForGood(repos, scope, handoff.readingId)) : false;
}
