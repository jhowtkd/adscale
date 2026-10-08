// Agents port implementation (#550).
//
// createEquipeAgents returns the module's `Agents` port: runTask dispatches
// by kind, records every direct model call in the cost ledger, and refuses
// new work past the monthly per-account cap (current São Paulo month) with
// an `agent.budget_exceeded` event. (The exception command itself arrives
// with #547.)

import { isAllowedImageType } from "@/lib/upload-config";
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
  type ModelImagePart,
} from "./model-client";
import { EQUIPE_PROMPT_VERSION } from "./prompts";
import { resolveEquipeProvider, type EquipeProvider } from "./provider";
import { runResearch } from "./research";
import { runDiagnosis } from "./diagnosis";
import { DIAGNOSIS_MONTHLY_BUDGET_EXCEEDED_CODE, diagnosisInputSchema, type DiagnosisInput } from "../handoff/diagnosis-contract";
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
import { freeBudgetUsdCents, freeStrategistMaxTokens } from "./free-budget";
import { freePlanLimitsApply, freePlanReadersFor } from "../module/free-plan";
import { createBudgetedModelClient } from "./budgeted-client";
import { assertAccountExecution, authorizeAccountExecution } from "../module/execution-authorization";

export const BUDGET_EXCEEDED_ERROR = "budget_exceeded";

// Admission metadata is a server capability, consumed inside the job's generate
// step before memoization. Neither a task payload nor a serialized/model result
// can manufacture proof of the instant used to consult the monthly ledger.
const monthlyAdmissionInstants = new WeakMap<object, number>();
export function diagnosisMonthlyAdmissionInstant(result: AgentTaskResult): Date | null {
  const instant = result.output !== null && typeof result.output === "object" ? monthlyAdmissionInstants.get(result.output) : undefined;
  return instant === undefined ? null : new Date(instant);
}

const taskInputSchemas = {
  strategist_turn: z.object({
    message: z.string().max(8000),
    images: z.array(z.object({ assetId: z.string().uuid() }).strict()).min(1).max(5).optional(),
    history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) })).max(20).optional(),
    maxIterations: z.number().int().min(1).max(10).optional(),
  }).refine(input => input.message.length > 0 || Boolean(input.images?.length), "message or images required"),
  research: z.object({
    materials: z
      .array(z.object({ assetId: z.string().min(1), label: z.string().min(1), excerpt: z.string().min(1) }))
      .min(1)
      .max(20),
  }),
  diagnosis: diagnosisInputSchema,
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
  diagnosis: "research",
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
    error = BUDGET_EXCEEDED_ERROR,
    admissionInstant?: number,
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
    if (task.kind === "diagnosis" && error === DIAGNOSIS_MONTHLY_BUDGET_EXCEEDED_CODE && admissionInstant !== undefined) {
      const output = { monthlyAdmissionAt: new Date(admissionInstant).toISOString() };
      monthlyAdmissionInstants.set(output, admissionInstant);
      return { ok: false, error, output };
    }
    return { ok: false, error };
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

      const allowed = await authorizeAccountExecution(options.moduleDeps.uow.repos, task);
      if (!allowed.ok) return invalidTask(allowed.error.code);

      const account = await options.moduleDeps.uow.repos.accounts.get(task.workspaceId, task.accountId);
      // Engine work bypasses this ledger, so a free account never delegates it: that is what its status allows.
      if (account?.status === "free" && kind !== "strategist_turn" && kind !== "research" && kind !== "diagnosis") return invalidTask("requires_plan");
      // The lifetime cap is the free plan's (spec 2026-10-07 §3): it binds a free account only while its workspace does not pay.
      const free = await freePlanLimitsApply(account, task.workspaceId, freePlanReadersFor(options.moduleDeps));
      const imageRefs = kind === "strategist_turn" ? (parsedInput.data as { images?: Array<{ assetId: string }> }).images : undefined;
      // The internal image-only contract belongs to talk only; keep existing
      // paid/free task behavior and lifetime image admission closed.
      if (imageRefs?.length && (account?.status !== "free" || free)) return invalidTask("invalid_agent_input:images_require_talk");
      const budgetUsdCents = free ? freeBudgetUsdCents() : resolveAgentMonthlyBudgetUsdCents();
      if (!free) {
        const admittedAt = now();
        const admissionInstant = admittedAt.getTime();
        const total = await ledger.monthlyTotalCostUsdCents(task.workspaceId, task.accountId, admittedAt);
        if (total >= budgetUsdCents) return refuseOverBudget(task, total, budgetUsdCents,
          kind === "diagnosis" ? DIAGNOSIS_MONTHLY_BUDGET_EXCEEDED_CODE : BUDGET_EXCEEDED_ERROR, admissionInstant);
      }

      let strategistImages: ModelImagePart[] | undefined;
      if (imageRefs?.length) {
        // The event input is untrusted. Resolve every reference through the server gateway,
        // recheck ownership/type, and rebuild URLs from canonical storage before any model can run.
        // Visibility is the account's brand, as in its Library: its own assets or unbranded ones,
        // never another brand's of the same workspace.
        const clientProfileId = account?.clientProfileId;
        if (!clientProfileId) return invalidTask("invalid_agent_input:untrusted_image_asset");
        try {
          const assets = await Promise.all(imageRefs.map(ref => options.moduleDeps.gateway.getAssetForBrand(ref.assetId, clientProfileId)));
          const keys: string[] = [];
          for (const [index, asset] of assets.entries()) {
            if (!asset || asset.id !== imageRefs[index]!.assetId || asset.workspaceId !== task.workspaceId
              || !asset.key || !isAllowedImageType(asset.kind)) return invalidTask("invalid_agent_input:untrusted_image_asset");
            keys.push(asset.key);
          }
          const { objectStorage } = await import("@/server/storage");
          strategistImages = keys.map(key => ({ type: "image_url", image_url: { url: objectStorage.publicUrl(key) } }));
        } catch {
          return invalidTask("invalid_agent_input:untrusted_image_asset");
        }
      }

      // Every free call is serialized across processes; its maximum commits
      // before sending, and its reported usage settles before releasing the lock.
      const taskClient = (model: string): EquipeModelClient => createBudgetedModelClient({
        scope: task, repos: options.moduleDeps.uow.repos, ledger, client: () => clientForModel(model),
        free, model, role: KIND_ROLES[kind], taskKind: kind, now,
        ...(kind === "strategist_turn" ? { maxTokens: freeStrategistMaxTokens(), reserveDiagnostic: true } : {}),
      });

      const recordCall = async (call: ModelCallUsage) => {
        if (free) return; // Already settled inside the serialized taskClient call.
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
        await assertAccountExecution(options.moduleDeps.uow.repos, task);
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
              client: taskClient(model), model, effort, onModelCall: recordCall }) };
          }
          case "strategist_turn": {
            const model = resolveStrategistModel();
            const output = await runStrategistTurn({
              client: taskClient(model),
              model,
              effort: resolveStrategistEffort(),
              ctx: { deps: options.moduleDeps, workspaceId: task.workspaceId, accountId: task.accountId },
              message: input.message as string,
              images: strategistImages,
              history: input.history as Array<{ role: "user" | "assistant"; content: string }> | undefined,
              maxIterations: input.maxIterations as number | undefined,
              ...(free ? { maxTokens: freeStrategistMaxTokens() } : {}),
              onModelCall: recordCall,
            });
            return { ok: true, output };
          }
          case "research": {
            const model = resolveResearchModel();
            const output = await runResearch({
              client: taskClient(model),
              model,
              effort: resolveResearchEffort(),
              materials: input.materials as ResearchMaterial[],
              onModelCall: recordCall,
            });
            return { ok: true, output };
          }
          case "diagnosis": {
            // The free diagnosis is paid from the reserve kept for it (strategist turns cannot spend it).
            const model = resolveResearchModel();
            const output = await runDiagnosis({
              client: taskClient(model),
              model,
              effort: resolveResearchEffort(),
              diagnosis: parsedInput.data as DiagnosisInput,
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
              client: taskClient(model),
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
              client: taskClient(model),
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
        if (free && error instanceof Error && error.message === BUDGET_EXCEEDED_ERROR) {
          return refuseOverBudget(task, await ledger.lifetimeTotalCostUsdCents(task.workspaceId, task.accountId), budgetUsdCents);
        }
        if (error instanceof EquipeModelTruncatedError) {
          return { ok: false, error: `model_truncated:${error.message}` };
        }
        if (error instanceof EquipeModelRefusalError) {
          return { ok: false, error: `model_refused:${error.message}` };
        }
        const message = error instanceof Error ? error.message : "agent_task_failed";
        // Only our pre-provider admission may prove a monthly refusal; a provider's
        // error text with the same spelling cannot give a consumed intent back.
        if (kind === "diagnosis" && message === DIAGNOSIS_MONTHLY_BUDGET_EXCEEDED_CODE) return { ok: false, error: "provider_error" };
        return { ok: false, error: message };
      }
    },
  };
}
