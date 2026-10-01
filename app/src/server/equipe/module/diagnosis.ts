// Free diagnosis commands (ticket 08). The consumer of the `equipe.handoff.diagnose`
// intent calls claim/record/fail as the system; the approver can retry a failed
// run or reopen the source after an "insufficient" diagnosis.
//
// Idempotency is durable and per task intent: a redelivery, a resumed step or a
// second record never creates a second document or a second `diagnostic.recorded`.

import { err, ok, type Result } from "../domain";
import { DIAGNOSTIC_RECORDED_EVENT } from "../agents/free-budget";
import { HANDOFF_DIAGNOSE_EVENT } from "../handoff/contract";
import {
  DIAGNOSIS_AUTHOR_ROLE, DIAGNOSIS_FAILED_EVENT, DIAGNOSIS_KIND, DIAGNOSIS_MAX_INTENTS, DIAGNOSIS_READ_LIMIT,
  DIAGNOSIS_REOPENED_EVENT, DIAGNOSIS_RETRYABLE_CODES, DIAGNOSIS_STARTED_EVENT, type DiagnosisCommand,
} from "../handoff/diagnosis-contract";
import { sourceCorrectionRequirementUsdCents } from "../agents/free-balance";
import { assembleDiagnosis, buildDiagnosisInput, diagnosisInformed, hasEnoughPublicText } from "../handoff/diagnosis";
import { diagnoseIntents as intentsOf, eventsFor as eventsOf } from "../handoff/diagnosis-state";
import type { EquipeModuleDeps } from "./ports";
import { appendEvent, requestNotification, scopeOf, transact, type CommandContext, type TxBase } from "./shared";
import { requestTask } from "./task-outbox";
import { authorizeAccountExecution } from "./execution-authorization";

type Payload = Record<string, unknown>;
const payloadOf = (event: { payload: unknown }) => (event.payload ?? {}) as Payload;

async function diagnosisDocuments(ctx: CommandContext) {
  return (await ctx.repos.documents.list(scopeOf(ctx))).filter(doc => doc.kind === DIAGNOSIS_KIND).sort((a, b) => a.version - b.version);
}

const readingOf = (doc: { content: Record<string, unknown> }) => (doc.content.meta as { readingId?: string } | undefined)?.readingId;

/** A diagnose intent of the current reading; the handoff must be confirmed and the intent must be its own. */
async function currentRun(ctx: CommandContext, taskIntentId: string) {
  const scope = scopeOf(ctx);
  const [handoff] = await ctx.repos.handoffs.list(scope);
  const intent = await ctx.repos.taskOutbox.get(scope, taskIntentId);
  const data = (intent?.data ?? {}) as { handoffId?: string; readingId?: string };
  if (intent?.eventName !== HANDOFF_DIAGNOSE_EVENT || !handoff || handoff.step !== "done" || !handoff.readingId
    || handoff.id !== data.handoffId || handoff.readingId !== data.readingId) return null;
  return { handoff, readingId: handoff.readingId };
}

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
        const remaining = await deps.freeBudget?.remainingUsdCents(scope);
        if (remaining === undefined || remaining < sourceCorrectionRequirementUsdCents()) return err("insufficient_balance", "The free AI balance does not cover a new reading and diagnosis.");
        const version = handoff.version + 1;
        await ctx.repos.handoffs.update(scope, handoff.id, { step: "source", version });
        // Until its successor is recorded, this diagnosis no longer releases the reserve nor unlocks the plan card.
        await appendEvent(ctx, { eventType: DIAGNOSIS_REOPENED_EVENT, objectType: "document", objectId: recorded!.id, payload: { documentId: recorded!.id } });
        await appendEvent(ctx, { eventType: "handoff.card", objectType: "handoff", objectId: handoff.id, payload: { step: "source" } });
        return ok({ handoffId: handoff.id, step: "source", version });
      }
      if (recorded) return err("invalid_transition", "The diagnosis is already recorded.");
      const intents = await diagnoseIntents(ctx, handoff.readingId);
      const latest = intents.at(-1);
      const failure = latest ? (await eventsFor(ctx, DIAGNOSIS_FAILED_EVENT, latest.id))[0] : undefined;
      if (!latest || !failure) return err("invalid_transition", "There is no failed diagnosis to retry.");
      if (!payloadOf(failure).retryable || intents.length >= DIAGNOSIS_MAX_INTENTS) return err("diagnosis_retry_limit", "This diagnosis cannot be retried.");
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
      const intents = await diagnoseIntents(ctx, run.readingId);
      const retryable = (DIAGNOSIS_RETRYABLE_CODES as readonly string[]).includes(code) && intents.length < DIAGNOSIS_MAX_INTENTS;
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
