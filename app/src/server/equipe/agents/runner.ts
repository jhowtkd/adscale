// Agents port implementation (#550).
//
// createEquipeAgents returns the module's `Agents` port: runTask dispatches
// by kind, records every direct model call in the cost ledger, and refuses
// new work past the monthly per-account cap (current São Paulo month) with
// an `agent.budget_exceeded` event. (The exception command itself arrives
// with #547.)

import { itemWorkInputSchema, runItemWork } from "./item-work";
import { z } from "zod";
import type { Agents, AgentTask, AgentTaskResult, EquipeModuleDeps } from "../module/ports";
import { runArtDirection } from "./art-direction";
import {
  BUDGET_EXCEEDED_EVENT,
  MemoryLedgerStore,
  estimateCostUsdCents,
  type LedgerStore,
} from "./ledger";
import {
  ServedAdsMeasurementReader,
  type MeasurementReader,
} from "./measurement";
import { AnthropicEquipeModelClient } from "./anthropic-client";
import {
  EquipeModelRefusalError,
  EquipeModelTruncatedError,
  MetaEquipeModelClient,
  OpenAIEquipeModelClient,
  type EquipeModelClient,
  type ModelCallUsage,
} from "./model-client";
import { EQUIPE_PROMPT_VERSION } from "./prompts";
import { resolveEquipeProvider, type EquipeProvider } from "./provider";
import { runResearch } from "./research";
import type { ResearchMaterial } from "./prompts";
import { runTextReview, runVisualReview } from "./reviewers";
import {
  isAgentTaskKind,
  resolveAgentMonthlyBudgetUsdCents,
  resolveResearchEffort,
  resolveResearchModel,
  resolveReviewerEffort,
  resolveReviewerModel,
  resolveStrategistEffort,
  resolveStrategistModel,
  type EquipeAgentRole,
  type EquipeAgentTaskKind,
} from "./roles";
import { STRATEGIST_AGENT_ID, runStrategistTurn } from "./strategist";
import { runWriting, type WritingDeps } from "./writing";

export const BUDGET_EXCEEDED_ERROR = "budget_exceeded";

const taskInputSchemas = {
  strategist_turn: z.object({
    message: z.string().min(1).max(8000),
    maxIterations: z.number().int().min(1).max(10).optional(),
  }),
  research: z.object({
    materials: z
      .array(z.object({ assetId: z.string().min(1), label: z.string().min(1), excerpt: z.string().min(1) }))
      .min(1)
      .max(20),
  }),
  writing: z.object({ workItemId: z.string().min(1) }),
  art_direction: z.object({ workId: z.string().min(1) }),
  review_text: z.object({
    copy: z.object({ headline: z.string(), body: z.string(), cta: z.string() }),
    facts: z.array(z.string()).optional(),
  }),
  review_caption: itemWorkInputSchema,
  plan_adjustment: itemWorkInputSchema,
  plan_replacement: itemWorkInputSchema,
  plan_reschedule: itemWorkInputSchema,
  review_visual: z.object({ imageUrl: z.string().min(1), brief: z.string().default("") }),
  measurement: z.object({
    brandId: z.string().min(1),
    windowDays: z.number().int().min(1).max(90).optional(),
  }),
} satisfies Record<EquipeAgentTaskKind, z.ZodTypeAny>;

const KIND_ROLES: Record<EquipeAgentTaskKind, EquipeAgentRole> = {
  strategist_turn: "strategist",
  research: "research",
  writing: "writer",
  art_direction: "strategist",
  review_text: "reviewer_text",
  review_visual: "reviewer_visual",
  review_caption: "reviewer_text",
  plan_adjustment: "research",
  plan_replacement: "strategist",
  plan_reschedule: "strategist",
  measurement: "measurement",
};

export type EquipeAgentsOptions = {
  moduleDeps: EquipeModuleDeps;
  /** Single fake for every role (tests). Wins over `clients`. */
  client?: EquipeModelClient;
  /** Per-provider fakes (tests): routing stays observable, no network. */
  clients?: Partial<Record<EquipeProvider, EquipeModelClient>>;
  ledger?: LedgerStore;
  measurement?: MeasurementReader;
  writing?: WritingDeps;
  now?: () => Date;
};

function invalidTask(error: string): AgentTaskResult {
  return { ok: false, error };
}

export function createEquipeAgents(options: EquipeAgentsOptions): Agents {
  // Lazy: kinds without a direct model call (writing, art_direction,
  // measurement) must work without model credentials configured. One
  // cached client per provider; each is built on its first role's run.
  const providerClients = new Map<EquipeProvider, EquipeModelClient>(
    Object.entries(options.clients ?? {}) as Array<[EquipeProvider, EquipeModelClient]>,
  );
  const clientForModel = (model: string): EquipeModelClient => {
    if (options.client) return options.client;
    const provider = resolveEquipeProvider(model);
    const cached = providerClients.get(provider);
    if (cached) return cached;
    const created =
      provider === "anthropic"
        ? new AnthropicEquipeModelClient()
        : provider === "meta"
          ? new MetaEquipeModelClient()
          : new OpenAIEquipeModelClient();
    providerClients.set(provider, created);
    return created;
  };
  const ledger = options.ledger ?? new MemoryLedgerStore();
  const measurement = options.measurement ?? new ServedAdsMeasurementReader();
  const now = options.now ?? (() => new Date());

  async function refuseOverBudget(
    task: AgentTask,
    totalCostUsdCents: number,
    budgetUsdCents: number,
  ): Promise<AgentTaskResult> {
    try {
      await options.moduleDeps.uow.run(async (repos) => {
        await repos.events.create(
          { workspaceId: task.workspaceId, accountId: task.accountId },
          {
            actorType: "agent",
            actorId: STRATEGIST_AGENT_ID,
            actorRole: "agent",
            eventType: BUDGET_EXCEEDED_EVENT,
            payload: { totalCostUsdCents, budgetUsdCents, taskKind: task.kind },
            occurredAt: now(),
          },
        );
      });
    } catch {
      // The refusal stands even if the event write fails.
    }
    return { ok: false, error: BUDGET_EXCEEDED_ERROR };
  }

  return {
    async runTask(task: AgentTask): Promise<AgentTaskResult> {
      if (!task.workspaceId || !task.accountId) {
        return invalidTask("agent_task_requires_scope");
      }
      if (!isAgentTaskKind(task.kind)) {
        return invalidTask(`unknown_agent_task:${String(task.kind)}`);
      }
      const kind = task.kind;
      const parsedInput = taskInputSchemas[kind].safeParse(task.input);
      if (!parsedInput.success) {
        return invalidTask(`invalid_agent_input:${parsedInput.error.issues[0]?.message ?? "invalid"}`);
      }

      const budgetUsdCents = resolveAgentMonthlyBudgetUsdCents();
      const totalCostUsdCents = await ledger.monthlyTotalCostUsdCents(task.workspaceId, task.accountId, now());
      if (totalCostUsdCents >= budgetUsdCents) {
        return refuseOverBudget(task, totalCostUsdCents, budgetUsdCents);
      }

      const recordCall = async (call: ModelCallUsage) => {
        await ledger.record({
          workspaceId: task.workspaceId,
          accountId: task.accountId,
          role: KIND_ROLES[kind],
          model: call.model,
          promptVersion: EQUIPE_PROMPT_VERSION,
          taskKind: kind,
          inputTokens: call.inputTokens,
          outputTokens: call.outputTokens,
          cacheReadTokens: call.cacheReadTokens,
          cacheWriteTokens: call.cacheWriteTokens,
          costUsdCents: estimateCostUsdCents(
            call.model,
            call.inputTokens,
            call.outputTokens,
            call.cacheReadTokens,
            call.cacheWriteTokens,
          ),
        });
      };

      try {
        const input = parsedInput.data as { message?: string; maxIterations?: number } & Record<string, unknown>;
        switch (kind) {
          case "review_caption":
          case "plan_adjustment":
          case "plan_replacement":
          case "plan_reschedule": {
            const model = kind === "review_caption" ? resolveReviewerModel()
              : kind === "plan_adjustment" ? resolveResearchModel() : resolveStrategistModel();
            const effort = kind === "review_caption" ? resolveReviewerEffort()
              : kind === "plan_adjustment" ? resolveResearchEffort() : resolveStrategistEffort();
            return { ok: true, output: await runItemWork({ kind, input: itemWorkInputSchema.parse(task.input),
              client: clientForModel(model), model, effort, onModelCall: recordCall }) };
          }
          case "strategist_turn": {
            const model = resolveStrategistModel();
            const output = await runStrategistTurn({
              client: clientForModel(model),
              model,
              effort: resolveStrategistEffort(),
              ctx: { deps: options.moduleDeps, workspaceId: task.workspaceId, accountId: task.accountId },
              message: input.message as string,
              maxIterations: input.maxIterations as number | undefined,
              onModelCall: recordCall,
            });
            return { ok: true, output };
          }
          case "research": {
            const model = resolveResearchModel();
            const output = await runResearch({
              client: clientForModel(model),
              model,
              effort: resolveResearchEffort(),
              materials: input.materials as ResearchMaterial[],
              onModelCall: recordCall,
            });
            return { ok: true, output };
          }
          case "writing": {
            // Delegated to the engine: no direct model call, no ledger entry.
            const output = await runWriting(
              { workspaceId: task.workspaceId, workItemId: input.workItemId as string },
              options.writing,
            );
            return { ok: true, output };
          }
          case "art_direction": {
            // The engine owns generation; the adapter resolves the Trabalho.
            const output = await runArtDirection({
              gateway: options.moduleDeps.gateway,
              workspaceId: task.workspaceId,
              workId: input.workId as string,
            });
            return { ok: true, output };
          }
          case "review_text": {
            const model = resolveReviewerModel();
            const output = await runTextReview({
              client: clientForModel(model),
              model,
              effort: resolveReviewerEffort(),
              copy: input.copy as { headline: string; body: string; cta: string },
              facts: input.facts as string[] | undefined,
              onModelCall: recordCall,
            });
            return { ok: true, output };
          }
          case "review_visual": {
            const model = resolveReviewerModel();
            const output = await runVisualReview({
              client: clientForModel(model),
              model,
              effort: resolveReviewerEffort(),
              imageUrl: input.imageUrl as string,
              brief: input.brief as string,
              onModelCall: recordCall,
            });
            return { ok: true, output };
          }
          case "measurement": {
            const output = await measurement.read({
              workspaceId: task.workspaceId,
              brandId: input.brandId as string,
              windowDays: input.windowDays as number | undefined,
            });
            return { ok: true, output };
          }
        }
      } catch (error) {
        // Typed model failures fail the task with a prefixed code so the
        // task record tells them apart: truncation is retryable, refusal
        // is not. (The pilot job retries nothing yet.)
        if (error instanceof EquipeModelTruncatedError) {
          return { ok: false, error: `model_truncated:${error.message}` };
        }
        if (error instanceof EquipeModelRefusalError) {
          return { ok: false, error: `model_refused:${error.message}` };
        }
        const message = error instanceof Error ? error.message : "agent_task_failed";
        return { ok: false, error: message };
      }
    },
  };
}
