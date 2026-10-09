// Where a free diagnosis stands, read from what the account persisted: the diagnose runs of a reading,
// their final failures and whether the brand reading can still move. The reserve and the plan-card gate
// (agents/free-budget.ts) follow it, so it never writes and takes no clock.

import type { AccountScope, EquipeRepositories } from "../data";
import type { HandoffState } from "../domain/handoff";
import { HANDOFF_DIAGNOSE_EVENT } from "./contract";
import { DIAGNOSIS_ATTEMPT_EVENT, DIAGNOSIS_BUDGET_EXCEEDED_CODE, DIAGNOSIS_FAILED_EVENT, DIAGNOSIS_KIND, DIAGNOSIS_MONTHLY_BUDGET_EXCEEDED_CODE, DIAGNOSIS_READ_LIMIT } from "./diagnosis-contract";

type Payload = Record<string, unknown>;
const payloadOf = (event: { payload: unknown }) => (event.payload ?? {}) as Payload;

/** The diagnosis documents of the account, oldest version first. */
export async function diagnosisDocuments(repos: EquipeRepositories, scope: AccountScope) {
  return (await repos.documents.list(scope)).filter(doc => doc.kind === DIAGNOSIS_KIND).sort((a, b) => a.version - b.version);
}

/** The reading a diagnosis document was written for. */
export const readingOf = (doc: { content: Record<string, unknown> }) => (doc.content.meta as { readingId?: string } | undefined)?.readingId;

/** A diagnose intent of the current reading of a confirmed brand: the handoff must be `done` and the intent must be its own. */
export async function currentRun(repos: EquipeRepositories, scope: AccountScope, taskIntentId: string) {
  const [handoff] = await repos.handoffs.list(scope);
  const intent = await repos.taskOutbox.get(scope, taskIntentId);
  const data = (intent?.data ?? {}) as { handoffId?: string; readingId?: string };
  if (intent?.eventName !== HANDOFF_DIAGNOSE_EVENT || !handoff || handoff.step !== "done" || !handoff.readingId
    || handoff.id !== data.handoffId || handoff.readingId !== data.readingId) return null;
  return { handoff, readingId: handoff.readingId };
}

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

/** Every admission start needs its own durable monthly refusal proof; uncertainty consumes a provider intent. */
export async function diagnosisIntentWasMonthlyOnly(repos: EquipeRepositories, scope: AccountScope, taskIntentId: string) {
  const attempts = await eventsFor(repos, scope, DIAGNOSIS_ATTEMPT_EVENT, taskIntentId);
  const started = attempts.filter(event => payloadOf(event).code === "admission_started");
  const refused = new Set(attempts.filter(event => payloadOf(event).code === DIAGNOSIS_MONTHLY_BUDGET_EXCEEDED_CODE).map(event => event.objectId));
  return started.length > 0 && started.every(event => event.objectId !== null && refused.has(event.objectId));
}

/** Pure monthly admission refusals never reached a provider and do not spend the provider retry allowance. */
export async function diagnosisProviderIntentCount(repos: EquipeRepositories, scope: AccountScope, readingId: string) {
  const intents = await diagnoseIntents(repos, scope, readingId);
  const monthlyRefusals = new Set((await repos.events.list(scope, { eventType: DIAGNOSIS_FAILED_EVENT }))
    .filter(event => payloadOf(event).code === DIAGNOSIS_MONTHLY_BUDGET_EXCEEDED_CODE)
    .map(event => payloadOf(event).taskIntentId));
  const consumed = await Promise.all(intents.map(async intent => !monthlyRefusals.has(intent.id)
    || !(await diagnosisIntentWasMonthlyOnly(repos, scope, intent.id))));
  return consumed.filter(Boolean).length;
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
 * The diagnosis of the current reading failed for good because the free AI credit ended, and nothing was recorded for the reading. Nothing will ever
 * record it and the free conversation cannot run either, so the person needs a way out that does not depend on a model (ticket 13, D-12).
 */
export async function diagnosisBlockedByBudget(repos: EquipeRepositories, scope: AccountScope) {
  const [handoff] = await repos.handoffs.list(scope);
  if (!handoff || handoff.step !== "done" || !handoff.readingId) return false;
  if ((await diagnosisDocuments(repos, scope)).some(doc => readingOf(doc) === handoff.readingId)) return false;
  const latest = (await diagnoseIntents(repos, scope, handoff.readingId)).at(-1);
  if (!latest) return false;
  const failure = (await eventsFor(repos, scope, DIAGNOSIS_FAILED_EVENT, latest.id))[0];
  return failure !== undefined && !payloadOf(failure).retryable && payloadOf(failure).code === DIAGNOSIS_BUDGET_EXCEEDED_CODE;
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
  if (!handoff.readingId) return false;
  // Back at "done" on a reading that already has its own diagnosis: the person gave up the correction, nothing is pending.
  if ((await diagnosisDocuments(repos, scope)).some(doc => readingOf(doc) === handoff.readingId)) return false;
  return !(await diagnosisFailedForGood(repos, scope, handoff.readingId));
}
