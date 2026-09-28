// Estrategista IA: tool-calling loop over the module (#550).
//
// Tools are ONLY the module's read queries and the commands the `agent`
// actor may run that exist today: propose context section, propose
// plan/mandate, advance onboarding. Commands arrive later for propose
// idea, ask a question, create version, record finding, open
// exception/escalation (#545/#547) — they join this list when they exist.
// There is NO approval tool, and unknown tool names (a hallucinated
// `approve_*`) are rejected before reaching the module.

import type { EquipeModuleDeps } from "../module/ports";
import { executeCommand } from "../module/commands";
import {
  advanceOnboardingPayloadSchema,
  proposeContextSectionPayloadSchema,
  proposeMandatePayloadSchema,
  proposePlanPayloadSchema,
  type CommandType,
} from "../module/envelope";
import { getAccountState, getGoalsView } from "../module/queries";
import {
  EquipeModelRefusalError,
  EquipeModelTruncatedError,
  type EquipeModelClient,
  type ModelCallUsage,
  type ModelMessage,
  type ModelTool,
} from "./model-client";
import type { EquipeEffort } from "./provider";
import { EQUIPE_PROMPT_VERSION, strategistSystemPrompt } from "./prompts";
import { resolveStrategistEffort, resolveStrategistModel } from "./roles";

export const STRATEGIST_AGENT_ID = "estrategista";

const AGENT_COMMAND_TOOLS: CommandType[] = [
  "propose_context_section",
  "propose_plan",
  "propose_mandate",
  "advance_onboarding",
];

export type StrategistToolContext = {
  deps: EquipeModuleDeps;
  workspaceId: string;
  accountId: string;
};

export type StrategistTool = ModelTool & {
  run(args: unknown): Promise<unknown>;
};

function agentContext(ctx: StrategistToolContext) {
  return {
    actor: { kind: "agent" as const, agentId: STRATEGIST_AGENT_ID },
    workspaceId: ctx.workspaceId,
    accountId: ctx.accountId,
  };
}

function summarizeOutcome(outcome: Awaited<ReturnType<typeof executeCommand>>): unknown {
  if (!outcome.ok) {
    return { ok: false, code: outcome.error.code, message: outcome.error.message };
  }
  return {
    ok: true,
    type: outcome.value.type,
    data: outcome.value.data,
    events: outcome.value.events.map((event) => event.eventType),
  };
}

async function runCommandTool(
  ctx: StrategistToolContext,
  type: CommandType,
  payload: unknown,
): Promise<unknown> {
  return summarizeOutcome(await executeCommand(ctx.deps, agentContext(ctx), { type, payload }));
}

/** The exact tool list the strategist sees. No approval action exists here. */
export function buildStrategistTools(ctx: StrategistToolContext): StrategistTool[] {
  return [
    {
      name: "get_account_state",
      description: "Read the account status, fronts, and pending onboarding steps.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      run: () => getAccountState(ctx.deps.uow.repos, ctx.workspaceId, ctx.accountId),
    },
    {
      name: "get_goals",
      description: "Read the current plan, mandates, and onboarding steps.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      run: () => getGoalsView(ctx.deps.uow.repos, ctx.workspaceId, ctx.accountId),
    },
    {
      name: "propose_context_section",
      description: "Propose a marketing-context section (fields sustained/inferred/unknown).",
      parameters: {
        type: "object",
        properties: {
          section: { type: "string" },
          fields: {
            type: "object",
            additionalProperties: {
              type: "object",
              properties: {
                status: { type: "string", enum: ["sustained", "inferred", "unknown"] },
                value: {},
                source: { type: "string" },
              },
              required: ["status"],
              additionalProperties: false,
            },
          },
        },
        required: ["section", "fields"],
        additionalProperties: false,
      },
      run: (args) =>
        runCommandTool(ctx, "propose_context_section", proposeContextSectionPayloadSchema.parse(args)),
    },
    {
      name: "propose_plan",
      description: "Propose the account plan content for human approval.",
      parameters: {
        type: "object",
        properties: { content: { type: "object" } },
        required: ["content"],
        additionalProperties: false,
      },
      run: (args) => runCommandTool(ctx, "propose_plan", proposePlanPayloadSchema.parse(args)),
    },
    {
      name: "propose_mandate",
      description: "Propose a mandate (starts in shadow mode) for human approval.",
      parameters: {
        type: "object",
        properties: {
          frontId: { type: "string" },
          limits: {},
          window: {},
          validFrom: { type: "string" },
          validUntil: { type: "string" },
          stopCondition: {},
          shadow: { type: "boolean" },
        },
        additionalProperties: false,
      },
      run: (args) =>
        runCommandTool(ctx, "propose_mandate", proposeMandatePayloadSchema.parse(args)),
    },
    {
      name: "advance_onboarding",
      description: "Advance the onboarding to the given step.",
      parameters: {
        type: "object",
        properties: { step: { type: "string" } },
        required: ["step"],
        additionalProperties: false,
      },
      run: (args) =>
        runCommandTool(ctx, "advance_onboarding", advanceOnboardingPayloadSchema.parse(args)),
    },
  ];
}

/** Command types the strategist may invoke. Used by the no-approval test. */
export function strategistCommandTypes(): CommandType[] {
  return [...AGENT_COMMAND_TOOLS];
}

export type ToolExecution = { ok: true; result: unknown } | { ok: false; error: string };

/**
 * Execute one model-requested tool call. Unknown names — including a
 * hallucinated approval call — are rejected here, before the module.
 */
export async function executeStrategistTool(
  tools: StrategistTool[],
  name: string,
  argumentsJson: string,
): Promise<ToolExecution> {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) {
    return { ok: false, error: `unknown tool "${name}" — call rejected` };
  }
  let args: unknown;
  try {
    args = JSON.parse(argumentsJson || "{}");
  } catch {
    return { ok: false, error: `tool "${name}" got invalid JSON arguments` };
  }
  try {
    return { ok: true, result: await tool.run(args) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return { ok: false, error: `tool "${name}" failed: ${message}` };
  }
}

export type StrategistTurnInput = {
  client: EquipeModelClient;
  ctx: StrategistToolContext;
  /** The client message (or job instruction) this turn answers. */
  message: string;
  maxIterations?: number;
  model?: string;
  effort?: EquipeEffort;
  maxTokens?: number;
  onModelCall?: (call: ModelCallUsage) => Promise<void>;
};

export type StrategistTurnResult = {
  text: string | null;
  toolCallsExecuted: number;
  iterations: number;
  promptVersion: string;
};

const DEFAULT_MAX_ITERATIONS = 6;

/** Covers thinking + answer on the reasoning providers (Anthropic, Meta). */
export const STRATEGIST_MAX_TOKENS = 16000;

export async function runStrategistTurn(input: StrategistTurnInput): Promise<StrategistTurnResult> {
  const model = input.model ?? resolveStrategistModel();
  const effort = input.effort ?? resolveStrategistEffort();
  const maxTokens = input.maxTokens ?? STRATEGIST_MAX_TOKENS;
  const maxIterations = input.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  // Cache-prefix stability: the SAME tools array (stable order, stable
  // schema key order) and the SAME static system prompt go out on every
  // iteration; account state travels in messages/tool results only, and
  // history below is append-only — so each iteration reuses the
  // previous one's cached prefix (Anthropic cache: auto).
  const tools = buildStrategistTools(input.ctx);
  const messages: ModelMessage[] = [
    { role: "system", content: strategistSystemPrompt() },
    { role: "user", content: input.message },
  ];
  let toolCallsExecuted = 0;
  let iterations = 0;
  for (;;) {
    iterations += 1;
    const response = await input.client.chat({ model, messages, tools, effort, maxTokens, cache: "auto" });
    await input.onModelCall?.({ model, ...response.usage });
    // History is append-only: a truncated or refused turn fails instead of
    // editing or dropping messages inside the loop.
    if (response.stopReason === "refusal") {
      throw new EquipeModelRefusalError("strategist_refused");
    }
    if (response.stopReason === "max_tokens") {
      throw new EquipeModelTruncatedError("strategist_truncated");
    }
    if (response.toolCalls.length === 0 || iterations >= maxIterations) {
      return {
        text: response.content,
        toolCallsExecuted,
        iterations,
        promptVersion: EQUIPE_PROMPT_VERSION,
      };
    }
    messages.push({
      role: "assistant",
      content: response.content,
      toolCalls: response.toolCalls,
      ...(response.providerContent !== undefined ? { providerContent: response.providerContent } : {}),
    });
    for (const call of response.toolCalls) {
      toolCallsExecuted += 1;
      const execution = await executeStrategistTool(tools, call.name, call.argumentsJson);
      messages.push({
        role: "tool",
        toolCallId: call.id,
        content: JSON.stringify(execution.ok ? execution.result : { error: execution.error }),
      });
    }
  }
}
