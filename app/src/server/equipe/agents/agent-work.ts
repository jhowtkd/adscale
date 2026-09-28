// Inngest function `equipe-agent-work` (#550).
//
// Triggered by `equipe.agent.work`, serialized per account (concurrency
// limit 1 on event.data.accountId). Runs one agent turn through the Agents
// port; strategist tool calls feed results back as `agent` commands inside
// the turn. Registered in app/src/app/api/inngest/route.ts — no new route.

import { z } from "zod";
import { inngest } from "@/server/jobs/client";
import { logger } from "@/lib/logger";
import { db } from "@/server/db";
import { systemClock } from "../domain";
import type { EquipeUnitOfWork } from "../data";
import { createPostgresEquipeUnitOfWork } from "../data/postgres";
import { isEquipeEnabledForWorkspace } from "../module/equipe-enabled";
import type { EquipeModuleDeps } from "../module/ports";
import { DrizzleLedgerStore } from "./ledger";
import { createEquipeAgents, BUDGET_EXCEEDED_ERROR } from "./runner";
import { LiveAdscaleGateway } from "./gateway";
import { STRATEGIST_AGENT_ID } from "./strategist";
import { isAgentTaskKind } from "./roles";

export const EQUIPE_AGENT_WORK_EVENT = "equipe.agent.work";
export const EQUIPE_AGENT_WORK_ID = "equipe-agent-work";

/** Refusal when the workspace is outside the Equipe pilot. Never retried. */
export const EQUIPE_NOT_ENABLED_ERROR = "equipe_not_enabled";

/** Recorded when a turn throws, so #547 can turn it into an exception. */
export const TURN_FAILED_EVENT = "agent.turn_failed";

const agentWorkEventSchema = z.object({
  workspaceId: z.string().uuid(),
  accountId: z.string().uuid(),
  kind: z.string().min(1),
  input: z.unknown().optional(),
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

export async function equipeAgentWorkHandler({
  event,
  step,
}: {
  event: { data: unknown };
  step: EquipeAgentWorkStep;
}) {
  const parsed = agentWorkEventSchema.safeParse(event.data);
  if (!parsed.success) {
    throw new Error(`invalid ${EQUIPE_AGENT_WORK_EVENT} event: ${parsed.error.issues[0]?.message ?? "invalid"}`);
  }
  const { workspaceId, accountId, kind, input } = parsed.data;
  // Pilot gate FIRST: research, reviewers and writing call models directly,
  // so gating only inside strategist commands would spend model money for
  // workspaces outside the pilot. A refusal returns — never throws — so it
  // never retries and writes nothing: no model call, no ledger entry.
  if (!isEquipeEnabledForWorkspace(workspaceId)) {
    logger.info("[equipeAgentWorkJob] workspace outside the pilot, refusing", {
      workspaceId,
      accountId,
      kind,
    });
    return { refused: true as const, error: EQUIPE_NOT_ENABLED_ERROR };
  }
  if (!isAgentTaskKind(kind)) {
    throw new Error(`unknown agent task kind: ${kind}`);
  }
  const moduleDeps = buildModuleDeps(workspaceId);
  const agents = createEquipeAgents({
    moduleDeps,
    ledger: new DrizzleLedgerStore(db),
    now: () => moduleDeps.clock.now(),
  });
  const result = await step.run("run-agent-task", () =>
    agents.runTask({ kind, workspaceId, accountId, input }),
  );
  if (!result.ok) {
    // Over budget is a refusal, not a failure: no retry.
    if (result.error === BUDGET_EXCEEDED_ERROR) {
      logger.info("[equipeAgentWorkJob] budget exceeded, refusing", { workspaceId, accountId, kind });
      return { refused: true as const, error: result.error };
    }
    throw new Error(`agent task ${kind} failed: ${result.error}`);
  }
  return { refused: false as const, output: result.output };
}

/**
 * Record a failed turn as an account event through the module's unit of
 * work (never a raw insert). #547 turns `agent.turn_failed` into a
 * support exception. The write going through is best-effort: the turn
 * already failed, and a failing failure-hook must not mask that.
 */
export async function recordAgentTurnFailed(
  uow: EquipeUnitOfWork,
  scope: { workspaceId: string; accountId: string },
  detail: { taskKind: string; error: string },
  now: Date = new Date(),
): Promise<void> {
  await uow.run(async (repos) => {
    await repos.events.create(scope, {
      actorType: "agent",
      actorId: STRATEGIST_AGENT_ID,
      actorRole: "agent",
      eventType: TURN_FAILED_EVENT,
      payload: { taskKind: detail.taskKind, error: detail.error },
      occurredAt: now,
    });
  });
}

export function buildEquipeAgentWorkJob(
  client: typeof inngest,
  options: { id: string; eventName: string },
) {
  return client.createFunction(
    {
      id: options.id,
      // No retries in the pilot: the turn runs inside a single step, so a
      // retry re-executes the WHOLE turn — duplicating commands the failed
      // attempt already ran (e.g. propose_context_section) and charging the
      // ledger a second time. A failure records `agent.turn_failed` (see
      // onFailure) so #547 can surface it as an exception instead.
      retries: 0,
      // One agent turn per account at a time: turns call module commands
      // that decide on loaded state, so concurrent turns could interleave.
      concurrency: [{ limit: 1, key: "event.data.accountId" }],
      triggers: [{ event: options.eventName }],
      onFailure: async ({ event, error }) => {
        const message = error instanceof Error ? error.message : "unknown";
        const parsed = agentWorkEventSchema.safeParse(
          (event as { data?: unknown } | undefined)?.data,
        );
        if (!parsed.success) {
          logger.error("[equipeAgentWorkJob] turn failed without a valid event", {
            error: message,
          });
          return;
        }
        const { workspaceId, accountId, kind } = parsed.data;
        try {
          await recordAgentTurnFailed(
            createPostgresEquipeUnitOfWork(db),
            { workspaceId, accountId },
            { taskKind: kind, error: message },
          );
        } catch (cause) {
          logger.error("[equipeAgentWorkJob] failed to record agent.turn_failed", {
            workspaceId,
            accountId,
            kind,
            error: cause instanceof Error ? cause.message : "unknown",
          });
        }
        logger.error("[equipeAgentWorkJob] turn failed", {
          workspaceId,
          accountId,
          kind,
          error: message,
        });
      },
    },
    equipeAgentWorkHandler,
  );
}

export const equipeAgentWorkJob = buildEquipeAgentWorkJob(inngest, {
  id: EQUIPE_AGENT_WORK_ID,
  eventName: EQUIPE_AGENT_WORK_EVENT,
});
