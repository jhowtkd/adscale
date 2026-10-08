// Agent work driver: per-account FIFO queue with concurrency 1 (the same
// shape as the `equipe-agent-work` Inngest concurrency key on accountId).
// Each turn mirrors equipeAgentWorkHandler: pilot gate → kind check →
// runTask through createEquipeAgents (load model client + real ledger) →
// budget refusal mapping → turn_failed recording. The production handler
// hardcodes prod deps (live gateway, real OpenAI), so staging measures the
// real Inngest path; locally this is the faithful equivalent.

import { BUDGET_EXCEEDED_ERROR, createEquipeAgents } from "../../src/server/equipe/agents/runner";
import { isAgentTaskKind } from "../../src/server/equipe/agents/roles";
import { STRATEGIST_AGENT_ID } from "../../src/server/equipe/agents/strategist";
import type { EquipeModuleDeps } from "../../src/server/equipe/module/ports";
import type { EquipeUnitOfWork } from "../../src/server/equipe/data";
import type { LedgerStore } from "../../src/server/equipe/agents/ledger";
import type { EquipeModelClient } from "../../src/server/equipe/agents/model-client";
import type { Metrics } from "./metrics";

export type AgentTaskSpec = {
  workspaceId: string;
  accountId: string;
  kind: string;
  input: unknown;
};

export type AgentQueueOptions = {
  uow: EquipeUnitOfWork;
  moduleDepsFor: (workspaceId: string) => EquipeModuleDeps;
  client: EquipeModelClient;
  ledger: LedgerStore;
  now: () => Date;
  metrics: Metrics;
};

async function recordTurnFailed(
  uow: EquipeUnitOfWork,
  scope: { workspaceId: string; accountId: string },
  detail: { taskKind: string; error: string },
  now: Date,
): Promise<void> {
  await uow.run(async (repos) => {
    await repos.events.create(scope, {
      actorType: "agent",
      actorId: STRATEGIST_AGENT_ID,
      actorRole: "agent",
      eventType: "agent.turn_failed",
      payload: { taskKind: detail.taskKind, error: detail.error },
      occurredAt: now,
    });
  });
}

export class AgentQueue {
  private readonly chains = new Map<string, Promise<void>>();
  private readonly pending = new Map<string, number>();
  private refused = 0;
  private failed = 0;
  private succeeded = 0;

  constructor(private readonly options: AgentQueueOptions) {}

  get stats(): { refused: number; failed: number; succeeded: number } {
    return { refused: this.refused, failed: this.failed, succeeded: this.succeeded };
  }

  private async runTurn(task: AgentTaskSpec): Promise<void> {
    const { metrics } = this.options;
    if (!isAgentTaskKind(task.kind)) {
      this.failed += 1;
      metrics.error("unknown_agent_task");
      return;
    }
    const agents = createEquipeAgents({
      moduleDeps: this.options.moduleDepsFor(task.workspaceId),
      client: this.options.client,
      ledger: this.options.ledger,
      now: this.options.now,
    });
    const start = performance.now();
    const result = await agents.runTask({
      kind: task.kind,
      workspaceId: task.workspaceId,
      accountId: task.accountId,
      input: task.input,
    });
    metrics.timeAgentTurn(task.kind, performance.now() - start);
    if (!result.ok) {
      if (result.error === BUDGET_EXCEEDED_ERROR) {
        this.refused += 1;
        metrics.count("agent.refused");
        return;
      }
      this.failed += 1;
      metrics.error("agent.turn_failed");
      try {
        await recordTurnFailed(
          this.options.uow,
          { workspaceId: task.workspaceId, accountId: task.accountId },
          { taskKind: task.kind, error: result.error ?? "unknown" },
          this.options.now(),
        );
      } catch {
        metrics.error("agent.turn_failed_record_lost");
      }
      return;
    }
    this.succeeded += 1;
  }

  /** Enqueue a turn; per-account turns run strictly one at a time. */
  submit(task: AgentTaskSpec): Promise<void> {
    const { metrics } = this.options;
    const enqueuedAt = performance.now();
    const depth = (this.pending.get(task.accountId) ?? 0) + 1;
    this.pending.set(task.accountId, depth);
    metrics.noteAgentDepth(task.accountId, depth);
    const previous = this.chains.get(task.accountId) ?? Promise.resolve();
    const current: Promise<void> = previous.then(async () => {
      metrics.timeAgentWait(task.kind, performance.now() - enqueuedAt);
      try {
        await this.runTurn(task);
      } finally {
        this.pending.set(task.accountId, (this.pending.get(task.accountId) ?? 1) - 1);
      }
    });
    this.chains.set(task.accountId, current.catch(() => undefined));
    return current;
  }

  /** Wait until every submitted turn finished. */
  async drain(): Promise<void> {
    await Promise.all([...this.chains.values()]);
  }
}

export function strategistInput(brand: string, week: number): { message: string } {
  return { message: `Leitura semanal ${week} da ${brand}: resuma o andamento e as pendências.` };
}

export function researchInput(): {
  materials: Array<{ assetId: string; label: string; excerpt: string }>;
} {
  return {
    materials: [
      { assetId: "material-1", label: "Guia de marca", excerpt: "Tom direto, sem jargão." },
      { assetId: "material-2", label: "Ofertas", excerpt: "Preços válidos em outubro." },
    ],
  };
}

export function reviewInput(caption: string): {
  copy: { headline: string; body: string; cta: string };
  facts: string[];
} {
  return {
    copy: { headline: caption.slice(0, 60), body: caption, cta: "Fale com a gente" },
    facts: ["preço público", "entrega em todo o Brasil"],
  };
}
