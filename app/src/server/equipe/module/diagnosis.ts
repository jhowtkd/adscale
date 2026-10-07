// Free diagnosis commands (ticket 08). The consumer of the `equipe.handoff.diagnose`
// intent calls claim/record/fail as the system; the approver can retry a failed
// run or reopen the source after an "insufficient" diagnosis.
//
// Idempotency is durable and per task intent: a redelivery, a resumed step or a
// second record never creates a second document or a second `diagnostic.recorded`.

import { monthKey } from "../domain/calendar";
import { err, ok, type Result } from "../domain";
import { transitionHandoff } from "../domain/handoff";
import { DIAGNOSTIC_RECORDED_EVENT } from "../agents/free-budget";
import { HANDOFF_DIAGNOSE_EVENT } from "../handoff/contract";
import {
  DIAGNOSIS_ATTEMPT_EVENT, DIAGNOSIS_AUTHOR_ROLE, DIAGNOSIS_FAILED_EVENT, DIAGNOSIS_KIND, DIAGNOSIS_MAX_INTENTS, DIAGNOSIS_READ_LIMIT,
  DIAGNOSIS_MONTHLY_BUDGET_EXCEEDED_CODE, DIAGNOSIS_REOPENED_EVENT, DIAGNOSIS_RESTORED_EVENT, DIAGNOSIS_RETRYABLE_CODES, DIAGNOSIS_STARTED_EVENT, type DiagnosisCommand,
} from "../handoff/diagnosis-contract";
import { sourceCorrectionRequirementUsdCents } from "../agents/free-balance";
import { assembleDiagnosis, buildDiagnosisInput, diagnosisInformed, hasEnoughPublicText } from "../handoff/diagnosis";
import { diagnosisIntentWasMonthlyOnly, diagnosisProviderIntentCount, currentRun as runOf, diagnoseIntents as intentsOf, diagnosisDocuments as documentsOf, eventsFor as eventsOf, readingOf } from "../handoff/diagnosis-state";
import type { EquipeModuleDeps } from "./ports";
import { accountOnFreePlan } from "./free-plan";
import { appendEvent, requestNotification, scopeOf, transact, type CommandContext, type TxBase } from "./shared";
import { requestTask } from "./task-outbox";
import { authorizeAccountExecution } from "./execution-authorization";

type Payload = Record<string, unknown>;
const payloadOf = (event: { payload: unknown }) => (event.payload ?? {}) as Payload;

const diagnosisDocuments = (ctx: CommandContext) => documentsOf(ctx.repos, scopeOf(ctx));
const currentRun = (ctx: CommandContext, taskIntentId: string) => runOf(ctx.repos, scopeOf(ctx), taskIntentId);

const diagnoseIntents = (ctx: CommandContext, readingId: string) => intentsOf(ctx.repos, scopeOf(ctx), readingId);
const eventsFor = (ctx: CommandContext, eventType: string, taskIntentId: string) => eventsOf(ctx.repos, scopeOf(ctx), eventType, taskIntentId);

function requireDiagnosisJob(ctx: CommandContext): Result<never> | null {
  return ctx.actor.kind === "system" && ctx.actor.job === HANDOFF_DIAGNOSE_EVENT ? null
    : err<never>("forbidden_actor", "Only the diagnosis task records its run.");
}

export async function runDiagnosisCommand(deps: EquipeModuleDeps, base: TxBase, command: DiagnosisCommand) {
  return transact(deps, base, async ctx => {
    const scope = scopeOf(ctx);
    const account = await ctx.repos.accounts.get(ctx.workspaceId, ctx.accountId, { forUpdate: true });
    if (!account) return err("unknown_account", "Unknown account.");

    if (command.type === "diagnosis_restore_previous") {
      const [handoff] = await ctx.repos.handoffs.list(scope);
      if (!handoff) return err("invalid_transition", "No brand handoff for this account.");
      if (command.payload.expectedVersion !== undefined && command.payload.expectedVersion !== handoff.version) return err("stale_version", "The brand step changed. Reload the card.");
      // Only the diagnosis of the reading the correction left untouched (no new reading started) can come back.
      const recorded = (await diagnosisDocuments(ctx)).find(doc => readingOf(doc) === handoff.readingId);
      const reopened = recorded ? (await ctx.repos.events.list(scope, { eventType: DIAGNOSIS_REOPENED_EVENT })).some(event => payloadOf(event).documentId === recorded.id) : false;
      if (!recorded || !reopened) return err("invalid_transition", "There is no earlier diagnosis to go back to.");
      const next = transitionHandoff({ ...handoff }, "restore");
      if (!next.ok) return next;
      await ctx.repos.handoffs.update(scope, handoff.id, { step: next.value.step, version: next.value.version });
      // The reading was never touched, so no read is spent and the earlier diagnosis counts again (hasRecordedDiagnostic).
      await appendEvent(ctx, { eventType: DIAGNOSIS_RESTORED_EVENT, objectType: "document", objectId: recorded.id, payload: { documentId: recorded.id } });
      return ok({ handoffId: handoff.id, step: next.value.step, version: next.value.version, documentId: recorded.id });
    }

    if (command.type === "diagnosis_retry" || command.type === "diagnosis_correct_source") {
      const [handoff] = await ctx.repos.handoffs.list(scope);
      if (!handoff || handoff.step !== "done" || !handoff.readingId) return err("invalid_transition", "The brand is not confirmed yet.");
      const documents = await diagnosisDocuments(ctx);
      const recorded = documents.find(doc => readingOf(doc) === handoff.readingId);
      if (command.type === "diagnosis_correct_source") {
        // Only an honest "insufficient" diagnosis reopens the source; a complete one has nothing to fix.
        if ((recorded?.content as { status?: string } | undefined)?.status !== "insufficient") return err("invalid_transition", "Only an insufficient diagnosis reopens the source.");
        if (handoff.readsUsed >= DIAGNOSIS_READ_LIMIT) return err("reading_limit", "No readings left to correct the source.");
        // The insufficient document released the reserve: re-reserve under the strict cap. The balance must cover one
        // more reading and the diagnosis after it, or nothing starts (the chat says so, without calling a model).
        // The lifetime balance is the free plan's (spec 2026-10-07 §3): a paying workspace's brand reads on its monthly budget.
        if (await accountOnFreePlan(deps, scope)) {
          const remaining = await deps.freeBudget?.remainingUsdCents(scope);
          if (remaining === undefined || remaining < sourceCorrectionRequirementUsdCents()) return err("insufficient_balance", "The free AI balance does not cover a new reading and diagnosis.");
        }
        // The brand step only moves through the handoff state machine (ticket 04).
        const next = transitionHandoff({ ...handoff }, "reopen");
        if (!next.ok) return next;
        await ctx.repos.handoffs.update(scope, handoff.id, { step: next.value.step, version: next.value.version });
        // While its replacement can still be recorded, this diagnosis no longer releases the reserve nor unlocks the plan card.
        await appendEvent(ctx, { eventType: DIAGNOSIS_REOPENED_EVENT, objectType: "document", objectId: recorded!.id, payload: { documentId: recorded!.id } });
        await appendEvent(ctx, { eventType: "handoff.card", objectType: "handoff", objectId: handoff.id, payload: { step: next.value.step } });
        return ok({ handoffId: handoff.id, step: next.value.step, version: next.value.version });
      }
      if (recorded) return err("invalid_transition", "The diagnosis is already recorded.");
      const intents = await diagnoseIntents(ctx, handoff.readingId);
      const latest = intents.at(-1);
      const failure = latest ? (await eventsFor(ctx, DIAGNOSIS_FAILED_EVENT, latest.id))[0] : undefined;
      if (!latest || !failure) return err("invalid_transition", "There is no failed diagnosis to retry.");
      if (!payloadOf(failure).retryable
        || await diagnosisProviderIntentCount(ctx.repos, scope, handoff.readingId) >= DIAGNOSIS_MAX_INTENTS) return err("diagnosis_retry_limit", "This diagnosis cannot be retried.");
      if (payloadOf(failure).code === DIAGNOSIS_MONTHLY_BUDGET_EXCEEDED_CODE) {
        // A resumed fail step may persist after the reset: the proven refusal's month,
        // rather than that late failure write, is the month that actually exhausted.
        const refusedAt = (await eventsFor(ctx, DIAGNOSIS_ATTEMPT_EVENT, latest.id))
          .filter(event => payloadOf(event).code === DIAGNOSIS_MONTHLY_BUDGET_EXCEEDED_CODE).at(-1)?.occurredAt ?? failure.occurredAt;
        if (monthKey(refusedAt) === monthKey(ctx.now)) return err(DIAGNOSIS_MONTHLY_BUDGET_EXCEEDED_CODE, "Retry after the next Sao Paulo month starts.");
      }
      const intent = await requestTask(ctx, { eventName: HANDOFF_DIAGNOSE_EVENT, data: { handoffId: handoff.id, readingId: handoff.readingId } });
      return ok({ taskIntentId: intent.id });
    }

    const refused = requireDiagnosisJob(ctx);
    if (refused) return refused;
    const { taskIntentId } = command.payload;

    if (command.type === "diagnosis_claim") {
      // A suspended or closed account runs nothing; the caller records the reason.
      const allowed = await authorizeAccountExecution(ctx.repos, scope);
      if (!allowed.ok) return ok({ claimed: false, reason: allowed.error.code });
      const run = await currentRun(ctx, taskIntentId);
      if (!run) return ok({ claimed: false, reason: "stale" });
      if ((await diagnosisDocuments(ctx)).some(doc => readingOf(doc) === run.readingId)) return ok({ claimed: false, reason: "already_recorded" });
      if ((await eventsFor(ctx, DIAGNOSIS_FAILED_EVENT, taskIntentId)).length) return ok({ claimed: false, reason: "already_failed" });
      // The "building" line shows once per run; a resumed run claims again without repeating it.
      if (!(await eventsFor(ctx, DIAGNOSIS_STARTED_EVENT, taskIntentId)).length) {
        await appendEvent(ctx, { eventType: DIAGNOSIS_STARTED_EVENT, objectType: "handoff", objectId: run.handoff.id, payload: { taskIntentId } });
      }
      return ok({ claimed: true });
    }

    const run = await currentRun(ctx, taskIntentId);
    if (!run) return ok({ ignored: true, reason: "stale" });
    const documents = await diagnosisDocuments(ctx);
    const existing = documents.find(doc => readingOf(doc) === run.readingId);
    if (existing) return ok({ ignored: true, duplicate: true, documentId: existing.id });

    if (command.type === "diagnosis_fail") {
      if ((await eventsFor(ctx, DIAGNOSIS_FAILED_EVENT, taskIntentId)).length) return ok({ ignored: true, duplicate: true });
      const { code } = command.payload;
      const monthly = code === DIAGNOSIS_MONTHLY_BUDGET_EXCEEDED_CODE;
      // The current intent has not yet failed: exclude it only for a pure monthly refusal.
      const monthlyOnly = monthly && await diagnosisIntentWasMonthlyOnly(ctx.repos, scope, taskIntentId);
      const providerIntents = await diagnosisProviderIntentCount(ctx.repos, scope, run.readingId) - (monthlyOnly ? 1 : 0);
      const retryable = (monthly || (DIAGNOSIS_RETRYABLE_CODES as readonly string[]).includes(code)) && providerIntents < DIAGNOSIS_MAX_INTENTS;
      await appendEvent(ctx, { eventType: DIAGNOSIS_FAILED_EVENT, objectType: "handoff", objectId: run.handoff.id, payload: { taskIntentId, code, retryable } });
      return ok({ failed: true, retryable });
    }

    // diagnosis_record
    const allowed = await authorizeAccountExecution(ctx.repos, scope);
    if (!allowed.ok) return err(allowed.error.code, allowed.error.message);
    if ((await eventsFor(ctx, DIAGNOSIS_FAILED_EVENT, taskIntentId)).length) return ok({ ignored: true, reason: "already_failed" });
    const { output, model, promptVersion } = command.payload;
    const input = buildDiagnosisInput(run.handoff);
    // Skipping the model is only honest when there really was too little public text.
    if (output === null && hasEnoughPublicText(input)) return err("invalid_command", "A model answer is required for this content.");
    const content = assembleDiagnosis({
      input, output, brand: run.handoff.decisions.identity?.name.value ?? null,
      meta: { readingId: run.readingId, taskIntentId, model, promptVersion }, informed: diagnosisInformed(run.handoff),
    });
    const version = (documents.at(-1)?.version ?? 0) + 1;
    const document = await ctx.repos.documents.create(scope, {
      clientProfileId: account.clientProfileId, kind: DIAGNOSIS_KIND, version, content, createdByRole: DIAGNOSIS_AUTHOR_ROLE,
    });
    // SAME transaction as the document: this event is what releases the reserve and unlocks the plan card.
    await appendEvent(ctx, { eventType: DIAGNOSTIC_RECORDED_EVENT, objectType: "document", objectId: document.id, payload: { documentId: document.id } });
    await requestNotification(ctx, { recipientRole: "approver", templateKey: content.status === "insufficient" ? "diagnosis.insufficient" : "diagnosis.ready" });
    return ok({ documentId: document.id, version, status: content.status });
  });
}
