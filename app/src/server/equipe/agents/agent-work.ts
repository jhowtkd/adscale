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
import { createPostgresEquipeUnitOfWork } from "../data/postgres";
import type { EquipeModuleDeps } from "../module/ports";
import { DrizzleLedgerStore } from "./ledger";
import { createEquipeAgents, BUDGET_EXCEEDED_ERROR } from "./runner";
import { LiveAdscaleGateway } from "./gateway";
import { isAgentTaskKind } from "./roles";

export const EQUIPE_AGENT_WORK_EVENT = "equipe.agent.work";
export const EQUIPE_AGENT_WORK_ID = "equipe-agent-work";

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

async function equipeAgentWorkHandler({ event, step }: { event: { data: unknown }; step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> } }) {
  const parsed = agentWorkEventSchema.safeParse(event.data);
  if (!parsed.success) {
    throw new Error(`invalid ${EQUIPE_AGENT_WORK_EVENT} event: ${parsed.error.issues[0]?.message ?? "invalid"}`);
  }
  const { workspaceId, accountId, kind, input } = parsed.data;
  if (!isAgentTaskKind(kind)) {
    throw new Error(`unknown agent task kind: ${kind}`);
  }
  const agents = createEquipeAgents({
    moduleDeps: buildModuleDeps(workspaceId),
    ledger: new DrizzleLedgerStore(db),
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

export function buildEquipeAgentWorkJob(
  client: typeof inngest,
  options: { id: string; eventName: string },
) {
  return client.createFunction(
    {
      id: options.id,
      retries: 2,
      // One agent turn per account at a time: turns call module commands
      // that decide on loaded state, so concurrent turns could interleave.
      concurrency: [{ limit: 1, key: "event.data.accountId" }],
      triggers: [{ event: options.eventName }],
      onFailure: async ({ error }) => {
        logger.error("[equipeAgentWorkJob] failed after retries", {
          error: error instanceof Error ? error.message : "unknown",
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
