// Inngest function `equipe-agent-work` (#550).
//
// Triggered by `equipe.agent.work`, serialized per account (concurrency
// limit 1 on event.data.accountId). Runs one agent turn through the Agents
// port; strategist tool calls feed results back as `agent` commands inside
// the turn. Registered in app/src/app/api/inngest/route.ts — no new route.

import { z } from "zod";
import type { FailureEventPayload } from "inngest";
import { executeCommand } from "../module/commands";
import { deferAgentWork, deferRefusedClaim } from "../module/agent-work";
import { authorizeAccountExecution, isExecutionBlocked } from "../module/execution-authorization";
import { inngest } from "@/server/jobs/client";
import { logger } from "@/lib/logger";
import { db } from "@/server/db";
import { systemClock } from "../domain";
import type { EquipeUnitOfWork } from "../data";
import { createPostgresEquipeUnitOfWork } from "../data/postgres";
import { isEquipeEnabledForWorkspace } from "../module/equipe-enabled";
import type { Agents, AgentTask, AgentTaskResult, EquipeModuleDeps } from "../module/ports";
import { DrizzleLedgerStore } from "./ledger";
import { createEquipeAgents, BUDGET_EXCEEDED_ERROR } from "./runner";
import { LiveAdscaleGateway } from "./gateway";
import { STRATEGIST_AGENT_ID } from "./strategist";
import { isAgentTaskKind } from "./roles";

export const EQUIPE_AGENT_WORK_EVENT = "equipe.agent.work";
export const EQUIPE_AGENT_WORK_ID = "equipe-agent-work";

/** Refusal when the workspace is outside the Equipe pilot. Never retried. */
export const EQUIPE_NOT_ENABLED_ERROR = "equipe_not_enabled";

/** Recorded when a turn throws, so #547 can turn it into a technical escalation. */
export const TURN_FAILED_EVENT = "agent.turn_failed";

const agentWorkEventSchema = z.object({
  workspaceId: z.string().uuid(),
  accountId: z.string().uuid(),
  kind: z.string().min(1),
  input: z.unknown().optional(),
  sourceEventId: z.string().uuid().optional(),
});

export type EquipeAgentWorkEvent = z.infer<typeof agentWorkEventSchema>;

function buildModuleDeps(workspaceId: string): EquipeModuleDeps {
  return {
    uow: createPostgresEquipeUnitOfWork(db),
    clock: systemClock(),
    gateway: new LiveAdscaleGateway(workspaceId),
  };
}

export type EquipeAgentWorkStep = {
  run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
};

export type AgentWorkRuntime = {
  depsFor: (workspaceId: string) => EquipeModuleDeps;
  agentsFor: (deps: EquipeModuleDeps) => Agents;
  isEnabled: (workspaceId: string) => boolean;
};

const productionRuntime: AgentWorkRuntime = {
  depsFor: buildModuleDeps,
  agentsFor: (moduleDeps) => createEquipeAgents({ moduleDeps, ledger: new DrizzleLedgerStore(db), now: () => moduleDeps.clock.now() }),
  isEnabled: isEquipeEnabledForWorkspace,
};

export function createAgentWorkHandler(runtime: AgentWorkRuntime) {
  return async ({ event, step, runId }: {
    event: { id?: string; data: unknown }; step: EquipeAgentWorkStep; runId?: string;
  }) => {
    const parsed = agentWorkEventSchema.safeParse(event.data);
    if (!parsed.success) throw new Error(`invalid ${EQUIPE_AGENT_WORK_EVENT} event: ${parsed.error.message}`);
    const { workspaceId, accountId, kind, input, sourceEventId } = parsed.data;
    if (!runtime.isEnabled(workspaceId)) return { refused: true as const, error: EQUIPE_NOT_ENABLED_ERROR };
    const deps = runtime.depsFor(workspaceId);
    const owner = runId ?? event.id;
    let task: AgentTask = { kind, workspaceId, accountId, input };
    let savedResult: AgentTaskResult | undefined;
    if (sourceEventId) {
      if (!owner) throw new Error("agent work requires a durable run id");
      const claim = await step.run("claim-work", () => executeCommand(deps,
        { actor: { kind: "system", job: EQUIPE_AGENT_WORK_ID }, workspaceId, accountId },
        { type: "claim_agent_work", payload: { sourceEventId, runId: owner } }));
      if (!claim.ok) {
        if (isExecutionBlocked(claim.error.code)) {
          // The gated claim tx rolled back; record the refusal so the next
          // sweep uses a new transport id after resume.
          const deferred = await step.run("defer-refused-claim", () => deferRefusedClaim(deps, { workspaceId, accountId }, sourceEventId, owner));
          if (!deferred.ok) throw new Error(`defer refused claim: ${deferred.error.code}`);
          return { refused: true as const, error: claim.error.code };
        }
        throw new Error(`claim agent work: ${claim.error.code}`);
      }
      if (!claim.value.data.claimed) return { refused: false as const, ...claim.value.data };
      task = claim.value.data.task as AgentTask;
      savedResult = claim.value.data.result as AgentTaskResult | undefined;
    }
    const defer = async (error: string, result?: AgentTaskResult) => {
      if (sourceEventId && owner) {
        const deferred = await step.run("defer-agent-work", () => deferAgentWork(deps, { workspaceId, accountId }, sourceEventId, owner, result));
        if (!deferred.ok) throw new Error(`defer agent work: ${deferred.error.code}`);
      }
      return { refused: true as const, error };
    };
    if (!isAgentTaskKind(task.kind)) throw new Error(`unknown agent task kind: ${task.kind}`);
    const result: AgentTaskResult = savedResult ?? await step.run("run-agent-task", async (): Promise<AgentTaskResult> => {
      // Recheck on actual execution, after a possibly cached claim. Replays
      // must still retrieve a completed step's result so it can be deferred
      // without losing it if suspension landed between Inngest invocations.
      const allowed = await authorizeAccountExecution(deps.uow.repos, { workspaceId, accountId });
      return allowed.ok ? runtime.agentsFor(deps).runTask(task) : { ok: false, error: allowed.error.code };
    });
    if (!result.ok && isExecutionBlocked(result.error)) return defer(result.error!);
    if (!result.ok && result.error !== BUDGET_EXCEEDED_ERROR) throw new Error(`agent task ${task.kind} failed: ${result.error}`);
    if (sourceEventId) {
      const applied = await step.run("apply-agent-result", () => executeCommand(deps,
        { actor: { kind: "agent", agentId: STRATEGIST_AGENT_ID }, workspaceId, accountId },
        { type: "complete_agent_work", payload: { sourceEventId, runId: owner, output: result.output,
          ...(result.error === BUDGET_EXCEEDED_ERROR ? { refusal: "budget_exceeded" } : {}) } }));
      if (!applied.ok) {
        if (isExecutionBlocked(applied.error.code)) return defer(applied.error.code, result);
        throw new Error(`apply agent result: ${applied.error.code}`);
      }
    } else {
      const allowed = await authorizeAccountExecution(deps.uow.repos, { workspaceId, accountId });
      if (!allowed.ok) return { refused: true as const, error: allowed.error.code };
    }
    return result.ok ? { refused: false as const, output: result.output }
      : { refused: true as const, error: result.error };
  };
}

export const equipeAgentWorkHandler = createAgentWorkHandler(productionRuntime);

/**
 * Record a failed turn as an account event through the module's unit of
 * work (never a raw insert). #547 turns `agent.turn_failed` into an
 * automatic technical escalation. Duplicate failure envelopes reuse the
 * source failure event, so escalation ingestion can resume safely.
 */
export async function recordAgentTurnFailed(
  uow: EquipeUnitOfWork,
  scope: { workspaceId: string; accountId: string },
  detail: { taskKind: string; error: string; sourceEventId?: string; runId?: string },
  now: Date = new Date(),
): Promise<string | null> {
  return uow.run(async (repos) => {
    const account = await repos.accounts.get(scope.workspaceId, scope.accountId, { forUpdate: true });
    if (!account) return null;
    const failed = await repos.events.list(scope, { eventType: TURN_FAILED_EVENT });
    const existing = failed.find((e) => {
      const payload = e.payload as { sourceEventId?: string; runId?: string } | null;
      return detail.sourceEventId ? payload?.sourceEventId === detail.sourceEventId
        : detail.runId ? payload?.runId === detail.runId : false;
    });
    if (existing) return existing.id;
    const source = detail.sourceEventId ? await repos.events.get(scope, detail.sourceEventId) : null;
    const event = await repos.events.create(scope, {
      actorType: "agent", actorId: STRATEGIST_AGENT_ID, actorRole: "agent", eventType: TURN_FAILED_EVENT,
      ...(source?.objectType === "item" ? { objectType: "item", objectId: source.objectId } : {}),
      payload: { ...detail, error: detail.error.slice(0, 2000) }, occurredAt: now,
    });
    return event.id;
  });
}

export function createAgentWorkFailureHandler(runtime: AgentWorkRuntime) {
  return async ({ event, error }: { event: FailureEventPayload; error: Error }) => {
    // Inngest wraps the ORIGINAL event inside inngest/function.failed.
    const parsed = agentWorkEventSchema.safeParse(event.data.event.data);
    if (!parsed.success) {
      logger.error("[equipeAgentWorkJob] invalid failure envelope", { error: error.message });
      return;
    }
    const { workspaceId, accountId, kind, sourceEventId } = parsed.data;
    if (!runtime.isEnabled(workspaceId)) return;
    const deps = runtime.depsFor(workspaceId);
    const id = await recordAgentTurnFailed(deps.uow, { workspaceId, accountId },
      { taskKind: kind, error: error.message, sourceEventId, runId: event.data.run_id }, deps.clock.now());
    if (!id) return;
    const outcome = await executeCommand(deps, { actor: { kind: "system", job: EQUIPE_AGENT_WORK_ID }, workspaceId, accountId },
      { type: "ingest_agent_signal", payload: { sourceEventId: id } });
    if (!outcome.ok) throw new Error(`ingest turn failure: ${outcome.error.code}`);
  };
}

export function buildEquipeAgentWorkJob(
  client: typeof inngest,
  options: { id: string; eventName: string },
  runtime: AgentWorkRuntime = productionRuntime,
) {
  return client.createFunction(
    {
      id: options.id,
      // No model retries in the pilot: a partial tool turn could have written
      // commands and charged usage already. Claim and apply are idempotent;
      // model failure opens a technical escalation for human follow-through.
      retries: 0,
      // One agent turn per account at a time: turns call module commands
      // that decide on loaded state, so concurrent turns could interleave.
      concurrency: [{ limit: 1, key: "event.data.accountId" }],
      triggers: [{ event: options.eventName }],
      onFailure: createAgentWorkFailureHandler(runtime),
    },
    createAgentWorkHandler(runtime),
  );
}

export const equipeAgentWorkJob = buildEquipeAgentWorkJob(inngest, {
  id: EQUIPE_AGENT_WORK_ID,
  eventName: EQUIPE_AGENT_WORK_EVENT,
});
