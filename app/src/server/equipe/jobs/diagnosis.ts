// Inngest function `equipe-diagnosis-generate` (ticket 08): the consumer of the
// `equipe.handoff.diagnose` intent that the confirmed handoff writes to the outbox.
//
// One run per intent (concurrency 1 per account, 2 attempts). Every durable
// decision is a module command keyed by `taskIntentId`, so redelivery, a resumed
// step or a retry never pays or records twice. Nothing here decides: the model
// call goes through the free-account admission of the runner, and the result is
// verified and stored by `diagnosis_record` in ONE transaction with
// `diagnostic.recorded`.
//
// Registered in app/src/app/api/inngest/route.ts — no new route.

import { z } from "zod";
import type { FailureEventPayload } from "inngest";
import { inngest } from "@/server/jobs/client";
import { logger } from "@/lib/logger";
import { executeCommand } from "../module/commands";
import type { Agents, EquipeModuleDeps } from "../module/ports";
import { createEquipeAgents, BUDGET_EXCEEDED_ERROR } from "../agents/runner";
import { DrizzleLedgerStore } from "../agents/ledger";
import { DIAGNOSIS_PROMPT_VERSION } from "../agents/prompts";
import { resolveResearchModel } from "../agents/roles";
import { isExecutionBlocked } from "../module/execution-authorization";
import { HANDOFF_DIAGNOSE_EVENT } from "../handoff/contract";
import { buildDiagnosisInput, hasEnoughPublicText } from "../handoff/diagnosis";
import { createProdJobDeps, moduleDepsFor, type JobStep } from "./shared";

export const EQUIPE_DIAGNOSIS_ID = "equipe-diagnosis-generate";

const uuid = z.string().uuid();
const eventSchema = z.object({ workspaceId: uuid, accountId: uuid, taskIntentId: uuid, handoffId: uuid, readingId: uuid });

export type DiagnosisRuntime = {
  depsFor: (workspaceId: string) => EquipeModuleDeps;
  agentsFor: (deps: EquipeModuleDeps) => Agents;
  isEnabled: (workspaceId: string) => boolean;
};

/** Stable failure codes: the card and the retry rule read them, never the raw provider message. */
const OWN_CODES: Record<string, boolean> = {
  budget_exceeded: false, execution_blocked: false, model_refused: false, diagnosis_unavailable: false,
  model_truncated: true, diagnosis_invalid: true, provider_error: true,
};

export function classifyDiagnosisFailure(error: string | undefined): { code: string; retry: boolean } {
  const message = error ?? "";
  // Codes this job already classified (thrown to trigger the retry, read back by the failure handler).
  if (Object.hasOwn(OWN_CODES, message)) return { code: message, retry: OWN_CODES[message]! };
  if (message === BUDGET_EXCEEDED_ERROR) return { code: "budget_exceeded", retry: false };
  if (isExecutionBlocked(message) || message === "execution_blocked") return { code: "execution_blocked", retry: false };
  if (message.startsWith("model_refused")) return { code: "model_refused", retry: false };
  if (message.startsWith("model_truncated")) return { code: "model_truncated", retry: true };
  if (/diagnosis_(invalid_json|schema_mismatch)/.test(message)) return { code: "diagnosis_invalid", retry: true };
  if (message === "requires_plan" || message.startsWith("invalid_agent_input") || message === "free_call_unbounded") return { code: "diagnosis_unavailable", retry: false };
  return { code: "provider_error", retry: true };
}

const DIAGNOSE_ACTOR = { kind: "system", job: HANDOFF_DIAGNOSE_EVENT } as const;

async function command(deps: EquipeModuleDeps, scope: { workspaceId: string; accountId: string }, type: string, payload: Record<string, unknown>) {
  const outcome = await executeCommand(deps, { ...scope, actor: DIAGNOSE_ACTOR }, { type, payload });
  return outcome.ok ? { ok: true as const, data: outcome.value.data } : { ok: false as const, code: outcome.error.code };
}

export function createDiagnosisHandler(runtime: DiagnosisRuntime) {
  return async ({ event, step }: { event: { data: unknown }; step: JobStep }) => {
    const parsed = eventSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.error("[equipe-diagnosis] invalid event, ignored", { error: parsed.error.message });
      return { ignored: true as const, reason: "invalid_event" };
    }
    const { workspaceId, accountId, taskIntentId } = parsed.data;
    const scope = { workspaceId, accountId };
    if (!runtime.isEnabled(workspaceId)) return { ignored: true as const, reason: "not_enabled" };
    const deps = runtime.depsFor(workspaceId);

    const claim = await step.run(`claim-${taskIntentId}`, () => command(deps, scope, "diagnosis_claim", { taskIntentId }));
    if (!claim.ok) throw new Error(`diagnosis claim: ${claim.code}`);
    const claimed = claim.data as { claimed: boolean; reason?: string };
    const fail = (code: string) => step.run(`fail-${taskIntentId}`, async () => {
      const failed = await command(deps, scope, "diagnosis_fail", { taskIntentId, code });
      if (!failed.ok) throw new Error(`diagnosis fail: ${failed.code}`);
      return failed.data;
    });
    if (!claimed.claimed) {
      // A suspended account cannot run; the person must not wait forever, so the pause is told in the conversation.
      if (claimed.reason && isExecutionBlocked(claimed.reason)) { await fail("execution_blocked"); return { failed: true as const, code: "execution_blocked" }; }
      return { ignored: true as const, reason: claimed.reason ?? "not_claimed" };
    }

    // A retryable failure THROWS inside the step, so the platform retries the step (a real second attempt) instead
    // of memoizing the failure; a final failure is recorded by the failure handler below.
    const generated = await step.run(`generate-${taskIntentId}`, async () => {
      const [handoff] = await deps.uow.repos.handoffs.list(scope);
      if (!handoff) throw new Error("handoff_not_found");
      const input = buildDiagnosisInput(handoff);
      // Too little public text: nothing to ask the model, and nothing to pay.
      if (!hasEnoughPublicText(input)) return { ok: true as const, output: null, model: null, promptVersion: null };
      const result = await runtime.agentsFor(deps).runTask({ kind: "diagnosis", workspaceId, accountId, input });
      if (result.ok) return { ok: true as const, output: result.output, model: resolveResearchModel(), promptVersion: DIAGNOSIS_PROMPT_VERSION };
      const failure = classifyDiagnosisFailure(result.error);
      if (failure.retry) throw new Error(failure.code);
      return { ok: false as const, code: failure.code };
    });
    if (!generated.ok) { await fail(generated.code); return { failed: true as const, code: generated.code }; }

    const recorded = await step.run(`record-${taskIntentId}`, () => command(deps, scope, "diagnosis_record", {
      taskIntentId, output: generated.output, model: generated.model, promptVersion: generated.promptVersion,
    }));
    if (!recorded.ok) {
      if (isExecutionBlocked(recorded.code)) { await fail("execution_blocked"); return { failed: true as const, code: "execution_blocked" }; }
      throw new Error(`diagnosis record: ${recorded.code}`);
    }
    return { recorded: true as const, ...recorded.data };
  };
}

/** After the last attempt: the conversation gets the error card (with the "Tentar de novo" isca when it can help). */
export function createDiagnosisFailureHandler(runtime: DiagnosisRuntime) {
  return async ({ event, error }: { event: FailureEventPayload; error: Error }) => {
    const parsed = eventSchema.safeParse(event.data.event.data);
    if (!parsed.success) {
      logger.error("[equipe-diagnosis] invalid failure envelope", { error: error.message });
      return;
    }
    const { workspaceId, accountId, taskIntentId } = parsed.data;
    if (!runtime.isEnabled(workspaceId)) return;
    const deps = runtime.depsFor(workspaceId);
    // Our own thrown codes come back as the message; anything else is a provider/transport problem.
    const code = classifyDiagnosisFailure(error.message).code;
    const outcome = await command(deps, { workspaceId, accountId }, "diagnosis_fail", { taskIntentId, code });
    if (!outcome.ok) throw new Error(`record diagnosis failure: ${outcome.code}`);
  };
}

export function buildEquipeDiagnosisJob(client: typeof inngest, runtime: DiagnosisRuntime) {
  return client.createFunction({
    id: EQUIPE_DIAGNOSIS_ID,
    triggers: [{ event: HANDOFF_DIAGNOSE_EVENT }],
    // The automatic run has two attempts; each one is admitted and settled on its own by the free ledger.
    retries: 1,
    // One free AI call per account at a time (the ledger lock enforces it too).
    concurrency: [{ limit: 1, key: "event.data.accountId" }],
    onFailure: createDiagnosisFailureHandler(runtime),
  }, createDiagnosisHandler(runtime));
}

function createProductionRuntime(): DiagnosisRuntime {
  const deps = createProdJobDeps();
  const ledger = new DrizzleLedgerStore();
  return {
    depsFor: (workspaceId) => moduleDepsFor(deps, workspaceId),
    agentsFor: (moduleDeps) => createEquipeAgents({ moduleDeps, ledger, now: () => moduleDeps.clock.now() }),
    isEnabled: deps.isEnabledForWorkspace,
  };
}

export const equipeDiagnosisJob = buildEquipeDiagnosisJob(inngest, createProductionRuntime());
