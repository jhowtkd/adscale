// Estrategista IA: tool-calling loop over the module (#550).
//
// Tools expose account queries, implantation proposals and delivery/version
// commands over existing Trabalhos/Peças. No approval action is available;
// hallucinated or unknown tool names are rejected before the module.

import { freeStrategistMaxTokens, hasRecordedDiagnostic, withTextInputBound } from "./free-budget";
import { freeAccountContext } from "./free-context";
import { splitLeakedToolCall } from "./leaked-tool-call";
import { filterSuggestions } from "@/lib/equipe/suggestions";
import { logger } from "@/lib/logger";
import type { EquipeModuleDeps } from "../module/ports";
import { executeCommand } from "../module/commands";
import {
  advanceOnboardingPayloadSchema,
  proposeContextSectionPayloadSchema,
  proposeMandatePayloadSchema,
  proposePlanPayloadSchema,
  deliverBatchPayloadSchema,
  submitCorrectedVersionPayloadSchema,
  type CommandType,
} from "../module/envelope";
import { submitItemVersionPayloadSchema } from "../module/agent-work-contract";
import { getAccountState, getGoalsView, getClientPipeline, getItemDetail } from "../module/queries";
import { z } from "zod";
import {
  EquipeModelRefusalError,
  EquipeModelTruncatedError,
  type EquipeModelClient,
  type ModelAssistantToolCall,
  type ModelCallUsage,
  type ModelMessage,
  type ModelTool,
} from "./model-client";
import type { EquipeEffort } from "./provider";
import { EQUIPE_PROMPT_VERSION, strategistSystemPrompt } from "./prompts";
import { resolveStrategistEffort, resolveStrategistModel } from "./roles";
import { loadInstagramAuth } from "../publishing/auth";
import { assertAccountExecution } from "../module/execution-authorization";

export const STRATEGIST_AGENT_ID = "estrategista";

const AGENT_COMMAND_TOOLS: CommandType[] = [
  "propose_context_section",
  "propose_plan",
  "propose_mandate",
  "advance_onboarding",
  "deliver_batch",
  "submit_item_version",
  "submit_corrected_version",
];

/** The two tools that end a turn: the first carries the answer, the second ends it with the plan card. */
const SUGGEST_TOOL = "sugerir_proximos_passos";
const OFFER_PLAN_TOOL = "oferecer_plano";
const isClosingTool = (name: string) => name === SUGGEST_TOOL || name === OFFER_PLAN_TOOL;
const isCommandTool = (name: string) => (AGENT_COMMAND_TOOLS as string[]).includes(name);

// Only the answer is required to end the turn; a missing or malformed `itens` costs the client the suggestions, never the answer.
const suggestArgsSchema = z.object({ resposta: z.string().trim().min(1), itens: z.unknown().optional() });
/** A model that closes without the answer gets ONE more try; the second time the turn ends (answer_missing) instead of paying for another call. */
const MAX_ANSWER_MISSES = 2;

const strategistBatchPayloadSchema = deliverBatchPayloadSchema.extend({
  items: z.array(deliverBatchPayloadSchema.shape.items.element.omit({ destinationAccount: true })).min(1).max(50),
});

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
export function buildStrategistTools(ctx: StrategistToolContext, free = false): StrategistTool[] {
  const tools: StrategistTool[] = [
    {
      name: "submit_corrected_version",
      description: "Submit an existing corrected Peça/caption for a calibration item returned by Quality. Returns to Quality conference; never releases or approves.",
      parameters: { type: "object", properties: {
        roundId: { type: "string" }, itemId: { type: "string" },
        caption: { type: "string" }, creativeWorkOutputId: { type: "string" },
      }, required: ["roundId", "itemId"], additionalProperties: false },
      run: (args) => runCommandTool(ctx, "submit_corrected_version", submitCorrectedVersionPayloadSchema.parse(args)),
    },
    {
      name: "get_pipeline",
      description: "Read this account's items and their review/decision states.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      run: () => getClientPipeline(ctx.deps.uow.repos, ctx.workspaceId, ctx.accountId),
    },
    {
      name: "get_item",
      description: "Read an item, its Trabalho, versions and review findings, within this account.",
      parameters: { type: "object", properties: { itemId: { type: "string" } }, required: ["itemId"], additionalProperties: false },
      run: (args) => getItemDetail(ctx.deps.uow.repos, ctx.workspaceId, ctx.accountId, z.object({ itemId: z.string().uuid() }).parse(args).itemId),
    },
    {
      name: "submit_item_version",
      description: "Submit a corrected caption or an existing Peça from the item's Trabalho. Requires the current hash and goes through review; never approves.",
      parameters: { type: "object", properties: {
        itemId: { type: "string" }, expectedVersionHash: { type: "string" },
        caption: { type: "string" }, creativeWorkOutputId: { type: "string" },
      }, required: ["itemId", "expectedVersionHash", "caption"], additionalProperties: false },
      run: (args) => runCommandTool(ctx, "submit_item_version", submitItemVersionPayloadSchema.parse(args)),
    },
    {
      name: "deliver_batch",
      description: "Deliver existing Trabalhos/Peças for client review on the social_instagram front. The server selects the connected Instagram or a neutral manual destination. Never invent output IDs and never approves or publishes.",
      parameters: { type: "object", properties: {
        title: { type: "string" }, frontId: { type: "string" }, approveByAt: { type: "string" },
        items: { type: "array", items: { type: "object", properties: {
          creativeWorkId: { type: "string" }, creativeWorkOutputId: { type: "string" }, caption: { type: "string" },
          scheduledFor: { type: "string" }, needsConfirmation: { type: "boolean" },
        }, required: ["creativeWorkId", "creativeWorkOutputId", "caption", "scheduledFor", "needsConfirmation"], additionalProperties: false } },
      }, required: ["title", "frontId", "approveByAt", "items"], additionalProperties: false },
      run: async (args) => {
        const payload = strategistBatchPayloadSchema.parse(args);
        const scope = { workspaceId: ctx.workspaceId, accountId: ctx.accountId };
        const front = await ctx.deps.uow.repos.fronts.get(scope, payload.frontId);
        if (front?.key !== "social_instagram") {
          throw new Error("deliver_batch requires this account's social_instagram front");
        }
        const connection = (await ctx.deps.uow.repos.connections.list(scope)).find((row) => row.provider === "instagram");
        let destinationAccount = "instagram";
        if (connection?.status === "active") {
          const auth = await loadInstagramAuth(ctx.deps.uow.repos, scope);
          destinationAccount = `instagram:${auth.igUsername ? `@${auth.igUsername}` : auth.igUserId}`;
        }
        return runCommandTool(ctx, "deliver_batch", {
          ...payload, items: payload.items.map((item) => ({ ...item, destinationAccount })),
        });
      },
    },
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
  tools.push({
    name: SUGGEST_TOOL,
    description: "Delivers the answer and ends the turn. `resposta` is the complete answer to the client, in pt-BR: it is the only text the client reads, so it is never left out. `itens` are 1-3 suggestions in the client's voice, at most 60 characters. Never suggest approval or confirmation.",
    parameters: { type: "object", properties: {
      resposta: { type: "string", description: "The complete answer to the client, in pt-BR. Write it only here: text outside this call is not shown." },
      itens: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", maxLength: 60 } },
    }, required: ["resposta", "itens"], additionalProperties: false },
    run: (args) => {
      const parsed = suggestArgsSchema.safeParse(args);
      // The turn does not end without the answer: this error goes back to the model, which writes it and calls again.
      if (!parsed.success) throw new Error("`resposta` is required: write the complete answer to the client in `resposta` and call this tool again");
      return Promise.resolve({ answer: parsed.data.resposta, suggestions: filterSuggestions(parsed.data.itens) });
    },
  }, {
    name: OFFER_PLAN_TOOL,
    description: "End the turn with the plan card for a paid request. Only after a recorded diagnosis, never for missing or failed sources. No price or checkout.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    run: async (args) => {
      z.object({}).strict().parse(args);
      const account = await ctx.deps.uow.repos.accounts.get(ctx.workspaceId, ctx.accountId);
      if (account?.status !== "free" || !(await hasRecordedDiagnostic(ctx.deps.uow.repos, ctx))) {
        throw new Error("plan_offer_unavailable");
      }
      return { planOffered: true };
    },
  });
  // The free account reads its brand and diagnosis from the context message (free-context.ts), so it has no tool that
  // reads the account: a model that has everything it needs answers in one call.
  return tools.filter((tool) => free
    ? isClosingTool(tool.name)
    : tool.name !== OFFER_PLAN_TOOL).map((tool) => ({
    ...tool,
    async run(args) {
      await assertAccountExecution(ctx.deps.uow.repos, ctx);
      return tool.run(args);
    },
  }));
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
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  maxIterations?: number;
  model?: string;
  effort?: EquipeEffort;
  maxTokens?: number;
  onModelCall?: (call: ModelCallUsage) => Promise<void>;
};

export type StrategistTurnResult = {
  /** The answer the client reads: `resposta` of the closing tool, or the model's own text. Null only when the model gave none (logged). */
  text: string | null;
  toolCallsExecuted: number;
  /** Commands that really ran and were accepted by the module (reads and the closing tools are not commands). */
  commandsApplied: number;
  iterations: number;
  promptVersion: string;
  suggestions?: string[];
  planOffered?: boolean;
};

type Completion = { answer?: string; suggestions?: string[]; planOffered?: boolean };

const DEFAULT_MAX_ITERATIONS = 6;
/**
 * The free account has no tool that reads anything: a legitimate turn is one call, or two when the first answer had to be written again.
 * A model that keeps calling without writing it must not spend six calls of the US$ 1 cap on one message.
 */
const FREE_MAX_ITERATIONS = 3;

/** Covers thinking + answer on the reasoning providers (Anthropic, Meta). */
export const STRATEGIST_MAX_TOKENS = 16000;

/**
 * A model that wrote its answer as text next to the call instead of in `resposta` (what a chat-completions provider
 * does by default, and what this tool used to ask for) has answered all the same: the text becomes the argument, so
 * the answer is neither lost nor asked for again at the price of another call. A call that carries its own
 * `resposta` is left as it is.
 */
function withSiblingAnswer(call: ModelAssistantToolCall, text: string | null): string {
  if (call.name !== SUGGEST_TOOL || !text) return call.argumentsJson;
  try {
    const args = JSON.parse(call.argumentsJson || "{}") as unknown;
    if (args && typeof args === "object" && !Array.isArray(args)) {
      const own = (args as { resposta?: unknown }).resposta;
      if (!(typeof own === "string" && own.trim())) return JSON.stringify({ ...args, resposta: text });
    }
  } catch { /* the tool reports the invalid JSON itself */ }
  return call.argumentsJson;
}

/**
 * What the model is told about a `sugerir_proximos_passos` that was accepted when the turn nevertheless goes on (a command or a read of the same response
 * failed). The answer it carried is not shown (it may claim what the refused call did not do), so the call must not read as delivered: a model that takes it
 * for the end of its answer may say nothing more, and the turn would end with no answer. (An accepted `oferecer_plano` always ends the turn.)
 */
const NOT_DELIVERED = "not delivered: another call of this response failed, so the turn goes on. Write the final answer in `resposta` and call this tool again";

export async function runStrategistTurn(input: StrategistTurnInput): Promise<StrategistTurnResult> {
  const account = await input.ctx.deps.uow.repos.accounts.get(input.ctx.workspaceId, input.ctx.accountId);
  const free = account?.status === "free";
  const model = input.model ?? resolveStrategistModel();
  const effort = input.effort ?? resolveStrategistEffort();
  const maxTokens = free ? Math.min(input.maxTokens ?? freeStrategistMaxTokens(), freeStrategistMaxTokens()) : input.maxTokens ?? STRATEGIST_MAX_TOKENS;
  const maxIterations = input.maxIterations ?? (free ? FREE_MAX_ITERATIONS : DEFAULT_MAX_ITERATIONS);
  // Cache-prefix stability: the SAME tools array (stable order, stable
  // schema key order) and the SAME static system prompt go out on every
  // iteration; account state travels in messages/tool results only, and
  // history below is append-only — so each iteration reuses the
  // previous one's cached prefix (Anthropic cache: auto).
  const tools = buildStrategistTools(input.ctx, free);
  // The free account's brand and recorded diagnosis (a few KB) come first, ahead of the history: they only change
  // when the diagnosis does, so the prefix [tools, system, context] is cached and the answer takes one call. The history
  // is a window of the last 20 messages: once the thread outgrows it the window slides and the cached history stops
  // matching, so the context carries its own cache breakpoint and keeps being read from the cache.
  const accountContext = free ? await freeAccountContext(input.ctx.deps.uow.repos, input.ctx) : null;
  const messages: ModelMessage[] = [
    { role: "system", content: strategistSystemPrompt(free) },
    ...(accountContext ? [{ role: "user" as const, content: [{ type: "text" as const, text: accountContext, cacheBreakpoint: true }] }] : []),
    ...(input.history ?? []).slice(-20).map((message) => ({ role: message.role, content: message.content.slice(0, 2000) })),
    { role: "user", content: input.message },
  ];
  let toolCallsExecuted = 0;
  let commandsApplied = 0;
  let iterations = 0;
  let answerMisses = 0;
  const toolsCalled: string[] = [];
  for (;;) {
    await assertAccountExecution(input.ctx.deps.uow.repos, input.ctx);
    iterations += 1;
    const response = await input.client.chat(withTextInputBound({ model, messages, tools, effort, maxTokens, cache: "auto" }));
    await input.onModelCall?.({ model, ...response.usage });
    await assertAccountExecution(input.ctx.deps.uow.repos, input.ctx);
    // History is append-only: a truncated or refused turn fails instead of
    // editing or dropping messages inside the loop.
    if (response.stopReason === "refusal") {
      throw new EquipeModelRefusalError("strategist_refused");
    }
    if (response.stopReason === "max_tokens") {
      throw new EquipeModelTruncatedError("strategist_truncated");
    }
    // What the model wrote in THIS response. A reasoning model may answer with a tool call and no text block at all, or write the call
    // itself as text (leaked-tool-call.ts): the client never reads that markup, whatever its source.
    const content = response.content ?? "";
    const leaked = splitLeakedToolCall(content);
    const text = leaked.text.trim() || null;
    const finish = (answer: string | null, completion?: Completion): StrategistTurnResult => {
      if (!completion) logger.info("[equipe.strategist] suggestions_missing", { accountId: input.ctx.accountId, iterations });
      // Never the content of a message: which turn it was, how it ended and what it called.
      if (!answer && !completion?.planOffered) {
        logger.warn("[equipe.strategist] answer_missing", {
          accountId: input.ctx.accountId, iterations, stopReason: response.stopReason, toolsCalled, toolCallsExecuted, commandsApplied,
        });
      }
      return {
        text: answer, toolCallsExecuted, commandsApplied, iterations, promptVersion: EQUIPE_PROMPT_VERSION,
        ...(completion?.suggestions ? { suggestions: completion.suggestions } : {}),
        ...(completion?.planOffered ? { planOffered: true } : {}),
      };
    };
    if (response.toolCalls.length === 0) {
      // A closing call the provider spelled out as text is honoured as if it had come as a block (both are harmless: the first only carries
      // the answer and the suggestions, the second asks for the plan card, which its own gate still checks) ONLY in the signature observed
      // with the real model: the provider stopped to call a tool, no block came, and the markup is the last thing written (the parser hands
      // the call back only then). Markup anywhere else, or in a reply that simply ended, is a quotation: it is taken out of the text and never
      // runs. Any other leaked call is dropped.
      let recovered: Completion | undefined;
      if (leaked.call && response.stopReason === "tool_calls" && isClosingTool(leaked.call.name)) {
        const call = { id: "leaked-call", name: leaked.call.name, argumentsJson: JSON.stringify(leaked.call.args) };
        const execution = await executeStrategistTool(tools, call.name, withSiblingAnswer(call, text));
        if (execution.ok) {
          recovered = execution.result as Completion;
          toolCallsExecuted += 1;
          toolsCalled.push(call.name);
        }
      }
      if (leaked.text !== content) {
        // Facts of the turn only, never what the model wrote: the name of a leaked call is free text, so only a tool of this turn is named.
        logger.info("[equipe.strategist] tool_call_as_text", {
          accountId: input.ctx.accountId, iterations, stopReason: response.stopReason, tool: leaked.call && tools.some(tool => tool.name === leaked.call!.name) ? leaked.call.name : "unknown",
          honoured: Boolean(recovered), textChars: leaked.text.length, rawChars: content.length,
        });
      }
      return finish(recovered?.answer ?? text, recovered);
    }
    messages.push({
      role: "assistant",
      content: response.content,
      toolCalls: response.toolCalls,
      ...(response.providerContent !== undefined ? { providerContent: response.providerContent } : {}),
    });
    let completion: Completion | undefined;
    // A refused tool that is not a closing one (a command of the paid account, a name the model made up) may make the answer false: it keeps the turn open.
    let blocked = false;
    const results: Array<{ call: ModelAssistantToolCall; execution: ToolExecution }> = [];
    for (const call of response.toolCalls) {
      // Keep the existing iteration limit for commands, while accepting a
      // final suggestion/offer without paying for another model call.
      if (iterations >= maxIterations && !isClosingTool(call.name)) continue;
      toolCallsExecuted += 1;
      toolsCalled.push(call.name);
      const execution = await executeStrategistTool(tools, call.name, withSiblingAnswer(call, text));
      const refused = !execution.ok || (execution.result as { ok?: boolean } | null)?.ok === false;
      if (refused && !isClosingTool(call.name)) blocked = true;
      if (!refused && isCommandTool(call.name)) commandsApplied += 1;
      if (execution.ok && isClosingTool(call.name)) completion = { ...completion, ...(execution.result as Completion) };
      results.push({ call, execution });
    }
    // An accepted plan offer is the whole answer (the card): the turn ends with it in the same call, even if the other closing tool was refused for
    // lack of `resposta` (a model that asks for the card has nothing more to write), as it always did.
    if (completion?.planOffered) return finish(completion.answer ?? text, completion);
    // The answer is in, and only a closing tool was refused (the plan offer, say): it is delivered, without paying for a second call to write it again.
    if (completion && !blocked) return finish(completion.answer ?? text, completion);
    if (results.some(({ call, execution }) => call.name === SUGGEST_TOOL && !execution.ok)) answerMisses += 1;
    // No call is left to correct a refused tool, or the model has twice closed without the answer: the turn ends with what the model wrote, which may be
    // its `resposta` (the old contract ended with the text next to the call; the answer is no less its own now that it travels in the call).
    if (iterations >= maxIterations || answerMisses >= MAX_ANSWER_MISSES) return finish(completion?.answer ?? text);
    for (const { call, execution } of results) {
      messages.push({
        role: "tool",
        toolCallId: call.id,
        content: JSON.stringify(!execution.ok ? { error: execution.error } : call.name === SUGGEST_TOOL ? { error: NOT_DELIVERED } : execution.result),
      });
    }
  }
}
